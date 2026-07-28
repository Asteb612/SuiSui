<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useRunnerStore } from '~/stores/runner'
import { useAiStore } from '~/stores/ai'
import { useStepsStore } from '~/stores/steps'
import { statusPresentation, formatDuration } from '~/utils/runStatus'

const runnerStore = useRunnerStore()
const aiStore = useAiStore()
const stepsStore = useStepsStore()
const logsContainer = ref<HTMLPreElement | null>(null)

// --- AI failure explanation (spec FR-012) ---
const explaining = ref(false)
const explanation = ref('')
const explainError = ref<string | null>(null)

// --- AI failure fix (advisory suggestion, reviewed by the user) ---
const fixing = ref(false)
const fixSuggestion = ref('')
const fixError = ref<string | null>(null)

const hasFailures = computed(() => {
  const b = runnerStore.batchResult
  return (!!b && b.summary.failed > 0) || runnerStore.errors.length > 0 || runnerStore.status === 'error'
})

/** Assemble the failed-test output the assistant explains: failed scenarios, errors, else logs. */
const failureOutput = computed(() => {
  const parts: string[] = []
  const b = runnerStore.batchResult
  if (b) {
    for (const feature of b.featureResults) {
      for (const scenario of feature.scenarioResults) {
        if (scenario.status === 'failed' && scenario.error) {
          parts.push(`${feature.name || feature.relativePath} › ${scenario.name}\n${scenario.error}`)
        }
      }
    }
  }
  for (const error of runnerStore.errors) {
    const loc = error.file ? ` (${error.file}${error.line ? `:${error.line}` : ''})` : ''
    parts.push(`${error.message}${loc}`)
  }
  if (parts.length === 0 && runnerStore.logs.length > 0) {
    parts.push(runnerStore.logs.join('\n'))
  }
  return parts.join('\n\n')
})

async function onExplainFailure() {
  if (!hasFailures.value || explaining.value) return
  explaining.value = true
  explanation.value = ''
  explainError.value = null
  try {
    const result = await aiStore.generate('failure-explain', failureOutput.value, {
      steps: [],
      scenarioText: null,
      targetStep: null,
    })
    if (result.error) explainError.value = result.error
    else explanation.value = result.text
  } finally {
    explaining.value = false
  }
}

async function onFixFailure() {
  if (!hasFailures.value || fixing.value) return
  fixing.value = true
  fixSuggestion.value = ''
  fixError.value = null
  try {
    const result = await aiStore.generate('failure-fix', failureOutput.value, {
      steps: stepsStore.steps,
      scenarioText: null,
      targetStep: null,
    })
    if (result.error) fixError.value = result.error
    else fixSuggestion.value = result.text
  } finally {
    fixing.value = false
  }
}

function onCancelAi() {
  aiStore.cancel()
}

watch(
  () => runnerStore.logs.length,
  () => {
    nextTick(() => {
      if (logsContainer.value) {
        logsContainer.value.scrollTop = logsContainer.value.scrollHeight
      }
    })
  },
)
// Logs are noisy and hidden by default; the integrated report is the main view.
const showLogs = ref(false)

// --- Live run progress + elapsed timer (so a long/stuck run is visible) ---
const elapsedMs = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

// `immediate` matters: this panel is behind `v-if="showResults"`, which the store
// only turns on *after* it has already set `isRunning`. Without it the watcher
// never sees a transition, the interval is never started, and the run reads
// "0s" for its entire duration.
//
// The start instant comes from the store for the same reason — the panel mounts
// after the run begins, and may unmount and remount mid-run.
watch(
  () => [runnerStore.isRunning, runnerStore.startedAt] as const,
  ([running, startedAt]) => {
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    if (!running || !startedAt) {
      elapsedMs.value = 0
      return
    }
    const tick = (): void => {
      elapsedMs.value = Date.now() - startedAt
    }
    tick()
    elapsedTimer = setInterval(tick, 500)
  },
  { immediate: true },
)
onUnmounted(() => {
  if (elapsedTimer) clearInterval(elapsedTimer)
})

const progressPct = computed(() => {
  const p = runnerStore.progress
  return p.total > 0 ? Math.min(100, Math.round((p.completed / p.total) * 100)) : 0
})

/** The most recent non-empty streamed line — shown as current activity. */
const lastLogLine = computed(() => {
  const logs = runnerStore.logs
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i]?.trim()
    if (l) return l
  }
  return ''
})

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function statusClass(status: string): string {
  return `status-${status}`
}

// --- Live per-scenario / per-step view (feature 011, US2 + US3) ---

/** Which scenario's steps are expanded in the live list. */
const selectedTestId = ref<string | null>(null)

/** True once progress events have arrived; otherwise the aggregate view stands alone. */
const hasLiveDetail = computed(
  () => runnerStore.live.available && runnerStore.liveScenarios.length > 0,
)

const runningIds = computed(() => new Set(runnerStore.live.running))

/**
 * Wall clock, derived from the SINGLE elapsed ticker above.
 *
 * One interval drives every elapsed readout on this panel (FR-014). A timer per
 * step would multiply by the number of steps on screen for no added precision.
 */
const nowMs = computed(() =>
  runnerStore.startedAt ? runnerStore.startedAt + elapsedMs.value : Date.now(),
)

/** Steps of the expanded scenario, or null when there is nothing to show. */
const selectedSteps = computed(() => {
  const scenario = runnerStore.liveScenarios.find((s) => s.testId === selectedTestId.value)
  if (!scenario) return null
  return runnerStore.liveStepsFor(scenario.relativePath, scenario.title)
})

function toggleScenario(testId: string): void {
  selectedTestId.value = selectedTestId.value === testId ? null : testId
}

/** How long a step has been running, or how long it took once finished. */
function stepElapsedMs(step: { status: string; startedAt?: number; durationMs?: number }): number {
  if (step.status === 'running' && step.startedAt) return Math.max(0, nowMs.value - step.startedAt)
  return step.durationMs ?? 0
}

/**
 * The step that has been running longest, surfaced so a stalled run is
 * attributable to a step without reading the log (US3).
 *
 * Only shown once it has been running a while — flagging every step the instant
 * it starts would make the callout meaningless.
 */
const STUCK_THRESHOLD_MS = 5000

const longestRunningStep = computed(() => {
  let worst: { scenario: string; title: string; elapsed: number } | null = null

  for (const scenario of runnerStore.liveScenarios) {
    if (!runningIds.value.has(scenario.testId)) continue
    for (const step of Object.values(scenario.steps)) {
      if (step.status !== 'running' || !step.startedAt) continue
      const elapsed = nowMs.value - step.startedAt
      if (!worst || elapsed > worst.elapsed) {
        worst = { scenario: scenario.title, title: step.title, elapsed }
      }
    }
  }

  return worst && worst.elapsed >= STUCK_THRESHOLD_MS ? worst : null
})

</script>

<template>
  <div class="run-results-panel">
    <!-- Back to Filters button (hidden for a single-spec quick-run — there are no filters to return to) -->
    <div class="results-header">
      <Button
        v-if="!runnerStore.singleRun"
        icon="pi pi-arrow-left"
        label="Back to Filters"
        text
        size="small"
        data-testid="back-to-filters-btn"
        @click="runnerStore.showFilters()"
      />
      <div class="results-header-spacer" />
      <Button
        v-if="runnerStore.batchResult && !runnerStore.isRunning && runnerStore.logs.length > 0"
        :icon="showLogs ? 'pi pi-eye-slash' : 'pi pi-list'"
        :label="showLogs ? 'Hide logs' : 'Show logs'"
        text
        size="small"
        data-testid="toggle-logs-btn"
        @click="showLogs = !showLogs"
      />
    </div>

    <!-- No results yet -->
    <div
      v-if="!runnerStore.batchResult && !runnerStore.isRunning"
      class="empty-state"
    >
      <i class="pi pi-play" />
      <span>Run tests to see results here</span>
    </div>

    <!-- Running indicator with live progress -->
    <div
      v-else-if="runnerStore.isRunning"
      class="running-state-section"
    >
      <div class="running-state">
        <i class="pi pi-spin pi-spinner" />
        <span>Running tests…</span>
        <span
          class="run-elapsed"
          data-testid="run-elapsed"
        >{{ formatElapsed(elapsedMs) }}</span>
      </div>

      <div
        v-if="runnerStore.progress.total > 0"
        class="run-progress"
        data-testid="run-progress"
      >
        <div class="run-progress-head">
          <span class="run-progress-count">
            <strong>{{ runnerStore.progress.completed }}</strong> / {{ runnerStore.progress.total }} tests
          </span>
          <span class="run-progress-breakdown">
            <span
              v-if="runnerStore.progress.passed"
              class="ok"
            >{{ runnerStore.progress.passed }} passed</span>
            <span
              v-if="runnerStore.progress.failed"
              class="fail"
            >{{ runnerStore.progress.failed }} failed</span>
            <span
              v-if="runnerStore.progress.skipped"
              class="skip"
            >{{ runnerStore.progress.skipped }} skipped</span>
          </span>
        </div>
        <div class="run-progress-bar">
          <div
            class="run-progress-fill"
            :style="{ width: progressPct + '%' }"
          />
        </div>
      </div>

      <!-- Longest-running step, so a stalled run is attributable without the log -->
      <div
        v-if="longestRunningStep"
        class="stuck-step"
        data-testid="stuck-step"
      >
        <i class="pi pi-clock" />
        <span>
          Running for {{ formatDuration(longestRunningStep.elapsed) }}:
          <strong>{{ longestRunningStep.title }}</strong>
          <span class="stuck-step-scenario">in {{ longestRunningStep.scenario }}</span>
        </span>
      </div>

      <!-- Live scenario list (US2). Only appears when the reporter produced
           events; otherwise the counters above are the whole story. -->
      <div
        v-if="hasLiveDetail"
        class="live-scenarios"
        data-testid="live-scenarios"
      >
        <div
          v-for="scenario in runnerStore.liveScenarios"
          :key="scenario.testId"
          class="live-scenario"
          :class="[
            `live-${scenario.status}`,
            { 'is-running': runningIds.has(scenario.testId) }
          ]"
          :data-testid="`live-scenario-${scenario.status}`"
        >
          <button
            type="button"
            class="live-scenario-head"
            :aria-expanded="selectedTestId === scenario.testId"
            data-testid="live-scenario-toggle"
            @click="toggleScenario(scenario.testId)"
          >
            <span
              class="live-status"
              :class="`live-icon-${scenario.status}`"
              :title="statusPresentation(scenario.status).label"
              :aria-label="statusPresentation(scenario.status).label"
              role="img"
            >
              <i :class="statusPresentation(scenario.status).icon" />
            </span>
            <span class="live-scenario-name">{{ scenario.title }}</span>
            <span class="live-scenario-feature">{{ scenario.relativePath }}</span>
            <span
              v-if="scenario.durationMs"
              class="live-scenario-duration"
            >{{ formatDuration(scenario.durationMs) }}</span>
            <i
              class="pi live-scenario-chevron"
              :class="selectedTestId === scenario.testId ? 'pi-chevron-down' : 'pi-chevron-right'"
            />
          </button>

          <!-- Steps of the selected scenario, without leaving the run view (FR-011) -->
          <ol
            v-if="selectedTestId === scenario.testId && selectedSteps"
            class="live-steps"
            data-testid="live-steps"
          >
            <li
              v-for="step in selectedSteps"
              :key="step.index"
              class="live-step"
              :class="`live-${step.status}`"
            >
              <span
                class="live-status"
                :class="`live-icon-${step.status}`"
                :title="statusPresentation(step.status).label"
                :aria-label="statusPresentation(step.status).label"
                role="img"
              >
                <i :class="statusPresentation(step.status).icon" />
              </span>
              <span class="live-step-title">{{ step.title }}</span>
              <span
                v-if="step.isBackground"
                class="live-step-background"
              >background</span>
              <span
                v-if="stepElapsedMs(step)"
                class="live-step-elapsed"
                data-testid="live-step-elapsed"
              >{{ formatDuration(stepElapsedMs(step)) }}</span>
            </li>
          </ol>

          <p
            v-else-if="selectedTestId === scenario.testId"
            class="live-steps-empty"
          >
            Step details are not available for this scenario.
          </p>
        </div>
      </div>

      <p
        v-if="lastLogLine"
        class="run-current"
        data-testid="run-current"
      >
        {{ lastLogLine }}
      </p>

      <pre
        v-if="runnerStore.logs.length > 0"
        ref="logsContainer"
        class="logs-output"
      >{{ runnerStore.logs.join('\n') }}</pre>
    </div>

    <!-- Results -->
    <div
      v-else-if="runnerStore.batchResult"
      class="results-content"
    >
      <!-- Summary Bar -->
      <div
        class="summary-bar"
        :class="statusClass(runnerStore.batchResult.status)"
      >
        <div class="summary-stats">
          <span class="stat total">
            <strong>{{ runnerStore.batchResult.summary.total }}</strong> total
          </span>
          <span
            v-if="runnerStore.batchResult.summary.passed"
            class="stat passed"
          >
            <i class="pi pi-check-circle" />
            {{ runnerStore.batchResult.summary.passed }} passed
          </span>
          <span
            v-if="runnerStore.batchResult.summary.failed"
            class="stat failed"
          >
            <i class="pi pi-times-circle" />
            {{ runnerStore.batchResult.summary.failed }} failed
          </span>
          <span
            v-if="runnerStore.batchResult.summary.skipped"
            class="stat skipped"
          >
            <i class="pi pi-minus-circle" />
            {{ runnerStore.batchResult.summary.skipped }} skipped
          </span>
        </div>
        <span class="duration">{{ formatDuration(runnerStore.batchResult.duration) }}</span>
      </div>

      <!-- AI failure explanation (spec FR-012) -->
      <div
        v-if="hasFailures && aiStore.isConfigured"
        class="ai-explain-section"
        data-testid="ai-explain-section"
      >
        <div class="ai-explain-header">
          <Button
            :label="explanation || explaining ? 'Re-explain failure (AI)' : 'Explain failure (AI)'"
            icon="pi pi-sparkles"
            size="small"
            outlined
            :disabled="explaining || fixing"
            :loading="explaining"
            data-testid="ai-explain-btn"
            @click="onExplainFailure"
          />
          <Button
            :label="fixSuggestion || fixing ? 'Re-fix failure (AI)' : 'Fix failure (AI)'"
            icon="pi pi-wrench"
            size="small"
            outlined
            :disabled="explaining || fixing"
            :loading="fixing"
            data-testid="ai-fix-btn"
            @click="onFixFailure"
          />
          <Button
            v-if="explaining || fixing"
            label="Cancel"
            icon="pi pi-times"
            text
            size="small"
            data-testid="ai-explain-cancel"
            @click="onCancelAi"
          />
        </div>

        <!-- Explanation result -->
        <div
          v-if="explainError"
          class="ai-explain-error"
          data-testid="ai-explain-error"
        >
          <i class="pi pi-exclamation-triangle" /> {{ explainError }}
        </div>
        <pre
          v-else-if="explaining"
          class="ai-explain-body"
          data-testid="ai-explain-stream"
        >{{ aiStore.streamingDraft }}<span class="cursor">▍</span></pre>
        <pre
          v-else-if="explanation"
          class="ai-explain-body"
          data-testid="ai-explain-result"
        >{{ explanation }}</pre>

        <!-- Fix suggestion result -->
        <div
          v-if="fixError"
          class="ai-explain-error"
          data-testid="ai-fix-error"
        >
          <i class="pi pi-exclamation-triangle" /> {{ fixError }}
        </div>
        <pre
          v-else-if="fixing"
          class="ai-explain-body"
          data-testid="ai-fix-stream"
        >{{ aiStore.streamingDraft }}<span class="cursor">▍</span></pre>
        <pre
          v-else-if="fixSuggestion"
          class="ai-explain-body"
          data-testid="ai-fix-result"
        >{{ fixSuggestion }}</pre>
      </div>

      <!-- Errors (native — e.g. bddgen failures that never reached the report) -->
      <div
        v-if="runnerStore.errors.length > 0"
        class="errors-section"
      >
        <h4>Errors</h4>
        <div
          v-for="(error, idx) in runnerStore.errors"
          :key="idx"
          class="error-item"
        >
          <i class="pi pi-exclamation-triangle" />
          <span>{{ error.message }}</span>
          <span
            v-if="error.file"
            class="error-file"
          >
            {{ error.file }}{{ error.line ? `:${error.line}` : '' }}
          </span>
          <div
            v-if="error.suggestion"
            class="error-suggestion"
          >
            {{ error.suggestion }}
          </div>
        </div>
      </div>

      <!-- Integrated Playwright report + collapsible logs beside it -->
      <div class="results-body">
        <div
          class="report-pane"
          data-testid="report-pane"
        >
          <iframe
            v-if="runnerStore.reportUrl"
            :src="runnerStore.reportUrl"
            class="report-frame"
            title="Test report"
          />
          <div
            v-else-if="runnerStore.reportLoading"
            class="report-placeholder"
          >
            <i class="pi pi-spin pi-spinner" />
            <span>Preparing the report…</span>
          </div>
          <div
            v-else
            class="report-placeholder"
          >
            <i class="pi pi-info-circle" />
            <span>No report for this run — open the logs to see what happened.</span>
          </div>
        </div>

        <div
          v-if="showLogs && runnerStore.logs.length > 0"
          class="logs-pane"
          data-testid="logs-pane"
        >
          <div class="logs-header">
            <span class="logs-title">Logs</span>
            <Button
              icon="pi pi-trash"
              label="Clear"
              text
              size="small"
              @click="runnerStore.clearLogs()"
            />
          </div>
          <pre
            ref="logsContainer"
            class="logs-output"
          >{{ runnerStore.logs.join('\n') }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-results-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  overflow: hidden;
  flex: 1;
  /* Fill the runner content area so the embedded report fills the remaining
     height and only its own content scrolls (inside the iframe), not the panel. */
  height: 100%;
  min-height: 0;
  position: relative;
}

/* Integrated report + logs live side by side and fill the panel */
.results-header-spacer {
  flex: 1;
}

.results-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0.5rem;
}

.report-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 6px;
  overflow: hidden;
  background: var(--p-content-background, #fff);
}

.report-frame {
  flex: 1;
  width: 100%;
  border: 0;
}

.report-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color, #6b7280);
  font-size: 0.9rem;
}

.logs-pane {
  width: 40%;
  max-width: 520px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 6px;
  overflow: hidden;
}

.results-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}

.results-header {
  display: flex;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.running-state-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}

.empty-state,
.running-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  justify-content: center;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

/* When running, the state line is a compact header above the live progress. */
.running-state-section .running-state {
  padding: 0.75rem;
  justify-content: flex-start;
}

.run-elapsed {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.run-progress {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0 0.75rem;
}

.run-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.85rem;
}

.run-progress-count strong {
  font-size: 1rem;
}

.run-progress-breakdown {
  display: inline-flex;
  gap: 0.75rem;
  font-size: 0.8rem;
}

.run-progress-breakdown .ok {
  color: var(--p-green-600);
}

.run-progress-breakdown .fail {
  color: var(--p-red-600);
}

.run-progress-breakdown .skip {
  color: var(--p-text-muted-color);
}

.run-progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--p-content-border-color, var(--surface-border, #e5e7eb));
  overflow: hidden;
}

.run-progress-fill {
  height: 100%;
  background: var(--p-primary-color, #3b82f6);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.run-current {
  margin: 0;
  padding: 0 0.75rem;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- Live scenario / step list (feature 011, US2 + US3) --- */

.stuck-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.75rem 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: rgba(234, 88, 12, 0.08);
  color: var(--p-orange-700, #c2410c);
  font-size: 0.82rem;
}

.stuck-step-scenario {
  margin-left: 0.4rem;
  color: var(--text-color-secondary);
}

.live-scenarios {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0 0.75rem 0.75rem;
  max-height: 22rem;
  overflow-y: auto;
}

.live-scenario {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-card);
  overflow: hidden;
}

/* Every running scenario is highlighted, not just one — a parallel run has
   several genuinely in flight (FR-009). */
.live-scenario.is-running {
  border-color: var(--p-blue-400, #60a5fa);
  background: rgba(59, 130, 246, 0.06);
}

.live-scenario.live-failed {
  border-color: var(--p-red-300, #fca5a5);
}

.live-scenario-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 0.82rem;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}

.live-scenario-head:hover {
  background: var(--surface-hover);
}

.live-scenario-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-scenario-feature {
  flex: 1;
  min-width: 0;
  font-size: 0.74rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-scenario-duration,
.live-step-elapsed {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-color-secondary);
}

.live-scenario-chevron {
  flex: 0 0 auto;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.live-steps {
  margin: 0;
  padding: 0.25rem 0.6rem 0.5rem 2rem;
  list-style: none;
  border-top: 1px solid var(--surface-border);
}

.live-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0;
  font-size: 0.8rem;
}

.live-step-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-step.live-pending .live-step-title {
  color: var(--text-color-secondary);
}

.live-step-background {
  flex: 0 0 auto;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--surface-ground);
  font-size: 0.68rem;
  color: var(--text-color-secondary);
}

.live-steps-empty {
  margin: 0;
  padding: 0.4rem 0.6rem 0.5rem 2rem;
  border-top: 1px solid var(--surface-border);
  font-size: 0.78rem;
  color: var(--text-color-secondary);
}

.live-status {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  font-size: 0.85rem;
}

.live-icon-pending { color: var(--text-color-secondary); }
.live-icon-running { color: var(--p-blue-600, #2563eb); }
.live-icon-passed { color: var(--p-green-600, #16a34a); }
.live-icon-failed { color: var(--p-red-600, #dc2626); }
.live-icon-skipped { color: var(--text-color-secondary); }
.live-icon-interrupted { color: var(--p-orange-600, #ea580c); }

.summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius);
  font-size: 0.85rem;
}

.summary-bar.status-passed {
  background: var(--p-green-50);
  border: 1px solid var(--p-green-200);
}

.summary-bar.status-failed {
  background: var(--p-red-50);
  border: 1px solid var(--p-red-200);
}

.summary-bar.status-error {
  background: var(--p-orange-50);
  border: 1px solid var(--p-orange-200);
}

.summary-stats {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.stat.passed { color: var(--p-green-700); }
.stat.failed { color: var(--p-red-700); }
.stat.skipped { color: var(--p-text-muted-color); }

.duration {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}

.ai-explain-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius);
}

.ai-explain-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-explain-body {
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: var(--p-surface-100);
  border-radius: var(--p-border-radius);
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 16rem;
  overflow-y: auto;
}

.ai-explain-error {
  font-size: 0.8rem;
  color: var(--p-red-700);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.cursor {
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.feature-results {
  display: flex;
  flex-direction: column;
}

.feature-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
  cursor: pointer;
  border-bottom: 1px solid var(--p-content-border-color);
  font-size: 0.85rem;
}

.feature-header:hover {
  background: var(--p-surface-hover);
}

.expand-icon {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.feature-name {
  font-weight: 600;
  flex: 1;
}

.feature-meta {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.scenario-list {
  padding-left: 1.5rem;
}

.scenario-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.35rem 0.25rem;
  font-size: 0.8rem;
  border-bottom: 1px solid var(--p-surface-200);
}

.scenario-name {
  flex: 1;
}

.scenario-duration {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  white-space: nowrap;
}

.scenario-error {
  width: 100%;
  padding: 0.35rem 0.5rem;
  margin-top: 0.25rem;
  background: var(--p-red-50);
  border-radius: var(--p-border-radius);
  color: var(--p-red-700);
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.status-passed { color: var(--p-green-600); }
.status-failed { color: var(--p-red-600); }
.status-skipped { color: var(--p-text-muted-color); }

.errors-section {
  padding: 0.5rem;
  background: var(--p-red-50);
  border-radius: var(--p-border-radius);
}

.errors-section h4 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--p-red-700);
}

.error-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
  color: var(--p-red-700);
}

.error-file {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.error-suggestion {
  width: 100%;
  padding-left: 1.5rem;
  font-style: italic;
  color: var(--p-text-muted-color);
}

.logs-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-content-border-color);
  flex: 1;
  min-height: 0;
}

.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logs-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.logs-output {
  padding: 0.5rem;
  background: var(--p-surface-900);
  color: var(--p-surface-100);
  border-radius: var(--p-border-radius);
  font-size: 0.75rem;
  overflow-x: auto;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
