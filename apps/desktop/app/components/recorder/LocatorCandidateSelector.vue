<script setup lang="ts">
import { computed } from 'vue'
import type { LocatorCandidate, LocatorReference, RecordedAction } from '@suisui/shared'

const props = defineProps<{ action: RecordedAction }>()
const emit = defineEmits<{
  selectLocator: [index: number]
  highlight: [locator: LocatorReference]
  pickElement: []
}>()

const candidates = computed<LocatorCandidate[]>(() => props.action.locatorCandidates ?? [])

function describe(locator: LocatorReference): string {
  switch (locator.type) {
    case 'testId':
      return `${locator.attribute}="${locator.value}"`
    case 'role':
      return locator.name ? `role "${locator.role}" — "${locator.name}"` : `role "${locator.role}"`
    case 'label':
      return `label "${locator.value}"`
    case 'placeholder':
      return `placeholder "${locator.value}"`
    case 'text':
      return `text "${locator.value}"`
    case 'name':
      return `name "${locator.value}"`
    case 'id':
      return `id "${locator.value}"`
    case 'css':
      return locator.value
  }
}

function isSelected(candidate: LocatorCandidate): boolean {
  return JSON.stringify(candidate.locator) === JSON.stringify(props.action.selectedLocator)
}

const reliabilityLabel: Record<LocatorCandidate['reliability'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
}
</script>

<template>
  <div class="locator-candidate-selector">
    <div class="head">
      <h4>Element locator</h4>
      <Button
        text
        size="small"
        icon="pi pi-crosshairs"
        label="Pick a different element"
        data-testid="pick-element"
        @click="emit('pickElement')"
      />
    </div>

    <p
      v-if="candidates.length === 0"
      class="empty"
    >
      No locator candidates for this action.
    </p>

    <ul
      v-else
      class="candidates"
    >
      <li
        v-for="(candidate, index) in candidates"
        :key="index"
        class="candidate"
        :class="{ selected: isSelected(candidate) }"
        data-testid="locator-candidate"
        @click="emit('selectLocator', index)"
      >
        <div class="row">
          <span
            class="reliability"
            :class="candidate.reliability"
            data-testid="candidate-reliability"
          >{{ reliabilityLabel[candidate.reliability] }}</span>
          <code class="desc">{{ describe(candidate.locator) }}</code>
          <Button
            text
            rounded
            size="small"
            icon="pi pi-eye"
            aria-label="Highlight"
            @click.stop="emit('highlight', candidate.locator)"
          />
        </div>
        <ul class="reasons">
          <li
            v-for="reason in candidate.reasons"
            :key="reason"
            class="reason"
          >
            {{ reason }}
          </li>
          <li
            v-for="warning in candidate.warnings"
            :key="warning"
            class="warning"
          >
            {{ warning }}
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.locator-candidate-selector {
  margin-top: 1rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h4 {
  margin: 0;
}
.candidates {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.candidate {
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  cursor: pointer;
}
.candidate.selected {
  border-color: var(--p-primary-color, #3b82f6);
  background: var(--p-highlight-background, rgba(59, 130, 246, 0.08));
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.desc {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reliability {
  font-size: 0.7rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
}
.reliability.excellent {
  background: #dcfce7;
  color: #166534;
}
.reliability.good {
  background: #dbeafe;
  color: #1e40af;
}
.reliability.fair {
  background: #fef9c3;
  color: #854d0e;
}
.reliability.poor {
  background: #fee2e2;
  color: #991b1b;
}
.reasons {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  font-size: 0.75rem;
}
.reason {
  color: #166534;
}
.warning {
  color: #991b1b;
}
.empty {
  color: var(--p-text-muted-color, #6b7280);
}
</style>
