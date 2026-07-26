<script setup lang="ts">
import { ref, computed } from 'vue'
import type { RecordedActionType } from '@suisui/shared'
import { useRecorderStore } from '~/stores/recorder'

const recorder = useRecorderStore()

interface AssertionChoice {
  type: RecordedActionType
  label: string
  needsValue?: boolean
}

const ELEMENT_ASSERTIONS: AssertionChoice[] = [
  { type: 'assertVisible', label: 'Is visible' },
  { type: 'assertHidden', label: 'Is hidden' },
  { type: 'assertText', label: 'Contains text', needsValue: true },
  { type: 'assertValue', label: 'Has value', needsValue: true },
  { type: 'assertChecked', label: 'Is checked' },
  { type: 'assertEnabled', label: 'Is enabled' },
  { type: 'assertCount', label: 'Element count', needsValue: true },
]
const PAGE_ASSERTIONS: AssertionChoice[] = [
  { type: 'assertUrl', label: 'URL contains' },
  { type: 'assertTitle', label: 'Page title contains' },
]

const elementType = ref<RecordedActionType>('assertVisible')
const elementValue = ref('')
const pageType = ref<RecordedActionType>('assertUrl')
const pageValue = ref('')

const elementNeedsValue = computed(() => ELEMENT_ASSERTIONS.find((a) => a.type === elementType.value)?.needsValue ?? false)

const pickedLabel = computed(() => {
  const locator = recorder.pendingAssertion?.locatorCandidates[0]?.locator
  if (!locator) return 'the element'
  return 'value' in locator ? `"${locator.value}"` : 'name' in locator ? `"${locator.name}"` : 'the element'
})

async function confirmElement() {
  await recorder.addAssertion(elementType.value, elementNeedsValue.value ? elementValue.value : undefined)
  elementValue.value = ''
}

async function addPage() {
  await recorder.addAssertion(pageType.value, pageValue.value)
  pageValue.value = ''
}
</script>

<template>
  <div class="assertion-picker">
    <h4>Assertions</h4>

    <!-- Element assertion -->
    <div class="block">
      <template v-if="recorder.pendingAssertion">
        <p class="picked">
          Assert on {{ pickedLabel }}:
        </p>
        <div class="controls">
          <select
            v-model="elementType"
            data-testid="assert-type"
          >
            <option
              v-for="choice in ELEMENT_ASSERTIONS"
              :key="choice.type"
              :value="choice.type"
            >
              {{ choice.label }}
            </option>
          </select>
          <input
            v-if="elementNeedsValue"
            v-model="elementValue"
            placeholder="Expected value"
          >
          <Button
            size="small"
            label="Add"
            icon="pi pi-check"
            data-testid="assert-add"
            @click="confirmElement"
          />
          <Button
            text
            size="small"
            label="Cancel"
            @click="recorder.cancelAssertion()"
          />
        </div>
      </template>
      <Button
        v-else
        text
        size="small"
        icon="pi pi-crosshairs"
        label="Assert on an element"
        data-testid="assert-pick"
        @click="recorder.enterAssertMode()"
      />
    </div>

    <!-- Page assertion -->
    <div class="block controls">
      <select v-model="pageType">
        <option
          v-for="choice in PAGE_ASSERTIONS"
          :key="choice.type"
          :value="choice.type"
        >
          {{ choice.label }}
        </option>
      </select>
      <input
        v-model="pageValue"
        placeholder="Expected fragment"
      >
      <Button
        size="small"
        label="Add page check"
        icon="pi pi-check"
        :disabled="!pageValue"
        @click="addPage"
      />
    </div>

    <!-- Suggestions -->
    <div
      v-if="recorder.suggestions.length"
      class="suggestions"
    >
      <p class="suggest-head">
        Suggested checks
      </p>
      <div
        v-for="suggestion in recorder.suggestions"
        :key="suggestion.id"
        class="suggestion"
      >
        <span>{{ suggestion.label }}</span>
        <span class="suggestion-actions">
          <Button
            text
            size="small"
            icon="pi pi-check"
            aria-label="Accept"
            @click="recorder.acceptSuggestion(suggestion.id)"
          />
          <Button
            text
            size="small"
            severity="secondary"
            icon="pi pi-times"
            aria-label="Reject"
            @click="recorder.rejectSuggestion(suggestion.id)"
          />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assertion-picker {
  border-top: 1px solid var(--p-content-border-color, #e5e7eb);
  margin-top: 0.75rem;
  padding-top: 0.75rem;
}
.assertion-picker h4 {
  margin: 0 0 0.5rem;
}
.block {
  margin-bottom: 0.5rem;
}
.controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.controls select,
.controls input {
  padding: 0.2rem 0.4rem;
}
.picked {
  margin: 0 0 0.25rem;
}
.suggestions {
  margin-top: 0.5rem;
}
.suggest-head {
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.suggestion-actions {
  display: flex;
}
</style>
