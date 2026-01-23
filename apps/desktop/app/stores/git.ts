import { defineStore } from 'pinia'
import type { GitStatusResult } from '@suisui/shared'

export const useGitStore = defineStore('git', {
  state: () => ({
    status: null as GitStatusResult | null,
    isLoading: false,
    isPulling: false,
    isPushing: false,
    error: null as string | null,
    lastMessage: null as string | null,
  }),

  getters: {
    hasChanges: (state) =>
      state.status?.modified.length ||
      state.status?.untracked.length ||
      state.status?.staged.length,
    branchName: (state) => state.status?.branch ?? 'unknown',
  },

  actions: {
    async refreshStatus() {
      this.isLoading = true
      this.error = null
      try {
        this.status = await window.api.git.status()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to get git status'
      } finally {
        this.isLoading = false
      }
    },

    async pull() {
      this.isPulling = true
      this.error = null
      this.lastMessage = null
      try {
        const result = await window.api.git.pull()
        if (result.success) {
          this.lastMessage = result.message
          await this.refreshStatus()
        } else {
          this.error = result.error ?? 'Pull failed'
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Pull failed'
      } finally {
        this.isPulling = false
      }
    },

    async commitPush(message: string) {
      this.isPushing = true
      this.error = null
      this.lastMessage = null
      try {
        const result = await window.api.git.commitPush(message)
        if (result.success) {
          this.lastMessage = result.message
          await this.refreshStatus()
        } else {
          this.error = result.error ?? 'Commit & Push failed'
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Commit & Push failed'
      } finally {
        this.isPushing = false
      }
    },
  },
})
