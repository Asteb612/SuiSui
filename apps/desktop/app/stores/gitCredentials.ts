import { defineStore } from 'pinia'
import type { GitCredentials } from '@suisui/shared'

export const useGithubStore = defineStore('github', {
  state: () => ({
    credentials: null as GitCredentials | null,
    hasCredentials: false,
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async saveCredentials(workspacePath: string, credentials: GitCredentials) {
      this.isLoading = true
      this.error = null
      try {
        await window.api.gitCredentials.save(workspacePath, credentials)
        this.credentials = credentials
        this.hasCredentials = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to save credentials'
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async loadCredentials(workspacePath: string) {
      try {
        const creds = await window.api.gitCredentials.get(workspacePath)
        if (creds) {
          this.credentials = creds
          this.hasCredentials = true
        } else {
          this.credentials = null
          this.hasCredentials = false
        }
      } catch {
        // silently ignore
      }
    },

    async clearCredentials(workspacePath: string) {
      try {
        await window.api.gitCredentials.delete(workspacePath)
      } catch {
        // ignore
      }
      this.credentials = null
      this.hasCredentials = false
      this.error = null
    },
  },
})
