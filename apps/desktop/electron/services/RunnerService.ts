import type { RunResult, RunOptions, RunStatus } from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'

export class RunnerService {
  private commandRunner: ICommandRunner
  private currentProcess: ChildProcess | null = null

  constructor(commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
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
      args.push(options.featurePath)
    }

    if (options.scenarioName) {
      args.push('--grep', options.scenarioName)
    }

    const startTime = Date.now()

    const result = await this.commandRunner.exec('npx', args, {
      cwd: workspacePath,
      timeout: options.mode === 'ui' ? 0 : 300000,
    })

    const duration = Date.now() - startTime

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
