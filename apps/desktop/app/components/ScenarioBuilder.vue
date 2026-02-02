<script setup lang="ts">
import { ref } from 'vue'
import { useScenarioStore } from '~/stores/scenario'
import type { ScenarioStep, StepKeyword, StepArgDefinition } from '@suisui/shared'

const scenarioStore = useScenarioStore()

// Drag & drop state
const draggedIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

// Edit dialog state
const showEditDialog = ref(false)
const editingStep = ref<ScenarioStep | null>(null)

function moveStepUp(index: number) {
  if (index > 0) {
    scenarioStore.moveStep(index, index - 1)
  }
}

function moveStepDown(index: number) {
  if (index < scenarioStore.scenario.steps.length - 1) {
    scenarioStore.moveStep(index, index + 1)
  }
}

function removeStep(stepId: string) {
  scenarioStore.removeStep(stepId)
}

function updateArg(stepId: string, argName: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  scenarioStore.updateStepArg(stepId, argName, value)
}

function getStepIssues(stepId: string) {
  return scenarioStore.validation?.issues.filter((i) => i.stepId === stepId) ?? []
}

async function validateScenario() {
  await scenarioStore.validate()
}

// Drag & drop handlers
function handleDragStart(index: number, event: DragEvent) {
  draggedIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function handleDragEnter(index: number) {
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    dropTargetIndex.value = index
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleDrop(index: number) {
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    scenarioStore.moveStep(draggedIndex.value, index)
  }
  draggedIndex.value = null
  dropTargetIndex.value = null
}

function handleDragEnd() {
  draggedIndex.value = null
  dropTargetIndex.value = null
}

// Edit step handlers
function openEditDialog(step: ScenarioStep) {
  editingStep.value = step
  showEditDialog.value = true
}

function handleReplaceStep(stepId: string, keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
  scenarioStore.replaceStep(stepId, keyword, pattern, args)
}
</script>

<template>
  <div
    class="scenario-builder"
    data-testid="scenario-builder"
  >
    <!-- Empty state when no scenario selected -->
    <div
      v-if="!scenarioStore.currentFeaturePath && !scenarioStore.scenario.name"
      class="no-scenario-selected"
    >
      <div class="empty-state-icon">
        <i class="pi pi-file-edit" />
      </div>
      <h3>No Scenario Selected</h3>
      <p>Select a feature from the list on the left, or create a new scenario to get started.</p>
    </div>

    <!-- Builder content when scenario exists -->
    <template v-else>
      <!-- Scenario Tabs -->
      <div class="scenario-tabs">
        <div
          v-for="(scenario, index) in scenarioStore.scenarios"
          :key="index"
          class="scenario-tab"
          :class="{ active: index === scenarioStore.activeScenarioIndex }"
          @click="scenarioStore.setActiveScenario(index)"
        >
          <span class="tab-name">{{ scenario.name || `Scenario ${index + 1}` }}</span>
          <Button
            v-if="scenarioStore.scenarios.length > 1"
            icon="pi pi-times"
            text
            rounded
            size="small"
            class="tab-close"
            @click.stop="scenarioStore.removeScenario(index)"
          />
        </div>
        <Button
          icon="pi pi-plus"
          text
          rounded
          size="small"
          title="Add Scenario"
          class="add-scenario-btn"
          @click="scenarioStore.addScenario()"
        />
      </div>

      <div
        class="scenario-name"
        data-testid="scenario-name"
      >
        <label for="scenario-name">Scenario Name</label>
        <InputText
          id="scenario-name"
          :model-value="scenarioStore.scenario.name"
          placeholder="Enter scenario name..."
          @update:model-value="scenarioStore.setName($event as string)"
        />
      </div>

      <div class="steps-container">
        <div
          v-if="scenarioStore.scenario.steps.length === 0"
          class="empty-steps"
        >
          <i class="pi pi-plus-circle" />
          <p>No steps yet</p>
          <p class="hint">
            Select steps from the panel on the right to add them here
          </p>
        </div>

        <div
          v-for="(step, index) in scenarioStore.scenario.steps"
          :key="step.id"
          class="step-row"
          :class="{
            'has-error': getStepIssues(step.id).some(i => i.severity === 'error'),
            'is-dragging': draggedIndex === index,
            'is-drop-target': dropTargetIndex === index
          }"
          data-testid="scenario-step"
          draggable="true"
          @dragstart="handleDragStart(index, $event)"
          @dragenter="handleDragEnter(index)"
          @dragover="handleDragOver"
          @drop="handleDrop(index)"
          @dragend="handleDragEnd"
        >
          <div class="step-controls">
            <i
              class="pi pi-bars drag-handle"
              title="Drag to reorder"
            />
            <Button
              icon="pi pi-chevron-up"
              text
              rounded
              size="small"
              :disabled="index === 0"
              @click="moveStepUp(index)"
            />
            <Button
              icon="pi pi-chevron-down"
              text
              rounded
              size="small"
              :disabled="index === scenarioStore.scenario.steps.length - 1"
              @click="moveStepDown(index)"
            />
          </div>

          <div class="step-content">
            <div class="step-header">
              <span
                class="step-keyword"
                :class="step.keyword.toLowerCase()"
              >
                {{ step.keyword }}
              </span>
              <span class="step-pattern">{{ step.pattern }}</span>
              <Button
                icon="pi pi-pencil"
                text
                rounded
                size="small"
                title="Edit step"
                @click="openEditDialog(step)"
              />
              <Button
                icon="pi pi-times"
                text
                rounded
                severity="danger"
                size="small"
                title="Remove step"
                @click="removeStep(step.id)"
              />
            </div>

            <div
              v-if="step.args.length > 0"
              class="step-args"
            >
              <div
                v-for="arg in step.args"
                :key="arg.name"
                class="arg-field"
              >
                <label :for="`arg-${step.id}-${arg.name}`">{{ arg.name }}</label>
                <InputText
                  :id="`arg-${step.id}-${arg.name}`"
                  :value="arg.value"
                  :placeholder="`Enter ${arg.type}...`"
                  size="small"
                  :class="{ 'p-invalid': !arg.value }"
                  @input="updateArg(step.id, arg.name, $event)"
                />
              </div>
            </div>

            <div
              v-if="getStepIssues(step.id).length > 0"
              class="step-issues"
            >
              <div
                v-for="(issue, i) in getStepIssues(step.id)"
                :key="i"
                :class="['issue', issue.severity]"
              >
                <i :class="issue.severity === 'error' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'" />
                {{ issue.message }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="builder-actions">
        <Button
          label="Validate"
          icon="pi pi-check"
          outlined
          size="small"
          data-testid="validate-button"
          @click="validateScenario"
        />
        <span
          v-if="scenarioStore.isDirty"
          class="dirty-indicator"
        >
          <i class="pi pi-circle-fill" />
          Unsaved changes
        </span>
      </div>
    </template>

    <!-- Edit Step Dialog -->
    <StepEditDialog
      v-model:visible="showEditDialog"
      :step="editingStep"
      @replace="handleReplaceStep"
    />
  </div>
</template>

<style scoped>
.scenario-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.scenario-name {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.scenario-name label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.scenario-name :deep(input) {
  width: 100%;
  font-size: 1.125rem;
}

.steps-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-ground);
}

.empty-steps {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--text-color-secondary);
  gap: 0.5rem;
}

.empty-steps i {
  font-size: 3rem;
  opacity: 0.5;
}

.empty-steps .hint {
  font-size: 0.875rem;
}

.step-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--surface-border);
}

.step-row.has-error {
  background: rgba(220, 53, 69, 0.05);
}

.step-row.is-dragging {
  opacity: 0.5;
  background: var(--surface-ground);
}

.step-row.is-drop-target {
  border-top: 2px solid var(--primary-color);
}

.step-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.drag-handle {
  cursor: grab;
  color: var(--text-color-secondary);
  padding: 0.25rem;
  font-size: 0.875rem;
}

.drag-handle:hover {
  color: var(--primary-color);
}

.step-row.is-dragging .drag-handle {
  cursor: grabbing;
}

.step-content {
  flex: 1;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step-keyword {
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.step-keyword.given {
  background: #10b981;
  color: white;
}

.step-keyword.when {
  background: #3b82f6;
  color: white;
}

.step-keyword.then {
  background: #8b5cf6;
  color: white;
}

.step-keyword.and,
.step-keyword.but {
  background: #6b7280;
  color: white;
}

.step-pattern {
  flex: 1;
  font-family: monospace;
  font-size: 0.875rem;
}

.step-args {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--surface-border);
}

.arg-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 150px;
}

.arg-field label {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.step-issues {
  margin-top: 0.5rem;
}

.issue {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.25rem 0;
}

.issue.error {
  color: #dc3545;
}

.issue.warning {
  color: #ffc107;
}

.builder-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--surface-border);
}

.dirty-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.dirty-indicator i {
  font-size: 0.5rem;
  color: #f59e0b;
}

/* Empty state styles */
.no-scenario-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 2rem;
  color: var(--text-color-secondary);
}

.empty-state-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--surface-ground);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.empty-state-icon i {
  font-size: 2.5rem;
  opacity: 0.5;
}

.no-scenario-selected h3 {
  margin: 0 0 0.5rem 0;
  color: var(--text-color);
}

.no-scenario-selected p {
  font-size: 0.875rem;
  max-width: 300px;
}

/* Scenario tabs styles */
.scenario-tabs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  margin-bottom: 0.5rem;
  overflow-x: auto;
}

.scenario-tab {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px 6px 0 0;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-bottom: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  transition: all 0.15s;
  white-space: nowrap;
}

.scenario-tab:hover {
  background: var(--surface-card);
  color: var(--text-color);
}

.scenario-tab.active {
  background: var(--surface-card);
  color: var(--primary-color);
  font-weight: 500;
  border-color: var(--primary-color);
  border-bottom: 1px solid var(--surface-card);
  margin-bottom: -1px;
}

.tab-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  padding: 0.125rem !important;
  width: 1.25rem !important;
  height: 1.25rem !important;
}

.tab-close:hover {
  color: #dc3545 !important;
}

.add-scenario-btn {
  margin-left: 0.25rem;
}
</style>
