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

// --- Batch execution types ---

export interface BatchRunOptions {
  featurePaths?: string[]
  tags?: string[]
  nameFilter?: string
  executionMode: 'sequential' | 'parallel'
  mode: RunMode
  baseUrl?: string
}

export interface BatchRunResult {
  status: RunStatus
  featureResults: FeatureRunResult[]
  summary: RunSummary
  duration: number
  stdout: string
  stderr: string
  reportPath?: string
  errors: RunError[]
}

export interface FeatureRunResult {
  relativePath: string
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  scenarioResults: ScenarioRunResult[]
}

export interface ScenarioRunResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  error?: string
}

export interface RunSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  features: number
}

// --- Workspace test info types ---

export interface WorkspaceTestInfo {
  features: FeatureTestInfo[]
  allTags: string[]
  folders: string[]
}

export interface FeatureTestInfo {
  relativePath: string
  name: string
  tags: string[]
  folder: string
  scenarios: ScenarioTestInfo[]
}

export interface ScenarioTestInfo {
  name: string
  tags: string[]
}

// --- Run configuration (persisted) ---

export type FilterTab = 'features' | 'folders' | 'tags'

export interface RunConfiguration {
  activeFilterTab: FilterTab
  selectedFeatures: string[]
  selectedFolders: string[]
  selectedTags: string[]
  nameFilter: string
  executionMode: 'sequential' | 'parallel'
  baseUrl: string
}
