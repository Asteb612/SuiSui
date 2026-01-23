import type { WorkspaceInfo, WorkspaceValidation } from '../types/workspace'
import type { FeatureFile, Scenario } from '../types/feature'
import type { StepExportResult, DecoratorDefinition } from '../types/step'
import type { ValidationResult } from '../types/validation'
import type { RunResult, RunOptions } from '../types/runner'
import type { GitStatusResult, GitOperationResult } from '../types/git'
import type { AppSettings } from '../types/settings'

export interface ElectronAPI {
  workspace: {
    get: () => Promise<WorkspaceInfo | null>
    set: (path: string) => Promise<WorkspaceValidation>
    select: () => Promise<WorkspaceInfo | null>
    validate: (path: string) => Promise<WorkspaceValidation>
  }

  features: {
    list: () => Promise<FeatureFile[]>
    read: (relativePath: string) => Promise<string>
    write: (relativePath: string, content: string) => Promise<void>
    delete: (relativePath: string) => Promise<void>
  }

  steps: {
    export: () => Promise<StepExportResult>
    getCached: () => Promise<StepExportResult | null>
    getDecorators: () => Promise<DecoratorDefinition[]>
  }

  validate: {
    scenario: (scenario: Scenario) => Promise<ValidationResult>
  }

  runner: {
    runHeadless: (options?: Partial<RunOptions>) => Promise<RunResult>
    runUI: (options?: Partial<RunOptions>) => Promise<RunResult>
    stop: () => Promise<void>
  }

  git: {
    status: () => Promise<GitStatusResult>
    pull: () => Promise<GitOperationResult>
    commitPush: (message: string) => Promise<GitOperationResult>
  }

  settings: {
    get: () => Promise<AppSettings>
    set: (settings: Partial<AppSettings>) => Promise<void>
    reset: () => Promise<void>
  }

  app: {
    getVersion: () => Promise<string>
    openExternal: (url: string) => Promise<void>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
