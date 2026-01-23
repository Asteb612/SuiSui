export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface CommandOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
}
