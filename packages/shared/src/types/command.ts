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
  /** Set when the caller cancelled the command via `CommandOptions.signal`. */
  cancelled?: boolean
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
  /**
   * Cancels the command, taking down its whole process tree.
   *
   * Needed because a test run is a tree — the Playwright CLI spawns workers,
   * which spawn browsers — and signalling only the process we hold a handle to
   * leaves the rest running. Cancellation therefore goes through the same
   * group-kill and SIGKILL escalation a timeout uses, rather than a bare
   * `child.kill()`.
   */
  signal?: AbortSignal
}
