export type RunMode = 'headless' | 'ui'

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error'

export type RunErrorType =
  | 'undefined_step'
  | 'syntax_error'
  | 'missing_decorator'
  | 'ambiguous_step'
  | 'config_error'
  | 'unknown'

export interface RunError {
  type: RunErrorType
  message: string
  step?: string
  file?: string
  line?: number
  suggestion?: string
}

export interface RunResult {
  status: RunStatus
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  reportPath?: string
  errors?: RunError[]
}

export interface RunOptions {
  mode: RunMode
  featurePath?: string
  scenarioName?: string
  baseUrl?: string
}
