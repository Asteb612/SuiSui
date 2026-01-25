import type { RunResult, RunOptions, RunStatus } from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
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

  private resolvePlaywrightCliPath(appRoot: string): string | null {
    const appNodeModules = path.join(appRoot, 'node_modules')
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')

    const candidates = [
      path.join(appNodeModules, 'playwright', 'cli.js'),
      path.join(rootNodeModules, 'playwright', 'cli.js'),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  }

  private resolveBddgenCliPath(appRoot: string): string | null {
    const appNodeModules = path.join(appRoot, 'node_modules')
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')

    const candidates = [
      path.join(appNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js'),
      path.join(rootNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js'),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
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
    const playwrightCliPath = this.resolvePlaywrightCliPath(appRoot)
    const bddgenCliPath = this.resolveBddgenCliPath(appRoot)

    const nodePathParts = [appNodeModules]
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


    const env: Record<string, string> = {
      ...(normalizedBaseUrl ? { BASE_URL: normalizedBaseUrl } : {}),
      NODE_PATH: nodePathParts.join(path.delimiter),
      PATH: `${path.join(appNodeModules, '.bin')}${path.delimiter}${process.env.PATH || ''}`,
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
      logger.error('bddgen CLI not found', undefined, { appRoot, appNodeModules, rootNodeModules })
      return {
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: 'bddgen CLI not found. Please ensure playwright-bdd is installed in the app.',
        duration: 0,
      }
    }

    const bddgenResult = await this.commandRunner.exec('node', [bddgenCliPath], {
      cwd: workspacePath,
      timeout: 60000,
      env,
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

    const cmd = playwrightCliPath ? 'node' : 'npx'
    const cmdArgs = playwrightCliPath ? [playwrightCliPath, ...args.slice(1)] : args

    const result = await this.commandRunner.exec(cmd, cmdArgs, {
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
