import { defineStore } from 'pinia'
import type {
  WorkspaceMetadata,
  WorkspaceStatusResult,
  CommitPushOptions,
  GitWorkspaceParams,
  GitCredentials,
} from '@suisui/shared'

export const useGitWorkspaceStore = defineStore('gitWorkspace', {
  state: () => ({
    metadata: null as WorkspaceMetadata | null,
    isCloning: false,
    isPulling: false,
    isCommitting: false,
    status: null as WorkspaceStatusResult | null,
    error: null as string | null,
  }),

  getters: {
    hasChanges: (state) => {
      if (!state.status) return false
      const c = state.status.counts
      return c.modified + c.added + c.deleted + c.untracked > 0
    },
    totalChanges: (state) => {
      if (!state.status) return 0
      const c = state.status.counts
      return c.modified + c.added + c.deleted + c.untracked
    },
  },

  actions: {
    async cloneOrOpen(params: GitWorkspaceParams) {
      this.isCloning = true
      this.error = null
      try {
        this.metadata = await window.api.gitWorkspace.cloneOrOpen(params)
        return this.metadata
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Clone failed'
        throw err
      } finally {
        this.isCloning = false
      }
    },

    async pull(localPath: string, credentials?: GitCredentials) {
      this.isPulling = true
      this.error = null
      try {
        const result = await window.api.gitWorkspace.pull(localPath, credentials)
        return result
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Pull failed'
        throw err
      } finally {
        this.isPulling = false
      }
    },

    async refreshStatus(localPath: string) {
      this.error = null
      try {
        this.status = await window.api.gitWorkspace.status(localPath)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to get status'
      }
    },

    async commitAndPush(localPath: string, credentials: GitCredentials | undefined, options: CommitPushOptions) {
      this.isCommitting = true
      this.error = null
      try {
        const result = await window.api.gitWorkspace.commitAndPush(localPath, credentials, options)
        return result
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Commit & Push failed'
        throw err
      } finally {
        this.isCommitting = false
      }
    },

    clear() {
      this.metadata = null
      this.status = null
      this.error = null
      this.isCloning = false
      this.isPulling = false
      this.isCommitting = false
    },
  },
})
