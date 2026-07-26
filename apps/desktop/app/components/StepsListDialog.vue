<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStepsStore } from '~/stores/steps'

defineProps<{
  visible: boolean
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

const stepsStore = useStepsStore()
const filter = ref('')

const filteredSteps = computed(() => {
  const sorted = [...stepsStore.steps].sort(
    (a, b) => a.keyword.localeCompare(b.keyword) || a.pattern.localeCompare(b.pattern),
  )
  const q = filter.value.trim().toLowerCase()
  if (!q) return sorted
  return sorted.filter(
    (s) =>
      s.pattern.toLowerCase().includes(q) ||
      s.keyword.toLowerCase().includes(q) ||
      s.location.toLowerCase().includes(q),
  )
})

function keywordClass(keyword: string): string {
  return `kw-${keyword.toLowerCase()}`
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Step Definitions"
    :style="{ width: '660px', maxWidth: '94vw' }"
    data-testid="steps-list-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="steps-dialog">
      <div class="steps-toolbar">
        <span class="count">
          {{ stepsStore.steps.length }} step<span v-if="stepsStore.steps.length !== 1">s</span>
        </span>
        <InputText
          v-model="filter"
          placeholder="Filter steps…"
          class="filter"
          data-testid="steps-filter"
        />
      </div>

      <div
        v-if="filteredSteps.length === 0"
        class="steps-empty"
      >
        {{ stepsStore.steps.length === 0 ? 'No steps loaded.' : 'No steps match the filter.' }}
      </div>

      <ul
        v-else
        class="step-list"
        data-testid="step-list"
      >
        <li
          v-for="step in filteredSteps"
          :key="step.id"
          class="step-row"
          data-testid="step-row"
        >
          <span
            class="kw"
            :class="keywordClass(step.keyword)"
          >{{ step.keyword }}</span>
          <div class="step-body">
            <code class="pattern">{{ step.pattern }}</code>
            <span
              v-if="step.location"
              class="location"
            >{{ step.location }}</span>
          </div>
          <span
            v-if="step.isGeneric"
            class="generic-tag"
            title="Bundled generic step"
          >generic</span>
        </li>
      </ul>
    </div>

    <template #footer>
      <Button
        label="Close"
        text
        @click="$emit('update:visible', false)"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.steps-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.steps-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.steps-toolbar .count {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.steps-toolbar .filter {
  flex: 1;
}

.steps-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.step-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.kw {
  flex-shrink: 0;
  min-width: 3.2rem;
  text-align: center;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: capitalize;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
}

.kw-given {
  background: var(--p-blue-50, #eff6ff);
  color: var(--p-blue-600, #2563eb);
}

.kw-when {
  background: var(--p-amber-50, #fffbeb);
  color: var(--p-amber-600, #d97706);
}

.kw-then {
  background: var(--p-green-50, #f0fdf4);
  color: var(--p-green-600, #16a34a);
}

.step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.pattern {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.82rem;
  word-break: break-word;
}

.location {
  font-size: 0.72rem;
  color: var(--text-color-secondary);
  word-break: break-all;
}

.generic-tag {
  flex-shrink: 0;
  align-self: center;
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
}
</style>
