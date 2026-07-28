<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BulkTagOperation } from '@suisui/shared'
import { isValidTagName, normalizeTagName } from '@suisui/shared'
import { useTagsStore } from '~/stores/tags'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const tagsStore = useTagsStore()

const operation = ref<BulkTagOperation>('add')
const tagInput = ref('')
/** The user has acknowledged that a target file has unsaved editor changes. */
const conflictAcknowledged = ref(false)

const normalized = computed(() => normalizeTagName(tagInput.value))
const tagIsValid = computed(() => isValidTagName(tagInput.value))
const preview = computed(() => tagsStore.previewBulk(operation.value, tagInput.value))

const blockedByConflict = computed(
  () => tagsStore.conflictsWithUnsavedEditor && !conflictAcknowledged.value
)

const canApply = computed(
  () =>
    tagIsValid.value &&
    preview.value.willChange > 0 &&
    !blockedByConflict.value &&
    !tagsStore.isApplying
)

// Reset per-open so a previous run's tag and summary never leak into the next.
watch(
  () => props.visible,
  (open) => {
    if (!open) return
    operation.value = 'add'
    tagInput.value = ''
    conflictAcknowledged.value = false
    tagsStore.clearLastResult()
  }
)

async function apply() {
  if (!canApply.value) return
  await tagsStore.applyBulk(operation.value, tagInput.value)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Bulk edit tags"
    modal
    :style="{ width: '32rem' }"
    data-testid="bulk-tag-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="bulk-body">
      <p class="selection-summary">
        <strong>{{ tagsStore.selectedScenarioIds.length }}</strong> scenario(s) selected
      </p>

      <div class="op-toggle">
        <button
          type="button"
          class="op-chip"
          :class="{ active: operation === 'add' }"
          data-testid="bulk-op-add"
          @click="operation = 'add'"
        >
          Add tag
        </button>
        <button
          type="button"
          class="op-chip"
          :class="{ active: operation === 'remove' }"
          data-testid="bulk-op-remove"
          @click="operation = 'remove'"
        >
          Remove tag
        </button>
      </div>

      <InputText
        v-model="tagInput"
        class="tag-input"
        placeholder="Tag name (with or without @)"
        aria-label="Tag name"
        data-testid="bulk-tag-input"
      />
      <small
        v-if="tagInput.length > 0 && !tagIsValid"
        class="validation-error"
        data-testid="bulk-tag-invalid"
      >
        Tags may contain letters, digits, and <code>_ - . :</code> only — no spaces or “#”.
      </small>

      <!-- Preview: what this will actually do, before anything is written. -->
      <div
        v-if="tagIsValid"
        class="preview"
        data-testid="bulk-preview"
      >
        <p class="preview-main">
          Will {{ operation }} <strong>@{{ normalized }}</strong> on
          <strong data-testid="bulk-preview-count">{{ preview.willChange }}</strong>
          scenario(s) across
          <strong data-testid="bulk-preview-files">{{ preview.filesAffected }}</strong> file(s).
        </p>
        <p
          v-if="preview.alreadySatisfied > 0"
          class="preview-note"
        >
          {{ preview.alreadySatisfied }} already
          {{ operation === 'add' ? 'carry it' : 'do not carry it' }} and will be left unchanged.
        </p>
        <p
          v-if="preview.blocked > 0"
          class="preview-note"
          data-testid="bulk-preview-blocked"
        >
          {{ preview.blocked }} inherit this tag from their feature and cannot have it removed
          individually.
        </p>
      </div>

      <div
        v-if="tagsStore.conflictsWithUnsavedEditor"
        class="conflict"
        data-testid="bulk-conflict"
      >
        <i class="pi pi-exclamation-triangle" />
        <div>
          <p>
            A selected scenario is in the feature you are editing, which has unsaved changes.
            Applying now means whichever is saved last wins.
          </p>
          <label class="conflict-ack">
            <input
              v-model="conflictAcknowledged"
              type="checkbox"
              data-testid="bulk-conflict-ack"
            >
            Apply anyway
          </label>
        </div>
      </div>

      <!-- Outcome summary, shown after applying. -->
      <div
        v-if="tagsStore.lastResult"
        class="outcome"
        data-testid="bulk-outcome"
      >
        <p>
          Changed {{ tagsStore.lastResult.changedCount }} scenario(s) in
          {{ tagsStore.lastResult.filesChanged }} file(s).
        </p>
        <ul
          v-if="tagsStore.lastResult.outcomes.some((o) => o.status === 'skipped' || o.status === 'failed')"
          class="outcome-list"
        >
          <li
            v-for="entry in tagsStore.lastResult.outcomes.filter(
              (o) => o.status === 'skipped' || o.status === 'failed'
            )"
            :key="`${entry.relativePath}#${entry.scenarioIndex}`"
            :class="entry.status"
          >
            <strong>{{ entry.status }}</strong>
            — {{ entry.scenarioName || '(untitled)' }} in {{ entry.relativePath }}:
            {{ entry.reason }}
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <Button
        label="Close"
        text
        size="small"
        data-testid="bulk-close"
        @click="close"
      />
      <Button
        :label="operation === 'add' ? 'Add tag' : 'Remove tag'"
        :icon="operation === 'add' ? 'pi pi-plus' : 'pi pi-minus'"
        size="small"
        :severity="operation === 'remove' ? 'danger' : undefined"
        :disabled="!canApply"
        :loading="tagsStore.isApplying"
        data-testid="bulk-apply"
        @click="apply"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.bulk-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.selection-summary {
  font-size: 0.85rem;
}

.op-toggle {
  display: flex;
  gap: 0.35rem;
}

.op-chip {
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.op-chip.active {
  background: var(--primary-color);
  color: #ffffff;
  border-color: transparent;
}

.tag-input {
  width: 100%;
}

.validation-error {
  color: #b91c1c;
  font-size: 0.72rem;
}

.preview {
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-size: 0.8rem;
}

.preview-note {
  font-size: 0.72rem;
  color: var(--text-color-secondary);
  margin-top: 0.25rem;
}

.conflict {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #b45309;
  border-radius: 4px;
  font-size: 0.78rem;
  color: #b45309;
}

.conflict-ack {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
  cursor: pointer;
}

.outcome {
  font-size: 0.8rem;
  border-top: 1px solid var(--surface-border);
  padding-top: 0.5rem;
}

.outcome-list {
  list-style: none;
  padding: 0;
  margin: 0.35rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
}

.outcome-list .failed {
  color: #b91c1c;
}

.outcome-list .skipped {
  color: var(--text-color-secondary);
}
</style>
