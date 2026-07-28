import { spawn } from 'node:child_process'
import type { CommandResult, CommandOptions } from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('CommandRunner')

/** Grace period between the polite SIGTERM and the unconditional SIGKILL. */
const KILL_GRACE_MS = 5000

/** How much trailing output to quote back when a command is killed. */
const TIMEOUT_OUTPUT_TAIL = 800

/**
 * Process-group ids we have spawned and not yet reaped.
 *
 * Children are spawned detached (see `exec`) so that a timeout can signal the
 * whole tree. The flip side is that they no longer die with us, so if the app
 * exits mid-command we have to take them down explicitly or leave orphans
 * holding package-manager locks.
 */
const activeGroups = new Set<number>()
let exitHookInstalled = false

function installExitHook(): void {
  if (exitHookInstalled) return
  exitHookInstalled = true
  process.once('exit', () => {
    for (const pgid of activeGroups) {
      try {
        process.kill(-pgid, 'SIGKILL')
      } catch {
        // Already gone — nothing to clean up.
      }
    }
  })
}

export interface ICommandRunner {
  exec(cmd: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}

export class CommandRunner implements ICommandRunner {
  async exec(cmd: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const { cwd, env, timeout = 60000, idleTimeout = 0 } = options

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

      // `detached` puts the child in its own process group, which is what makes
      // a timeout able to kill the whole tree instead of just the process we
      // hold a handle to. A command like `node corepack pnpm install` is four
      // levels deep (corepack -> pnpm -> nested pnpm -> tsc); signalling only
      // the top of it leaves the rest running, still holding the package
      // manager's store lock, so every later install hangs too.
      //
      // Windows has no process groups in this sense — the tree is torn down
      // with `taskkill /T` instead — and it is incompatible with `shell: true`.
      const detached = !isWindows && !needsShell

      const child = spawn(spawnCmd, spawnArgs, {
        cwd,
        env: { ...process.env, ...env },
        shell: needsShell,
        windowsHide: true,
        detached,
        // Give the child no stdin rather than an open pipe nobody ever writes
        // to. Tools that ask a question (pnpm's "reinstall from scratch?
        // (Y/n)", corepack's download prompt) block forever on a pipe that
        // stays open; on 'ignore' the read hits EOF and they fail fast with a
        // real message instead of stalling until the timeout.
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      if (detached && child.pid !== undefined) {
        installExitHook()
        activeGroups.add(child.pid)
      }

      let stdout = ''
      let stderr = ''
      let timedOut: 'idle' | 'total' | null = null
      let cancelled = false

      /**
       * Signal the child's entire process group, falling back to the single
       * process when the group is already gone (or we never detached).
       */
      const killTree = (signal: NodeJS.Signals): void => {
        const pid = child.pid
        if (pid === undefined) return
        if (isWindows) {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
          return
        }
        try {
          if (detached) {
            process.kill(-pid, signal)
            return
          }
        } catch {
          // Group already reaped — fall through to the direct kill.
        }
        try {
          child.kill(signal)
        } catch {
          // Already exited.
        }
      }

      let killTimer: NodeJS.Timeout | null = null

      const triggerTimeout = (reason: 'idle' | 'total'): void => {
        if (timedOut) return
        timedOut = reason
        killTree('SIGTERM')
        // Escalate. A wedged install may be blocked in a syscall or ignoring
        // SIGTERM outright; without this it would survive the "kill" and go on
        // holding whatever lock made it wedge in the first place.
        killTimer = setTimeout(() => {
          killTree('SIGKILL')
          if (child.pid !== undefined) activeGroups.delete(child.pid)
        }, KILL_GRACE_MS)
        // Unref'd: this sweep must not by itself keep the process alive.
        killTimer.unref?.()
      }

      /**
       * Cancel on request, taking the whole tree down the same way a timeout
       * does. A bare `child.kill()` would leave the Playwright workers and their
       * browsers running after the user pressed Stop.
       */
      const onAbort = (): void => {
        if (cancelled || timedOut) return
        cancelled = true
        killTree('SIGTERM')
        killTimer = setTimeout(() => {
          killTree('SIGKILL')
          if (child.pid !== undefined) activeGroups.delete(child.pid)
        }, KILL_GRACE_MS)
        killTimer.unref?.()
      }

      if (options.signal) {
        if (options.signal.aborted) onAbort()
        else options.signal.addEventListener('abort', onAbort, { once: true })
      }

      const totalTimer =
        timeout > 0 ? setTimeout(() => triggerTimeout('total'), timeout) : null

      let idleTimer: NodeJS.Timeout | null = null
      const bumpIdleTimer = (): void => {
        if (idleTimeout <= 0) return
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => triggerTimeout('idle'), idleTimeout)
      }
      bumpIdleTimer()

      /**
       * Stop the deadline timers. Deliberately leaves `killTimer` alone: after
       * a timeout the SIGKILL sweep must still run, because 'close' only tells
       * us the process we held a handle to has gone — others in its group may
       * have ignored the SIGTERM and would otherwise be left behind.
       */
      const clearDeadlineTimers = (): void => {
        if (totalTimer) clearTimeout(totalTimer)
        if (idleTimer) clearTimeout(idleTimer)
        options.signal?.removeEventListener('abort', onAbort)
      }

      child.stdout?.on('data', (data) => {
        const chunk = data.toString()
        stdout += chunk
        bumpIdleTimer()
        options.onOutput?.('stdout', chunk)
      })

      child.stderr?.on('data', (data) => {
        const chunk = data.toString()
        stderr += chunk
        bumpIdleTimer()
        options.onOutput?.('stderr', chunk)
      })

      child.on('close', (code) => {
        clearDeadlineTimers()
        // On the timeout path the group stays registered until the SIGKILL
        // sweep has run, so app exit can still reap it in the meantime.
        if (!timedOut && child.pid !== undefined) activeGroups.delete(child.pid)

        if (timedOut || code !== 0) {
          logger.warn('Command execution issue', {
            cmd: fullCmd,
            cwd,
            timedOut: timedOut ?? false,
            exitCode: code ?? 1,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            // The tail is the whole point of a timeout report: it shows the
            // last thing the command managed to do before it stopped.
            lastOutput: (stdout + stderr).slice(-TIMEOUT_OUTPUT_TAIL),
          })
        }

        if (timedOut) {
          const tail = (stdout + stderr).slice(-TIMEOUT_OUTPUT_TAIL)
          const reason =
            timedOut === 'idle'
              ? `Command timed out after producing no output for ${idleTimeout}ms`
              : `Command timed out after ${timeout}ms`
          resolve({
            code: -1,
            stdout,
            stderr: `${reason}\nLast output before it stopped:\n${tail}\n${stderr}`,
            timedOut,
          })
          return
        }

        if (cancelled) {
          resolve({ code: -1, stdout, stderr, cancelled: true })
          return
        }

        resolve({ code: code ?? 1, stdout, stderr })
      })

      child.on('error', (err) => {
        clearDeadlineTimers()
        // Spawn failed outright — there is no tree to sweep.
        if (killTimer) clearTimeout(killTimer)
        if (child.pid !== undefined) activeGroups.delete(child.pid)
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
