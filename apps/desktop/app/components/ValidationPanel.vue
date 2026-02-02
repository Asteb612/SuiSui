<script setup lang="ts">
import { useScenarioStore } from '~/stores/scenario'
import { useRunnerStore } from '~/stores/runner'

const scenarioStore = useScenarioStore()
const runnerStore = useRunnerStore()

function runHeadless() {
  runnerStore.runHeadless(
    scenarioStore.currentFeaturePath ?? undefined,
    scenarioStore.scenario.name || undefined
  )
}

function runUI() {
  runnerStore.runUI(
    scenarioStore.currentFeaturePath ?? undefined,
    scenarioStore.scenario.name || undefined
  )
}

function stopRun() {
  runnerStore.stop()
}

function clearLogs() {
  runnerStore.clearLogs()
}

const statusColors: Record<string, string> = {
  idle: 'var(--text-color-secondary)',
  running: 'var(--primary-color)',
  passed: '#10b981',
  failed: '#dc3545',
  error: '#dc3545',
}
</script>

<template>
  <div
    class="validation-panel"
    data-testid="validation-panel"
  >
    <div class="validation-section">
      <h4>Validation</h4>
      <div
        v-if="!scenarioStore.validation"
        class="validation-empty"
      >
        Click "Validate" to check the scenario
      </div>
      <div
        v-else-if="scenarioStore.isValid"
        class="validation-success"
      >
        <i class="pi pi-check-circle" />
        Scenario is valid
      </div>
      <div
        v-else
        class="validation-issues"
      >
        <div
          v-for="(issue, i) in scenarioStore.errors"
          :key="`error-${i}`"
          class="issue error"
        >
          <i class="pi pi-times-circle" />
          {{ issue.message }}
        </div>
        <div
          v-for="(issue, i) in scenarioStore.warnings"
          :key="`warning-${i}`"
          class="issue warning"
        >
          <i class="pi pi-exclamation-triangle" />
          {{ issue.message }}
        </div>
      </div>
    </div>

    <div class="runner-section">
      <h4>Test Runner</h4>
      <div class="runner-status">
        <span
          class="status-dot"
          :style="{ backgroundColor: statusColors[runnerStore.status] }"
        />
        <span class="status-text">{{ runnerStore.status }}</span>
        <span
          v-if="runnerStore.lastResult"
          class="duration"
        >
          {{ runnerStore.lastResult.duration }}ms
        </span>
      </div>

      <div class="base-url-input">
        <label for="baseUrl">Base URL</label>
        <InputText
          id="baseUrl"
          :model-value="runnerStore.baseUrl"
          placeholder="http://localhost:3000"
          size="small"
          :disabled="runnerStore.isRunning"
          @update:model-value="runnerStore.setBaseUrl($event ?? '')"
        />
      </div>

      <div class="runner-buttons">
        <Button
          label="UI"
          icon="pi pi-desktop"
          size="small"
          :disabled="runnerStore.isRunning"
          @click="runUI"
        />
        <Button
          label="Headless"
          icon="pi pi-play"
          size="small"
          outlined
          :disabled="runnerStore.isRunning"
          @click="runHeadless"
        />
        <Button
          v-if="runnerStore.isRunning"
          label="Stop"
          icon="pi pi-stop"
          size="small"
          severity="danger"
          @click="stopRun"
        />
      </div>
    </div>

    <div class="logs-section">
      <div class="logs-header">
        <h4>Logs</h4>
        <Button
          icon="pi pi-trash"
          text
          rounded
          size="small"
          :disabled="runnerStore.logs.length === 0"
          @click="clearLogs"
        />
      </div>
      <div class="logs-content">
        <div
          v-if="runnerStore.logs.length === 0"
          class="logs-empty"
        >
          No logs yet
        </div>
        <pre
          v-else
          class="logs-text"
        >{{ runnerStore.logs.join('\n') }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.validation-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

h4 {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem 0;
}

.validation-section,
.runner-section {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.validation-empty,
.logs-empty {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  font-style: italic;
}

.validation-success {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #10b981;
  font-size: 0.875rem;
}

.validation-issues {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.issue {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8rem;
  padding: 0.5rem;
  border-radius: 4px;
}

.issue.error {
  background: rgba(220, 53, 69, 0.1);
  color: #dc3545;
}

.issue.warning {
  background: rgba(255, 193, 7, 0.1);
  color: #856404;
}

.runner-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-text {
  font-size: 0.875rem;
  text-transform: capitalize;
}

.duration {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin-left: auto;
}

.base-url-input {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.base-url-input label {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.base-url-input :deep(input) {
  width: 100%;
  font-size: 0.875rem;
}

.runner-buttons {
  display: flex;
  gap: 0.5rem;
}

.logs-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logs-content {
  flex: 1;
  background: var(--surface-ground);
  border-radius: 4px;
  padding: 0.5rem;
  overflow: auto;
  min-height: 100px;
}

.logs-text {
  font-family: monospace;
  font-size: 0.75rem;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
