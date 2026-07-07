<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AIRequestContext, ValidationResult } from '@suisui/shared'
import { useAiStore } from '~/stores/ai'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const aiStore = useAiStore()
const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()

type Phase = 'input' | 'streaming' | 'review'

const description = ref('')
const draft = ref('')
const phase = ref<Phase>('input')
const validating = ref(false)
/** Whether the CURRENT draft text has been validated (FR-008: validate before accept). */
const validated = ref(false)
/** Validation of the draft, kept locally so it survives restoring the scenario store. */
const draftValidation = ref<ValidationResult | null>(null)
const error = ref<string | null>(null)

const canGenerate = computed(() => description.value.trim().length > 0 && !aiStore.isStreaming)
// FR-008/FR-013: no draft may be accepted until it has been run through validation.
const canAccept = computed(() => phase.value === 'review' && validated.value && !validating.value)

const validationErrors = computed(
  () => draftValidation.value?.issues.filter((i) => i.severity === 'error') ?? []
)
const validationWarnings = computed(
  () => draftValidation.value?.issues.filter((i) => i.severity === 'warning') ?? []
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) reset()
  }
)

function reset() {
  description.value = ''
  draft.value = ''
  phase.value = 'input'
  validating.value = false
  validated.value = false
  draftValidation.value = null
  error.value = null
}

async function onGenerate() {
  if (!canGenerate.value) return
  error.value = null
  draftValidation.value = null
  validated.value = false
  phase.value = 'streaming'

  const context: AIRequestContext = {
    steps: stepsStore.allSteps,
    scenarioText: null,
    targetStep: null,
  }
  const result = await aiStore.generate('scenario', description.value.trim(), context)

  // FR-015 / streaming-interrupted edge case: a failed or empty stream is a
  // generation failure — never silently accepted, never inserted.
  if (result.error) {
    error.value = result.error
    phase.value = 'input'
    return
  }
  // User cancelled mid-stream: discard the partial draft rather than offering it for accept.
  if (result.finishReason === 'aborted') {
    phase.value = 'input'
    return
  }
  if (!result.text.trim()) {
    error.value = 'The model returned an empty draft. Try rephrasing your description.'
    phase.value = 'input'
    return
  }

  draft.value = result.text
  phase.value = 'review'
  await validateDraft()
}

/**
 * Validate the draft WITHOUT committing it (FR-008/FR-013). We snapshot the scenario
 * store, parse the draft into it, validate the active scenario, then restore the
 * snapshot — so the working feature is untouched until the user explicitly accepts.
 */
async function validateDraft() {
  validating.value = true
  const snapshot = JSON.parse(JSON.stringify(scenarioStore.$state))
  try {
    scenarioStore.parseGherkin(draft.value, stepsStore.allSteps)
    scenarioStore.activeScenarioIndex = 0
    await scenarioStore.validate()
    draftValidation.value = scenarioStore.validation
    validated.value = true
  } catch (err) {
    draftValidation.value = {
      isValid: false,
      issues: [{ severity: 'error', message: err instanceof Error ? err.message : 'Validation failed' }],
    }
    validated.value = true
  } finally {
    scenarioStore.$state = snapshot
    validating.value = false
  }
}

/** Editing the draft invalidates the prior validation — force a re-validate before accept. */
function onDraftEdited() {
  validated.value = false
  draftValidation.value = null
}

function onCancelStream() {
  aiStore.cancel()
}

/** FR-009: commit the validated draft as the active feature. */
function onAccept() {
  if (!canAccept.value) return
  scenarioStore.parseGherkin(draft.value, stepsStore.allSteps)
  scenarioStore.activeScenarioIndex = 0
  scenarioStore.isDirty = true
  close()
}

/** FR-009: discard — the working feature was never mutated, so just close. */
function onDiscard() {
  close()
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Generate scenario with AI"
    :style="{ width: '640px' }"
    data-testid="ai-generation-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="dialog-content">
      <div class="field">
        <label for="ai-gen-description">Describe the scenario you want to test</label>
        <Textarea
          id="ai-gen-description"
          v-model="description"
          rows="3"
          auto-resize
          placeholder="e.g., A user logs in with valid credentials and lands on the dashboard"
          class="w-full"
          data-testid="ai-gen-description"
          :disabled="aiStore.isStreaming"
        />
        <small class="hint">The assistant drafts Gherkin reusing your existing steps where they match. Every draft is validated before you can accept it.</small>
      </div>

      <div
        v-if="error"
        class="callout error"
        data-testid="ai-gen-error"
      >
        <i class="pi pi-exclamation-triangle" />
        <span>{{ error }}</span>
      </div>

      <!-- Streamed / editable draft -->
      <div
        v-if="phase !== 'input'"
        class="field"
      >
        <div class="label-row">
          <label for="ai-gen-draft">Draft</label>
          <span
            v-if="aiStore.isStreaming"
            class="streaming-badge"
          >
            <i class="pi pi-spin pi-spinner" /> generating…
          </span>
        </div>
        <Textarea
          v-if="phase === 'review'"
          id="ai-gen-draft"
          v-model="draft"
          rows="10"
          class="w-full mono"
          data-testid="ai-gen-draft"
          @input="onDraftEdited"
        />
        <pre
          v-else
          class="draft-stream mono"
          data-testid="ai-gen-stream"
        >{{ aiStore.streamingDraft }}</pre>
      </div>

      <!-- Validation results (FR-008) -->
      <div
        v-if="phase === 'review'"
        class="validation"
        data-testid="ai-gen-validation"
      >
        <span
          v-if="validating"
          class="status"
        ><i class="pi pi-spin pi-spinner" /> Validating…</span>
        <template v-else-if="draftValidation">
          <span
            v-if="validationErrors.length === 0"
            class="status ok"
          ><i class="pi pi-check-circle" /> Valid{{ validationWarnings.length ? ` (${validationWarnings.length} warning${validationWarnings.length > 1 ? 's' : ''})` : '' }}</span>
          <span
            v-else
            class="status fail"
          ><i class="pi pi-times-circle" /> {{ validationErrors.length }} validation error{{ validationErrors.length > 1 ? 's' : '' }}</span>
          <ul
            v-if="draftValidation.issues.length"
            class="issues"
          >
            <li
              v-for="(issue, i) in draftValidation.issues"
              :key="i"
              :class="issue.severity"
            >
              {{ issue.message }}
            </li>
          </ul>
        </template>
        <Button
          v-if="!validated && !validating"
          label="Validate"
          icon="pi pi-check"
          size="small"
          outlined
          data-testid="ai-gen-revalidate"
          @click="validateDraft"
        />
      </div>
    </div>

    <template #footer>
      <!-- Input phase: generate -->
      <template v-if="phase !== 'review'">
        <Button
          v-if="aiStore.isStreaming"
          label="Cancel"
          text
          icon="pi pi-times"
          data-testid="ai-gen-cancel"
          @click="onCancelStream"
        />
        <Button
          v-else
          label="Close"
          text
          @click="close"
        />
        <Button
          label="Generate"
          icon="pi pi-sparkles"
          :disabled="!canGenerate"
          :loading="aiStore.isStreaming"
          data-testid="ai-gen-generate"
          @click="onGenerate"
        />
      </template>

      <!-- Review phase: accept / edit-and-regenerate / discard -->
      <template v-else>
        <Button
          label="Discard"
          text
          severity="secondary"
          data-testid="ai-gen-discard"
          @click="onDiscard"
        />
        <Button
          label="Regenerate"
          text
          icon="pi pi-refresh"
          :disabled="aiStore.isStreaming"
          data-testid="ai-gen-regenerate"
          @click="onGenerate"
        />
        <Button
          label="Accept"
          icon="pi pi-check"
          :disabled="!canAccept"
          data-testid="ai-gen-accept"
          @click="onAccept"
        />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.mono {
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
}

.draft-stream {
  margin: 0;
  padding: 0.75rem;
  min-height: 6rem;
  max-height: 16rem;
  overflow: auto;
  white-space: pre-wrap;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.streaming-badge {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.callout {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
}

.callout.error {
  background: color-mix(in srgb, #dc3545 12%, transparent);
  border: 1px solid #dc3545;
  color: #dc3545;
}

.validation {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status {
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.status.ok {
  color: var(--green-600, #16a34a);
}

.status.fail {
  color: #dc3545;
}

.issues {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
}

.issues .error {
  color: #dc3545;
}

.issues .warning {
  color: var(--yellow-700, #a16207);
}

.w-full {
  width: 100%;
}
</style>
