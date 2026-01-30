import { defineStore } from 'pinia'
import type { RunResult, RunStatus } from '@suisui/shared'

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    status: 'idle' as RunStatus,
    lastResult: null as RunResult | null,
    logs: [] as string[],
    isRunning: false,
    baseUrl: '' as string,
  }),

  actions: {
    async setBaseUrl(url: string) {
      this.baseUrl = url
      await window.api.settings.set({ baseUrl: url || null })
    },

    async loadBaseUrl() {
      const settings = await window.api.settings.get()
      this.baseUrl = settings.baseUrl ?? ''
    },

    async runHeadless(featurePath?: string, scenarioName?: string) {
      this.isRunning = true
      this.status = 'running'
      this.logs = ['Starting headless test run...']
      if (this.baseUrl) {
        this.logs.push(`Base URL: ${this.baseUrl}`)
      }

      try {
        const result = await window.api.runner.runHeadless({
          featurePath,
          scenarioName,
          baseUrl: this.baseUrl || undefined,
        })
        this.lastResult = result
        this.status = result.status
        this.logs.push(result.stdout)
        if (result.stderr) {
          this.logs.push(`[stderr] ${result.stderr}`)
        }
        this.logs.push(`Test completed in ${result.duration}ms`)
      } catch (err) {
        this.status = 'error'
        this.logs.push(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        this.isRunning = false
      }
    },

    async runUI(featurePath?: string, scenarioName?: string) {
      this.isRunning = true
      this.status = 'running'
      this.logs = ['Starting Playwright UI...']
      if (this.baseUrl) {
        this.logs.push(`Base URL: ${this.baseUrl}`)
      }

      try {
        const result = await window.api.runner.runUI({
          featurePath,
          scenarioName,
          baseUrl: this.baseUrl || undefined,
        })
        this.lastResult = result
        this.status = result.status
        this.logs.push('Playwright UI session ended')
      } catch (err) {
        this.status = 'error'
        this.logs.push(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        this.isRunning = false
      }
    },

    async stop() {
      try {
        await window.api.runner.stop()
        this.isRunning = false
        this.status = 'idle'
        this.logs.push('Test run stopped')
      } catch {
        // Ignore stop errors
      }
    },

    clearLogs() {
      this.logs = []
      this.lastResult = null
      this.status = 'idle'
    },
  },
})
