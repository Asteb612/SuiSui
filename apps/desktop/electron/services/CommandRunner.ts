import { spawn } from 'node:child_process'
import type { CommandResult, CommandOptions } from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('CommandRunner')

export interface ICommandRunner {
  exec(cmd: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}

export class CommandRunner implements ICommandRunner {
  async exec(cmd: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const { cwd, env, timeout = 60000 } = options

    return new Promise((resolve) => {
      // Pass arguments to spawn as an array with shell disabled so that
      // command/argument values (workspace paths, branch names, etc.) cannot
      // be interpreted by a shell. This removes the command-injection surface
      // and handles spaces in paths natively without manual quoting.
      //
      // The one exception is Windows batch shims (npm.cmd / *.bat): Node
      // refuses to spawn these without a shell (CVE-2024-27980), so for that
      // narrow case we enable the shell and quote every token. The commands
      // that reach this path are internal and fixed (npm install/ci/--version).
      const isWindows = process.platform === 'win32'
      const needsShell = isWindows && /\.(cmd|bat)$/i.test(cmd)

      let spawnCmd = cmd
      let spawnArgs = args
      if (needsShell) {
        spawnCmd = `"${cmd}"`
        spawnArgs = args.map((arg) => `"${arg.replace(/"/g, '""')}"`)
      }

      const fullCmd = `${cmd} ${args.join(' ')}`
      const child = spawn(spawnCmd, spawnArgs, {
        cwd,
        env: { ...process.env, ...env },
        shell: needsShell,
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timer =
        timeout > 0
          ? setTimeout(() => {
              timedOut = true
              child.kill('SIGTERM')
            }, timeout)
          : null

      child.stdout?.on('data', (data) => {
        const chunk = data.toString()
        stdout += chunk
        options.onOutput?.('stdout', chunk)
      })

      child.stderr?.on('data', (data) => {
        const chunk = data.toString()
        stderr += chunk
        options.onOutput?.('stderr', chunk)
      })

      child.on('close', (code) => {
        if (timer) {
          clearTimeout(timer)
        }
        if (timedOut || code !== 0) {
          logger.warn('Command execution issue', {
            cmd: fullCmd,
            cwd,
            timedOut,
            exitCode: code ?? 1,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
          })
        }
        resolve({
          code: timedOut ? -1 : (code ?? 1),
          stdout,
          stderr: timedOut ? `Command timed out after ${timeout}ms\n${stderr}` : stderr,
        })
      })

      child.on('error', (err) => {
        if (timer) {
          clearTimeout(timer)
        }
        logger.error('Command spawn error', err, { cmd: fullCmd, cwd })
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
