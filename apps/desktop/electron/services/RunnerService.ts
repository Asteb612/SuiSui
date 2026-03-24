import type {
  RunResult,
  RunOptions,
  RunStatus,
  BatchRunOptions,
  BatchRunResult,
  FeatureRunResult,
  ScenarioRunResult,
  RunSummary,
  WorkspaceTestInfo,
  FeatureTestInfo,
  ScenarioTestInfo,
} from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import { getDependencyService } from './DependencyService'
import { getNodeService } from './NodeService'
import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { createLogger } from '../utils/logger'
import { parseBddgenErrors, getErrorSummary } from '../utils/bddgenErrorParser'

const logger = createLogger('RunnerService')
const debugRunner = process.env.SUISUI_DEBUG_RUNNER === '1'

/**
 * Escapes special regex characters in a string for use in Playwright's --grep option
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Lightweight Gherkin parser that extracts feature metadata (name, tags, scenarios)
 * without needing a full Cucumber parser dependency.
 */
interface ParsedFeatureMetadata {
  name: string
  tags: string[]
  scenarios: ScenarioTestInfo[]
}

function parseFeatureMetadata(content: string): ParsedFeatureMetadata {
  const lines = content.split('\n')
  let featureName = ''
  const featureTags: string[] = []
  const scenarios: ScenarioTestInfo[] = []
  let pendingTags: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('@')) {
      const tags = trimmed
        .split(/\s+/)
        .filter((t) => t.startsWith('@'))
        .map((t) => t.slice(1))
      pendingTags.push(...tags)
      continue
    }

    if (trimmed.startsWith('Feature:')) {
      featureName = trimmed.replace(/^Feature:\s*/, '')
      featureTags.push(...pendingTags)
      pendingTags = []
      continue
    }

    if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
      const name = trimmed.replace(/^Scenario(?:\s+Outline)?:\s*/, '')
      scenarios.push({
        name,
        tags: [...featureTags, ...pendingTags],
      })
      pendingTags = []
      continue
    }

    // Non-tag, non-keyword line: clear orphaned pending tags
    pendingTags = []
  }

  return { name: featureName, tags: featureTags, scenarios }
}

// --- Playwright JSON reporter types (internal) ---

interface PlaywrightJsonReport {
  suites: PlaywrightSuite[]
  stats?: {
    startTime: string
    duration: number
    expected: number
    unexpected: number
    skipped: number
    flaky: number
  }
}

interface PlaywrightSuite {
  title: string
  file?: string
  suites?: PlaywrightSuite[]
  specs?: PlaywrightSpec[]
}

interface PlaywrightSpec {
  title: string
  ok: boolean
  tests: PlaywrightTest[]
}

interface PlaywrightTest {
  expectedStatus: string
  status: string
  results: PlaywrightTestResult[]
}

interface PlaywrightTestResult {
  status: string
  duration: number
  errors?: Array<{ message?: string; stack?: string }>
}

function extractFeatureRelativePath(generatedPath: string): string {
  // .features-gen/features/auth/login.feature.spec.js → features/auth/login.feature
  const match = generatedPath.match(/\.features-gen\/(.+?)\.spec\.[jt]s$/)
  return match?.[1] ?? generatedPath
}

function parsePlaywrightJsonReport(
  jsonStr: string,
  rawStdout: string,
  rawStderr: string,
  totalDuration: number,
): BatchRunResult {
  let report: PlaywrightJsonReport
  try {
    report = JSON.parse(jsonStr) as PlaywrightJsonReport
  } catch {
    return {
      status: 'error',
      featureResults: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
      duration: totalDuration,
      stdout: rawStdout,
      stderr: rawStderr || 'Failed to parse JSON reporter output',
      errors: [],
    }
  }

  const featureResults: FeatureRunResult[] = []

  function collectScenarioResults(suite: PlaywrightSuite, results: ScenarioRunResult[]): void {
    if (suite.specs) {
      for (const spec of suite.specs) {
        const test = spec.tests[0]
        const result = test?.results[0]
        results.push({
          name: spec.title,
          status:
            result?.status === 'passed'
              ? 'passed'
              : result?.status === 'skipped'
                ? 'skipped'
                : 'failed',
          duration: result?.duration ?? 0,
          error: result?.errors?.[0]?.message,
        })
      }
    }
    if (suite.suites) {
      for (const sub of suite.suites) {
        collectScenarioResults(sub, results)
      }
    }
  }

  function collectFeatureSuites(suite: PlaywrightSuite): void {
    if (suite.file?.includes('.features-gen/')) {
      const relativePath = extractFeatureRelativePath(suite.file)
      const scenarioResults: ScenarioRunResult[] = []
      collectScenarioResults(suite, scenarioResults)

      const status: 'passed' | 'failed' | 'skipped' = scenarioResults.some(
        (s) => s.status === 'failed',
      )
        ? 'failed'
        : scenarioResults.every((s) => s.status === 'skipped')
          ? 'skipped'
          : 'passed'

      featureResults.push({
        relativePath,
        name: suite.title,
        status,
        duration: scenarioResults.reduce((sum, s) => sum + s.duration, 0),
        scenarioResults,
      })
      return
    }
    if (suite.suites) {
      for (const child of suite.suites) {
        collectFeatureSuites(child)
      }
    }
  }

  for (const rootSuite of report.suites) {
    collectFeatureSuites(rootSuite)
  }

  const allScenarios = featureResults.flatMap((f) => f.scenarioResults)
  const summary: RunSummary = {
    total: allScenarios.length,
    passed: allScenarios.filter((s) => s.status === 'passed').length,
    failed: allScenarios.filter((s) => s.status === 'failed').length,
    skipped: allScenarios.filter((s) => s.status === 'skipped').length,
    features: featureResults.length,
  }

  return {
    status: summary.failed > 0 ? 'failed' : 'passed',
    featureResults,
    summary,
    duration: report.stats?.duration ?? totalDuration,
    stdout: rawStdout,
    stderr: rawStderr,
    errors: [],
  }
}

export class RunnerService {
  private commandRunner: ICommandRunner
  private currentProcess: ChildProcess | null = null

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

  async runHeadless(options: Partial<RunOptions> = {}): Promise<RunResult> {
    return this.run({ ...options, mode: 'headless' })
  }

  async runUI(options: Partial<RunOptions> = {}): Promise<RunResult> {
    return this.run({ ...options, mode: 'ui' })
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

    const env: Record<string, string> = {
      ...(normalizedBaseUrl ? { BASE_URL: normalizedBaseUrl } : {}),
      NODE_PATH: workspaceNodeModules,
      PATH: pathParts.join(path.delimiter),
    }

    logger.info('Starting batch test run', {
      mode: options.mode,
      executionMode: options.executionMode,
      featurePaths: options.featurePaths?.length ?? 'all',
      tags: options.tags,
      nameFilter: options.nameFilter,
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
      // JSON + HTML reporters for structured output parsing
      playwrightArgs.push('--reporter=json,html')
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
        timeout: options.mode === 'ui' ? 0 : 600000,
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

    // Parse JSON reporter output
    return parsePlaywrightJsonReport(result.stdout, result.stdout, result.stderr, duration)
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

  private async run(options: RunOptions): Promise<RunResult> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      logger.error('No workspace selected')
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'No workspace selected',
        duration: 0,
      }
    }

    // Check and install dependencies if needed
    const depService = getDependencyService()
    const depStatus = await depService.checkStatus(workspacePath)

    if (depStatus.needsInstall) {
      logger.info('Installing dependencies before run', {
        reason: depStatus.reason,
        workspacePath,
      })

      const installResult = await depService.install(workspacePath)
      if (!installResult.success) {
        logger.error('Dependency installation failed', undefined, {
          error: installResult.error,
        })
        return {
          status: 'error',
          exitCode: 1,
          stdout: installResult.stdout,
          stderr: installResult.error || 'Failed to install dependencies',
          duration: installResult.duration,
        }
      }

      logger.info('Dependencies installed successfully', {
        duration: installResult.duration,
      })
    }

    // Resolve the feature file path for both bddgen and playwright
    let featurePath: string | undefined
    let specPath: string | undefined

    if (options.featurePath) {
      const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
      const normalizedFeaturesDir = featuresDir.replace(/\\/g, '/').replace(/\/+$/, '')
      const normalized = options.featurePath.replace(/\\/g, '/')
      const isInFeaturesDir = normalizedFeaturesDir
        ? normalized.startsWith(`${normalizedFeaturesDir}/`)
        : false

      // Ensure the path starts with the configured features dir
      featurePath = isInFeaturesDir ? normalized : `${normalizedFeaturesDir}/${normalized}`

      // Convert to the generated spec file path:
      // <featuresDir>/auth/login.feature -> .features-gen/<featuresDir>/auth/login.feature.spec.js
      specPath = `.features-gen/${featurePath.replace(/\.feature$/, '.feature.spec.js')}`
    }

    // Build playwright args
    const playwrightArgs = ['test']

    if (options.mode === 'ui') {
      playwrightArgs.push('--ui')
    }

    // Add the generated spec file path to playwright args
    if (specPath) {
      playwrightArgs.push(specPath)
    }

    // Escape special regex characters in scenario name for --grep
    if (options.scenarioName) {
      const escapedName = escapeRegex(options.scenarioName)
      playwrightArgs.push('--grep', escapedName)
    }

    // Use only workspace binaries
    const workspaceNodeModules = path.join(workspacePath, 'node_modules')
    const playwrightCliPath = this.resolvePlaywrightCliPath(workspacePath)
    const bddgenCliPath = this.resolveBddgenCliPath(workspacePath)

    const normalizedBaseUrl =
      options.baseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(options.baseUrl)
        ? `https://${options.baseUrl}`
        : options.baseUrl

    // Set up environment with workspace's node_modules
    const pathParts = []
    if (fs.existsSync(path.join(workspaceNodeModules, '.bin'))) {
      pathParts.push(path.join(workspaceNodeModules, '.bin'))
    }
    if (process.env.PATH) {
      pathParts.push(process.env.PATH)
    }

    const env: Record<string, string> = {
      ...(normalizedBaseUrl ? { BASE_URL: normalizedBaseUrl } : {}),
      ...(featurePath ? { FEATURE: featurePath } : {}),
      NODE_PATH: workspaceNodeModules,
      PATH: pathParts.join(path.delimiter),
    }

    if (debugRunner) {
      logger.warn('Debug: Starting test run', {
        mode: options.mode,
        workspacePath,
        playwrightArgs,
        featurePath,
        specPath,
        scenarioName: options.scenarioName,
        baseUrl: normalizedBaseUrl,
        env: { FEATURE: featurePath, BASE_URL: normalizedBaseUrl },
        workspaceNodeModules,
        playwrightCliPath,
        bddgenCliPath,
        nodeExec: process.execPath,
      })
    } else {
      logger.info('Starting test run', {
        mode: options.mode,
        workspacePath,
        featurePath,
        scenarioName: options.scenarioName,
        baseUrl: options.baseUrl,
      })
    }

    const startTime = Date.now()

    if (!bddgenCliPath) {
      logger.error('bddgen CLI not found', undefined, {
        workspacePath,
        workspaceNodeModules,
      })
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'bddgen CLI not found. Please install playwright-bdd in your workspace.',
        duration: 0,
      }
    }

    // Use embedded Node.js runtime instead of Electron's process.execPath
    const nodeService = getNodeService()
    const nodeExec = await nodeService.getNodePath()

    if (!nodeExec) {
      logger.error('Node.js runtime not found')
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'Node.js runtime not available. Please restart the application.',
        duration: 0,
      }
    }

    // Add embedded Node.js bin directory to PATH
    const nodeDir = path.dirname(nodeExec)
    if (!pathParts.includes(nodeDir)) {
      pathParts.unshift(nodeDir)
      env.PATH = pathParts.join(path.delimiter)
    }

    // Run bddgen to generate spec files
    // The FEATURE env var is read by playwright.config.ts to filter which features to generate
    const bddgenResult = await this.commandRunner.exec(nodeExec, [bddgenCliPath], {
      cwd: workspacePath,
      timeout: 60000,
      env,
    })

    if (bddgenResult.code !== 0) {
      const parsedErrors = parseBddgenErrors(bddgenResult.stdout, bddgenResult.stderr)
      const errorSummary = getErrorSummary(parsedErrors)

      logger.error('bddgen generation failed', undefined, {
        exitCode: bddgenResult.code,
        errorSummary,
        errorCount: parsedErrors.length,
        stdoutLength: bddgenResult.stdout.length,
        stderrLength: bddgenResult.stderr.length,
      })

      if (debugRunner) {
        logger.warn('Debug: bddgen error details', {
          stdout: bddgenResult.stdout,
          stderr: bddgenResult.stderr,
          parsedErrors,
        })
      }

      return {
        status: 'error',
        exitCode: bddgenResult.code,
        stdout: bddgenResult.stdout,
        stderr: bddgenResult.stderr || 'bddgen generation failed',
        duration: Date.now() - startTime,
        errors: parsedErrors,
      }
    }

    if (!playwrightCliPath) {
      logger.error('Playwright CLI not found', undefined, {
        workspacePath,
        workspaceNodeModules,
      })
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'Playwright CLI not found. Please install @playwright/test in your workspace.',
        duration: Date.now() - startTime,
      }
    }

    // Run playwright test
    const result = await this.commandRunner.exec(nodeExec, [playwrightCliPath, ...playwrightArgs], {
      cwd: workspacePath,
      timeout: options.mode === 'ui' ? 0 : 300000,
      env,
    })

    const duration = Date.now() - startTime

    if (debugRunner) {
      logger.warn('Debug: Playwright run completed', {
        exitCode: result.code,
        duration,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        stdoutSnippet: result.stdout.slice(0, 2000),
        stderrSnippet: result.stderr.slice(0, 2000),
      })
    } else {
      logger.info('Playwright run completed', {
        exitCode: result.code,
        duration,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      })
    }

    if (result.stderr) {
      logger.warn('Playwright run stderr', { stderr: result.stderr })
    }

    let status: RunStatus = 'passed'
    if (result.code !== 0) {
      status = result.stderr.includes('Error') ? 'error' : 'failed'
    }

    return {
      status,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      duration,
      reportPath: this.findReportPath(result.stdout),
    }
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
