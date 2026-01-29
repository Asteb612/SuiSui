import type { RunResult, RunOptions, RunStatus } from '@suisui/shared'
import { app } from 'electron'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { createLogger } from '../utils/logger'

const logger = createLogger('RunnerService')
const debugRunner = process.env.SUISUI_DEBUG_RUNNER === '1'

export class RunnerService {
  private commandRunner: ICommandRunner
  private currentProcess: ChildProcess | null = null

  constructor(commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
  }

  private getAppRoot(): string {
    const appRoot = path.resolve(__dirname, '..', '..')

    const packageJsonPath = path.join(appRoot, 'package.json')
    try {
      fs.accessSync(packageJsonPath)
      return appRoot
    } catch {
      try {
        return app.getAppPath()
      } catch {
        return appRoot
      }
    }
  }

  private resolvePlaywrightCliPath(appRoot: string, workspacePath?: string | null): string | null {
    const appNodeModules = path.join(appRoot, 'node_modules')
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')
    const workspaceNodeModules = workspacePath ? path.join(workspacePath, 'node_modules') : null
    // In packaged app, node_modules are in extraResources
    const resourceNodeModules = app.isPackaged && process.resourcesPath
      ? path.join(process.resourcesPath, 'node_modules')
      : null

    const candidates = [
      // Check packaged extraResources first
      resourceNodeModules ? path.join(resourceNodeModules, '@playwright/test', 'cli.js') : null,
      resourceNodeModules ? path.join(resourceNodeModules, 'playwright', 'cli.js') : null,
      path.join(appNodeModules, '@playwright/test', 'cli.js'),
      path.join(appNodeModules, 'playwright', 'cli.js'),
      workspaceNodeModules ? path.join(workspaceNodeModules, '@playwright/test', 'cli.js') : null,
      workspaceNodeModules ? path.join(workspaceNodeModules, 'playwright', 'cli.js') : null,
      path.join(rootNodeModules, 'playwright', 'cli.js'),
    ]

    for (const candidate of candidates) {
      if (!candidate) continue
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  }

  private resolveBddgenCliPath(appRoot: string, workspacePath?: string | null): string | null {
    const appNodeModules = path.join(appRoot, 'node_modules')
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')
    const workspaceNodeModules = workspacePath ? path.join(workspacePath, 'node_modules') : null
    // In packaged app, node_modules are in extraResources
    const resourceNodeModules = app.isPackaged && process.resourcesPath
      ? path.join(process.resourcesPath, 'node_modules')
      : null

    const candidates = [
      // Check packaged extraResources first
      resourceNodeModules
        ? path.join(resourceNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js')
        : null,
      path.join(appNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js'),
      workspaceNodeModules
        ? path.join(workspaceNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js')
        : null,
      path.join(rootNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js'),
    ]

    for (const candidate of candidates) {
      if (!candidate) continue
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  }

  private resolveBundledBrowsersPath(appRoot: string): string | null {
    const packagedPath =
      typeof process.resourcesPath === 'string'
        ? path.join(process.resourcesPath, 'playwright-browsers')
        : null
    const devPath = path.join(appRoot, 'playwright-browsers')
    const candidate = packagedPath && fs.existsSync(packagedPath) ? packagedPath : devPath

    return fs.existsSync(candidate) ? candidate : null
  }

  async runHeadless(options: Partial<RunOptions> = {}): Promise<RunResult> {
    return this.run({ ...options, mode: 'headless' })
  }

  async runUI(options: Partial<RunOptions> = {}): Promise<RunResult> {
    return this.run({ ...options, mode: 'ui' })
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

    const args = ['playwright', 'test']

    if (options.mode === 'ui') {
      args.push('--ui')
    }

    if (options.featurePath) {
      const normalized = options.featurePath.replace(/\\/g, '/')
      const isAbsolute = path.isAbsolute(options.featurePath)
      const isInFeaturesDir = normalized.startsWith('features/')
      const resolvedFeaturePath =
        isAbsolute || isInFeaturesDir
          ? options.featurePath
          : path.join('features', options.featurePath)
      args.push(resolvedFeaturePath)
    }

    if (options.scenarioName) {
      args.push('--grep', options.scenarioName)
    }

    const appRoot = this.getAppRoot()
    const appNodeModules = path.join(appRoot, 'node_modules')
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')
    const playwrightCliPath = this.resolvePlaywrightCliPath(appRoot, workspacePath)
    const bddgenCliPath = this.resolveBddgenCliPath(appRoot, workspacePath)
    const bundledBrowsersPath = this.resolveBundledBrowsersPath(appRoot)

    const nodePathParts = []
    const workspaceNodeModules = path.join(workspacePath, 'node_modules')
    if (fs.existsSync(workspaceNodeModules)) {
      nodePathParts.push(workspaceNodeModules)
    }
    // In packaged app, node_modules are in extraResources (check first)
    const resourceNodeModules =
      typeof process.resourcesPath === 'string'
        ? path.join(process.resourcesPath, 'node_modules')
        : null
    const unpackedNodeModules =
      typeof process.resourcesPath === 'string'
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
        : null
    if (resourceNodeModules && fs.existsSync(resourceNodeModules)) {
      nodePathParts.push(resourceNodeModules)
    }
    if (unpackedNodeModules && fs.existsSync(unpackedNodeModules)) {
      nodePathParts.push(unpackedNodeModules)
    }
    // Only add appNodeModules if it exists (won't exist in packaged app)
    if (fs.existsSync(appNodeModules)) {
      nodePathParts.push(appNodeModules)
    }
    if (fs.existsSync(rootNodeModules)) {
      nodePathParts.push(rootNodeModules)
    }
    if (process.env.NODE_PATH) {
      nodePathParts.push(process.env.NODE_PATH)
    }

    const normalizedBaseUrl =
      options.baseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(options.baseUrl)
        ? `https://${options.baseUrl}`
        : options.baseUrl


    const pathParts = []
    if (fs.existsSync(path.join(workspaceNodeModules, '.bin'))) {
      pathParts.push(path.join(workspaceNodeModules, '.bin'))
    }
    // In packaged app, check extraResources .bin first
    if (resourceNodeModules && fs.existsSync(path.join(resourceNodeModules, '.bin'))) {
      pathParts.push(path.join(resourceNodeModules, '.bin'))
    }
    if (fs.existsSync(path.join(appNodeModules, '.bin'))) {
      pathParts.push(path.join(appNodeModules, '.bin'))
    }
    if (process.env.PATH) {
      pathParts.push(process.env.PATH)
    }

    const env: Record<string, string> = {
      ...(normalizedBaseUrl ? { BASE_URL: normalizedBaseUrl } : {}),
      ...(bundledBrowsersPath ? { PLAYWRIGHT_BROWSERS_PATH: bundledBrowsersPath } : {}),
      NODE_PATH: nodePathParts.join(path.delimiter),
      PATH: pathParts.join(path.delimiter),
    }

    if (debugRunner) {
      logger.warn('Debug: Starting Playwright run', {
        mode: options.mode,
        workspacePath,
        args,
        featurePath: options.featurePath,
        scenarioName: options.scenarioName,
        baseUrl: normalizedBaseUrl,
        appRoot,
        appNodeModules,
        rootNodeModules,
        playwrightCliPath,
        bddgenCliPath,
        bundledBrowsersPath,
        nodeExec: process.execPath,
      })
    } else {
      logger.info('Starting Playwright run', {
        mode: options.mode,
        workspacePath,
        args,
        featurePath: options.featurePath,
        scenarioName: options.scenarioName,
        baseUrl: options.baseUrl,
      })
    }

    const startTime = Date.now()

    if (!bddgenCliPath) {
      logger.error('bddgen CLI not found', undefined, {
        appRoot,
        appNodeModules,
        rootNodeModules,
        workspacePath,
      })
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'bddgen CLI not found. Please install playwright-bdd in your workspace.',
        duration: 0,
      }
    }

    const nodeExec = process.execPath
    const runAsNodeEnv: Record<string, string> = process.versions.electron
      ? { ELECTRON_RUN_AS_NODE: '1' }
      : {}

    const bddgenResult = await this.commandRunner.exec(nodeExec, [bddgenCliPath], {
      cwd: workspacePath,
      timeout: 60000,
      env: { ...env, ...runAsNodeEnv },
    })

    if (bddgenResult.code !== 0) {
      logger.error('bddgen generation failed', undefined, {
        exitCode: bddgenResult.code,
        stdoutLength: bddgenResult.stdout.length,
        stderrLength: bddgenResult.stderr.length,
      })
      return {
        status: 'error',
        exitCode: bddgenResult.code,
        stdout: bddgenResult.stdout,
        stderr: bddgenResult.stderr || 'bddgen generation failed',
        duration: Date.now() - startTime,
      }
    }

    if (!playwrightCliPath) {
      logger.error('Playwright CLI not found', undefined, {
        appRoot,
        appNodeModules,
        rootNodeModules,
        workspacePath,
      })
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'Playwright CLI not found. Please install @playwright/test in your workspace.',
        duration: Date.now() - startTime,
      }
    }

    const result = await this.commandRunner.exec(nodeExec, [playwrightCliPath, ...args.slice(1)], {
      cwd: workspacePath,
      timeout: options.mode === 'ui' ? 0 : 300000,
      env: { ...env, ...runAsNodeEnv },
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
