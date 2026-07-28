import { defineStore } from 'pinia'
import type {
  RunResult,
  RunStatus,
  RunError,
  BatchRunResult,
  WorkspaceTestInfo,
  RunConfiguration,
  BatchRunOptions,
  LiveRunState,
  AuthoredSteps,
  LiveStepDisplay,
  ScenarioExecution,
  ScenarioStep,
  ReportedScenarioOutcome,
} from '@suisui/shared'
import {
  DEFAULT_RUN_CONFIGURATION,
  applyProgressEvent,
  applyReportOutcomes,
  emptyLiveRunState,
  reconcileLiveRun,
  mergeLiveSteps,
  parseFeatureSteps,
  authoredStepsFor,
  stepTitleMatches,
  resolvePattern,
} from '@suisui/shared'
import { useScenarioStore } from './scenario'

/**
 * Unsubscribe handle for the live-progress push (one subscription at a time).
 * Module-scoped so it never lands in reactive state.
 */
let unsubscribeProgress: (() => void) | null = null

/**
 * Set when the user stops a run, so in-flight steps settle as `interrupted`
 * rather than `failed` — they stopped it, they did not break it.
 */
let stopRequested = false

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

/** Cache key for a scenario's authored step list. */
function authoredKey(relativePath: string, scenarioTitle: string): string {
  return `${relativePath}\n${scenarioTitle}`
}

/**
 * Authored steps taken from the feature currently open in the editor.
 *
 * Preferred over reading the file because it reflects UNSAVED edits — the steps
 * the user is looking at are the ones their statuses should land on.
 *
 * Returns null when the open feature is a different file, or has no scenario
 * matching the reported title, so the caller falls back to reading from disk.
 */
function authoredFromEditor(
  editor: ReturnType<typeof useScenarioStore>,
  relativePath: string,
  scenarioTitle: string,
): AuthoredSteps | null {
  if (editor.currentFeaturePath !== relativePath) return null

  // An outline row reports its substituted title, so exact first, tolerant second.
  const scenario =
    editor.scenarios.find((s) => s.name === scenarioTitle) ??
    editor.scenarios.find((s) => stepTitleMatches(s.name, scenarioTitle))
  if (!scenario) return null

  // Same shape the reporter emits: keyword + the pattern with its args filled in.
  const title = (step: ScenarioStep) =>
    `${step.keyword} ${resolvePattern(step.pattern, step.args)}`

  const background = editor.background.map(title)

  return {
    titles: [...background, ...scenario.steps.map(title)],
    backgroundCount: background.length,
  }
}

/** Flatten a batch result into the per-scenario outcomes reconciliation needs. */
function reportedOutcomes(result: BatchRunResult): ReportedScenarioOutcome[] {
  // Arrives over IPC and a failed/aborted run can omit sections of it, so nothing
  // here may assume the shape is complete.
  return (result.featureResults ?? []).flatMap((feature) =>
    (feature.scenarioResults ?? []).map((scenario) => ({
      relativePath: feature.relativePath,
      name: scenario.name,
      status: scenario.status,
    })),
  )
}

/**
 * Find the execution of one scenario in live state.
 *
 * Live state is keyed by the reporter's testId, which the editor has no way to
 * know, so lookups go through feature path + title instead. A `Scenario Outline`
 * has one execution PER example row; the latest-started is used, which is the row
 * a viewer of the editor would take "this scenario is running" to mean.
 */
function findExecution(
  live: LiveRunState,
  relativePath: string,
  scenarioTitle: string,
): ScenarioExecution | undefined {
  let best: ScenarioExecution | undefined

  for (const execution of Object.values(live.scenarios)) {
    if (execution.relativePath !== relativePath) continue
    if (execution.title !== scenarioTitle && !stepTitleMatches(scenarioTitle, execution.title)) {
      continue
    }
    // Prefer whatever is actually running, then the most recently started.
    if (
      !best ||
      (execution.status === 'running' && best.status !== 'running') ||
      (execution.status === best.status && (execution.startedAt ?? 0) > (best.startedAt ?? 0))
    ) {
      best = execution
    }
  }

  return best
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
  /**
   * Live per-STEP execution state (feature 011).
   *
   * Complements `progress`, which is aggregate counters: this is what is running
   * right now and how each step of it went. Stays `available: false` when no
   * progress events arrive, in which case the UI falls back to the counters.
   */
  live: LiveRunState
  /**
   * When the in-flight run started, as an epoch ms stamp; 0 when idle.
   *
   * Owned by the store rather than the panel because the panel is mounted by a
   * `v-if` that only turns on *after* the run has already begun — anything it
   * measured from its own mount would start at the wrong moment, or (if it
   * never saw the transition) not start at all.
   */
  startedAt: number
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
    live: emptyLiveRunState(),
    startedAt: 0,
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

    /**
     * Authored step lists for scenarios seen during a run, keyed by
     * `relativePath\ntitle`.
     *
     * Needed because the reporter emits nothing for steps that have not run: the
     * authored list is the only source of the pending tail. Kept in state (not
     * module scope) so it resets with the store and cannot leak between tests.
     */
    authoredSteps: {} as Record<string, AuthoredSteps>,
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
    /** Live per-step execution state for the displayed scope (feature 011). */
    live(): LiveRunState {
      return this.currentScope.live
    },

    /**
     * Steps of a scenario as they should be displayed: authored text, live status.
     *
     * Returns null when there is nothing live to show — no progress events at all,
     * or no authored list for this scenario — so callers keep rendering exactly
     * what they rendered before this feature existed.
     */
    liveStepsFor(): (relativePath: string, scenarioTitle: string) => LiveStepDisplay[] | null {
      const live = this.currentScope.live
      const authoredCache = this.authoredSteps

      return (relativePath: string, scenarioTitle: string) => {
        if (!live.available) return null

        const authored = authoredCache[authoredKey(relativePath, scenarioTitle)]
        if (!authored) return null

        return mergeLiveSteps(authored, findExecution(live, relativePath, scenarioTitle))
      }
    },

    /** Live execution record for a scenario, if it ran in the current run. */
    executionFor(): (
      relativePath: string,
      scenarioTitle: string,
    ) => ScenarioExecution | undefined {
      const live = this.currentScope.live
      return (relativePath, scenarioTitle) => findExecution(live, relativePath, scenarioTitle)
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
    /** Epoch ms the in-flight run started, or 0 when idle. */
    startedAt(): number {
      return this.currentScope.startedAt
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

    /**
     * Make sure a scenario's authored step list is available for display.
     *
     * Best-effort: on failure the scenario simply shows no per-step detail and the
     * aggregate counters carry the run, exactly as before this feature.
     */
    async ensureAuthoredSteps(relativePath: string, scenarioTitle: string) {
      const key = authoredKey(relativePath, scenarioTitle)
      if (this.authoredSteps[key]) return

      // The open editor wins: it has the user's unsaved edits, the file does not.
      const fromEditor = authoredFromEditor(useScenarioStore(), relativePath, scenarioTitle)
      if (fromEditor) {
        this.authoredSteps[key] = fromEditor
        return
      }

      try {
        const content = await window.api.features.read(relativePath)
        const authored = authoredStepsFor(parseFeatureSteps(content), scenarioTitle)
        if (authored) this.authoredSteps[key] = authored
      } catch {
        // Unreadable or renamed mid-run — leave it absent.
      }
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
      s.startedAt = Date.now()
      s.showResults = true
      s.singleRun = opts.single ?? false
      s.batchResult = null
      s.reportUrl = ''
      s.reportLoading = false
      s.progress = emptyProgress()
      // A new run must never show anything from the previous one.
      s.live = emptyLiveRunState()
      // Re-read authored steps too: the user may have edited the feature since.
      this.authoredSteps = {}
      stopRequested = false
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

      // Live per-step events arrive on their own channel; structured events are
      // filtered out of the log stream in the main process.
      unsubscribeProgress?.()
      unsubscribeProgress = window.api.runner.onProgress((event) => {
        // Verify ordinals against the authored steps when we have them, so a
        // drifted index is dropped rather than painting the wrong step.
        const authored =
          event.type === 'stepStart' || event.type === 'stepEnd'
            ? this.authoredSteps[
                authoredKey(
                  s.live.scenarios[event.testId]?.relativePath ?? '',
                  s.live.scenarios[event.testId]?.title ?? '',
                )
              ]
            : undefined

        s.live = applyProgressEvent(s.live, event, authored?.titles)

        // Fetching is async; kick it off as soon as a scenario appears so its
        // steps are ready to display by the time they start reporting.
        if (event.type === 'testStart') {
          void this.ensureAuthoredSteps(event.relativePath, event.title)
        }
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
        unsubscribeProgress?.()
        unsubscribeProgress = null
        // Nothing may be left showing `running` once the run is over...
        s.live = reconcileLiveRun(s.live, stopRequested ? 'stopped' : 'completed')
        // ...and where the report disagrees with what the live stream said, the
        // report wins (FR-017) — it is the authoritative record of the run.
        if (s.batchResult) {
          s.live = applyReportOutcomes(s.live, reportedOutcomes(s.batchResult))
        }
        stopRequested = false
        this.isRunning = false
        s.startedAt = 0
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
      s.startedAt = Date.now()
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
        s.startedAt = 0
      }
    },

    async runUI(featurePath?: string, scenarioName?: string) {
      const s = this.ensureScope()
      this.isRunning = true
      s.status = 'running'
      s.startedAt = Date.now()
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
        s.startedAt = 0
      }
    },

    async stop() {
      stopRequested = true
      try {
        await window.api.runner.stop()
        this.isRunning = false
        const s = this.ensureScope()
        s.status = 'idle'
        s.startedAt = 0
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
