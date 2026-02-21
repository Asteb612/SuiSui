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
    async saveCredentials(credentials: GitCredentials) {
      this.isLoading = true
      this.error = null
      try {
        await window.api.gitCredentials.save(credentials)
        this.credentials = credentials
        this.hasCredentials = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to save credentials'
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async loadCredentials() {
      try {
        const creds = await window.api.gitCredentials.get()
        if (creds) {
          this.credentials = creds
          this.hasCredentials = true
        }
      } catch {
        // silently ignore
      }
    },

    async clearCredentials() {
      try {
        await window.api.gitCredentials.delete()
      } catch {
        // ignore
      }
      this.credentials = null
      this.hasCredentials = false
      this.error = null
    },
  },
})
