<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStepsStore } from '~/stores/steps'
import type { ScenarioStep, StepKeyword, StepDefinition } from '@suisui/shared'

const props = defineProps<{
  visible: boolean
  step: ScenarioStep | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  replace: [stepId: string, keyword: StepKeyword, pattern: string, args: StepDefinition['args']]
}>()

const stepsStore = useStepsStore()

const selectedKeyword = ref<StepKeyword>('Given')
const searchQuery = ref('')

const keywords: StepKeyword[] = ['Given', 'When', 'Then']

// Initialize selected keyword from the step being edited
watch(
  () => props.step,
  (step) => {
    if (step) {
      // Map And/But to their base keywords
      const baseKeyword = step.keyword === 'And' || step.keyword === 'But' ? 'Given' : step.keyword
      selectedKeyword.value = baseKeyword as StepKeyword
      searchQuery.value = ''
    }
  },
  { immediate: true }
)

const filteredSteps = computed(() => {
  const steps = stepsStore.stepsByKeyword(selectedKeyword.value)
  if (!searchQuery.value) return steps

  const query = searchQuery.value.toLowerCase()
  return steps.filter((step) => step.pattern.toLowerCase().includes(query))
})

function selectStep(stepDef: StepDefinition) {
  if (!props.step) return

  emit('replace', props.step.id, stepDef.keyword, stepDef.pattern, stepDef.args)
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
    header="Edit Step"
    :style="{ width: '600px', height: '500px' }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="edit-dialog-content">
      <div
        v-if="step"
        class="current-step"
      >
        <label>Current Step</label>
        <div class="current-step-display">
          <span
            class="keyword"
            :class="step.keyword.toLowerCase()"
          >{{ step.keyword }}</span>
          <span class="pattern">{{ step.pattern }}</span>
        </div>
      </div>

      <div class="step-selector-section">
        <label>Select New Step</label>

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
            :class="{
              generic: stepDef.isGeneric,
              selected: step && stepDef.pattern === step.pattern && stepDef.keyword === step.keyword
            }"
            @click="selectStep(stepDef)"
          >
            <div class="step-pattern">
              <span class="keyword">{{ stepDef.keyword }}</span>
              {{ stepDef.pattern }}
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
.edit-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.current-step {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.current-step label,
.step-selector-section > label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.current-step-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.875rem;
}

.current-step-display .keyword {
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.current-step-display .keyword.given {
  background: #10b981;
  color: white;
}

.current-step-display .keyword.when {
  background: #3b82f6;
  color: white;
}

.current-step-display .keyword.then {
  background: #8b5cf6;
  color: white;
}

.current-step-display .keyword.and,
.current-step-display .keyword.but {
  background: #6b7280;
  color: white;
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

.step-items li.selected {
  background-color: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--primary-color);
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
