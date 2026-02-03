<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScenarioStore } from '~/stores/scenario'
import TableEditor from './TableEditor.vue'
import type { ScenarioStep, StepKeyword, StepArgDefinition, StepDefinition } from '@suisui/shared'

interface TableRow {
  [key: string]: string
}

// Throttle utility function
function throttle<T extends (...args: unknown[]) => unknown>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastRan = 0

  return function(...args: Parameters<T>) {
    const now = Date.now()
    
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    if (now - lastRan >= delay) {
      func(...args)
      lastRan = now
    } else {
      timeoutId = setTimeout(() => {
        func(...args)
        lastRan = Date.now()
        timeoutId = null
      }, delay - (now - lastRan))
    }
  }
}

const props = withDefaults(
  defineProps<{
    editMode?: 'scenario' | 'background'
  }>(),
  {
    editMode: 'scenario',
  }
)

defineEmits<{
  'toggle-edit-mode': []
}>()

const scenarioStore = useScenarioStore()

// Drag & drop state
const draggedIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)
const dragType = ref<'scenario' | 'background'>('scenario')
const isDraggingFromCatalog = ref(false)

// Edit dialog state
const showEditDialog = ref(false)
const editingStep = ref<ScenarioStep | null>(null)
const editingStepType = ref<'scenario' | 'background'>('scenario')

// Background section state
const backgroundExpanded = ref(false)

// Computed
const isBackgroundEditMode = computed(() => props.editMode === 'background')
const isScenarioEditMode = computed(() => props.editMode === 'scenario')

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

function updateArg(stepId: string, argName: string, value: string) {
  scenarioStore.updateStepArg(stepId, argName, value)
}

function parseTableValue(value: string): TableRow[] {
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function updateTableArg(stepId: string, argName: string, rows: TableRow[]) {
  const value = JSON.stringify(rows)
  scenarioStore.updateStepArg(stepId, argName, value)
}

function updateBackgroundArg(stepId: string, argName: string, value: string) {
  scenarioStore.updateBackgroundStepArg(stepId, argName, value)
}

function updateBackgroundTableArg(stepId: string, argName: string, rows: TableRow[]) {
  const value = JSON.stringify(rows)
  scenarioStore.updateBackgroundStepArg(stepId, argName, value)
}

function parseStepPattern(pattern: string): string {
  const escapeHtml = (str: string): string => {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return str.replace(/[&<>"']/g, (c) => map[c] || c)
  }

  let parsed = pattern

  // Replace (enum|values) with styled variable - show first option with asterisk
  parsed = parsed.replace(/\(([^)]+\|[^)]+)\)/g, (_, content) => {
    const firstOption = content.split('|')[0].trim()
    const escaped = escapeHtml(firstOption)
    return `<span class="pattern-variable pattern-enum">${escaped}*</span>`
  })

  // Replace {type} with styled variable
  parsed = parsed.replace(/\{(string|int|float|any)(?::(\w+))?\}/g, (_, type, name) => {
    const displayName = name || type
    const escaped = escapeHtml(displayName)
    return `<span class="pattern-variable pattern-${type}">{${escaped}}</span>`
  })

  // Replace (columns) : with table indicator
  parsed = parsed.replace(/\(([^)]+(?:,\s*[^)]+)+)\)\s*:\s*$/, (_, columns) => {
    const escaped = escapeHtml(columns)
    return `<span class="pattern-variable pattern-table">[${escaped}]</span>`
  })

  return parsed
}

function getStepIssues(stepId: string) {
  return scenarioStore.validation?.issues.filter((i) => i.stepId === stepId) ?? []
}

// Auto-validation with throttle
const throttledValidate = throttle(async () => {
  if (scenarioStore.scenario.name || scenarioStore.scenario.steps.length > 0) {
    await scenarioStore.validate()
  }
}, 1000)

// Watch for changes in scenario to trigger validation
// Use computed values to avoid reactivity issues
watch(
  () => {
    // Create a plain serializable representation for watching
    const scenario = scenarioStore.scenario
    const background = scenarioStore.background
    
    return {
      featureName: scenarioStore.featureName,
      scenarioName: scenario.name,
      stepCount: scenario.steps.length,
      backgroundCount: background.length,
      // Serialize args to detect changes
      stepsSignature: scenario.steps.map(s => ({
        id: s.id,
        pattern: s.pattern,
        args: s.args.map(a => ({ name: a.name, value: a.value, type: a.type }))
      })),
      backgroundSignature: background.map(s => ({
        id: s.id,
        pattern: s.pattern,
        args: s.args.map(a => ({ name: a.name, value: a.value, type: a.type }))
      }))
    }
  },
  () => {
    throttledValidate()
  },
  { deep: true }
)

// Background step handlers
function moveBackgroundStepUp(index: number) {
  if (index > 0) {
    scenarioStore.moveBackgroundStep(index, index - 1)
  }
}

function moveBackgroundStepDown(index: number) {
  if (index < scenarioStore.background.length - 1) {
    scenarioStore.moveBackgroundStep(index, index + 1)
  }
}

function removeBackgroundStep(stepId: string) {
  scenarioStore.removeBackgroundStep(stepId)
}

function toggleBackground() {
  backgroundExpanded.value = !backgroundExpanded.value
}

// Drag & drop handlers
function handleDragStart(index: number, type: 'scenario' | 'background', event: DragEvent) {
  draggedIndex.value = index
  dragType.value = type
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function handleDragEnter(index: number, type: 'scenario' | 'background') {
  if (draggedIndex.value !== null && draggedIndex.value !== index && dragType.value === type) {
    dropTargetIndex.value = index
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleDrop(index: number, type: 'scenario' | 'background') {
  if (draggedIndex.value !== null && draggedIndex.value !== index && dragType.value === type) {
    if (type === 'background') {
      scenarioStore.moveBackgroundStep(draggedIndex.value, index)
    } else {
      scenarioStore.moveStep(draggedIndex.value, index)
    }
  }
  draggedIndex.value = null
  dropTargetIndex.value = null
}

function handleDragEnd() {
  draggedIndex.value = null
  dropTargetIndex.value = null
  isDraggingFromCatalog.value = false
}

// Catalog drag & drop handlers
function handleCatalogDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  isDraggingFromCatalog.value = true
}

function handleCatalogDragLeave() {
  isDraggingFromCatalog.value = false
}

function handleDropFromCatalog(event: DragEvent, target: 'scenario' | 'background') {
  event.preventDefault()
  isDraggingFromCatalog.value = false
  
  const data = event.dataTransfer?.getData('application/json')
  if (!data) return
  
  try {
    const step = JSON.parse(data) as StepDefinition
    if (target === 'background') {
      scenarioStore.addBackgroundStep(step.keyword, step.pattern, step.args)
    } else {
      scenarioStore.addStep(step.keyword, step.pattern, step.args)
    }
  } catch (error) {
    console.error('Failed to parse dropped step:', error)
  }
}

// Edit step handlers
function openEditDialog(step: ScenarioStep, type: 'scenario' | 'background' = 'scenario') {
  editingStep.value = step
  editingStepType.value = type
  showEditDialog.value = true
}

function handleReplaceStep(stepId: string, keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
  if (editingStepType.value === 'background') {
    scenarioStore.replaceBackgroundStep(stepId, keyword, pattern, args)
  } else {
    scenarioStore.replaceStep(stepId, keyword, pattern, args)
  }
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

      <!-- Background Section -->
      <div
        class="background-section"
        :class="{ 'edit-mode-active': isBackgroundEditMode }"
      >
        <div
          class="background-header"
          @click="toggleBackground"
        >
          <i :class="backgroundExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
          <span class="background-title">
            Background
            <span
              v-if="scenarioStore.background.length > 0"
              class="step-count"
            >
              ({{ scenarioStore.background.length }} step<span v-if="scenarioStore.background.length !== 1">s</span>)
            </span>
          </span>
          <Button
            :icon="isBackgroundEditMode ? 'pi pi-check' : 'pi pi-pencil'"
            :label="isBackgroundEditMode ? 'Editing' : 'Edit'"
            :outlined="!isBackgroundEditMode"
            :severity="isBackgroundEditMode ? 'success' : undefined"
            size="small"
            :title="isBackgroundEditMode ? 'Currently editing background' : 'Click to edit background'"
            class="ms-auto"
            @click.stop="$emit('toggle-edit-mode')"
          />
        </div>

        <div 
          v-if="backgroundExpanded" 
          class="background-steps"
          :class="{ 
            'drop-zone-active': isDraggingFromCatalog && isBackgroundEditMode,
            'edit-mode-inactive': !isBackgroundEditMode 
          }"
          @dragover="isBackgroundEditMode && handleCatalogDragOver($event)"
          @dragleave="handleCatalogDragLeave"
          @drop="isBackgroundEditMode && handleDropFromCatalog($event, 'background')"
        >
          <div
            v-if="scenarioStore.background.length === 0"
            class="empty-steps"
          >
            <i class="pi pi-plus-circle" />
            <p>No background steps</p>
            <p class="hint">
              {{ isBackgroundEditMode ? 'Drag steps here or click steps in the catalog' : 'Click Edit to add background steps' }}
            </p>
          </div>

          <div
            v-for="(step, index) in scenarioStore.background"
            :key="step.id"
            class="step-row background-step-row"
            :class="{
              'has-error': getStepIssues(step.id).some(i => i.severity === 'error'),
              'is-dragging': draggedIndex === index && dragType === 'background',
              'is-drop-target': dropTargetIndex === index && dragType === 'background'
            }"
            data-testid="background-step"
            draggable="true"
            @dragstart="handleDragStart(index, 'background', $event)"
            @dragenter="handleDragEnter(index, 'background')"
            @dragover="handleDragOver"
            @drop="handleDrop(index, 'background')"
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
                @click="moveBackgroundStepUp(index)"
              />
              <Button
                icon="pi pi-chevron-down"
                text
                rounded
                size="small"
                :disabled="index === scenarioStore.background.length - 1"
                @click="moveBackgroundStepDown(index)"
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
                <span
                  class="step-pattern"
                  v-html="parseStepPattern(step.pattern)"
                />
                <Button
                  icon="pi pi-times"
                  text
                  rounded
                  severity="danger"
                  size="small"
                  title="Remove step"
                  @click="removeBackgroundStep(step.id)"
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
                  <label :for="`bg-arg-${step.id}-${arg.name}`">{{ arg.name }}</label>

                  <!-- Enum Select -->
                  <Select
                    v-if="arg.type === 'enum' && arg.enumValues"
                    :id="`bg-arg-${step.id}-${arg.name}`"
                    :model-value="arg.value"
                    :options="arg.enumValues"
                    placeholder="Select value..."
                    size="small"
                    :class="{ 'p-invalid': !arg.value }"
                    @update:model-value="updateBackgroundArg(step.id, arg.name, $event)"
                  />

                  <!-- Table DataTable -->
                  <TableEditor
                    v-else-if="arg.type === 'table'"
                    :model-value="parseTableValue(arg.value)"
                    :columns="arg.tableColumns || []"
                    @update:model-value="updateBackgroundTableArg(step.id, arg.name, $event)"
                  />

                  <!-- Standard Input -->
                  <InputText
                    v-else
                    :id="`bg-arg-${step.id}-${arg.name}`"
                    :value="arg.value"
                    :placeholder="`Enter ${arg.type}...`"
                    size="small"
                    :class="{ 'p-invalid': !arg.value }"
                    @input="updateBackgroundArg(step.id, arg.name, ($event.target as HTMLInputElement).value)"
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
      </div>

      <div
        class="scenario-name"
        :class="{ 'edit-mode-inactive': !isScenarioEditMode }"
        data-testid="scenario-name"
      >
        <label for="scenario-name">Scenario Name</label>
        <InputText
          id="scenario-name"
          :model-value="scenarioStore.scenario.name"
          placeholder="Enter scenario name..."
          :disabled="!isScenarioEditMode"
          @update:model-value="scenarioStore.setName($event as string)"
        />
      </div>

      <div 
        class="steps-container"
        :class="{ 
          'edit-mode-inactive': !isScenarioEditMode,
          'drop-zone-active': isDraggingFromCatalog && isScenarioEditMode 
        }"
        @dragover="isScenarioEditMode && handleCatalogDragOver($event)"
        @dragleave="handleCatalogDragLeave"
        @drop="isScenarioEditMode && handleDropFromCatalog($event, 'scenario')"
      >
        <div
          v-if="scenarioStore.scenario.steps.length === 0"
          class="empty-steps"
        >
          <i class="pi pi-plus-circle" />
          <p>No steps yet</p>
          <p class="hint">
            {{ isScenarioEditMode ? 'Drag steps here or click steps in the catalog' : 'Background edit mode active' }}
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
          @dragstart="handleDragStart(index, 'scenario', $event)"
          @dragenter="handleDragEnter(index, 'scenario')"
          @dragover="handleDragOver"
          @drop="handleDrop(index, 'scenario')"
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
              <span
                class="step-pattern"
                v-html="parseStepPattern(step.pattern)"
              />
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

                <!-- Enum Select -->
                <Select
                  v-if="arg.type === 'enum' && arg.enumValues"
                  :id="`arg-${step.id}-${arg.name}`"
                  :model-value="arg.value"
                  :options="arg.enumValues"
                  placeholder="Select value..."
                  size="small"
                  :class="{ 'p-invalid': !arg.value }"
                  @update:model-value="updateArg(step.id, arg.name, $event)"
                />

                <!-- Table DataTable -->
                <TableEditor
                  v-else-if="arg.type === 'table'"
                  :model-value="parseTableValue(arg.value)"
                  :columns="arg.tableColumns || []"
                  @update:model-value="updateTableArg(step.id, arg.name, $event)"
                />

                <!-- Standard Input -->
                <InputText
                  v-else
                  :id="`arg-${step.id}-${arg.name}`"
                  :value="arg.value"
                  :placeholder="`Enter ${arg.type}...`"
                  size="small"
                  :class="{ 'p-invalid': !arg.value }"
                  @input="updateArg(step.id, arg.name, ($event.target as HTMLInputElement).value)"
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
  word-break: break-word;
}

.pattern-variable {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-weight: 600;
  margin: 0 0.125rem;
}

.pattern-enum {
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
}

.pattern-table {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.pattern-string,
.pattern-int,
.pattern-float,
.pattern-any {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
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

/* Background section styles */
.background-section {
  margin-bottom: 1rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-ground);
}

.background-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(59, 130, 246, 0.08);
  border-bottom: 1px solid var(--surface-border);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
}

.background-header:hover {
  background: rgba(59, 130, 246, 0.12);
}

.background-header i {
  color: var(--primary-color);
  font-size: 0.875rem;
}

.background-title {
  font-weight: 500;
  color: var(--text-color);
  font-size: 0.875rem;
}

.step-count {
  color: var(--text-color-secondary);
  font-weight: normal;
}

.background-steps {
  border-top: 1px solid var(--surface-border);
  max-height: 400px;
  overflow-y: auto;
}

.background-step-row {
  background: rgba(59, 130, 246, 0.03);
}

.background-step-row:hover {
  background: rgba(59, 130, 246, 0.06);
}

/* Edit mode styles */
.edit-mode-active {
  border: 2px solid var(--primary-color);
  border-radius: 6px;
}

.edit-mode-inactive {
  opacity: 0.5;
  pointer-events: none;
  position: relative;
}

.edit-mode-inactive::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.02);
  pointer-events: none;
}

/* Drop zone styles */
.drop-zone-active {
  border: 2px dashed var(--primary-color);
  background: rgba(59, 130, 246, 0.05);
  transition: all 0.2s;
}

.steps-container.drop-zone-active,
.background-steps.drop-zone-active {
  min-height: 150px;
}
</style>
