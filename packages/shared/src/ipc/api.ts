import type { WorkspaceInfo, WorkspaceValidation, BddDetectionResult } from '../types/workspace'
import type { FeatureFile, Scenario, FeatureTreeNode } from '../types/feature'
import type { StepCatalogResult, CatalogStep, GenerateCatalogOptions, StepSourceLocation } from '../types/step-catalog'
import type { ValidationResult } from '../types/validation'
import type { RunResult, RunOptions, BatchRunOptions, BatchRunResult, WorkspaceTestInfo } from '../types/runner'
import type { AppSettings } from '../types/settings'
import type { NodeRuntimeInfo, NodeExtractionResult } from '../types/node'
import type { DependencyStatus, DependencyInstallResult, PackageJsonCheckResult } from '../types/dependency'
import type { GitWorkspaceParams, GitCredentials, WorkspaceMetadata, PullResult, WorkspaceStatusResult, CommitPushOptions, CommitPushResult } from '../types/gitWorkspace'
import type { AIProviderConfig, AIProviderStatus, AIStatusTarget, AIGenerationRequest, AIStreamChunk, AIStreamDone, AIStreamError } from '../types/ai'
import type {
  RecorderStartOptions,
  RecorderSession,
  RecordedAction,
  PickedElement,
  PickRequest,
  RecorderAssertionRequest,
  RecorderStatus,
  RecorderError,
  LocatorReference,
  LocatorValidationResult,
} from '../types/recorder'

export interface WorkspaceSelectResult {
  workspace: WorkspaceInfo | null
  validation: WorkspaceValidation | null
  selectedPath: string | null
}

export interface ElectronAPI {
  workspace: {
    get: () => Promise<WorkspaceInfo | null>
    set: (path: string, gitRoot?: string) => Promise<WorkspaceValidation>
    select: () => Promise<WorkspaceSelectResult>
    validate: (path: string) => Promise<WorkspaceValidation>
    init: (path: string) => Promise<WorkspaceInfo>
    detectBdd: (clonePath: string) => Promise<BddDetectionResult>
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

  stepCatalog: {
    generate: (options?: GenerateCatalogOptions) => Promise<StepCatalogResult>
    getCached: () => Promise<StepCatalogResult | null>
    clearCache: () => Promise<void>
    getStep: (id: string) => Promise<CatalogStep | null>
  }

  validate: {
    scenario: (scenario: Scenario) => Promise<ValidationResult>
  }

  runner: {
    runHeadless: (options?: Partial<RunOptions>) => Promise<RunResult>
    runUI: (options?: Partial<RunOptions>) => Promise<RunResult>
    runBatch: (options: BatchRunOptions) => Promise<BatchRunResult>
    getWorkspaceTests: () => Promise<WorkspaceTestInfo>
    stop: () => Promise<void>
    onRunnerLog: (callback: (line: string) => void) => void
    offRunnerLog: () => void
  }

  settings: {
    get: () => Promise<AppSettings>
    set: (settings: Partial<AppSettings>) => Promise<void>
    reset: () => Promise<void>
  }

  app: {
    getVersion: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    /** Open a step definition's source at the given file/line in the editor. */
    openInEditor: (location: StepSourceLocation) => Promise<void>
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
    pull: (localPath: string, credentials?: GitCredentials) => Promise<PullResult>
    status: (localPath: string) => Promise<WorkspaceStatusResult>
    commitAndPush: (localPath: string, credentials: GitCredentials | undefined, options: CommitPushOptions) => Promise<CommitPushResult>
  }

  gitCredentials: {
    save: (workspacePath: string, credentials: GitCredentials) => Promise<void>
    get: (workspacePath: string) => Promise<GitCredentials | null>
    delete: (workspacePath: string) => Promise<void>
  }

  ai: {
    // config / credentials / status (invoke)
    getConfig: () => Promise<AIProviderConfig>
    setConfig: (config: AIProviderConfig) => Promise<void>
    /** Write-only: the key is never read back to the renderer. */
    setKey: (apiKey: string) => Promise<void>
    clearKey: () => Promise<void>
    /** With a target → probe that provider WITHOUT persisting (FR-021); omitted → test the configured provider (FR-004). */
    status: (target?: AIStatusTarget) => Promise<AIProviderStatus>

    // streaming generation
    start: (req: AIGenerationRequest) => Promise<{ accepted: true }>
    cancel: (requestId: string) => Promise<void>

    // subscriptions (return an unsubscribe fn — call on onUnmounted)
    onChunk: (callback: (chunk: AIStreamChunk) => void) => () => void
    onDone: (callback: (done: AIStreamDone) => void) => () => void
    onError: (callback: (err: AIStreamError) => void) => () => void
  }

  recorder: {
    start: (options: RecorderStartOptions) => Promise<{ accepted: true; session: RecorderSession }>
    stop: () => Promise<void>
    pause: () => Promise<void>
    resume: () => Promise<void>
    /** Arm SuiSui's own element picker (replaces Playwright's overlay). */
    pick: (request: PickRequest) => Promise<{ accepted: true; pickId: string }>
    cancelPick: () => Promise<void>
    highlight: (locator: LocatorReference) => Promise<void>
    validateLocator: (locator: LocatorReference) => Promise<LocatorValidationResult>
    /** Add an explicit assertion; it arrives back via `onAction`. */
    addAssertion: (request: RecorderAssertionRequest) => Promise<void>

    // subscriptions (return an unsubscribe fn — call on onUnmounted)
    onAction: (callback: (action: RecordedAction) => void) => () => void
    onActionUpdated: (callback: (action: RecordedAction) => void) => () => void
    onPicked: (callback: (picked: PickedElement) => void) => () => void
    onStatus: (callback: (status: RecorderStatus) => void) => () => void
    onError: (callback: (error: RecorderError) => void) => () => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
