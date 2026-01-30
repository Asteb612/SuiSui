import type { RunResult, RunOptions, RunStatus } from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import { getDependencyService } from './DependencyService'
import { getNodeService } from './NodeService'
import type { ChildProcess } from 'node:child_process'
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
      NODE_PATH: workspaceNodeModules,
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
        workspaceNodeModules,
        playwrightCliPath,
        bddgenCliPath,
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

    const bddgenResult = await this.commandRunner.exec(nodeExec, [bddgenCliPath], {
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

    const result = await this.commandRunner.exec(nodeExec, [playwrightCliPath, ...args.slice(1)], {
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
