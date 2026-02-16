<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScenarioStore } from '~/stores/scenario'
import { useRunnerStore } from '~/stores/runner'
import TableEditor from './TableEditor.vue'
import TagsEditor from './TagsEditor.vue'
import ExamplesEditor from './ExamplesEditor.vue'
import StepAddDialog from './StepAddDialog.vue'
import { parseTableValue } from '~/utils/tableUtils'
import { useThrottle } from '~/composables/useThrottle'
import { stripAnchors, parseSegments as sharedParseSegments, getOutlinePlaceholder } from '@suisui/shared'
import type { ScenarioStep, StepDefinition, PatternSegment } from '@suisui/shared'

interface TableRow {
  [key: string]: string
}

interface StepGroup {
  keyword: 'Given' | 'When' | 'Then'
  steps: ScenarioStep[]
}

type ViewMode = 'read' | 'edit' | 'run'

const props = withDefaults(
  defineProps<{
    editMode?: 'scenario' | 'background'
    viewMode?: ViewMode
  }>(),
  {
    editMode: 'scenario',
    viewMode: 'read',
  }
)

defineEmits<{
  'toggle-edit-mode': []
}>()

const scenarioStore = useScenarioStore()
const runnerStore = useRunnerStore()

// Runner status colors
const statusColors: Record<string, string> = {
  idle: 'var(--text-color-secondary)',
  running: 'var(--primary-color)',
  passed: '#10b981',
  failed: '#dc3545',
  error: '#dc3545',
}

// Runner actions
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

// Error display helpers
function getErrorIcon(type: string): string {
  const icons: Record<string, string> = {
    undefined_step: 'pi pi-question-circle',
    syntax_error: 'pi pi-code',
    missing_decorator: 'pi pi-tag',
    ambiguous_step: 'pi pi-clone',
    config_error: 'pi pi-cog',
    unknown: 'pi pi-exclamation-circle',
  }
  return icons[type] || 'pi pi-exclamation-circle'
}

function formatErrorType(type: string): string {
  const labels: Record<string, string> = {
    undefined_step: 'Undefined Step',
    syntax_error: 'Syntax Error',
    missing_decorator: 'Missing Decorator',
    ambiguous_step: 'Ambiguous Step',
    config_error: 'Configuration Error',
    unknown: 'Error',
  }
  return labels[type] || 'Error'
}

// Add step dialog state
const showAddStepDialog = ref(false)
const addStepTarget = ref<'scenario' | 'background'>('scenario')
const addStepIndex = ref(0)

// Mode helpers (using prop from parent)
const isReadMode = computed(() => props.viewMode === 'read')
const isEditMode = computed(() => props.viewMode === 'edit')
const isRunMode = computed(() => props.viewMode === 'run')

// Mode change logging (useful for debugging)
watch(
  () => props.viewMode,
  (newMode) => {
    if (import.meta.env.DEV) {
      console.log('[ScenarioBuilder] viewMode changed:', newMode)
    }
  },
  { immediate: true }
)

// Computed
const isBackgroundEditMode = computed(() => props.editMode === 'background' && isEditMode.value)
const isScenarioEditMode = computed(() => props.editMode === 'scenario' && isEditMode.value)
const isOutline = computed(() => !!scenarioStore.scenario.examples)
const scenarioTags = computed(() => scenarioStore.scenario.tags || [])

// Outline arg options: columns formatted as <col> for editable Select dropdown
const outlineArgOptions = computed(() => {
  if (!scenarioStore.scenario.examples) return []
  return scenarioStore.scenario.examples.columns.map(col => `<${col}>`)
})

// Group steps by main keyword (Given/When/Then), hiding And/But
const groupedSteps = computed((): StepGroup[] => {
  const groups: StepGroup[] = []
  let currentGroup: StepGroup | null = null
  let lastKeyword: 'Given' | 'When' | 'Then' = 'Given'

  for (const step of scenarioStore.scenario.steps) {
    let mainKeyword: 'Given' | 'When' | 'Then'
    if (step.keyword === 'And' || step.keyword === 'But') {
      mainKeyword = lastKeyword
    } else {
      mainKeyword = step.keyword as 'Given' | 'When' | 'Then'
      lastKeyword = mainKeyword
    }

    if (!currentGroup || currentGroup.keyword !== mainKeyword) {
      currentGroup = { keyword: mainKeyword, steps: [] }
      groups.push(currentGroup)
    }
    currentGroup.steps.push(step)
  }

  return groups
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
}

// Format step text with argument values inline (for read mode)
function formatStepText(step: ScenarioStep): string {
  let text = step.pattern
  let argIndex = 0

  // Strip escape backslashes for display: \{ → {, \( → (, \/ → /
  text = text.replace(/\\([{}()/])/g, '$1')

  // Expand optional text: (s) → s (parens without | inside, not enum)
  text = text.replace(/\(([^)|]+)\)/g, '$1')

  // Pick first alternative: belly/stomach → belly
  text = text.replace(/\b([\w-]+(?:\/[\w-]+)+)\b/g, (match) => {
    return match.split('/')[0]!
  })

  // Replace anonymous {} parameters
  text = text.replace(/\{\}/g, () => {
    const arg = step.args[argIndex++]
    if (arg) {
      const placeholderName = getOutlinePlaceholder(arg.value)
      if (placeholderName) {
        const safeName = escapeHtml(placeholderName)
        return `<strong class="arg-placeholder">&lt;${safeName}&gt;</strong>`
      }
      const value = arg.value || `<${arg.name}>`
      return `<strong class="arg-value">${escapeHtml(value)}</strong>`
    }
    return '<strong class="arg-value">...</strong>'
  })

  // Replace Cucumber expression placeholders {type} or {type:name}
  text = text.replace(/\{([a-zA-Z]+)(:[^}]+)?\}/g, () => {
    const arg = step.args[argIndex++]
    if (arg) {
      const placeholderName = getOutlinePlaceholder(arg.value)
      if (placeholderName) {
        const safeName = escapeHtml(placeholderName)
        return `<strong class="arg-placeholder">&lt;${safeName}&gt;</strong>`
      }
      const value = arg.value || `<${arg.name}>`
      const formatted = arg.type === 'string' && arg.value ? `"${arg.value}"` : value
      return `<strong class="arg-value">${escapeHtml(formatted)}</strong>`
    }
    return '<strong class="arg-value">...</strong>'
  })

  // Replace regex enum patterns (value1|value2|...) with the selected value
  text = text.replace(/\(([^)]+\|[^)]+)\)/g, () => {
    const arg = step.args[argIndex++]
    if (arg) {
      const placeholderName = getOutlinePlaceholder(arg.value)
      if (placeholderName) {
        const safeName = escapeHtml(placeholderName)
        return `<strong class="arg-placeholder">&lt;${safeName}&gt;</strong>`
      }
      const value = arg.value || `<${arg.name}>`
      return `<strong class="arg-value arg-enum">${escapeHtml(value)}</strong>`
    }
    return '<strong class="arg-value">...</strong>'
  })

  // Replace Scenario Outline placeholders <variable> with distinct styling
  // (only matches placeholders literally in the pattern, not from arg values)
  text = text.replace(/<([a-zA-Z_]\w*)>/g, (match, varName) => {
    const arg = step.args.find(a => a.name === varName)
    const rawValue = arg?.value || varName
    // If the value is itself an outline placeholder like <col>, extract the clean name
    const placeholderName = getOutlinePlaceholder(rawValue)
    const displayName = placeholderName || rawValue
    return `<strong class="arg-placeholder">&lt;${escapeHtml(displayName)}&gt;</strong>`
  })

  // Clean regex anchors
  text = stripAnchors(text).trim()

  return text
}

type StepRenderSegment = {
  type: 'text' | 'strong'
  className?: string
  text: string
}

function formatStepSegments(step: ScenarioStep): StepRenderSegment[] {
  const html = formatStepText(step)
  const segments: StepRenderSegment[] = []
  const regex = /<strong class="([^"]+)">([^<]*)<\/strong>/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        text: decodeHtml(html.slice(lastIndex, match.index)),
      })
    }
    const className = match[1] ?? ''
    const segmentText = match[2] ?? ''
    segments.push({
      type: 'strong',
      className,
      text: decodeHtml(segmentText),
    })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < html.length) {
    segments.push({
      type: 'text',
      text: decodeHtml(html.slice(lastIndex)),
    })
  }

  return segments
}

// Clean regex anchors and escape backslashes from display text
function cleanRegexText(text: string): string {
  return stripAnchors(text).replace(/\\([{}()/])/g, '$1').trim()
}

function parseStepPattern(step: ScenarioStep): PatternSegment[] {
  return sharedParseSegments(step.pattern, step.args)
}

function removeStep(stepId: string) {
  scenarioStore.removeStep(stepId)
}

function updateArg(stepId: string, argName: string, value: string, argType?: 'string' | 'int' | 'float' | 'word' | 'any' | 'enum' | 'table', enumValues?: string[]) {
  scenarioStore.updateStepArg(stepId, argName, value, argType, enumValues)
}

function updateTableArg(stepId: string, argName: string, rows: TableRow[]) {
  const value = JSON.stringify(rows)
  scenarioStore.updateStepArg(stepId, argName, value)
}

function getStepIssues(stepId: string) {
  return scenarioStore.validation?.issues.filter((i) => i.stepId === stepId) ?? []
}

// Auto-validation
const throttledValidate = useThrottle(async () => {
  if (scenarioStore.scenario.name || scenarioStore.scenario.steps.length > 0) {
    await scenarioStore.validate()
  }
}, 1000)

watch(
  () => [scenarioStore.scenario, scenarioStore.background],
  () => throttledValidate(),
  { deep: true }
)

function updateBackgroundArg(stepId: string, argName: string, value: string, argType?: 'string' | 'int' | 'float' | 'word' | 'any' | 'enum' | 'table', enumValues?: string[]) {
  scenarioStore.updateBackgroundStepArg(stepId, argName, value, argType, enumValues)
}

function removeBackgroundStep(stepId: string) {
  scenarioStore.removeBackgroundStep(stepId)
}

// Drag & drop state - track by step ID to avoid index issues
const activeDropZone = ref<{ target: 'scenario' | 'background'; index: number } | null>(null)
const draggingStepId = ref<string | null>(null)

// Track when any drag (internal or catalog) is active
const catalogDragOver = ref(false)
const isDraggingActive = computed(() => draggingStepId.value !== null || catalogDragOver.value)

// Get flat list of all scenario steps for indexing
const flatSteps = computed(() => scenarioStore.scenario.steps)

// Get index of step by ID
function getStepIndex(stepId: string, target: 'scenario' | 'background'): number {
  if (target === 'background') {
    return scenarioStore.background.findIndex(s => s.id === stepId)
  }
  return flatSteps.value.findIndex(s => s.id === stepId)
}

// Handle drag over drop zone
function handleDropZoneDragOver(event: DragEvent, target: 'scenario' | 'background', index: number) {
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = draggingStepId.value ? 'move' : 'copy'
  }
  activeDropZone.value = { target, index }
}

function handleDropZoneDragLeave(event: DragEvent) {
  // Only clear if we're leaving to outside the drop zone
  const relatedTarget = event.relatedTarget as HTMLElement
  if (!relatedTarget?.closest('.drop-zone')) {
    activeDropZone.value = null
  }
}

// Get the effective keyword for a step (resolves And/But to actual Given/When/Then)
function getEffectiveKeyword(stepId: string, target: 'scenario' | 'background'): 'Given' | 'When' | 'Then' {
  const steps = target === 'background' ? scenarioStore.background : flatSteps.value
  const stepIndex = steps.findIndex(s => s.id === stepId)
  if (stepIndex === -1) return 'Given'

  const step = steps[stepIndex]
  if (!step) return 'Given'

  if (step.keyword !== 'And' && step.keyword !== 'But') {
    return step.keyword as 'Given' | 'When' | 'Then'
  }

  // Find the parent keyword by looking backwards
  for (let i = stepIndex - 1; i >= 0; i--) {
    const prevStep = steps[i]
    if (prevStep && prevStep.keyword !== 'And' && prevStep.keyword !== 'But') {
      return prevStep.keyword as 'Given' | 'When' | 'Then'
    }
  }
  return 'Given' // Default if no parent found
}

function handleDropOnZone(event: DragEvent, target: 'scenario' | 'background', index: number) {
  event.preventDefault()
  event.stopPropagation()
  activeDropZone.value = null
  catalogDragOver.value = false

  // Check if reordering existing step
  if (draggingStepId.value) {
    const stepId = draggingStepId.value
    const dragTarget = event.dataTransfer?.getData('text/plain')?.split(':')[0] as 'scenario' | 'background'
    draggingStepId.value = null

    if (dragTarget === target) {
      const fromIndex = getStepIndex(stepId, target)
      if (fromIndex === -1) return

      // Calculate target index
      let toIndex = index
      if (fromIndex < index) {
        toIndex = index - 1 // Adjust for removal
      }
      if (fromIndex !== toIndex) {
        // Get the step to check if it needs keyword conversion
        const steps = target === 'background' ? scenarioStore.background : flatSteps.value
        const step = steps[fromIndex]

        // If step is And/But, convert to its effective keyword before moving
        if (step && (step.keyword === 'And' || step.keyword === 'But')) {
          const effectiveKeyword = getEffectiveKeyword(stepId, target)
          if (target === 'background') {
            scenarioStore.updateBackgroundStep(stepId, { keyword: effectiveKeyword })
          } else {
            scenarioStore.updateStep(stepId, { keyword: effectiveKeyword })
          }
        }

        if (target === 'background') {
          scenarioStore.moveBackgroundStep(fromIndex, toIndex)
        } else {
          scenarioStore.moveStep(fromIndex, toIndex)
        }
      }
    }
    return
  }

  // Handle drop from catalog
  const data = event.dataTransfer?.getData('application/json')
  if (!data) return

  try {
    const step = JSON.parse(data) as StepDefinition
    if (target === 'background') {
      scenarioStore.insertBackgroundStepAt(index, step.keyword, step.pattern, step.args)
    } else {
      scenarioStore.insertStepAt(index, step.keyword, step.pattern, step.args)
    }
  } catch (error) {
    console.error('Failed to parse dropped step:', error)
  }
}

// Step drag handlers (for reordering)
function handleStepDragStart(event: DragEvent, target: 'scenario' | 'background', stepId: string) {
  draggingStepId.value = stepId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${target}:${stepId}`)
  }
}

function handleStepDragEnd() {
  draggingStepId.value = null
  activeDropZone.value = null
  catalogDragOver.value = false
}

// Check if step is being dragged
function isStepDragging(stepId: string): boolean {
  return draggingStepId.value === stepId
}

// Check if drop zone is active
function isDropZoneActive(target: 'scenario' | 'background', index: number): boolean {
  return activeDropZone.value?.target === target && activeDropZone.value?.index === index
}

// Add step dialog
function openAddStepDialog(target: 'scenario' | 'background', index: number) {
  addStepTarget.value = target
  addStepIndex.value = index
  showAddStepDialog.value = true
}

function handleAddStep(target: 'scenario' | 'background', index: number, step: StepDefinition) {
  if (target === 'background') {
    scenarioStore.insertBackgroundStepAt(index, step.keyword, step.pattern, step.args)
  } else {
    scenarioStore.insertStepAt(index, step.keyword, step.pattern, step.args)
  }
}

// Tags
function updateScenarioTags(tags: string[]) {
  scenarioStore.setScenarioTags(tags)
}

function selectScenario(index: number) {
  scenarioStore.setActiveScenario(index)
}
</script>

<template>
  <div
    class="scenario-view"
    :class="[`mode-${props.viewMode}`]"
    data-testid="scenario-builder"
  >
    <!-- Empty state -->
    <div
      v-if="!scenarioStore.currentFeaturePath && !scenarioStore.scenario.name"
      class="empty-state"
    >
      <div class="empty-icon">
        <i class="pi pi-book" />
      </div>
      <h3>No Scenario Selected</h3>
      <p>Select a scenario from the left panel to view and edit it.</p>
    </div>

    <!-- Scenario content -->
    <template v-else>
      <!-- Scenario Pagination -->
      <div
        v-if="scenarioStore.scenarios.length > 1 || isEditMode"
        class="scenario-pagination"
      >
        <Button
          icon="pi pi-chevron-left"
          text
          rounded
          size="small"
          :disabled="scenarioStore.activeScenarioIndex === 0"
          @click="selectScenario(scenarioStore.activeScenarioIndex - 1)"
        />
        <div class="pagination-dots">
          <span
            v-for="(_, index) in scenarioStore.scenarios"
            :key="index"
            class="pagination-dot"
            :class="{ active: index === scenarioStore.activeScenarioIndex }"
            :title="scenarioStore.scenarios[index]?.name || `Scenario ${index + 1}`"
            @click="selectScenario(index)"
          />
        </div>
        <Button
          icon="pi pi-chevron-right"
          text
          rounded
          size="small"
          :disabled="scenarioStore.activeScenarioIndex === scenarioStore.scenarios.length - 1"
          @click="selectScenario(scenarioStore.activeScenarioIndex + 1)"
        />
        <!-- Add/Remove scenario buttons (edit mode only) -->
        <template v-if="isEditMode">
          <div class="pagination-separator" />
          <Button
            icon="pi pi-plus"
            text
            rounded
            size="small"
            title="Add new scenario"
            @click="scenarioStore.addScenario()"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            title="Remove current scenario"
            :disabled="scenarioStore.scenarios.length <= 1"
            @click="scenarioStore.removeScenario(scenarioStore.activeScenarioIndex)"
          />
        </template>
      </div>

      <!-- Scenario Card -->
      <div
        class="scenario-card"
        :class="{ 'dragging-active': isDraggingActive }"
        @dragover.prevent="catalogDragOver = true"
        @dragleave.self="catalogDragOver = false"
        @drop="catalogDragOver = false"
      >
        <!-- Header: Name + Tags -->
        <div class="scenario-header">
          <div class="scenario-title-row">
            <!-- Read/Run mode: simple title -->
            <h1
              v-if="!isEditMode"
              key="title-readonly"
              class="scenario-title"
            >
              {{ scenarioStore.scenario.name || 'Untitled Scenario' }}
            </h1>

            <!-- Edit mode: editable input -->
            <InputText
              v-else
              key="title-input"
              :model-value="scenarioStore.scenario.name"
              placeholder="Scenario name..."
              class="scenario-title-input"
              @update:model-value="scenarioStore.setName($event as string)"
            />

            <!-- Info button with popover -->
            <Button
              v-if="isEditMode"
              v-tooltip.left="{
                value: `<div class='gherkin-help'>
                  <h4>Gherkin Structure</h4>
                  <div class='help-item'>
                    <span class='help-label preconditions'>Preconditions</span>
                    <span>Setup steps that run before each scenario (Background)</span>
                  </div>
                  <div class='help-item'>
                    <span class='help-label given'>Given</span>
                    <span>Initial context - the starting state</span>
                  </div>
                  <div class='help-item'>
                    <span class='help-label when'>When</span>
                    <span>Action - user interaction or event</span>
                  </div>
                  <div class='help-item'>
                    <span class='help-label then'>Then</span>
                    <span>Expected outcome - what should happen</span>
                  </div>
                  <div class='help-item'>
                    <span class='help-label examples'>Examples</span>
                    <span>Data variations for Scenario Outlines</span>
                  </div>
                  <div class='help-tip'>
                    <i class='pi pi-lightbulb'></i>
                    Drag steps from the catalog or click + to add
                  </div>
                </div>`,
                escape: false,
                class: 'gherkin-tooltip'
              }"
              icon="pi pi-info-circle"
              text
              rounded
              size="small"
              severity="secondary"
              class="info-btn"
            />
          </div>

          <div
            v-if="scenarioTags.length > 0 && !isEditMode"
            class="scenario-tags"
          >
            <span
              v-for="tag in scenarioTags"
              :key="tag"
              class="tag-chip"
            >@{{ tag }}</span>
          </div>

          <!-- Edit mode: tag editor -->
          <TagsEditor
            v-if="isEditMode"
            :tags="scenarioTags"
            placeholder="+ tag"
            class="tags-editor"
            @update:tags="updateScenarioTags"
          />
        </div>

        <!-- Add Preconditions button (edit mode, no background, not in background edit mode) -->
        <Button
          v-if="isEditMode && !isBackgroundEditMode && scenarioStore.background.length === 0 && !isRunMode"
          icon="pi pi-key"
          label="Add Preconditions"
          text
          size="small"
          class="add-preconditions-trigger"
          @click="$emit('toggle-edit-mode')"
        />

        <!-- Preconditions (Background) - shown in read/edit modes -->
        <div
          v-if="(scenarioStore.background.length > 0 || isBackgroundEditMode) && !isRunMode"
          key="preconditions-section"
          class="preconditions-section"
          :class="{
            'edit-active': isBackgroundEditMode,
            'empty': scenarioStore.background.length === 0
          }"
        >
          <div class="section-label">
            <i class="pi pi-key" />
            <span>Preconditions</span>
            <span
              v-if="isReadMode"
              class="section-hint"
            >Always applied</span>
            <Button
              v-if="isEditMode"
              :label="isBackgroundEditMode ? 'Done' : 'Edit'"
              :icon="isBackgroundEditMode ? 'pi pi-check' : 'pi pi-pencil'"
              text
              size="small"
              class="section-action"
              @click="$emit('toggle-edit-mode')"
            />
          </div>

          <!-- Background steps with drop zones -->
          <div
            v-if="scenarioStore.background.length > 0 || isBackgroundEditMode"
            class="preconditions-list"
          >
            <!-- Drop zone before first step -->
            <div
              v-if="isBackgroundEditMode"
              class="drop-zone"
              :class="{ active: isDropZoneActive('background', 0) }"
              @dragover="handleDropZoneDragOver($event, 'background', 0)"
              @dragleave="handleDropZoneDragLeave"
              @drop="handleDropOnZone($event, 'background', 0)"
            >
              <div class="drop-indicator" />
              <Button
                icon="pi pi-plus"
                label="Add step"
                text
                size="small"
                class="add-step-btn"
                @click="openAddStepDialog('background', 0)"
              />
            </div>

            <template
              v-for="(step, index) in scenarioStore.background"
              :key="step.id"
            >
              <div
                class="precondition-item"
                :class="{ dragging: isStepDragging(step.id) }"
                :draggable="isBackgroundEditMode"
                @dragstart="handleStepDragStart($event, 'background', step.id)"
                @dragend="handleStepDragEnd"
              >
                <i
                  v-if="isBackgroundEditMode"
                  class="pi pi-bars drag-handle"
                />
                
                <!-- Read mode: formatted text -->
                <span
                  v-if="!isBackgroundEditMode"
                >
                  <template
                    v-for="(segment, segIdx) in formatStepSegments(step)"
                    :key="segIdx"
                  >
                    <strong
                      v-if="segment.type === 'strong'"
                      :class="segment.className"
                    >{{ segment.text }}</strong>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </span>
                
                <!-- Edit mode: inline editable inputs -->
                <span
                  v-else
                  class="step-text step-text-editable"
                >
                  <template
                    v-for="(segment, segIdx) in parseStepPattern(step)"
                    :key="segIdx"
                  >
                    <span
                      v-if="segment.type === 'text'"
                      class="step-text-segment"
                    >{{ cleanRegexText(segment.value) }}</span>

                    <!-- Enum Select inline -->
                    <Select
                      v-else-if="segment.arg && segment.arg.type === 'enum' && segment.arg.enumValues"
                      :model-value="segment.arg.value"
                      :options="segment.arg.enumValues"
                      :placeholder="segment.arg.name"
                      class="inline-arg-select"
                      data-testid="inline-arg-select-background"
                      @click.stop
                      @update:model-value="updateBackgroundArg(step.id, segment.arg!.name, $event, 'enum', segment.arg!.enumValues)"
                    />

                    <!-- Standard Input inline (string, int, float, any, etc.) -->
                    <InputText
                      v-else-if="segment.arg && segment.arg.type !== 'table'"
                      :model-value="segment.arg.value"
                      :placeholder="segment.arg.name"
                      class="inline-arg-input"
                      data-testid="inline-arg-input-background"
                      @click.stop
                      @update:model-value="updateBackgroundArg(step.id, segment.arg!.name, $event as string, segment.arg!.type as any, segment.arg!.enumValues)"
                    />

                    <!-- Table placeholder (shows below) -->
                    <span
                      v-else-if="segment.arg && segment.arg.type === 'table'"
                      class="inline-arg-table-badge"
                    >
                      <i class="pi pi-table" />
                      {{ segment.arg.name }}
                    </span>
                  </template>
                </span>

                <Button
                  v-if="isBackgroundEditMode"
                  icon="pi pi-times"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  class="remove-btn"
                  @click="removeBackgroundStep(step.id)"
                />
              </div>

              <!-- Drop zone after each step -->
              <div
                v-if="isBackgroundEditMode"
                class="drop-zone"
                :class="{ active: isDropZoneActive('background', index + 1) }"
                @dragover="handleDropZoneDragOver($event, 'background', index + 1)"
                @dragleave="handleDropZoneDragLeave"
                @drop="handleDropOnZone($event, 'background', index + 1)"
              >
                <div class="drop-indicator" />
                <Button
                  icon="pi pi-plus"
                  label="Add step"
                  text
                  size="small"
                  class="add-step-btn"
                  @click="openAddStepDialog('background', index + 1)"
                />
              </div>
            </template>

            <!-- Empty state hint -->
            <p
              v-if="scenarioStore.background.length === 0 && isBackgroundEditMode"
              class="empty-hint"
            >
              Drag steps here to add preconditions
            </p>
          </div>
        </div>

        <!-- Story Section -->
        <div
          v-if="!isRunMode"
          key="story-section"
          class="story-section"
        >
          <div class="section-label">
            <i class="pi pi-book" />
            <span>Story</span>
          </div>

          <!-- Empty story state with drop zone -->
          <div
            v-if="flatSteps.length === 0"
            class="empty-story"
            :class="{ 'drop-active': isScenarioEditMode && isDropZoneActive('scenario', 0) }"
          >
            <div
              v-if="isScenarioEditMode"
              class="drop-zone large"
              :class="{ active: isDropZoneActive('scenario', 0) }"
              @dragover="handleDropZoneDragOver($event, 'scenario', 0)"
              @dragleave="handleDropZoneDragLeave"
              @drop="handleDropOnZone($event, 'scenario', 0)"
            >
              <p>Drag steps or click + to add</p>
              <Button
                icon="pi pi-plus"
                label="Add Step"
                text
                size="small"
                class="add-step-btn-large"
                @click="openAddStepDialog('scenario', 0)"
              />
            </div>
            <p v-else>
              No steps defined
            </p>
          </div>

          <!-- Steps with drop zones -->
          <div
            v-else
            class="steps-container"
          >
            <!-- Drop zone before first step -->
            <div
              v-if="isScenarioEditMode"
              class="drop-zone"
              :class="{ active: isDropZoneActive('scenario', 0) }"
              @dragover="handleDropZoneDragOver($event, 'scenario', 0)"
              @dragleave="handleDropZoneDragLeave"
              @drop="handleDropOnZone($event, 'scenario', 0)"
            >
              <div class="drop-indicator" />
              <Button
                icon="pi pi-plus"
                label="Add step"
                text
                size="small"
                class="add-step-btn"
                @click="openAddStepDialog('scenario', 0)"
              />
            </div>

            <!-- Grouped steps display -->
            <template
              v-for="group in groupedSteps"
              :key="group.keyword"
            >
              <div
                class="step-group"
                :class="[group.keyword.toLowerCase(), { 'edit-mode': isEditMode }]"
              >
                <div
                  class="group-keyword"
                  :class="group.keyword.toLowerCase()"
                >
                  {{ group.keyword }}
                </div>
                <div class="group-steps">
                  <template
                    v-for="step in group.steps"
                    :key="step.id"
                  >
                    <div
                      class="step-item"
                      :class="{
                        'has-error': getStepIssues(step.id).some(i => i.severity === 'error'),
                        dragging: isStepDragging(step.id)
                      }"
                      :draggable="isEditMode"
                      @dragstart="handleStepDragStart($event, 'scenario', step.id)"
                      @dragend="handleStepDragEnd"
                    >
                      <i
                        v-if="isEditMode"
                        class="pi pi-bars drag-handle"
                      />

                      <!-- Read mode: show formatted step text -->
                      <span
                        v-if="props.viewMode !== 'edit'"
                        class="step-text"
                      >
                        <template
                          v-for="(segment, segIdx) in formatStepSegments(step)"
                          :key="segIdx"
                        >
                          <strong
                            v-if="segment.type === 'strong'"
                            :class="segment.className"
                          >{{ segment.text }}</strong>
                          <span v-else>{{ segment.text }}</span>
                        </template>
                      </span>

                      <!-- Edit mode: show inline editable inputs -->
                      <span
                        v-if="props.viewMode === 'edit'"
                        class="step-text step-text-editable"
                      >
                        <template
                          v-for="(segment, segIdx) in parseStepPattern(step)"
                          :key="segIdx"
                        >
                          <span
                            v-if="segment.type === 'text'"
                            class="step-text-segment"
                          >{{ cleanRegexText(segment.value) }}</span>

                          <!-- Enum Select inline -->
                          <Select
                            v-else-if="segment.arg && segment.arg.type === 'enum' && segment.arg.enumValues"
                            :model-value="segment.arg.value"
                            :options="segment.arg.enumValues"
                            :placeholder="segment.arg.name"
                            class="inline-arg-select"
                            data-testid="inline-arg-select"
                            @click.stop
                            @update:model-value="updateArg(step.id, segment.arg!.name, $event, 'enum', segment.arg!.enumValues)"
                          />

                          <!-- Outline: Editable Select with column suggestions -->
                          <Select
                            v-else-if="segment.arg && segment.arg.type !== 'table' && isOutline"
                            :model-value="segment.arg.value"
                            :options="outlineArgOptions"
                            :editable="true"
                            :placeholder="segment.arg.name"
                            class="inline-arg-input"
                            :class="{ 'inline-arg-placeholder': !!getOutlinePlaceholder(segment.arg.value) }"
                            data-testid="inline-arg-outline-select"
                            @click.stop
                            @update:model-value="updateArg(step.id, segment.arg!.name, $event as string, segment.arg!.type as any, segment.arg!.enumValues)"
                          />

                          <!-- Standard Input inline (string, int, float, any, etc.) -->
                          <InputText
                            v-else-if="segment.arg && segment.arg.type !== 'table'"
                            :model-value="segment.arg.value"
                            :placeholder="segment.arg.name"
                            class="inline-arg-input"
                            data-testid="inline-arg-input"
                            @click.stop
                            @update:model-value="updateArg(step.id, segment.arg!.name, $event as string, segment.arg!.type as any, segment.arg!.enumValues)"
                          />

                          <!-- Table placeholder (shows below) -->
                          <span
                            v-else-if="segment.arg && segment.arg.type === 'table'"
                            class="inline-arg-table-badge"
                          >
                            <i class="pi pi-table" />
                            {{ segment.arg.name }}
                          </span>
                        </template>
                      </span>

                      <!-- Table args (edit mode only, shown below text) -->
                      <div
                        v-if="isEditMode && step.args.some(a => a.type === 'table')"
                        class="step-table-args"
                      >
                        <template
                          v-for="arg in step.args.filter(a => a.type === 'table')"
                          :key="arg.name"
                        >
                          <TableEditor
                            :model-value="parseTableValue(arg.value)"
                            :columns="arg.tableColumns || []"
                            @update:model-value="updateTableArg(step.id, arg.name, $event)"
                          />
                        </template>
                      </div>

                      <!-- Table args (read mode, shown below text) -->
                      <div
                        v-if="!isEditMode && step.args.some(a => a.type === 'table' && a.value)"
                        class="step-table-args step-table-readonly"
                      >
                        <template
                          v-for="arg in step.args.filter(a => a.type === 'table' && a.value)"
                          :key="arg.name"
                        >
                          <table class="datatable-readonly">
                            <thead>
                              <tr>
                                <th
                                  v-for="col in (arg.tableColumns || [])"
                                  :key="col"
                                >
                                  {{ col }}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="(row, rowIdx) in parseTableValue(arg.value)"
                                :key="rowIdx"
                              >
                                <td
                                  v-for="col in (arg.tableColumns || [])"
                                  :key="col"
                                >
                                  {{ row[col] || '' }}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </template>
                      </div>

                      <!-- Actions (edit mode only) -->
                      <div
                        v-if="isEditMode"
                        class="step-actions"
                      >
                        <Button
                          icon="pi pi-times"
                          text
                          rounded
                          size="small"
                          severity="danger"
                          @click="removeStep(step.id)"
                        />
                      </div>

                      <!-- Validation issues (edit mode only) -->
                      <div
                        v-if="getStepIssues(step.id).length > 0 && isEditMode"
                        class="step-issues"
                      >
                        <span
                          v-for="(issue, i) in getStepIssues(step.id)"
                          :key="i"
                          :class="issue.severity"
                        >
                          {{ issue.message }}
                        </span>
                      </div>
                    </div>

                    <!-- Drop zone after each step -->
                    <div
                      v-if="isEditMode"
                      class="drop-zone"
                      :class="{ active: isDropZoneActive('scenario', flatSteps.findIndex(s => s.id === step.id) + 1) }"
                      @dragover="handleDropZoneDragOver($event, 'scenario', flatSteps.findIndex(s => s.id === step.id) + 1)"
                      @dragleave="handleDropZoneDragLeave"
                      @drop="handleDropOnZone($event, 'scenario', flatSteps.findIndex(s => s.id === step.id) + 1)"
                    >
                      <div class="drop-indicator" />
                      <Button
                        icon="pi pi-plus"
                        label="Add step"
                        text
                        size="small"
                        class="add-step-btn"
                        @click="openAddStepDialog('scenario', flatSteps.findIndex(s => s.id === step.id) + 1)"
                      />
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Run Mode View -->
        <div
          v-if="isRunMode"
          key="run-section"
          class="run-section"
        >
          <!-- Validation Status -->
          <div class="run-validation-section">
            <div class="section-label">
              <i class="pi pi-check-circle" />
              <span>Validation</span>
            </div>
            <div
              v-if="scenarioStore.isValid"
              class="validation-success"
            >
              <i class="pi pi-check-circle" />
              <span>Scenario is valid and ready to run</span>
            </div>
            <div
              v-else-if="scenarioStore.errors.length > 0"
              class="validation-errors"
            >
              <div
                v-for="(issue, i) in scenarioStore.errors"
                :key="`error-${i}`"
                class="validation-issue error"
              >
                <i class="pi pi-times-circle" />
                <span>{{ issue.message }}</span>
              </div>
            </div>
            <div
              v-else
              class="validation-pending"
            >
              <i class="pi pi-info-circle" />
              <span>Validation pending</span>
            </div>
          </div>

          <!-- Target Info -->
          <div class="run-target-section">
            <div class="section-label">
              <i class="pi pi-crosshair" />
              <span>Target</span>
            </div>
            <div class="target-info">
              <div class="target-item">
                <span class="target-label">Feature</span>
                <span class="target-value">{{ scenarioStore.currentFeaturePath || 'All features' }}</span>
              </div>
              <div class="target-item">
                <span class="target-label">Scenario</span>
                <span class="target-value">{{ scenarioStore.scenario.name || 'All scenarios' }}</span>
              </div>
            </div>
          </div>

          <!-- Runner Controls -->
          <div class="run-controls-section">
            <div class="section-label">
              <i class="pi pi-play" />
              <span>Test Runner</span>
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
            </div>

            <div class="base-url-field">
              <label for="baseUrl">Base URL</label>
              <InputText
                id="baseUrl"
                :model-value="runnerStore.baseUrl"
                placeholder="http://localhost:3000"
                :disabled="runnerStore.isRunning"
                @update:model-value="runnerStore.setBaseUrl($event ?? '')"
              />
            </div>

            <div class="run-buttons">
              <Button
                label="Run with UI"
                icon="pi pi-desktop"
                :disabled="runnerStore.isRunning || !scenarioStore.isValid"
                @click="runUI"
              />
              <Button
                label="Run Headless"
                icon="pi pi-play"
                outlined
                :disabled="runnerStore.isRunning || !scenarioStore.isValid"
                @click="runHeadless"
              />
              <Button
                v-if="runnerStore.isRunning"
                label="Stop"
                icon="pi pi-stop"
                severity="danger"
                @click="stopRun"
              />
            </div>
          </div>

          <!-- Runner Errors -->
          <div
            v-if="runnerStore.errors.length > 0"
            class="run-errors-section"
          >
            <div class="section-label">
              <i class="pi pi-exclamation-triangle" />
              <span>Errors</span>
              <span class="error-count">{{ runnerStore.errors.length }} issue{{ runnerStore.errors.length > 1 ? 's' : '' }}</span>
            </div>
            <div class="errors-list">
              <div
                v-for="(error, index) in runnerStore.errors"
                :key="index"
                class="error-item"
                :class="error.type"
              >
                <div class="error-header">
                  <i :class="getErrorIcon(error.type)" />
                  <span class="error-type">{{ formatErrorType(error.type) }}</span>
                </div>
                <div class="error-message">
                  {{ error.message }}
                </div>
                <div
                  v-if="error.file"
                  class="error-location"
                >
                  <i class="pi pi-file" />
                  {{ error.file }}{{ error.line ? `:${error.line}` : '' }}
                </div>
                <div
                  v-if="error.suggestion"
                  class="error-suggestion"
                >
                  <i class="pi pi-lightbulb" />
                  {{ error.suggestion }}
                </div>
              </div>
            </div>
          </div>

          <!-- Steps Preview -->
          <div class="run-steps-section">
            <div class="section-label">
              <i class="pi pi-list" />
              <span>Steps to Execute</span>
              <span class="step-count">{{ scenarioStore.scenario.steps.length }} steps</span>
            </div>
            <ol class="steps-list">
              <li
                v-for="step in scenarioStore.scenario.steps"
                :key="step.id"
              >
                <template
                  v-for="(segment, segIdx) in formatStepSegments(step)"
                  :key="segIdx"
                >
                  <strong
                    v-if="segment.type === 'strong'"
                    :class="segment.className"
                  >{{ segment.text }}</strong>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </li>
            </ol>
          </div>

          <!-- Logs -->
          <div class="run-logs-section">
            <div class="section-label">
              <i class="pi pi-file" />
              <span>Output</span>
              <Button
                v-if="runnerStore.logs.length > 0"
                icon="pi pi-trash"
                text
                rounded
                size="small"
                class="clear-logs-btn"
                @click="clearLogs"
              />
            </div>
            <div class="logs-container">
              <div
                v-if="runnerStore.logs.length === 0"
                class="logs-empty"
              >
                Run the scenario to see output here
              </div>
              <pre
                v-else
                class="logs-content"
              >{{ runnerStore.logs.join('\n') }}</pre>
            </div>
          </div>
        </div>

        <!-- Examples / Variations - shown in read/edit modes -->
        <div
          v-if="isOutline && !isRunMode"
          key="variations-section"
          class="variations-section"
        >
          <div class="section-label">
            <i class="pi pi-table" />
            <span>Examples</span>
            <Button
              v-if="isEditMode && isOutline"
              icon="pi pi-trash"
              text
              size="small"
              severity="secondary"
              class="section-action"
              title="Remove examples table"
              @click="scenarioStore.toggleScenarioOutline()"
            />
          </div>

          <!-- Read mode: show full examples table -->
          <table
            v-if="!isEditMode && scenarioStore.scenario.examples"
            class="examples-readonly-table"
          >
            <thead>
              <tr>
                <th
                  v-for="col in scenarioStore.scenario.examples.columns"
                  :key="col"
                  class="examples-readonly-header"
                >
                  &lt;{{ col }}&gt;
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, rowIndex) in scenarioStore.scenario.examples.rows"
                :key="rowIndex"
              >
                <td
                  v-for="col in scenarioStore.scenario.examples.columns"
                  :key="col"
                  class="examples-readonly-cell"
                >
                  {{ row[col] || '' }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Edit mode: full examples table editor -->
          <ExamplesEditor
            v-else-if="scenarioStore.scenario.examples"
            :examples="scenarioStore.scenario.examples"
            @add-column="scenarioStore.addExampleColumn"
            @remove-column="scenarioStore.removeExampleColumn"
            @add-row="scenarioStore.addExampleRow"
            @remove-row="scenarioStore.removeExampleRow"
            @update-cell="scenarioStore.updateExampleCell"
          />
        </div>

        <!-- Add examples button (edit mode only, when not outline yet) -->
        <Button
          v-if="!isOutline && isEditMode"
          icon="pi pi-table"
          label="Add examples table"
          text
          size="small"
          class="add-variations-trigger"
          @click="scenarioStore.toggleScenarioOutline()"
        />
      </div>
    </template>

    <!-- Add Step Dialog -->
    <StepAddDialog
      v-model:visible="showAddStepDialog"
      :target="addStepTarget"
      :insert-index="addStepIndex"
      @add="handleAddStep"
    />
  </div>
</template>

<style scoped>
.scenario-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 480px;
  padding: 1.5rem;
  overflow-y: auto;
  background: var(--surface-ground);
}

/* Scenario Pagination */
.scenario-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: var(--surface-card);
  border-radius: 6px;
  width: fit-content;
  align-self: center;
}

.pagination-dots {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.pagination-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--surface-border);
  cursor: pointer;
  transition: all 0.15s;
}

.pagination-dot:hover {
  background: var(--text-color-secondary);
  transform: scale(1.3);
}

.pagination-dot.active {
  background: var(--primary-color);
  width: 8px;
  height: 8px;
}

.pagination-separator {
  width: 1px;
  height: 16px;
  background: var(--surface-border);
  margin: 0 0.25rem;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-secondary);
}

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--surface-card);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.empty-icon i {
  font-size: 2rem;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--text-color);
  font-weight: 500;
}

.empty-state p {
  margin: 0;
  font-size: 0.875rem;
}

/* Scenario Card */
.scenario-card {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Header */
.scenario-header {
  margin-bottom: 2rem;
}

.scenario-title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.info-btn {
  flex-shrink: 0;
  margin-top: 0.25rem;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.info-btn:hover {
  opacity: 1;
}

.scenario-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1.3;
}

.scenario-title-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 1.5rem;
  font-weight: 600;
  padding: 0;
}

.scenario-title-input :deep(input) {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  font-weight: 600;
  padding: 0.25rem 0;
  color: var(--text-color);
}

.scenario-title-input :deep(input):focus {
  box-shadow: none;
  border-bottom: 2px solid var(--primary-color);
}

.scenario-title-input :deep(input)::placeholder {
  color: var(--text-color-secondary);
  font-weight: 400;
}

.scenario-tags {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.tags-editor {
  margin-top: 0.5rem;
}

.tag-chip {
  font-size: 0.75rem;
  color: var(--primary-color);
  background: rgba(59, 130, 246, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

/* Section labels */
.section-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  margin-bottom: 1rem;
}

.section-label i {
  font-size: 0.875rem;
}

.section-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.7;
  margin-left: 0.5rem;
}

.section-action {
  margin-left: auto;
}

/* Preconditions */
.preconditions-section {
  padding: 1.25rem;
  background: rgba(251, 191, 36, 0.08);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border-left: 3px solid #fbbf24;
}

.preconditions-section.empty {
  border-style: dashed;
  border-width: 1px;
  border-left-width: 3px;
}

.preconditions-section .section-label {
  color: #b45309;
}

.preconditions-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.precondition-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--text-color);
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  transition: all 0.15s;
}

.precondition-item:hover {
  background: rgba(251, 191, 36, 0.1);
}

.precondition-item.dragging {
  opacity: 0.5;
}

.precondition-item :deep(strong) {
  color: #b45309;
  font-weight: 600;
}

.precondition-item .remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
  margin-left: auto;
}

.precondition-item:hover .remove-btn {
  opacity: 1;
}

/* Drag handle */
.drag-handle {
  cursor: grab;
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.precondition-item:hover .drag-handle,
.step-item:hover .drag-handle {
  opacity: 1;
}

/* Drop zones - always visible with subtle indicator */
.drop-zone {
  position: relative;
  height: 12px;
  margin: 2px 0;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.drop-zone .drop-indicator {
  position: absolute;
  left: 1rem;
  right: 1rem;
  top: 50%;
  height: 2px;
  background: var(--surface-border);
  border-radius: 1px;
  transform: translateY(-50%);
  transition: all 0.2s ease;
  opacity: 0.5;
}

/* Dot indicator to hint at interactivity */
.drop-zone::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  background: var(--surface-border);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: all 0.2s ease;
  opacity: 0.6;
}

.drop-zone:hover,
.drop-zone.active,
.dragging-active .drop-zone {
  height: 32px;
  background: rgba(59, 130, 246, 0.08);
}

.drop-zone:hover .drop-indicator,
.drop-zone.active .drop-indicator,
.dragging-active .drop-zone .drop-indicator {
  opacity: 1;
  left: 0.5rem;
  right: 0.5rem;
}

.drop-zone:hover::before,
.drop-zone.active::before,
.dragging-active .drop-zone::before {
  opacity: 0;
}

.drop-zone.large {
  height: auto;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 2px dashed var(--surface-border);
  border-radius: 8px;
  margin: 0;
  background: rgba(59, 130, 246, 0.02);
  transition: all 0.2s ease;
}

.drop-zone.large::before {
  display: none;
}

.drop-zone.large:hover,
.drop-zone.large.active {
  border-color: var(--primary-color);
  background: rgba(59, 130, 246, 0.06);
}

.drop-zone.large p {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

/* Add step button */
.add-step-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  z-index: 1;
  white-space: nowrap;
}

.drop-zone:hover .add-step-btn,
.dragging-active .drop-zone .add-step-btn {
  opacity: 1;
}

.drop-zone:hover .drop-indicator,
.dragging-active .drop-zone .drop-indicator {
  opacity: 0;
}

.add-step-btn-large {
  margin-top: 0.25rem;
}

.empty-hint {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
  margin: 0;
}

/* Story section */
.story-section {
  margin-bottom: 1.5rem;
  min-height: 100px;
}

.story-section.edit-inactive {
  opacity: 0.6;
}

.story-section.drop-active {
  background: rgba(59, 130, 246, 0.05);
  border-radius: 8px;
  outline: 2px dashed var(--primary-color);
  outline-offset: -2px;
}

.empty-story {
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

/* Step groups */
.step-group {
  margin-bottom: 1rem;
  padding: 0.75rem;
  border-radius: 8px;
  border-left: 3px solid var(--surface-border);
}

.step-group:last-child {
  margin-bottom: 0;
}

/* Step group backgrounds */
.step-group.given {
  background: rgba(5, 150, 105, 0.04);
  border-left-color: #059669;
}

.step-group.when {
  background: rgba(37, 99, 235, 0.04);
  border-left-color: #2563eb;
}

.step-group.then {
  background: rgba(124, 58, 237, 0.04);
  border-left-color: #7c3aed;
}

/* Edit mode: adjust for drop zones */
.step-group.edit-mode {
  padding: 0.75rem 1rem;
}

.step-group.edit-mode .group-steps {
  gap: 0;
}

.group-keyword {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  padding-left: 0.25rem;
}

.group-keyword.given {
  color: #059669;
}

.group-keyword.when {
  color: #2563eb;
}

.group-keyword.then {
  color: #7c3aed;
}

.group-steps {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-left: 0.5rem;
}

.steps-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.step-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  transition: all 0.15s;
  cursor: default;
}

.step-item[draggable="true"] {
  cursor: grab;
}

.step-item[draggable="true"]:active {
  cursor: grabbing;
}

.step-item:hover {
  background: var(--surface-hover);
}

.step-item.dragging {
  opacity: 0.4;
  background: var(--surface-hover);
}

.step-item.has-error {
  background: rgba(220, 53, 69, 0.08);
}

.step-text {
  flex: 1;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--text-color);
}

.step-text :deep(strong) {
  color: var(--primary-color);
  font-weight: 600;
}

/* Argument values in view mode - default (Cucumber expressions) */
.step-text :deep(strong.arg-value) {
  color: var(--primary-color); /* Blue for {string}, {int}, etc. */
  font-weight: 600;
}

/* Enum values in view mode - purple/violet */
.step-text :deep(strong.arg-enum) {
  color: rgb(139, 92, 246); /* Purple/violet for (enum|values) */
  font-weight: 600;
}

/* Scenario Outline placeholders in view mode - teal/cyan */
.step-text :deep(strong.arg-placeholder) {
  color: rgb(20, 184, 166); /* Teal for <placeholder> */
  font-weight: 600;
  font-style: normal;
}

.step-text-editable {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.125rem;
  line-height: 1.75;
}

.step-text-segment {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Inline argument inputs - applied directly to PrimeVue InputText */
.inline-arg-input {
  display: inline-flex !important;
  width: auto !important;
  min-width: 60px;
  max-width: 200px;
}

/* Target both the wrapper and the input element */
.inline-arg-input.p-inputtext,
.inline-arg-input :deep(.p-inputtext),
.inline-arg-input :deep(input) {
  padding: 0.125rem 0.375rem !important;
  font-size: 0.8125rem !important;
  font-weight: 600 !important;
  color: var(--primary-color) !important;
  background: rgba(59, 130, 246, 0.12) !important;
  border: 1px solid rgba(59, 130, 246, 0.4) !important;
  border-radius: 3px !important;
  min-width: 60px;
  height: 1.5rem;
  line-height: 1.25rem;
}

.inline-arg-input.p-inputtext:focus,
.inline-arg-input :deep(.p-inputtext):focus,
.inline-arg-input :deep(input):focus {
  background: white !important;
  border-color: var(--primary-color) !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15) !important;
}

.inline-arg-input.p-inputtext::placeholder,
.inline-arg-input :deep(.p-inputtext)::placeholder,
.inline-arg-input :deep(input)::placeholder {
  color: var(--primary-color) !important;
  opacity: 0.6 !important;
  font-weight: 500 !important;
  font-size: 0.75rem !important;
}

/* Outline placeholder styling - teal accent when value is <var> */
.inline-arg-placeholder.p-select,
.inline-arg-placeholder :deep(.p-select) {
  background: rgba(20, 184, 166, 0.12) !important;
  border-color: rgba(20, 184, 166, 0.4) !important;
}

.inline-arg-placeholder :deep(.p-select-label),
.inline-arg-placeholder :deep(input) {
  color: rgb(20, 184, 166) !important;
  font-weight: 600 !important;
}

/* Inline argument selects */
.inline-arg-select {
  display: inline-flex !important;
  width: auto !important;
  min-width: 80px;
  max-width: 180px;
}

.inline-arg-select.p-select,
.inline-arg-select :deep(.p-select) {
  padding: 0.125rem 0.375rem !important;
  font-size: 0.8125rem !important;
  background: rgba(139, 92, 246, 0.12) !important;
  border: 1px solid rgba(139, 92, 246, 0.4) !important;
  border-radius: 3px !important;
  height: 1.5rem;
}

.inline-arg-select :deep(.p-select-label) {
  font-weight: 600 !important;
  color: #8b5cf6 !important;
  font-size: 0.8125rem !important;
  padding: 0 !important;
}

.inline-arg-select :deep(.p-select-dropdown) {
  width: 1.25rem;
}

/* Table arg badge */
.inline-arg-table-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.125rem 0.375rem;
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  height: 1.5rem;
}

.inline-arg-table-badge i {
  font-size: 0.625rem;
}

/* Table args below step text */
.step-table-args {
  width: 100%;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--surface-border);
}

/* Read-only DataTable */
.datatable-readonly {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  margin-top: 0.25rem;
}

.datatable-readonly th {
  padding: 0.25rem 0.5rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.08);
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}

.datatable-readonly td {
  padding: 0.25rem 0.5rem;
  color: var(--text-color);
  border-bottom: 1px solid var(--surface-border);
}

.step-actions {
  display: flex;
  gap: 0.125rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.step-item:hover .step-actions {
  opacity: 1;
}

.step-issues {
  width: 100%;
  font-size: 0.75rem;
  color: #dc3545;
  margin-top: 0.25rem;
}

/* Variations / Examples */
.variations-section {
  padding: 1rem;
  background: rgba(139, 92, 246, 0.06);
  border-radius: 8px;
  border-left: 3px solid #8b5cf6;
  margin-top: 1rem;
}

.variations-section .section-label {
  color: #6d28d9;
}

/* Read-only examples table */
.examples-readonly-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.examples-readonly-header {
  padding: 0.375rem 0.75rem;
  text-align: left;
  font-weight: 500;
  font-family: monospace;
  font-size: 0.75rem;
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 4px;
}

.examples-readonly-cell {
  padding: 0.375rem 0.75rem;
  color: var(--text-color);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.8125rem;
}

.add-preconditions-trigger {
  margin-bottom: 1rem;
  color: #b45309;
}

.add-variations-trigger {
  margin-top: 0.75rem;
  color: var(--text-color-secondary);
}


/* Drop zone */
.drop-active {
  background: rgba(59, 130, 246, 0.08) !important;
}

/* Edit active state for preconditions */
.preconditions-section.edit-active {
  border: 2px solid #fbbf24;
  border-left-width: 3px;
}

/* Run Section */
.run-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Run Target Section */
.run-target-section {
  padding: 1.25rem;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 8px;
  border-left: 3px solid #6366f1;
}

.run-target-section .section-label {
  color: #4f46e5;
}

.target-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.target-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.target-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  min-width: 70px;
}

.target-value {
  font-size: 0.875rem;
  color: var(--text-color);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: var(--surface-card);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  word-break: break-all;
}

/* Run Validation Section */
.run-validation-section {
  padding: 1.25rem;
  background: var(--surface-ground);
  border-radius: 8px;
}

.validation-success {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #10b981;
  font-size: 0.9375rem;
}

.validation-success i {
  font-size: 1.125rem;
}

.validation-errors {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.validation-issue {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}

.validation-issue.error {
  background: rgba(220, 53, 69, 0.1);
  color: #dc3545;
}

.validation-pending {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

/* Run Controls Section */
.run-controls-section {
  padding: 1.25rem;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
}

.run-controls-section .section-label {
  margin-bottom: 1.25rem;
}

.runner-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-text {
  font-size: 0.875rem;
  text-transform: capitalize;
  color: var(--text-color);
}

.duration {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.base-url-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.base-url-field label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.base-url-field :deep(input) {
  width: 100%;
}

.run-buttons {
  display: flex;
  gap: 0.75rem;
}

/* Run Errors Section */
.run-errors-section {
  padding: 1.25rem;
  background: rgba(220, 53, 69, 0.08);
  border-radius: 8px;
  border-left: 3px solid #dc3545;
}

.run-errors-section .section-label {
  color: #dc3545;
  margin-bottom: 1rem;
}

.error-count {
  margin-left: auto;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: #dc3545;
}

.errors-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.error-item {
  background: var(--surface-card);
  border-radius: 6px;
  padding: 1rem;
  border-left: 3px solid;
}

.error-item.undefined_step {
  border-color: #f59e0b;
}

.error-item.syntax_error {
  border-color: #dc3545;
}

.error-item.ambiguous_step {
  border-color: #8b5cf6;
}

.error-item.config_error {
  border-color: #6366f1;
}

.error-item.missing_decorator {
  border-color: #ec4899;
}

.error-item.unknown {
  border-color: #6b7280;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.error-header i {
  font-size: 1rem;
  color: var(--text-color-secondary);
}

.error-type {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-color-secondary);
}

.error-message {
  font-size: 0.9375rem;
  color: var(--text-color);
  line-height: 1.5;
  margin-bottom: 0.5rem;
}

.error-location {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  margin-bottom: 0.5rem;
}

.error-location i {
  font-size: 0.75rem;
}

.error-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: #059669;
  background: rgba(5, 150, 105, 0.08);
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  line-height: 1.4;
}

.error-suggestion i {
  font-size: 0.875rem;
  color: #059669;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

/* Run Steps Section */
.run-steps-section {
  padding: 1.25rem;
  background: var(--surface-ground);
  border-radius: 8px;
}

.step-count {
  margin-left: auto;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-color);
}

.steps-list {
  margin: 0;
  padding-left: 1.5rem;
  font-size: 0.9375rem;
  line-height: 1.8;
  color: var(--text-color);
}

.steps-list li {
  margin-bottom: 0.25rem;
}

.steps-list :deep(strong) {
  color: var(--primary-color);
  font-weight: 600;
}

/* Run Logs Section */
.run-logs-section {
  padding: 1.25rem;
  background: var(--surface-ground);
  border-radius: 8px;
}

.run-logs-section .section-label {
  margin-bottom: 0.75rem;
}

.clear-logs-btn {
  margin-left: auto;
}

.logs-container {
  background: var(--surface-card);
  border-radius: 6px;
  padding: 0.75rem;
  min-height: 120px;
  max-height: 300px;
  overflow: auto;
}

.logs-empty {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
  font-style: italic;
}

.logs-content {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-color);
}

/* Mode-specific adjustments */
.mode-read .scenario-card {
  max-width: 700px;
  min-width: 700px;
  margin: 0 auto;
}

.mode-run .scenario-card {
  max-width: 800px;
  margin: 0 auto;
}
</style>
