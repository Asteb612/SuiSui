<script setup lang="ts">
import { computed } from 'vue'
import type { RecordedAction, StepMatch } from '@suisui/shared'

const props = defineProps<{ action: RecordedAction }>()
const emit = defineEmits<{
  selectMatch: [definitionId: string]
  openImplementation: [location: NonNullable<StepMatch['definitionLocation']>]
  createStub: []
}>()

const options = computed<StepMatch[]>(() => {
  const all = [props.action.match, ...(props.action.matchAlternatives ?? [])]
  return all.filter((m): m is StepMatch => !!m)
})

function preview(match: StepMatch): string {
  let i = 0
  return `${match.keyword} ${match.pattern.replace(/\{[^}]*\}/g, () => `"${match.args[i++]?.value ?? ''}"`)}`
}
</script>

<template>
  <div class="step-match-selector">
    <h4>Matched step</h4>

    <div
      v-if="action.status === 'gap'"
      class="gap"
    >
      <p>No existing step matches this action.</p>
      <Button
        text
        size="small"
        icon="pi pi-copy"
        label="Copy step stub"
        @click="emit('createStub')"
      />
    </div>

    <template v-else-if="action.match">
      <p class="preview">
        {{ preview(action.match) }}
      </p>

      <label
        v-if="options.length > 1"
        class="alt"
      >
        Use a different step:
        <select
          :value="action.match.definitionId"
          @change="emit('selectMatch', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="m in options"
            :key="m.definitionId"
            :value="m.definitionId"
          >
            {{ m.pattern }}
          </option>
        </select>
      </label>

      <Button
        v-if="action.match.definitionLocation"
        text
        size="small"
        icon="pi pi-external-link"
        label="Open implementation"
        @click="emit('openImplementation', action.match.definitionLocation)"
      />
      <span
        v-if="action.status === 'needs-review'"
        class="review"
      >Needs review — some arguments are missing.</span>
    </template>
  </div>
</template>

<style scoped>
.step-match-selector h4 {
  margin: 0 0 0.5rem;
}
.preview {
  font-family: var(--p-font-family-mono, monospace);
  background: var(--p-content-background, #f9fafb);
  padding: 0.5rem;
  border-radius: 6px;
}
.alt {
  display: block;
  margin: 0.5rem 0;
}
.alt select {
  margin-left: 0.5rem;
}
.gap {
  color: #991b1b;
}
.review {
  display: block;
  color: #854d0e;
  font-size: 0.85rem;
}
</style>
