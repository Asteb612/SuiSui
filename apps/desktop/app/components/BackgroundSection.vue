<script setup lang="ts">
import { ref, computed } from 'vue'
import StepRow from './StepRow.vue'
import type { ScenarioStep, ValidationResult } from '@suisui/shared'

interface TableRow {
  [key: string]: string
}

const props = defineProps<{
  steps: ScenarioStep[]
  editMode: boolean
  validation: ValidationResult | null
  // Drag state from parent
  draggedIndex: number | null
  dropTargetIndex: number | null
  isDraggingFromCatalog: boolean
}>()

const emit = defineEmits<{
  'toggle-edit-mode': []
  'move-step': [fromIndex: number, toIndex: number]
  'remove-step': [stepId: string]
  'update-arg': [stepId: string, argName: string, value: string]
  'update-table-arg': [stepId: string, argName: string, rows: TableRow[]]
  // Drag events
  'drag-start': [index: number, event: DragEvent]
  'drag-enter': [index: number]
  'drag-over': [event: DragEvent]
  'drop': [index: number]
  'drag-end': []
  // Catalog drop
  'catalog-drag-over': [event: DragEvent]
  'catalog-drag-leave': []
  'drop-from-catalog': [event: DragEvent]
}>()

const expanded = ref(false)

const stepCount = computed(() => props.steps.length)

function toggleExpanded() {
  expanded.value = !expanded.value
}

function getStepIssues(stepId: string) {
  return props.validation?.issues.filter((i) => i.stepId === stepId) ?? []
}

function handleMoveUp(index: number) {
  if (index > 0) {
    emit('move-step', index, index - 1)
  }
}

function handleMoveDown(index: number) {
  if (index < props.steps.length - 1) {
    emit('move-step', index, index + 1)
  }
}

function handleDragStart(index: number, event: DragEvent) {
  emit('drag-start', index, event)
}

function handleDragEnter(index: number) {
  emit('drag-enter', index)
}

function handleDragOver(event: DragEvent) {
  emit('drag-over', event)
}

function handleDrop(index: number) {
  emit('drop', index)
}

function handleDragEnd() {
  emit('drag-end')
}

function handleCatalogDragOver(event: DragEvent) {
  if (props.editMode) {
    emit('catalog-drag-over', event)
  }
}

function handleCatalogDragLeave() {
  emit('catalog-drag-leave')
}

function handleDropFromCatalog(event: DragEvent) {
  if (props.editMode) {
    emit('drop-from-catalog', event)
  }
}
</script>

<template>
  <div
    class="background-section"
    :class="{ 'edit-mode-active': editMode }"
    data-testid="background-section"
  >
    <div
      class="background-header"
      data-testid="background-header"
      @click="toggleExpanded"
    >
      <i :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
      <span class="background-title">
        Background
        <span
          v-if="stepCount > 0"
          class="step-count"
          data-testid="step-count"
        >
          ({{ stepCount }} step<span v-if="stepCount !== 1">s</span>)
        </span>
      </span>
      <Button
        :icon="editMode ? 'pi pi-check' : 'pi pi-pencil'"
        :label="editMode ? 'Editing' : 'Edit'"
        :outlined="!editMode"
        :severity="editMode ? 'success' : undefined"
        size="small"
        :title="editMode ? 'Currently editing background' : 'Click to edit background'"
        class="ms-auto"
        data-testid="edit-toggle-btn"
        @click.stop="$emit('toggle-edit-mode')"
      />
    </div>

    <div
      v-if="expanded"
      class="background-steps"
      :class="{
        'drop-zone-active': isDraggingFromCatalog && editMode,
        'edit-mode-inactive': !editMode
      }"
      data-testid="background-steps"
      @dragover="handleCatalogDragOver"
      @dragleave="handleCatalogDragLeave"
      @drop="handleDropFromCatalog"
    >
      <div
        v-if="steps.length === 0"
        class="empty-steps"
        data-testid="empty-state"
      >
        <i class="pi pi-plus-circle" />
        <p>No background steps</p>
        <p class="hint">
          {{ editMode ? 'Drag steps here or click steps in the catalog' : 'Click Edit to add background steps' }}
        </p>
      </div>

      <StepRow
        v-for="(step, index) in steps"
        :key="step.id"
        :step="step"
        :index="index"
        :total-steps="steps.length"
        :issues="getStepIssues(step.id)"
        step-type="background"
        :is-dragging="draggedIndex === index"
        :is-drop-target="dropTargetIndex === index"
        @move-up="handleMoveUp(index)"
        @move-down="handleMoveDown(index)"
        @remove="$emit('remove-step', step.id)"
        @update-arg="(argName, value) => $emit('update-arg', step.id, argName, value)"
        @update-table-arg="(argName, rows) => $emit('update-table-arg', step.id, argName, rows)"
        @drag-start="(event) => handleDragStart(index, event)"
        @drag-enter="() => handleDragEnter(index)"
        @drag-over="handleDragOver"
        @drop="() => handleDrop(index)"
        @drag-end="handleDragEnd"
      />
    </div>
  </div>
</template>

<style scoped>
.background-section {
  margin-bottom: 1rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-ground);
}

.background-section.edit-mode-active {
  border: 2px solid var(--primary-color);
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

.background-steps.edit-mode-inactive {
  opacity: 0.5;
  pointer-events: none;
  position: relative;
}

.background-steps.edit-mode-inactive::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.02);
  pointer-events: none;
}

.background-steps.drop-zone-active {
  border: 2px dashed var(--primary-color);
  background: rgba(59, 130, 246, 0.05);
  min-height: 150px;
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

.ms-auto {
  margin-left: auto;
}
</style>
