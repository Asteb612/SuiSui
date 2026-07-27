export interface CommandResult {
  code: number
  stdout: string
  stderr: string
  /**
   * Set when the command was killed by a timeout, and which one fired:
   *   'idle'  — produced no output for `idleTimeout` ms (wedged)
   *   'total' — exceeded the absolute `timeout` ceiling
   * Absent when the command ran to completion, however it exited.
   */
  timedOut?: 'idle' | 'total'
}

export interface CommandOptions {
  cwd?: string
  env?: Record<string, string>
  /**
   * Absolute ceiling on wall-clock runtime, in ms. 0 disables it.
   *
   * This is a backstop, not the primary guard: a legitimate cold monorepo
   * install can run for many minutes, so setting this tight enough to catch a
   * hang would also kill healthy work. Prefer `idleTimeout` for that.
   */
  timeout?: number
  /**
   * Max time with no output at all, in ms. Reset on every stdout/stderr chunk.
   * Undefined or 0 disables it.
   *
   * Long-running tools (package managers, test runners, compilers) stream
   * progress continuously, so a stretch of total silence is a far better
   * signal of "stuck" than elapsed time is.
   */
  idleTimeout?: number
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void
}
