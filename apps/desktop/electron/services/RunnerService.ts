import type {
  BatchRunOptions,
  BatchRunResult,
  WorkspaceTestInfo,
  FeatureTestInfo,
} from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import { getDependencyService } from './DependencyService'
import { getNodeService } from './NodeService'
import { getVariablesService } from './VariablesService'
import type { ChildProcess } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { createLogger } from '../utils/logger'
import { parseBddgenErrors } from '../utils/bddgenErrorParser'
import { parseFeatureMetadata } from '../utils/gherkinMetadata'
import { parsePlaywrightJsonReport } from '../utils/playwrightReport'
import { checkBrowsers, describeMissingBrowsers } from './playwrightBrowsers'

const logger = createLogger('RunnerService')

/** Where SuiSui's progress reporter is written inside the workspace. */
const PROGRESS_REPORTER_FILE = 'suisui-progress-reporter.cjs'

/**
 * Source of the progress reporter asset.
 * In development: electron/assets/…  In production: dist-electron/assets/…
 */
function progressReporterAssetPath(): string {
  return path.join(__dirname, '..', 'assets', PROGRESS_REPORTER_FILE)
}

/**
 * Copy the progress reporter into the workspace so the workspace's own
 * Playwright can load it, and return its absolute path.
 *
 * Best-effort by design: a progress indicator must never be able to stop
 * someone running their tests. On any failure this returns null and the caller
 * simply omits it from the --reporter chain, leaving the run exactly as it was
 * before this feature existed.
 *
 * Rewritten on every run so an app upgrade can never leave a stale reporter.
 */
export function provisionProgressReporter(workspacePath: string): string | null {
  try {
    const target = path.join(workspacePath, '.app', PROGRESS_REPORTER_FILE)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(progressReporterAssetPath(), target)
    return target
  } catch (error) {
    logger.warn('Could not provision the live-progress reporter; running without it', {
      error: String(error),
    })
    return null
  }
}
/**
 * Replay a captured run instead of executing Playwright — E2E support only.
 *
 * Live per-step progress can only be exercised end to end if something produces
 * reporter output, and Constitution III forbids launching a real browser from the
 * test suite. So an E2E run streams a checked-in capture through the SAME stdout
 * path a real run uses: the real parser, the real IPC channel, the real UI.
 *
 * Double-gated on `APP_TEST_MODE` so it cannot be reached in a shipped app, and
 * returns null — leaving the real run untouched — whenever it is not requested.
 */
async function replayScriptedRun(
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void,
): Promise<BatchRunResult | null> {
  const fixture = process.env.TEST_RUN_PROGRESS_FIXTURE
  if (process.env.APP_TEST_MODE !== '1' || !fixture) return null

  let lines: string[]
  try {
    lines = fs.readFileSync(fixture, 'utf-8').split('\n').filter(Boolean)
  } catch (error) {
    logger.warn('Scripted run fixture could not be read', { fixture, error: String(error) })
    return null
  }

  // Paced so the UI genuinely renders intermediate states; a synchronous dump
  // would only ever prove the terminal state, never that a step was seen running.
  const perLineMs = Number(process.env.TEST_RUN_PROGRESS_INTERVAL_MS ?? '250')

  for (const line of lines) {
    onOutput?.('stdout', `${line}\n`)
    await new Promise((resolve) => setTimeout(resolve, perLineMs))
  }

  return {
    status: 'failed',
    featureResults: [],
    summary: { total: lines.length, passed: 0, failed: 0, skipped: 0, features: 0 },
    duration: lines.length * perLineMs,
    stdout: '',
    stderr: '',
    errors: [],
  }
}

const debugRunner = process.env.SUISUI_DEBUG_RUNNER === '1'

/**
 * How long a test run may produce *no output at all* before we treat it as hung.
 *
 * Test runs are bounded by elapsed time only in the sense that Playwright itself
 * enforces per-test `timeout` and, if configured, `globalTimeout`. A wall-clock
 * cap here just truncates healthy suites: a 150-test run at a few seconds each
 * sails past ten minutes while passing, and killing it mid-flight destroys the
 * report it was about to produce.
 *
 * The `list` reporter prints a line as each test finishes, so silence — not
 * elapsed time — is what distinguishes "wedged" from "long". The window is set
 * well above a single test's budget (including retries) so a slow test is never
 * mistaken for a hang.
 */
const RUN_IDLE_TIMEOUT_MS = 15 * 60 * 1000

/**
 * Browser downloads are hundreds of megabytes over a CDN; a slow connection can
 * legitimately take many minutes, so this is far more generous than a run's own
 * idle window.
 */
const BROWSER_INSTALL_TIMEOUT_MS = 20 * 60 * 1000

/**
 * Escapes special regex characters in a string for use in Playwright's --grep option
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const REPORT_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** Directory holding per-scope report snapshots (kept out of the user's VCS under .app/). */
function reportsRoot(workspacePath: string): string {
  return path.join(workspacePath, '.app', 'reports')
}

/**
 * A filesystem- and URL-safe id for a report scope (the global runner, or a spec's
 * feature path). Collapses anything outside [A-Za-z0-9._-] so it is a single path
 * segment, and never empty.
 */
function sanitizeReportScope(scope: string): string {
  const id = scope.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|_+$/g, '')
  return id || 'global'
}

export class RunnerService {
  private commandRunner: ICommandRunner
  private currentProcess: ChildProcess | null = null
  private reportServer: http.Server | null = null

  constructor(commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
  }

  private resolvePlaywrightCliPath(workspacePath: string): string | null {
    const workspaceNodeModules = path.join(workspacePath, 'node_modules')

    const candidates = [
      path.join(workspaceNodeModules, '@playwright/test', 'cli.js'),
      path.join(workspaceNodeModules, 'playwright', 'cli.js'),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  }

  private resolveBddgenCliPath(workspacePath: string): string | null {
    const workspaceNodeModules = path.join(workspacePath, 'node_modules')

    const candidate = path.join(workspaceNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js')
    if (fs.existsSync(candidate)) {
      return candidate
    }

    return null
  }

  /**
   * Make sure the workspace's Playwright browsers are present, installing them
   * if they are not.
   *
   * Returns `null` when the run may proceed, or an error result when the
   * browsers are missing and could not be installed.
   *
   * Auto-installing matches how npm dependencies are already handled above, but
   * this download is large and slow, so it is announced on the run log first —
   * a run that appears to hang for several minutes with no explanation is worse
   * than a slow one the user understands.
   */
  private async ensureBrowsers(
    workspacePath: string,
    playwrightCliPath: string | null,
    onOutput?: (stream: 'stdout' | 'stderr', data: string) => void,
  ): Promise<BatchRunResult | null> {
    const status = checkBrowsers(workspacePath)

    if (status.undetectable) {
      logger.info('Skipping the Playwright browser check', { reason: status.undetectable })
      return null
    }
    if (!status.needsInstall) return null

    const summary = describeMissingBrowsers(status)
    logger.info('Installing Playwright browsers before the run', {
      missing: status.missing.map((b) => `${b.name}-${b.revision}`),
    })
    onOutput?.('stdout', `${summary}\nDownloading them now — this can take a few minutes.\n`)

    if (!playwrightCliPath) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 0,
        stdout: '',
        stderr: `${summary}\nPlaywright was not found in this workspace, so they cannot be installed automatically. Run "npx playwright install" in the workspace.`,
        errors: [],
      }
    }

    const nodePath = await getNodeService().getNodePath()
    if (!nodePath) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 0,
        stdout: '',
        stderr: `${summary}\nNode.js was not found, so they cannot be installed automatically. Run "npx playwright install" in the workspace.`,
        errors: [],
      }
    }

    const names = [...new Set(status.missing.map((b) => b.name))]

    const result = await this.commandRunner.exec(
      nodePath,
      [playwrightCliPath, 'install', ...names],
      { cwd: workspacePath, timeout: BROWSER_INSTALL_TIMEOUT_MS },
    )

    if (result.code !== 0) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 0,
        stdout: result.stdout,
        stderr: `${summary}\nAutomatic installation failed. Run "npx playwright install" in the workspace.\n${result.stderr}`,
        errors: [],
      }
    }

    onOutput?.('stdout', 'Playwright browsers installed.\n')
    return null
  }

  async getWorkspaceTests(): Promise<WorkspaceTestInfo> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      return { features: [], allTags: [], folders: [] }
    }

    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    const featuresDirFull = path.join(workspacePath, featuresDir)
    const features: FeatureTestInfo[] = []
    const allTagsSet = new Set<string>()

    await this.scanFeatureFiles(featuresDirFull, featuresDir, features, allTagsSet)

    const foldersSet = new Set<string>()
    for (const f of features) {
      foldersSet.add(f.folder)
    }

    return {
      features: features.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      allTags: [...allTagsSet].sort(),
      folders: [...foldersSet].sort(),
    }
  }

  /**
   * Snapshot the last run's Playwright HTML report into a per-SCOPE folder and serve
   * it from a tiny in-process static server, returning its URL. Each scope (the global
   * runner, or a single spec's quick-run) keeps its OWN report copy, so viewing one
   * scope never shows another's results — Playwright overwrites `playwright-report/`
   * on every run, so we copy it aside here, right after the run that produced it.
   *
   * We serve the folder ourselves rather than spawning `playwright show-report` so it
   * never depends on CLI resolution, the embedded Node, or a detached child that can
   * fail silently in the packaged app.
   */
  async showReport(scope: string): Promise<string> {
    const workspacePath = getWorkspaceService().getPath()
    if (!workspacePath) throw new Error('No workspace selected')

    const scopeId = sanitizeReportScope(scope)
    const src = path.join(workspacePath, 'playwright-report')
    const root = reportsRoot(workspacePath)
    const dest = path.join(root, scopeId)

    // Snapshot the just-produced report into this scope's folder (when present). We keep
    // only the LAST report: the whole reports dir is dropped first, so exactly one
    // snapshot (this run's) remains, named by its scope.
    if (fs.existsSync(path.join(src, 'index.html'))) {
      fs.rmSync(root, { recursive: true, force: true })
      fs.mkdirSync(root, { recursive: true })
      fs.cpSync(src, dest, { recursive: true })
    } else if (!fs.existsSync(path.join(dest, 'index.html'))) {
      // No fresh report and none previously snapshotted for this scope.
      throw new Error('No report yet — run a test first, then watch the replay.')
    }

    const host = '127.0.0.1'
    const port = 9323
    const url = `http://${host}:${port}/${scopeId}/`

    if (this.reportServer) return url

    await new Promise<void>((resolve) => {
      const server = http.createServer((req, res) => this.serveReportFile(req, res))
      server.once('error', () => resolve()) // port already serving a report — reuse it
      server.listen(port, host, () => {
        this.reportServer = server
        resolve()
      })
    })
    return url
  }

  /**
   * Serve a static file from a per-scope report snapshot under `.app/reports/`. The URL
   * shape is `/<scopeId>/<asset>`; a bare `/<scopeId>/` serves that scope's index.html.
   */
  private serveReportFile(req: http.IncomingMessage, res: http.ServerResponse): void {
    const workspacePath = getWorkspaceService().getPath()
    const root = workspacePath ? reportsRoot(workspacePath) : ''
    try {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '')
      if (rel === '' || rel.endsWith('/')) rel += 'index.html'
      const filePath = path.normalize(path.join(root, rel))
      if (!root || !filePath.startsWith(root + path.sep)) {
        res.writeHead(403).end('Forbidden')
        return
      }
      const body = fs.readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': REPORT_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(body)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
    }
  }

  private async scanFeatureFiles(
    dir: string,
    prefix: string,
    features: FeatureTestInfo[],
    allTags: Set<string>,
  ): Promise<void> {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = `${prefix}/${entry.name}`

        if (entry.isDirectory()) {
          await this.scanFeatureFiles(fullPath, relativePath, features, allTags)
        } else if (entry.name.endsWith('.feature')) {
          const content = await fsPromises.readFile(fullPath, 'utf-8')
          const metadata = parseFeatureMetadata(content)

          features.push({
            relativePath,
            name: metadata.name,
            tags: metadata.tags,
            folder: prefix,
            scenarios: metadata.scenarios,
          })

          metadata.tags.forEach((t) => allTags.add(t))
          metadata.scenarios.forEach((s) => s.tags.forEach((t) => allTags.add(t)))
        }
      }
    } catch {
      // Directory doesn't exist or not accessible
    }
  }

  async runBatch(options: BatchRunOptions, onOutput?: (stream: 'stdout' | 'stderr', data: string) => void): Promise<BatchRunResult> {
    const scripted = await replayScriptedRun(onOutput)
    if (scripted) return scripted

    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 0,
        stdout: '',
        stderr: 'No workspace selected',
        errors: [],
      }
    }

    // Check and install dependencies if needed
    const depService = getDependencyService()
    const depStatus = await depService.checkStatus(workspacePath)

    if (depStatus.needsInstall) {
      logger.info('Installing dependencies before batch run', {
        reason: depStatus.reason,
      })

      const installResult = await depService.install(workspacePath)
      if (!installResult.success) {
        return {
          status: 'error',
          featureResults: [],
          summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
          duration: installResult.duration,
          stdout: installResult.stdout,
          stderr: installResult.error || 'Failed to install dependencies',
          errors: [],
        }
      }
    }

    const workspaceNodeModules = path.join(workspacePath, 'node_modules')
    const playwrightCliPath = this.resolvePlaywrightCliPath(workspacePath)
    const bddgenCliPath = this.resolveBddgenCliPath(workspacePath)

    // Browsers are pinned per Playwright version, so upgrading Playwright — an
    // ordinary npm change — silently invalidates them. Caught here rather than
    // letting Playwright fail mid-run with a raw "Executable doesn't exist".
    const browserFailure = await this.ensureBrowsers(workspacePath, playwrightCliPath, onOutput)
    if (browserFailure) return browserFailure

    const startTime = Date.now()

    if (!bddgenCliPath) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 0,
        stdout: '',
        stderr: 'bddgen CLI not found. Please install playwright-bdd in your workspace.',
        errors: [],
      }
    }

    const nodeService = getNodeService()
    const nodeExec = await nodeService.getNodePath()

    if (!nodeExec) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 0,
        stdout: '',
        stderr: 'Node.js runtime not available. Please restart the application.',
        errors: [],
      }
    }

    // Set up PATH with workspace node_modules and embedded Node
    const pathParts: string[] = []
    const nodeDir = path.dirname(nodeExec)
    pathParts.push(nodeDir)
    if (fs.existsSync(path.join(workspaceNodeModules, '.bin'))) {
      pathParts.push(path.join(workspaceNodeModules, '.bin'))
    }
    if (process.env.PATH) {
      pathParts.push(process.env.PATH)
    }

    const normalizedBaseUrl =
      options.baseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(options.baseUrl)
        ? `https://${options.baseUrl}`
        : options.baseUrl

    // Route the machine-readable JSON report to a file so stdout is free for the live
    // `list` reporter (streamed per-test to the UI). Read back after the run.
    const jsonReportFile = path.join(reportsRoot(workspacePath), 'last-run.json')
    fs.mkdirSync(path.dirname(jsonReportFile), { recursive: true })

    const env: Record<string, string> = {
      // User-defined variables/secrets first so `${NAME}` resolves; runner-critical
      // vars below win if a variable happens to share their name.
      ...getVariablesService().resolveEnv(),
      ...(normalizedBaseUrl ? { BASE_URL: normalizedBaseUrl } : {}),
      NODE_PATH: workspaceNodeModules,
      PATH: pathParts.join(path.delimiter),
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReportFile,
      // Never let the HTML reporter auto-launch its own server/browser — SuiSui serves
      // the report itself, and an auto-open can look like a hung run.
      PLAYWRIGHT_HTML_OPEN: 'never',
      PW_TEST_HTML_REPORT_OPEN: 'never',
    }

    logger.info('Starting batch test run', {
      mode: options.mode,
      executionMode: options.executionMode,
      featurePaths: options.featurePaths?.length ?? 'all',
      tags: options.tags,
      nameFilter: options.nameFilter,
      // Logged so the run's own guard is visible up front. Electron does not
      // reload the main process when `tsc --watch` rebuilds it, so a stale
      // build is otherwise indistinguishable from a fix that did not work.
      idleTimeoutMs: options.mode === 'ui' ? 0 : RUN_IDLE_TIMEOUT_MS,
      totalTimeoutMs: 0,
    })

    // Run bddgen to generate all spec files (no FEATURE env var)
    const bddgenResult = await this.commandRunner.exec(nodeExec, [bddgenCliPath], {
      cwd: workspacePath,
      timeout: 60000,
      env,
      onOutput,
    })

    if (bddgenResult.code !== 0) {
      const parsedErrors = parseBddgenErrors(bddgenResult.stdout, bddgenResult.stderr)
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: Date.now() - startTime,
        stdout: bddgenResult.stdout,
        stderr: bddgenResult.stderr || 'bddgen generation failed',
        errors: parsedErrors,
      }
    }

    if (!playwrightCliPath) {
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: Date.now() - startTime,
        stdout: '',
        stderr: 'Playwright CLI not found. Please install @playwright/test in your workspace.',
        errors: [],
      }
    }

    // Build playwright args
    const playwrightArgs = ['test']

    // Add spec file paths (converted from feature paths)
    if (options.featurePaths && options.featurePaths.length > 0) {
      for (const fp of options.featurePaths) {
        playwrightArgs.push(`.features-gen/${fp.replace(/\.feature$/, '.feature.spec.js')}`)
      }
    }

    // Add grep pattern for tag + name filtering
    const grepPattern = this.buildGrepPattern(options.tags, options.nameFilter)
    if (grepPattern) {
      playwrightArgs.push('--grep', grepPattern)
    }

    // Sequential execution
    if (options.executionMode === 'sequential') {
      playwrightArgs.push('--workers=1')
    }

    // UI mode
    if (options.mode === 'ui') {
      playwrightArgs.push('--ui')
    } else {
      // `list` streams per-test progress to stdout live (so the UI can show real-time
      // status); `json` (→ file) is parsed for results; `html` builds the report.
      // SuiSui's own reporter (feature 011) adds per-STEP events, which none of
      // the built-in reporters expose while a run is in flight.
      const progressReporter = provisionProgressReporter(workspacePath)
      playwrightArgs.push(
        progressReporter
          ? `--reporter=list,json,html,${progressReporter}`
          : '--reporter=list,json,html'
      )
      // Headed: show the browser so the run can be watched (replay).
      if (options.headed) {
        playwrightArgs.push('--headed')
      }
      // Trace: record a trace per test so the run can be replayed afterwards
      // (the HTML report links each test's trace viewer).
      if (options.trace) {
        playwrightArgs.push('--trace', 'on')
      }
    }

    if (debugRunner) {
      logger.warn('Debug: Batch run playwright args', { playwrightArgs, env })
    }

    // Run playwright test
    const result = await this.commandRunner.exec(
      nodeExec,
      [playwrightCliPath, ...playwrightArgs],
      {
        cwd: workspacePath,
        // No wall-clock cap: Playwright owns the run's total budget via its own
        // `globalTimeout`. SuiSui only guards against the process going silent.
        timeout: 0,
        idleTimeout: options.mode === 'ui' ? 0 : RUN_IDLE_TIMEOUT_MS,
        env,
        onOutput,
      },
    )

    const duration = Date.now() - startTime

    logger.info('Batch run completed', {
      exitCode: result.code,
      duration,
    })

    // For UI mode, return simple result (no JSON to parse)
    if (options.mode === 'ui') {
      return {
        status: result.code === 0 ? 'passed' : 'failed',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration,
        stdout: result.stdout,
        stderr: result.stderr,
        errors: [],
      }
    }

    // Parse the JSON report from its file (stdout now carries the live `list` output).
    // Fall back to stdout for resilience if the file wasn't produced.
    let jsonStr = ''
    try {
      jsonStr = fs.readFileSync(jsonReportFile, 'utf-8')
    } catch {
      jsonStr = result.stdout
    }
    return parsePlaywrightJsonReport(jsonStr, result.stdout, result.stderr, duration)
  }

  private buildGrepPattern(tags?: string[], nameFilter?: string): string | undefined {
    const hasTags = tags && tags.length > 0
    const hasName = nameFilter && nameFilter.length > 0

    if (!hasTags && !hasName) return undefined

    if (hasTags && !hasName) {
      return tags.map((t) => `@${escapeRegex(t)}`).join('|')
    }

    if (!hasTags && hasName) {
      return escapeRegex(nameFilter)
    }

    // Both: use lookaheads for AND logic across filter types
    const tagPattern = tags!.map((t) => `@${escapeRegex(t)}`).join('|')
    return `(?=.*(${tagPattern}))(?=.*${escapeRegex(nameFilter!)})`
  }

  private findReportPath(stdout: string): string | undefined {
    const match = stdout.match(/HTML report.*?:\s*(.*\.html)/i)
    return match?.[1]
  }

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM')
      this.currentProcess = null
    }
  }
}

let runnerServiceInstance: RunnerService | null = null

export function getRunnerService(commandRunner?: ICommandRunner): RunnerService {
  if (!runnerServiceInstance) {
    runnerServiceInstance = new RunnerService(commandRunner)
  }
  return runnerServiceInstance
}

export function resetRunnerService(): void {
  runnerServiceInstance = null
}
