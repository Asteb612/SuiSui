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

/** The global filters runner. Per-spec quick-runs use their feature path as the scope id. */
export const GLOBAL_SCOPE = 'global'

/** Live progress derived from the Playwright `list` reporter while a run is in flight. */
export interface RunProgress {
  total: number
  completed: number
  passed: number
  failed: number
  skipped: number
}

function emptyProgress(): RunProgress {
  return { total: 0, completed: 0, passed: 0, failed: 0, skipped: 0 }
}

// The `list` reporter colorizes its output; strip SGR/CSI escapes before parsing or
// displaying (a <pre> renders them as garbage otherwise).
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g

/** Remove ANSI escape sequences from a streamed log line. */
export function stripAnsi(line: string): string {
  return line.replace(ANSI_RE, '')
}

/**
 * Update live progress from one streamed `list`-reporter line. Best-effort and
 * degrades gracefully: unrecognized lines just don't move the counters (the raw log
 * still shows, and the final JSON report carries the authoritative numbers).
 */
export function updateProgressFromLine(p: RunProgress, rawLine: string): void {
  const line = stripAnsi(rawLine)
  const running = line.match(/Running\s+(\d+)\s+test/i)
  if (running) {
    p.total = Number(running[1])
    return
  }
  // A completed-test line has the "›" title separator and ends with a (duration).
  if (/›/.test(line) && /\(\s*\d+(?:\.\d+)?\s*m?s\s*\)\s*$/.test(line)) {
    p.completed++
    const head = line.trimStart().charAt(0)
    if (head === '✓' || head === '✔') p.passed++
    else if (head === '✘' || head === '✕' || head === '✗' || head === '✖') p.failed++
    return
  }
  // Skipped tests are dimmed with a leading "-" and carry no duration.
  if (/^\s*-\s+\d+\s+.*›/.test(line)) {
    p.completed++
    p.skipped++
  }
}

/**
 * Per-scope run output. The global filters runner and each single-spec quick-run
 * keep their OWN results/report/logs so they never clobber one another.
 */
interface RunScope {
  status: RunStatus
  logs: string[]
  errors: RunError[]
  batchResult: BatchRunResult | null
  lastResult: RunResult | null
  showResults: boolean
  reportUrl: string
  reportLoading: boolean
  /** True for a single-spec quick-run (hides filter-oriented controls in the runner view). */
  singleRun: boolean
  /** Live per-test progress while the run is in flight. */
  progress: RunProgress
}

function emptyScope(singleRun = false): RunScope {
  return {
    status: 'idle',
    logs: [],
    errors: [],
    batchResult: null,
    lastResult: null,
    showResults: false,
    reportUrl: '',
    reportLoading: false,
    singleRun,
    progress: emptyProgress(),
  }
}

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    // One test run at a time (a single Playwright process), so this stays global.
    isRunning: false,
    baseUrl: '' as string,
    /** Base URL derived from the workspace's Playwright config (fallback default). */
    workspaceBaseUrl: '' as string,

    workspaceTests: null as WorkspaceTestInfo | null,

    // Run configuration (filters + execution settings) — the GLOBAL runner's config.
    config: { ...DEFAULT_RUN_CONFIGURATION } as RunConfiguration,

    // Scoped run output. `activeScope` selects which scope the runner view displays:
    // GLOBAL_SCOPE for the filters runner, or a feature path for a single-spec quick-run.
    activeScope: GLOBAL_SCOPE as string,
    scopes: { [GLOBAL_SCOPE]: emptyScope() } as Record<string, RunScope>,
  }),

  getters: {
    /** The run output for the scope currently displayed. */
    currentScope(state): RunScope {
      return state.scopes[state.activeScope] ?? emptyScope(state.activeScope !== GLOBAL_SCOPE)
    },

    // Active-scope views of the run output (what components bind to).
    status(): RunStatus {
      return this.currentScope.status
    },
    logs(): string[] {
      return this.currentScope.logs
    },
    errors(): RunError[] {
      return this.currentScope.errors
    },
    batchResult(): BatchRunResult | null {
      return this.currentScope.batchResult
    },
    lastResult(): RunResult | null {
      return this.currentScope.lastResult
    },
    showResults(): boolean {
      return this.currentScope.showResults
    },
    reportUrl(): string {
      return this.currentScope.reportUrl
    },
    reportLoading(): boolean {
      return this.currentScope.reportLoading
    },
    singleRun(): boolean {
      return this.currentScope.singleRun
    },
    progress(): RunProgress {
      return this.currentScope.progress
    },

    /**
     * Effective Base URL: the user's setting when present, otherwise the
     * workspace's configured default. Used by the recorder and for display.
     */
    effectiveBaseUrl(state): string {
      return state.config.baseUrl?.trim() || state.workspaceBaseUrl
    },

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
    /** Get (creating if needed) the run output for the active scope. */
    ensureScope(): RunScope {
      if (!this.scopes[this.activeScope]) {
        this.scopes[this.activeScope] = emptyScope(this.activeScope !== GLOBAL_SCOPE)
      }
      return this.scopes[this.activeScope]!
    },

    /** Select which scope the runner view displays (GLOBAL_SCOPE or a feature path). */
    setActiveScope(scope: string) {
      this.activeScope = scope
      this.ensureScope()
    },

    /** Leave the results view and go back to the filters (global runner only). */
    showFilters() {
      this.ensureScope().showResults = false
    },

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
      // Derive a fallback Base URL from the workspace's Playwright config so the
      // recorder/runner have a sensible default when none is set globally.
      try {
        this.workspaceBaseUrl = (await window.api.workspace.getBaseUrl()) ?? ''
      } catch {
        this.workspaceBaseUrl = ''
      }
    },

    /** @deprecated Use loadConfig() instead */
    async loadBaseUrl() {
      return this.loadConfig()
    },

    async persistConfig() {
      await window.api.settings.set({
        baseUrl: this.config.baseUrl || null,
        // De-proxy: nested reactive arrays can't be structured-cloned across IPC.
        runConfiguration: JSON.parse(JSON.stringify(this.config)),
      })
    },

    /** Start the report server and show THIS scope's report in-app (iframe). */
    async showReport(scope?: string) {
      const scopeId = scope ?? this.activeScope
      if (!this.scopes[scopeId]) this.scopes[scopeId] = emptyScope(scopeId !== GLOBAL_SCOPE)
      const s = this.scopes[scopeId]!
      s.reportLoading = true
      try {
        const url = await window.api.runner.showReport(scopeId)
        // Only the last report is kept on disk (see RunnerService.showReport), so this
        // scope now owns it; drop every other scope's now-stale report URL.
        for (const [id, sc] of Object.entries(this.scopes)) {
          sc.reportUrl = id === scopeId ? url : ''
        }
      } catch (err) {
        s.logs.push(`Could not open the report: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        s.reportLoading = false
      }
    },

    closeReport() {
      this.ensureScope().reportUrl = ''
    },

    async loadWorkspaceTests() {
      try {
        this.workspaceTests = await window.api.runner.getWorkspaceTests()
      } catch {
        this.workspaceTests = null
      }
    },

    async runBatch(
      mode: 'headless' | 'ui',
      opts: { headed?: boolean; trace?: boolean; single?: boolean; featurePaths?: string[] } = {},
    ) {
      if (this.isRunning) return

      // Bind this run's output to the active scope for its whole lifetime, so async
      // completion writes to the right scope even if the view later changes.
      const scope = this.activeScope
      const s = this.ensureScope()

      this.isRunning = true
      s.status = 'running'
      s.showResults = true
      s.singleRun = opts.single ?? false
      s.batchResult = null
      s.reportUrl = ''
      s.reportLoading = false
      s.progress = emptyProgress()
      s.logs = [`Starting batch ${opts.headed ? 'headed' : mode} test run...`]
      s.errors = []

      if (this.config.baseUrl) {
        s.logs.push(`Base URL: ${this.config.baseUrl}`)
      }

      window.api.runner.onRunnerLog((line: string) => {
        // Strip ANSI so the log panel (a <pre>) is clean; the parser strips too.
        s.logs.push(stripAnsi(line))
        updateProgressFromLine(s.progress, line)
      })

      try {
        const options: BatchRunOptions = {
          executionMode: this.config.executionMode,
          mode,
          baseUrl: this.config.baseUrl || undefined,
          ...(opts.headed ? { headed: true } : {}),
          ...(opts.trace ? { trace: true } : {}),
        }

        if (opts.featurePaths && opts.featurePaths.length > 0) {
          // Explicit targets (single-spec quick-run) — do NOT touch the global filters.
          options.featurePaths = opts.featurePaths
        } else {
          // Global run: derive targets from the active filter tab.
          const matched = this.matchedTests
          const tab = this.config.activeFilterTab
          if (
            (tab === 'features' && this.config.selectedFeatures.length > 0) ||
            (tab === 'folders' && this.config.selectedFolders.length > 0)
          ) {
            options.featurePaths = matched.features.map((f) => f.relativePath)
          }
          if (tab === 'tags' && this.config.selectedTags.length > 0) {
            options.tags = this.config.selectedTags
          }
          if (this.config.nameFilter) {
            options.nameFilter = this.config.nameFilter
          }
        }

        const result = await window.api.runner.runBatch(options)
        s.batchResult = result
        s.status = result.status

        if (result.errors.length > 0) {
          s.errors = result.errors
        }

        if (result.stderr && result.errors.length === 0) {
          s.logs.push(`[stderr] ${result.stderr}`)
        }

        s.logs.push(
          `Batch run completed in ${result.duration}ms — ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.skipped} skipped`,
        )
      } catch (err) {
        s.status = 'error'
        s.logs.push(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        window.api.runner.offRunnerLog()
        this.isRunning = false
        // Integrate Playwright's HTML report directly in the results panel, scoped to
        // this run (UI mode has no report of its own).
        if (mode !== 'ui') void this.showReport(scope)
      }
    },

    // Legacy single-feature run methods (kept for backward compatibility)
    async runHeadless(featurePath?: string, scenarioName?: string) {
      const s = this.ensureScope()
      this.isRunning = true
      s.status = 'running'
      s.logs = ['Starting headless test run...']
      s.errors = []
      if (this.baseUrl) {
        s.logs.push(`Base URL: ${this.baseUrl}`)
      }

      try {
        const result = await window.api.runner.runHeadless({
          featurePath,
          scenarioName,
          baseUrl: this.baseUrl || undefined,
        })
        s.lastResult = result
        s.status = result.status

        if (result.errors && result.errors.length > 0) {
          s.errors = result.errors
          s.logs.push('')
          s.logs.push('=== Errors ===')
          for (const error of result.errors) {
            let errorMsg = error.message
            if (error.file) {
              errorMsg += ` (${error.file}${error.line ? `:${error.line}` : ''})`
            }
            s.logs.push(errorMsg)
            if (error.suggestion) {
              s.logs.push(`  → ${error.suggestion}`)
            }
          }
        } else if (result.stdout) {
          s.logs.push(result.stdout)
        }

        if (result.stderr && !result.errors?.length) {
          s.logs.push(`[stderr] ${result.stderr}`)
        }

        s.logs.push(`Test completed in ${result.duration}ms`)
      } catch (err) {
        s.status = 'error'
        s.logs.push(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        this.isRunning = false
      }
    },

    async runUI(featurePath?: string, scenarioName?: string) {
      const s = this.ensureScope()
      this.isRunning = true
      s.status = 'running'
      s.logs = ['Starting Playwright UI...']
      s.errors = []
      if (this.baseUrl) {
        s.logs.push(`Base URL: ${this.baseUrl}`)
      }

      try {
        const result = await window.api.runner.runUI({
          featurePath,
          scenarioName,
          baseUrl: this.baseUrl || undefined,
        })
        s.lastResult = result
        s.status = result.status

        if (result.errors && result.errors.length > 0) {
          s.errors = result.errors
          s.logs.push('')
          s.logs.push('=== Errors ===')
          for (const error of result.errors) {
            let errorMsg = error.message
            if (error.file) {
              errorMsg += ` (${error.file}${error.line ? `:${error.line}` : ''})`
            }
            s.logs.push(errorMsg)
            if (error.suggestion) {
              s.logs.push(`  → ${error.suggestion}`)
            }
          }
        } else {
          s.logs.push('Playwright UI session ended')
        }
      } catch (err) {
        s.status = 'error'
        s.logs.push(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        this.isRunning = false
      }
    },

    async stop() {
      try {
        await window.api.runner.stop()
        this.isRunning = false
        const s = this.ensureScope()
        s.status = 'idle'
        s.logs.push('Test run stopped')
      } catch {
        // Ignore stop errors
      }
    },

    clearLogs() {
      const s = this.ensureScope()
      s.logs = []
      s.errors = []
      s.lastResult = null
      s.batchResult = null
      s.status = 'idle'
    },
  },
})
