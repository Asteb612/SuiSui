<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useRunnerStore } from '~/stores/runner'
import { useAiStore } from '~/stores/ai'
import { useStepsStore } from '~/stores/steps'

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

function statusClass(status: string): string {
  return `status-${status}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
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

    <!-- Running indicator -->
    <div
      v-else-if="runnerStore.isRunning"
      class="running-state-section"
    >
      <div class="running-state">
        <i class="pi pi-spin pi-spinner" />
        <span>Tests are running...</span>
      </div>
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
