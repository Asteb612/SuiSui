<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'
import type { StepKeyword, StepDefinition } from '@suisui/shared'

const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()

const selectedKeyword = ref<StepKeyword>('Given')
const searchQuery = ref('')

const keywords: StepKeyword[] = ['Given', 'When', 'Then']

const filteredSteps = computed(() => {
  const steps = stepsStore.stepsByKeyword(selectedKeyword.value)
  if (!searchQuery.value) return steps

  const query = searchQuery.value.toLowerCase()
  return steps.filter((step) => step.pattern.toLowerCase().includes(query))
})

function addStep(step: StepDefinition) {
  scenarioStore.addStep(step.keyword, step.pattern, step.args)
}

async function refreshSteps() {
  await stepsStore.exportSteps()
}
</script>

<template>
  <div class="step-selector" data-testid="step-selector">
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

    <div class="search-box">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText v-model="searchQuery" placeholder="Search steps..." size="small" />
      </IconField>
    </div>

    <div v-if="stepsStore.error" class="error-message">
      <i class="pi pi-exclamation-triangle" />
      {{ stepsStore.error }}
    </div>

    <div v-else-if="filteredSteps.length === 0" class="empty-state">
      <p v-if="stepsStore.steps.length === 0">
        No steps loaded. Click refresh to export from bddgen.
      </p>
      <p v-else>No steps match your search.</p>
    </div>

    <ul v-else class="step-items">
      <li
        v-for="step in filteredSteps"
        :key="step.id"
        :class="{ generic: step.isGeneric }"
        data-testid="step-item"
        @click="addStep(step)"
      >
        <div class="step-pattern">
          <span class="keyword">{{ step.keyword }}</span>
          {{ step.pattern }}
        </div>
        <div v-if="step.args.length > 0" class="step-args">
          <span v-for="arg in step.args" :key="arg.name" class="arg-badge">
            {{ arg.name }}: {{ arg.type }}
          </span>
        </div>
        <span v-if="step.isGeneric" class="generic-badge">Generic</span>
        <span v-if="step.decorator" class="decorator-badge">@{{ step.decorator }}</span>
      </li>
    </ul>
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

.step-items {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.step-items li {
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--surface-border);
  transition: background-color 0.15s;
  position: relative;
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

.keyword {
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
