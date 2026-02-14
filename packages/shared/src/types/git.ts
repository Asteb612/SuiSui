export type GitStatus = 'clean' | 'dirty' | 'untracked' | 'error'

export interface GitStatusResult {
  status: GitStatus
  branch: string
  ahead: number
  behind: number
  modified: string[]
  untracked: string[]
  staged: string[]
  hasRemote: boolean
}

export interface GitOperationResult {
  success: boolean
  message: string
  error?: string
}
