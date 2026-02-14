import { defineStore } from 'pinia'
import type { GithubUser, GithubRepo } from '@suisui/shared'

export const useGithubStore = defineStore('github', {
  state: () => ({
    user: null as GithubUser | null,
    isConnected: false,
    isLoading: false,
    error: null as string | null,
    repos: [] as GithubRepo[],
    token: null as string | null, // in-memory only for session
  }),

  actions: {
    async connect(token: string) {
      this.isLoading = true
      this.error = null
      try {
        const user = await window.api.github.validateToken(token)
        await window.api.github.saveToken(token)
        this.user = user
        this.token = token
        this.isConnected = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to connect'
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async connectViaDeviceFlow() {
      this.isLoading = true
      this.error = null
      try {
        const flow = await window.api.github.deviceFlowStart()
        return flow
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to start device flow'
        this.isLoading = false
        throw err
      }
    },

    async pollDeviceFlow(deviceCode: string) {
      try {
        const result = await window.api.github.deviceFlowPoll(deviceCode)
        if (result.status === 'success' && result.accessToken) {
          await this.connect(result.accessToken)
        }
        return result
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Poll failed'
        this.isLoading = false
        throw err
      }
    },

    async disconnect() {
      try {
        await window.api.github.deleteToken()
      } catch {
        // ignore
      }
      this.user = null
      this.token = null
      this.isConnected = false
      this.repos = []
      this.error = null
    },

    async loadRepos() {
      if (!this.token) return
      this.isLoading = true
      this.error = null
      try {
        this.repos = await window.api.github.listRepos(this.token)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load repos'
      } finally {
        this.isLoading = false
      }
    },

    async restoreSession() {
      try {
        const token = await window.api.github.getToken()
        if (token) {
          const user = await window.api.github.validateToken(token)
          this.user = user
          this.token = token
          this.isConnected = true
        }
      } catch {
        // Token expired or invalid — silently ignore
      }
    },
  },
})
