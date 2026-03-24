import { defineStore } from 'pinia'
import type {
  RunResult,
  RunStatus,
  RunError,
  BatchRunResult,
  WorkspaceTestInfo,
  RunConfiguration,
  BatchRunOptions,
} from '@suisui/shared'
import { DEFAULT_RUN_CONFIGURATION } from '@suisui/shared'

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    status: 'idle' as RunStatus,
    lastResult: null as RunResult | null,
    logs: [] as string[],
    errors: [] as RunError[],
    isRunning: false,
    baseUrl: '' as string,

    // Batch run state
    batchResult: null as BatchRunResult | null,
    workspaceTests: null as WorkspaceTestInfo | null,

    // Run configuration (filters + execution settings)
    config: { ...DEFAULT_RUN_CONFIGURATION } as RunConfiguration,

    // UI state (session-scoped, not persisted)
    showResults: false,
    hasEnteredRunView: false,
  }),

  getters: {
    /**
     * Compute matched features and scenarios based on current filters.
     * Exclusive tab model: only the active tab's filter applies + name filter (AND).
     */
    matchedTests(state): { features: WorkspaceTestInfo['features']; scenarioCount: number } {
      if (!state.workspaceTests) {
        return { features: [], scenarioCount: 0 }
      }

      let features = [...state.workspaceTests.features]

      // Apply ONLY the active tab's structural filter
      if (state.config.activeFilterTab === 'features' && state.config.selectedFeatures.length > 0) {
        features = features.filter((f) =>
          state.config.selectedFeatures.includes(f.relativePath),
        )
      } else if (state.config.activeFilterTab === 'folders' && state.config.selectedFolders.length > 0) {
        features = features.filter((f) =>
          state.config.selectedFolders.some(
            (folder) => f.folder === folder || f.folder.startsWith(folder + '/'),
          ),
        )
      }

      // Filter scenarios by tags (only when tags tab is active) and name (always)
      let scenarioCount = 0
      const filteredFeatures = features
        .map((f) => {
          let scenarios = [...f.scenarios]

          // Tag filter only applies when tags tab is active
          if (state.config.activeFilterTab === 'tags' && state.config.selectedTags.length > 0) {
            scenarios = scenarios.filter((s) =>
              s.tags.some((t) => state.config.selectedTags.includes(t)),
            )
          }

          // Name filter always applies (AND with active tab)
          if (state.config.nameFilter) {
            const lower = state.config.nameFilter.toLowerCase()
            scenarios = scenarios.filter((s) => s.name.toLowerCase().includes(lower))
          }

          scenarioCount += scenarios.length
          return { ...f, scenarios }
        })
        .filter((f) => f.scenarios.length > 0)

      return { features: filteredFeatures, scenarioCount }
    },

    /** Whether running is allowed based on current state */
    canRun(state): boolean {
      return !state.isRunning && this.matchedTests.scenarioCount > 0
    },
  },

  actions: {
    async setBaseUrl(url: string) {
      this.baseUrl = url
      this.config.baseUrl = url
      await this.persistConfig()
    },

    async loadConfig() {
      const settings = await window.api.settings.get()
      this.baseUrl = settings.baseUrl ?? ''
      if (settings.runConfiguration) {
        this.config = { ...DEFAULT_RUN_CONFIGURATION, ...settings.runConfiguration }
        this.baseUrl = this.config.baseUrl || settings.baseUrl || ''
      }
    },

    /** @deprecated Use loadConfig() instead */
    async loadBaseUrl() {
      return this.loadConfig()
    },

    async persistConfig() {
      await window.api.settings.set({
        baseUrl: this.config.baseUrl || null,
        runConfiguration: { ...this.config },
      })
    },

    async loadWorkspaceTests() {
      try {
        this.workspaceTests = await window.api.runner.getWorkspaceTests()
      } catch {
        this.workspaceTests = null
      }
    },

    async runBatch(mode: 'headless' | 'ui') {
      if (this.isRunning) return

      this.isRunning = true
      this.status = 'running'
      this.showResults = true
      this.batchResult = null
      this.logs = [`Starting batch ${mode} test run...`]
      this.errors = []

      if (this.config.baseUrl) {
        this.logs.push(`Base URL: ${this.config.baseUrl}`)
      }

      window.api.runner.onRunnerLog((line: string) => {
        this.logs.push(line)
      })

      try {
        const options: BatchRunOptions = {
          executionMode: this.config.executionMode,
          mode,
          baseUrl: this.config.baseUrl || undefined,
        }

        // Pass feature paths based on active tab filter
        const matched = this.matchedTests
        const tab = this.config.activeFilterTab
        if (
          (tab === 'features' && this.config.selectedFeatures.length > 0) ||
          (tab === 'folders' && this.config.selectedFolders.length > 0)
        ) {
          options.featurePaths = matched.features.map((f) => f.relativePath)
        }

        // Pass tag filter only when tags tab is active
        if (tab === 'tags' && this.config.selectedTags.length > 0) {
          options.tags = this.config.selectedTags
        }
        if (this.config.nameFilter) {
          options.nameFilter = this.config.nameFilter
        }

        const result = await window.api.runner.runBatch(options)
        this.batchResult = result
        this.status = result.status

        if (result.errors.length > 0) {
          this.errors = result.errors
        }

        if (result.stderr && result.errors.length === 0) {
          this.logs.push(`[stderr] ${result.stderr}`)
        }

        this.logs.push(
          `Batch run completed in ${result.duration}ms — ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.skipped} skipped`,
        )
      } catch (err) {
        this.status = 'error'
        this.logs.push(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        window.api.runner.offRunnerLog()
        this.isRunning = false
      }
    },

    // Legacy single-feature run methods (kept for backward compatibility)
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
      this.batchResult = null
      this.status = 'idle'
    },
  },
})
