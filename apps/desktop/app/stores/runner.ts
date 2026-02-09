import { defineStore } from 'pinia'
import type { RunResult, RunStatus, RunError } from '@suisui/shared'

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    status: 'idle' as RunStatus,
    lastResult: null as RunResult | null,
    logs: [] as string[],
    errors: [] as RunError[],
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
      this.errors = []
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

        // Handle parsed errors
        if (result.errors && result.errors.length > 0) {
          this.errors = result.errors
          this.logs.push('')
          this.logs.push('=== Errors ===')
          for (const error of result.errors) {
            let errorMsg = error.message
            if (error.file) {
              errorMsg += ` (${error.file}${error.line ? `:${error.line}` : ''})`
            }
            this.logs.push(errorMsg)
            if (error.suggestion) {
              this.logs.push(`  → ${error.suggestion}`)
            }
          }
        } else if (result.stdout) {
          this.logs.push(result.stdout)
        }

        if (result.stderr && !result.errors?.length) {
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
      this.errors = []
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

        // Handle parsed errors
        if (result.errors && result.errors.length > 0) {
          this.errors = result.errors
          this.logs.push('')
          this.logs.push('=== Errors ===')
          for (const error of result.errors) {
            let errorMsg = error.message
            if (error.file) {
              errorMsg += ` (${error.file}${error.line ? `:${error.line}` : ''})`
            }
            this.logs.push(errorMsg)
            if (error.suggestion) {
              this.logs.push(`  → ${error.suggestion}`)
            }
          }
        } else {
          this.logs.push('Playwright UI session ended')
        }
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
      this.errors = []
      this.lastResult = null
      this.status = 'idle'
    },
  },
})
