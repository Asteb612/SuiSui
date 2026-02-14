import type { WorkspaceInfo, WorkspaceValidation } from '../types/workspace'
import type { FeatureFile, Scenario, FeatureTreeNode } from '../types/feature'
import type { StepExportResult, DecoratorDefinition } from '../types/step'
import type { ValidationResult } from '../types/validation'
import type { RunResult, RunOptions } from '../types/runner'
import type { GitStatusResult, GitOperationResult } from '../types/git'
import type { AppSettings } from '../types/settings'
import type { NodeRuntimeInfo, NodeExtractionResult } from '../types/node'
import type { DependencyStatus, DependencyInstallResult, PackageJsonCheckResult } from '../types/dependency'
import type { GitWorkspaceParams, WorkspaceMetadata, PullResult, WorkspaceStatusResult, CommitPushOptions, CommitPushResult } from '../types/gitWorkspace'
import type { DeviceFlowResponse, DeviceFlowPollResult, GithubUser, GithubRepo } from '../types/github'

export interface WorkspaceSelectResult {
  workspace: WorkspaceInfo | null
  validation: WorkspaceValidation | null
  selectedPath: string | null
}

export interface ElectronAPI {
  workspace: {
    get: () => Promise<WorkspaceInfo | null>
    set: (path: string) => Promise<WorkspaceValidation>
    select: () => Promise<WorkspaceSelectResult>
    validate: (path: string) => Promise<WorkspaceValidation>
    init: (path: string) => Promise<WorkspaceInfo>
  }

  features: {
    list: () => Promise<FeatureFile[]>
    read: (relativePath: string) => Promise<string>
    write: (relativePath: string, content: string) => Promise<void>
    delete: (relativePath: string) => Promise<void>
    getTree: () => Promise<FeatureTreeNode[]>
    createFolder: (relativePath: string) => Promise<void>
    renameFolder: (oldPath: string, newPath: string) => Promise<void>
    deleteFolder: (relativePath: string) => Promise<void>
    rename: (oldPath: string, newPath: string) => Promise<void>
    move: (filePath: string, newFolderPath: string) => Promise<void>
    copy: (sourcePath: string, targetPath: string) => Promise<void>
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

  node: {
    ensureRuntime: () => Promise<NodeExtractionResult>
    getInfo: () => Promise<NodeRuntimeInfo | null>
  }

  deps: {
    checkStatus: () => Promise<DependencyStatus>
    checkPackageJson: () => Promise<PackageJsonCheckResult>
    ensureRequired: () => Promise<PackageJsonCheckResult>
    install: () => Promise<DependencyInstallResult>
  }

  gitWorkspace: {
    cloneOrOpen: (params: GitWorkspaceParams) => Promise<WorkspaceMetadata>
    pull: (localPath: string, token: string) => Promise<PullResult>
    status: (localPath: string) => Promise<WorkspaceStatusResult>
    commitAndPush: (localPath: string, token: string, options: CommitPushOptions) => Promise<CommitPushResult>
  }

  github: {
    saveToken: (token: string) => Promise<void>
    getToken: () => Promise<string | null>
    deleteToken: () => Promise<void>
    validateToken: (token: string) => Promise<GithubUser>
    deviceFlowStart: () => Promise<DeviceFlowResponse>
    deviceFlowPoll: (deviceCode: string) => Promise<DeviceFlowPollResult>
    getUser: (token: string) => Promise<GithubUser>
    listRepos: (token: string) => Promise<GithubRepo[]>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
