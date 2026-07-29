import { defineStore } from 'pinia'
import type {
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
  ExecutionStatus,
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
  featurePathsMatch,
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

/**
 * How loudly a status asks to be looked at, for rolling several scenarios up
 * into one badge. A file with one failed row among fifty passed ones is a failed
 * file; `pending` ranks below `passed` because it means "no information yet".
 */
const STATUS_SEVERITY: Record<ExecutionStatus, number> = {
  pending: 0,
  passed: 1,
  skipped: 2,
  running: 3,
  interrupted: 4,
  failed: 5,
}

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
  if (!editor.currentFeaturePath || !featurePathsMatch(editor.currentFeaturePath, relativePath)) {
    return null
  }

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
    if (!featurePathsMatch(execution.relativePath, relativePath)) continue
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
 * One file's worth of scenarios in the live view.
 *
 * A suite of any size reports hundreds of scenarios, and a flat list of them is
 * not something anyone can read. Grouping by the file they came from turns it
 * back into a list the size of the suite's file count, which is what the tree
 * shows too.
 */
export interface LiveScenarioGroup {
  /** Feature path, or source file for a plain spec: the label and the identity. */
  key: string
  /** Worst status in the group — what the collapsed row has to convey. */
  status: ExecutionStatus
  /** In the order `liveScenarios` produced them: running first, then chronological. */
  scenarios: ScenarioExecution[]
  passed: number
  failed: number
  /** True while any scenario in it is executing. */
  running: boolean
  /** Earliest start, so groups read in the order the run reached them. */
  startedAt: number
}

/**
 * Bucket scenarios by file, preserving the incoming order within each bucket.
 *
 * Groups are ordered running → contains a failure → everything else, each
 * chronologically: with hundreds of tests, what is happening now and what went
 * wrong are the only two things worth putting at the top.
 */
function groupScenarios(
  scenarios: readonly ScenarioExecution[],
  keyOf: (scenario: ScenarioExecution) => string,
  running: ReadonlySet<string>,
): LiveScenarioGroup[] {
  const groups = new Map<string, LiveScenarioGroup>()

  for (const scenario of scenarios) {
    const key = keyOf(scenario)
    if (!key) continue

    const at = scenario.startedAt ?? 0
    const group =
      groups.get(key) ??
      ({
        key,
        status: scenario.status,
        scenarios: [],
        passed: 0,
        failed: 0,
        running: false,
        startedAt: at,
      } satisfies LiveScenarioGroup)

    group.scenarios.push(scenario)
    if (scenario.status === 'passed') group.passed += 1
    if (scenario.status === 'failed') group.failed += 1
    if (running.has(scenario.testId)) group.running = true
    if (STATUS_SEVERITY[scenario.status] > STATUS_SEVERITY[group.status]) {
      group.status = scenario.status
    }
    if (at > 0 && (group.startedAt === 0 || at < group.startedAt)) group.startedAt = at

    groups.set(key, group)
  }

  const rank = (group: LiveScenarioGroup): number =>
    group.running ? 0 : group.failed > 0 ? 1 : 2

  return [...groups.values()].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    return byRank !== 0 ? byRank : a.startedAt - b.startedAt
  })
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

    /**
     * Whether the raw run log is on screen. Off by default, during a run as well
     * as after it: shown, it takes the whole panel, and the point of the live
     * list is that nobody has to read stdout to see where the run is.
     *
     * Store state rather than component state because the toggle lives in the
     * runner header and the log itself lives in the results panel.
     */
    showLogs: false,

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

        // Resolve the execution FIRST, then key the authored cache off ITS path.
        // The cache was filled from the reporter's namespace, so keying off the
        // caller's would miss and silently render nothing.
        const execution = findExecution(live, relativePath, scenarioTitle)
        const key = execution
          ? authoredKey(execution.relativePath, execution.title)
          : authoredKey(relativePath, scenarioTitle)

        const authored = authoredCache[key]
        if (!authored) return null

        return mergeLiveSteps(authored, execution)
      }
    },

    /**
     * Every scenario the current run has touched, ordered for display.
     *
     * Running first — that is what the viewer is looking for — then the rest in
     * the order they started, so the list reads as the run progressed rather than
     * jumping around as statuses land.
     */
    liveScenarios(): ScenarioExecution[] {
      const running = new Set(this.currentScope.live.running)

      return Object.values(this.currentScope.live.scenarios).sort((a, b) => {
        const aRunning = running.has(a.testId)
        const bRunning = running.has(b.testId)
        if (aRunning !== bRunning) return aRunning ? -1 : 1
        return (a.startedAt ?? 0) - (b.startedAt ?? 0)
      })
    },

    /** Scenarios backed by a feature file — the Gherkin half of the run. */
    liveFeatureScenarios(): ScenarioExecution[] {
      return this.liveScenarios.filter((scenario) => !!scenario.relativePath)
    },

    /**
     * Tests from plain Playwright specs that ran alongside the Gherkin suite.
     *
     * Shown separately rather than dropped: they ran, they can fail, and hiding a
     * failing test is worse than showing one with no step detail. They have none —
     * a plain spec has no authored Gherkin steps to show statuses against.
     */
    liveOtherScenarios(): ScenarioExecution[] {
      return this.liveScenarios.filter((scenario) => !scenario.relativePath && !!scenario.specPath)
    },

    /** The run's Gherkin scenarios, grouped by feature file for display. */
    liveFeatureGroups(): LiveScenarioGroup[] {
      return groupScenarios(
        this.liveFeatureScenarios,
        (scenario) => scenario.relativePath,
        new Set(this.currentScope.live.running),
      )
    },

    /** The run's plain Playwright tests, grouped by the spec file they live in. */
    liveOtherSpecGroups(): LiveScenarioGroup[] {
      return groupScenarios(
        this.liveOtherScenarios,
        (scenario) => scenario.specPath ?? '',
        new Set(this.currentScope.live.running),
      )
    },

    /** Scenarios in the current run that failed — what the failures-only filter keeps. */
    liveFailureCount(): number {
      return this.liveScenarios.filter((scenario) => scenario.status === 'failed').length
    },

    /**
     * Worst last-run status per feature file, for the tree badges.
     *
     * "Worst" because a badge answers one question — does this file need my
     * attention — so one failing example row has to colour the whole file.
     *
     * Across ALL scopes, not just the displayed one: quick-running a single
     * feature must not blank the badges of every other file. Where scopes
     * disagree about a file, the run that started later wins, so re-running one
     * feature green clears the red the global run left on it.
     */
    liveStatusByFeature(): Record<string, ExecutionStatus> {
      /** path → worst status of the latest run that touched it, and when that was. */
      const best: Record<string, { status: ExecutionStatus; at: number }> = {}

      for (const scope of Object.values(this.scopes)) {
        // Roll up within one run first: statuses are only comparable across runs
        // once each run has been reduced to a single verdict per file.
        const perFeature: Record<string, { status: ExecutionStatus; at: number }> = {}

        for (const scenario of Object.values(scope.live.scenarios)) {
          if (!scenario.relativePath) continue
          const at = scenario.startedAt ?? 0
          const current = perFeature[scenario.relativePath]
          perFeature[scenario.relativePath] = {
            status:
              current && STATUS_SEVERITY[current.status] >= STATUS_SEVERITY[scenario.status]
                ? current.status
                : scenario.status,
            at: current ? Math.max(current.at, at) : at,
          }
        }

        for (const [path, entry] of Object.entries(perFeature)) {
          const current = best[path]
          if (!current || entry.at >= current.at) best[path] = entry
        }
      }

      return Object.fromEntries(Object.entries(best).map(([path, entry]) => [path, entry.status]))
    },

    /** Last-run status of one feature file, tolerant of the two path namespaces. */
    statusForFeature(): (relativePath: string) => ExecutionStatus | null {
      const byPath = this.liveStatusByFeature
      return (relativePath: string) => {
        const exact = byPath[relativePath]
        if (exact) return exact

        for (const [path, status] of Object.entries(byPath)) {
          if (featurePathsMatch(path, relativePath)) return status
        }
        return null
      }
    },

    /**
     * Worst last-run status among everything inside a folder.
     *
     * Folder paths are the tree's, features-dir-relative, so a prefix test is the
     * whole of it — matched on a `/` boundary so `cart` cannot claim `cart-legacy`.
     */
    statusForFolder(): (folderPath: string) => ExecutionStatus | null {
      const byPath = this.liveStatusByFeature
      return (folderPath: string) => {
        let worst: ExecutionStatus | null = null

        for (const [path, status] of Object.entries(byPath)) {
          if (!path.startsWith(`${folderPath}/`)) continue
          if (worst === null || STATUS_SEVERITY[status] > STATUS_SEVERITY[worst]) worst = status
        }
        return worst
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
     * The features and scenarios the current filters select.
     *
     * ALL the filters apply, not just the one whose tab happens to be open: the
     * tabs are three views of one filter set, and "narrow to this folder, then to
     * this tag" is the whole point of having them. `activeFilterTab` says which
     * list is on screen and nothing more.
     *
     * Features and folders are a UNION — both answer "which files", so selecting a
     * folder plus one extra feature adds that feature rather than intersecting to
     * nothing. Tags and the name filter then narrow the scenarios INSIDE those
     * files (AND), which is what makes "@smoke in the checkout folder" expressible.
     */
    matchedTests(state): { features: WorkspaceTestInfo['features']; scenarioCount: number } {
      if (!state.workspaceTests) {
        return { features: [], scenarioCount: 0 }
      }

      const { selectedFeatures, selectedFolders, selectedTags, nameFilter } = state.config
      const byFile = selectedFeatures.length > 0 || selectedFolders.length > 0

      const features = byFile
        ? state.workspaceTests.features.filter(
            (f) =>
              selectedFeatures.includes(f.relativePath) ||
              selectedFolders.some(
                (folder) => f.folder === folder || f.folder.startsWith(folder + '/'),
              ),
          )
        : [...state.workspaceTests.features]

      let scenarioCount = 0
      const filteredFeatures = features
        .map((f) => {
          let scenarios = [...f.scenarios]

          if (selectedTags.length > 0) {
            scenarios = scenarios.filter((s) => s.tags.some((t) => selectedTags.includes(t)))
          }

          if (nameFilter) {
            const lower = nameFilter.toLowerCase()
            scenarios = scenarios.filter((s) => s.name.toLowerCase().includes(lower))
          }

          // Tests, not authored scenarios: one `Scenario Outline` runs once per
          // example row, and counting the entries under-reported every outline.
          scenarioCount += scenarios.reduce((sum, s) => sum + (s.testCount ?? 1), 0)
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
      // A run can include plain Playwright specs, which have no feature file.
      // Asking the main process to read one as a feature is guaranteed to throw,
      // and it logs on every rejection — so never ask.
      if (!relativePath.endsWith('.feature')) return

      const key = authoredKey(relativePath, scenarioTitle)
      if (this.authoredSteps[key]) return

      // The open editor wins: it has the user's unsaved edits, the file does not.
      const fromEditor = authoredFromEditor(useScenarioStore(), relativePath, scenarioTitle)
      if (fromEditor) {
        this.authoredSteps[key] = fromEditor
        return
      }

      // `features.read` resolves relative to the features dir. The main process
      // normalizes progress paths into that namespace, but if it could not
      // resolve the configured dir the path still carries it — so try the
      // de-prefixed form too rather than silently showing no steps.
      const candidates = [relativePath]
      const firstSlash = relativePath.indexOf('/')
      if (firstSlash > 0) candidates.push(relativePath.slice(firstSlash + 1))

      for (const candidate of candidates) {
        try {
          const content = await window.api.features.read(candidate)
          const authored = authoredStepsFor(parseFeatureSteps(content), scenarioTitle)
          if (authored) {
            this.authoredSteps[key] = authored
            return
          }
        } catch {
          // Unreadable under this form — try the next, then give up quietly.
        }
      }
    },

    /** Save the finished run so its statuses survive a reload. */
    async persistLastRun(scopeId: string, live: LiveRunState) {
      try {
        // De-proxy: reactive objects cannot be structured-cloned across IPC.
        await window.api.runner.saveLastRun(JSON.parse(JSON.stringify(live)), scopeId)
      } catch {
        // Best-effort only.
      }
    },

    /**
     * Restore the previous run's statuses on workspace open.
     *
     * The authored step lists are deliberately NOT restored from the snapshot —
     * they are re-read from the feature files, so edits made since the run are
     * respected. Where a step no longer matches, the title guard drops its
     * status rather than showing it against the wrong step.
     */
    async restoreLastRun() {
      if (this.isRunning) return

      let snapshot: Awaited<ReturnType<typeof window.api.runner.getLastRun>>
      try {
        snapshot = await window.api.runner.getLastRun()
      } catch {
        return
      }
      if (!snapshot) return

      const scopeId = snapshot.scopeId
      if (!this.scopes[scopeId]) {
        this.scopes[scopeId] = emptyScope(scopeId !== GLOBAL_SCOPE)
      }

      // Older snapshots recorded plain Playwright specs under a mangled feature
      // path, before the reporter learned to report them as `specPath`. Those
      // rows name a file that does not exist, so they are dropped rather than
      // restored; a scenario is kept only if it names a feature or a source file.
      const scenarios = Object.fromEntries(
        Object.entries(snapshot.live.scenarios).filter(
          ([, scenario]) => scenario.relativePath.endsWith('.feature') || !!scenario.specPath,
        ),
      )
      const live = { ...snapshot.live, scenarios }

      this.scopes[scopeId]!.live = live
      // Nothing else has run yet on a fresh load, so showing the restored scope
      // is what the user expects to see.
      this.activeScope = scopeId

      // Re-derive the step lists from the CURRENT files.
      await Promise.all(
        Object.values(scenarios).map((scenario) =>
          this.ensureAuthoredSteps(scenario.relativePath, scenario.title),
        ),
      )
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
          // Global run: EVERY filter applies, exactly as the matched count says.
          // Playwright ANDs them for us — spec files narrow which files run, and
          // `--grep` narrows within them (see `buildGrepPattern`).
          if (this.config.selectedFeatures.length > 0 || this.config.selectedFolders.length > 0) {
            options.featurePaths = this.matchedTests.features.map((f) => f.relativePath)
          }
          if (this.config.selectedTags.length > 0) {
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
        // Outlives the window: finding the failing step is still the need after a
        // reload. Fire-and-forget — a failed write must not affect the run.
        void this.persistLastRun(scope, s.live)
        stopRequested = false
        this.isRunning = false
        s.startedAt = 0
        // Integrate Playwright's HTML report directly in the results panel, scoped to
        // this run (UI mode has no report of its own).
        if (mode !== 'ui') void this.showReport(scope)
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
      s.batchResult = null
      s.status = 'idle'
    },
  },
})
