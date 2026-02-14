export interface GitWorkspaceParams {
  owner: string
  repo: string
  repoUrl: string
  branch: string
  localPath: string
  token: string
  username?: string
}

export interface WorkspaceMetadata {
  owner: string
  repo: string
  branch: string
  remoteUrl: string
  lastPulledOid: string
}

export interface PullResult {
  updatedFiles: string[]
  conflicts: string[]
  headOid: string
}

export type FileStatusType = 'modified' | 'added' | 'deleted' | 'untracked'

export interface FileStatus {
  path: string
  status: FileStatusType
}

export interface WorkspaceStatusResult {
  fullStatus: FileStatus[]
  filteredStatus: FileStatus[]
  counts: {
    modified: number
    added: number
    deleted: number
    untracked: number
  }
}

export interface CommitPushOptions {
  message: string
  authorName?: string
  authorEmail?: string
  paths?: string[]
}

export interface CommitPushResult {
  commitOid: string
  pushed: boolean
}

export interface CloneProgress {
  phase: string
  loaded: number
  total: number
}

export class WorkspaceNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceNotFoundError'
  }
}

export class GitAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitAuthError'
  }
}

export class MergeConflictError extends Error {
  public conflicts: string[]
  constructor(message: string, conflicts: string[] = []) {
    super(message)
    this.name = 'MergeConflictError'
    this.conflicts = conflicts
  }
}

export class RemoteDivergedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteDivergedError'
  }
}
