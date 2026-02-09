<script setup lang="ts">
import { computed } from 'vue'
import TableEditor from './TableEditor.vue'
import { formatStepPattern } from '~/utils/stepPatternFormatter'
import { parseTableValue } from '~/utils/tableUtils'
import type { ScenarioStep, ValidationIssue } from '@suisui/shared'

interface TableRow {
  [key: string]: string
}

const props = defineProps<{
  step: ScenarioStep
  index: number
  totalSteps: number
  issues: ValidationIssue[]
  stepType: 'scenario' | 'background'
  isDragging?: boolean
  isDropTarget?: boolean
}>()

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  remove: []
  edit: []
  'update-arg': [argName: string, value: string]
  'update-table-arg': [argName: string, rows: TableRow[]]
  'drag-start': [event: DragEvent]
  'drag-enter': []
  'drag-over': [event: DragEvent]
  'drop': []
  'drag-end': []
}>()

const hasError = computed(() => {
  return props.issues.some((i) => i.severity === 'error')
})

const canMoveUp = computed(() => props.index > 0)
const canMoveDown = computed(() => props.index < props.totalSteps - 1)

const formattedPattern = computed(() => formatStepPattern(props.step.pattern))

function handleDragStart(event: DragEvent) {
  emit('drag-start', event)
}

function handleDragEnter() {
  emit('drag-enter')
}

function handleDragOver(event: DragEvent) {
  emit('drag-over', event)
}

function handleDrop() {
  emit('drop')
}

function handleDragEnd() {
  emit('drag-end')
}
</script>

<template>
  <div
    class="step-row"
    :class="{
      'has-error': hasError,
      'is-dragging': isDragging,
      'is-drop-target': isDropTarget,
      'background-step-row': stepType === 'background'
    }"
    :data-testid="`${stepType}-step`"
    draggable="true"
    @dragstart="handleDragStart"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @drop="handleDrop"
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
        :disabled="!canMoveUp"
        data-testid="move-up-btn"
        @click="$emit('move-up')"
      />
      <Button
        icon="pi pi-chevron-down"
        text
        rounded
        size="small"
        :disabled="!canMoveDown"
        data-testid="move-down-btn"
        @click="$emit('move-down')"
      />
    </div>

    <div class="step-content">
      <div class="step-header">
        <span
          class="step-keyword"
          :class="step.keyword.toLowerCase()"
          data-testid="step-keyword"
        >
          {{ step.keyword }}
        </span>
        <span
          class="step-pattern"
          data-testid="step-pattern"
          v-html="formattedPattern.html"
        />
        <Button
          v-if="stepType === 'scenario'"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          title="Edit step"
          data-testid="edit-btn"
          @click="$emit('edit')"
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          severity="danger"
          size="small"
          title="Remove step"
          data-testid="remove-btn"
          @click="$emit('remove')"
        />
      </div>

      <div
        v-if="step.args.length > 0"
        class="step-args"
        data-testid="step-args"
      >
        <div
          v-for="arg in step.args"
          :key="arg.name"
          class="arg-field"
          :data-testid="`arg-${arg.name}`"
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
            @update:model-value="$emit('update-arg', arg.name, $event)"
          />

          <!-- Table Editor -->
          <TableEditor
            v-else-if="arg.type === 'table'"
            :model-value="parseTableValue(arg.value)"
            :columns="arg.tableColumns || []"
            @update:model-value="$emit('update-table-arg', arg.name, $event)"
          />

          <!-- Standard Input -->
          <InputText
            v-else
            :id="`arg-${step.id}-${arg.name}`"
            :value="arg.value"
            :placeholder="`Enter ${arg.type}...`"
            size="small"
            :class="{ 'p-invalid': !arg.value }"
            @input="$emit('update-arg', arg.name, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div
        v-if="issues.length > 0"
        class="step-issues"
        data-testid="step-issues"
      >
        <div
          v-for="(issue, i) in issues"
          :key="i"
          :class="['issue', issue.severity]"
          data-testid="issue"
        >
          <i :class="issue.severity === 'error' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'" />
          {{ issue.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.step-row.background-step-row {
  background: rgba(59, 130, 246, 0.03);
}

.step-row.background-step-row:hover {
  background: rgba(59, 130, 246, 0.06);
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
</style>
