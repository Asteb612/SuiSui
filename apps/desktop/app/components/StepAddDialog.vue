<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStepsStore } from '~/stores/steps'
import { formatStepPattern } from '~/utils/stepPatternFormatter'
import type { StepKeyword, StepDefinition } from '@suisui/shared'

const props = defineProps<{
  visible: boolean
  target: 'scenario' | 'background'
  insertIndex: number
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  add: [target: 'scenario' | 'background', index: number, step: StepDefinition]
}>()

const stepsStore = useStepsStore()

const selectedKeyword = ref<StepKeyword>('Given')
const searchQuery = ref('')

const keywords: StepKeyword[] = ['Given', 'When', 'Then']

// Reset state when dialog opens
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      selectedKeyword.value = 'Given'
      searchQuery.value = ''
    }
  }
)

const filteredSteps = computed(() => {
  const steps = stepsStore.stepsByKeyword(selectedKeyword.value)
  if (!searchQuery.value) return steps

  const query = searchQuery.value.toLowerCase()
  return steps.filter((step) => step.pattern.toLowerCase().includes(query))
})

function selectStep(stepDef: StepDefinition) {
  emit('add', props.target, props.insertIndex, stepDef)
  emit('update:visible', false)
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Add Step"
    :style="{ width: '600px', height: '500px' }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="add-dialog-content">
      <div class="step-selector-section">
        <div class="selector-controls">
          <SelectButton
            v-model="selectedKeyword"
            :options="keywords"
            :allow-empty="false"
            size="small"
          />
        </div>

        <div class="search-box">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="searchQuery"
              placeholder="Search steps..."
              size="small"
            />
          </IconField>
        </div>

        <div
          v-if="filteredSteps.length === 0"
          class="empty-state"
        >
          <p>No steps match your search.</p>
        </div>

        <ul
          v-else
          class="step-items"
        >
          <li
            v-for="stepDef in filteredSteps"
            :key="stepDef.id"
            :class="{ generic: stepDef.isGeneric }"
            @click="selectStep(stepDef)"
          >
            <div class="step-pattern">
              <span class="keyword">{{ stepDef.keyword }}</span>
              <span
                :aria-label="stepDef.pattern"
                v-html="formatStepPattern(stepDef.pattern).html"
              />
            </div>
            <div
              v-if="stepDef.args.length > 0"
              class="step-args"
            >
              <span
                v-for="arg in stepDef.args"
                :key="arg.name"
                class="arg-badge"
              >
                {{ arg.name }}: {{ arg.type }}
              </span>
            </div>
            <span
              v-if="stepDef.isGeneric"
              class="generic-badge"
            >Generic</span>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        @click="onClose"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.add-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.step-selector-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}

.selector-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-box :deep(input) {
  width: 100%;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
}

.step-items {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.step-items li {
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--surface-border);
  transition: background-color 0.15s;
  position: relative;
}

.step-items li:last-child {
  border-bottom: none;
}

.step-items li:hover {
  background-color: var(--surface-ground);
}

.step-items li.generic {
  background-color: rgba(59, 130, 246, 0.05);
}

.step-pattern {
  font-family: monospace;
  font-size: 0.875rem;
}

.step-pattern .keyword {
  font-weight: 600;
  color: var(--primary-color);
  margin-right: 0.5rem;
}

/* Pattern variable styles */
:deep(.pattern-variable) {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-weight: 600;
  margin: 0 0.125rem;
}

:deep(.pattern-enum) {
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
}

:deep(.pattern-table) {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

:deep(.pattern-string),
:deep(.pattern-int),
:deep(.pattern-float),
:deep(.pattern-any) {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.step-args {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.arg-badge {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  background: var(--surface-ground);
  border-radius: 3px;
  color: var(--text-color-secondary);
}

.generic-badge {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  background: var(--primary-color);
  color: white;
}
</style>
