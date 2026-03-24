<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useRunnerStore } from '~/stores/runner'
import type { FeatureRunResult } from '@suisui/shared'

const runnerStore = useRunnerStore()
const logsContainer = ref<HTMLPreElement | null>(null)

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
const expandedFeatures = ref<Set<string>>(new Set())

function toggleFeature(path: string) {
  if (expandedFeatures.value.has(path)) {
    expandedFeatures.value.delete(path)
  } else {
    expandedFeatures.value.add(path)
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return 'pi pi-check-circle'
    case 'failed':
      return 'pi pi-times-circle'
    case 'skipped':
      return 'pi pi-minus-circle'
    default:
      return 'pi pi-circle'
  }
}

function statusClass(status: string): string {
  return `status-${status}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function featureScenarioSummary(feature: FeatureRunResult): string {
  const passed = feature.scenarioResults.filter((s) => s.status === 'passed').length
  const failed = feature.scenarioResults.filter((s) => s.status === 'failed').length
  const skipped = feature.scenarioResults.filter((s) => s.status === 'skipped').length
  const parts: string[] = []
  if (passed) parts.push(`${passed} passed`)
  if (failed) parts.push(`${failed} failed`)
  if (skipped) parts.push(`${skipped} skipped`)
  return parts.join(', ')
}
</script>

<template>
  <div class="run-results-panel">
    <!-- Back to Filters button -->
    <div class="results-header">
      <Button
        icon="pi pi-arrow-left"
        label="Back to Filters"
        text
        size="small"
        @click="runnerStore.showResults = false"
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

      <!-- Feature Results List -->
      <div class="feature-results">
        <div
          v-for="feature in runnerStore.batchResult.featureResults"
          :key="feature.relativePath"
          class="feature-item"
        >
          <div
            class="feature-header"
            @click="toggleFeature(feature.relativePath)"
          >
            <i
              :class="expandedFeatures.has(feature.relativePath) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
              class="expand-icon"
            />
            <i
              :class="statusIcon(feature.status)"
              :class-name="statusClass(feature.status)"
            />
            <span
              class="feature-name"
              :class="statusClass(feature.status)"
            >
              {{ feature.name || feature.relativePath }}
            </span>
            <span class="feature-meta">
              {{ featureScenarioSummary(feature) }}
              &middot; {{ formatDuration(feature.duration) }}
            </span>
          </div>

          <!-- Expanded Scenario Results -->
          <div
            v-if="expandedFeatures.has(feature.relativePath)"
            class="scenario-list"
          >
            <div
              v-for="scenario in feature.scenarioResults"
              :key="scenario.name"
              class="scenario-item"
            >
              <i :class="statusIcon(scenario.status)" />
              <span
                class="scenario-name"
                :class="statusClass(scenario.status)"
              >
                {{ scenario.name }}
              </span>
              <span class="scenario-duration">{{ formatDuration(scenario.duration) }}</span>
              <div
                v-if="scenario.error"
                class="scenario-error"
              >
                {{ scenario.error }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Errors -->
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

      <!-- Logs -->
      <div
        v-if="runnerStore.logs.length > 0"
        class="logs-section"
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
</template>

<style scoped>
.run-results-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  overflow: hidden;
  flex: 1;
  min-height: 0;
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
