import { spawn } from 'node:child_process'
import type { CommandResult, CommandOptions } from '@suisui/shared'

export interface ICommandRunner {
  exec(cmd: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}

export class CommandRunner implements ICommandRunner {
  async exec(cmd: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const { cwd, env, timeout = 60000 } = options

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: true,
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeout)

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({
          code: timedOut ? -1 : (code ?? 1),
          stdout,
          stderr: timedOut ? `Command timed out after ${timeout}ms\n${stderr}` : stderr,
        })
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          code: 1,
          stdout,
          stderr: err.message,
        })
      })
    })
  }
}

export interface MockCommandResponse {
  code: number
  stdout: string
  stderr: string
}

export class FakeCommandRunner implements ICommandRunner {
  private responses: Map<string, MockCommandResponse> = new Map()
  private defaultResponse: MockCommandResponse = { code: 0, stdout: '', stderr: '' }
  public callHistory: Array<{ cmd: string; args: string[]; options?: CommandOptions }> = []

  setResponse(cmdPattern: string, response: MockCommandResponse): void {
    this.responses.set(cmdPattern, response)
  }

  setDefaultResponse(response: MockCommandResponse): void {
    this.defaultResponse = response
  }

  clearResponses(): void {
    this.responses.clear()
    this.callHistory = []
  }

  async exec(cmd: string, args: string[], options?: CommandOptions): Promise<CommandResult> {
    this.callHistory.push({ cmd, args, options })

    const fullCmd = `${cmd} ${args.join(' ')}`

    for (const [pattern, response] of this.responses) {
      if (fullCmd.includes(pattern)) {
        return response
      }
    }

    return this.defaultResponse
  }
}

let commandRunnerInstance: ICommandRunner | null = null

export function getCommandRunner(isTestMode = false): ICommandRunner {
  if (!commandRunnerInstance) {
    commandRunnerInstance = isTestMode ? new FakeCommandRunner() : new CommandRunner()
  }
  return commandRunnerInstance
}

export function setCommandRunner(runner: ICommandRunner): void {
  commandRunnerInstance = runner
}
