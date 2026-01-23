export type RunMode = 'headless' | 'ui'

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error'

export interface RunResult {
  status: RunStatus
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  reportPath?: string
}

export interface RunOptions {
  mode: RunMode
  featurePath?: string
  scenarioName?: string
}
