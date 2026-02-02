<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'
import { useWorkspaceStore } from '~/stores/workspace'
import type { StepKeyword, StepDefinition } from '@suisui/shared'

const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()
const workspaceStore = useWorkspaceStore()

const props = withDefaults(
  defineProps<{
    addTarget?: 'scenario' | 'background'
  }>(),
  {
    addTarget: 'scenario',
  }
)

const selectedKeyword = ref<StepKeyword>('Given')
const searchQuery = ref('')

const keywords: StepKeyword[] = ['Given', 'When', 'Then']

const hasFeatureSelected = computed(() => {
  return workspaceStore.selectedFeature !== null || scenarioStore.currentFeaturePath !== null
})

const filteredSteps = computed(() => {
  const steps = stepsStore.stepsByKeyword(selectedKeyword.value)
  if (!searchQuery.value) return steps

  const query = searchQuery.value.toLowerCase()
  return steps.filter((step) => step.pattern.toLowerCase().includes(query))
})

function addStep(step: StepDefinition) {
  if (props.addTarget === 'background') {
    scenarioStore.addBackgroundStep(step.keyword, step.pattern, step.args)
  } else {
    scenarioStore.addStep(step.keyword, step.pattern, step.args)
  }
}

function handleDragStart(step: StepDefinition, event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/json', JSON.stringify(step))
  }
}

async function refreshSteps() {
  await stepsStore.exportSteps()
}
</script>

<template>
  <div
    class="step-selector"
    data-testid="step-selector"
  >
    <div class="step-selector-header">
      <SelectButton
        v-model="selectedKeyword"
        :options="keywords"
        :allow-empty="false"
        size="small"
      />
      <Button
        icon="pi pi-refresh"
        text
        rounded
        size="small"
        :loading="stepsStore.isLoading"
        title="Refresh steps from bddgen"
        @click="refreshSteps"
      />
    </div>

    <div
      v-if="!hasFeatureSelected"
      class="empty-state no-feature-selected"
    >
      <i class="pi pi-file" />
      <p>No feature selected</p>
      <p class="hint">
        Select or create a feature file to add steps
      </p>
    </div>

    <template v-else>
      <div class="target-indicator">
        <i class="pi pi-arrow-right" />
        <span>Adding to: <strong>{{ addTarget === 'background' ? 'Background' : 'Scenario' }}</strong></span>
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
        v-if="stepsStore.error"
        class="error-message"
      >
        <i class="pi pi-exclamation-triangle" />
        {{ stepsStore.error }}
      </div>

      <div
        v-else-if="filteredSteps.length === 0"
        class="empty-state"
      >
        <p v-if="stepsStore.steps.length === 0">
          No steps loaded. Click refresh to export from bddgen.
        </p>
        <p v-else>
          No steps match your search.
        </p>
      </div>

      <ul
        v-else
        class="step-items"
      >
        <li
          v-for="step in filteredSteps"
          :key="step.id"
          :class="{ generic: step.isGeneric }"
          data-testid="step-item"
          draggable="true"
          @click="addStep(step)"
          @dragstart="handleDragStart(step, $event)"
        >
          <div class="step-pattern">
            <span class="keyword">{{ step.keyword }}</span>
            {{ step.pattern }}
          </div>
          <div
            v-if="step.args.length > 0"
            class="step-args"
          >
            <span
              v-for="arg in step.args"
              :key="arg.name"
              class="arg-badge"
            >
              {{ arg.name }}: {{ arg.type }}
            </span>
          </div>
          <span
            v-if="step.isGeneric"
            class="generic-badge"
          >Generic</span>
          <span
            v-if="step.decorator"
            class="decorator-badge"
          >@{{ step.decorator }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.step-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-card);
}

.step-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid var(--surface-border);
}

.target-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(59, 130, 246, 0.08);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.target-indicator i {
  color: var(--primary-color);
}

.target-indicator strong {
  color: var(--primary-color);
  font-weight: 600;
}

.search-box {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
}

.search-box :deep(input) {
  width: 100%;
}

.error-message {
  padding: 1rem;
  color: #dc3545;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
}

.no-feature-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex: 1;
}

.no-feature-selected i {
  font-size: 3rem;
  opacity: 0.3;
  margin-bottom: 0.5rem;
}

.no-feature-selected .hint {
  font-size: 0.875rem;
  opacity: 0.7;
}

.step-items {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.step-items li {
  padding: 0.875rem 1rem;
  cursor: grab;
  border-bottom: 1px solid var(--surface-border);
  transition: background-color 0.15s;
  position: relative;
  line-height: 1.6;
}

.step-items li:active {
  cursor: grabbing;
}

.step-items li:hover {
  background-color: var(--surface-ground);
}

.step-items li.generic {
  background-color: rgba(59, 130, 246, 0.05);
}

.step-pattern {
  font-family: 'Courier New', Consolas, monospace;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-color);
}

.keyword {
  font-weight: 600;
  color: var(--primary-color);
  margin-right: 0.5rem;
  display: inline-block;
  min-width: 65px;
  font-size: 0.875rem;
}

.step-args {
  margin-top: 0.625rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.arg-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  color: var(--primary-color);
  font-weight: 500;
}

.generic-badge,
.decorator-badge {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.generic-badge {
  background: var(--primary-color);
  color: white;
}

.decorator-badge {
  background: #6366f1;
  color: white;
}
</style>
