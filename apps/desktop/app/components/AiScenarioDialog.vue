<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Scenario, ScenarioDraft, DraftApplyMode, StepDefinition } from '@suisui/shared'
import { resolvePattern } from '@suisui/shared'
import { useAiStore } from '~/stores/ai'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'

/**
 * Draft a scenario from a description, using only the workspace's steps
 * (feature 012).
 *
 * Nothing here mutates the scenario until the tester accepts (FR-012). A
 * redraft — the only destructive outcome — needs its own confirmation, distinct
 * from accepting an extend (FR-027).
 */

const props = defineProps<{
  visible: boolean
  /** Scenario text sent as context when generating against an existing scenario. */
  scenarioText?: string | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  applied: [mode: DraftApplyMode]
}>()

const aiStore = useAiStore()
const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()

const description = ref('')
const requirementRef = ref('')
const confirmingRedraft = ref(false)

const outcome = computed(() => aiStore.scenarioOutcome)
const isStreaming = computed(() => aiStore.isStreaming)

const availableSteps = computed<StepDefinition[]>(() => stepsStore.allSteps)

const activeScenario = computed(() => scenarioStore.scenarios[scenarioStore.activeScenarioIndex])
const existingSteps = computed(() => activeScenario.value?.steps ?? [])

/** The extend/redraft choice is meaningless with nothing to preserve (FR-028). */
const showModeChoice = computed(() => existingSteps.value.length > 0)

const drafts = computed<ScenarioDraft[]>(() =>
  outcome.value?.status === 'drafted' ? outcome.value.scenarios : [],
)

/** Per-draft keep/discard, so several proposals can be triaged independently (FR-019). */
const kept = ref<boolean[]>([])
watch(drafts, (list) => {
  kept.value = list.map(() => true)
})

const keptDrafts = computed(() => drafts.value.filter((_, i) => kept.value[i] !== false))

const canGenerate = computed(
  () => description.value.trim().length > 0 && !isStreaming.value && availableSteps.value.length > 0,
)

const canAccept = computed(() => keptDrafts.value.length > 0 && !isStreaming.value)

/** Steps that would be lost if a redraft is accepted (FR-026). */
const stepsLostToRedraft = computed(() =>
  aiStore.applyMode === 'redraft' ? existingSteps.value : [],
)

/**
 * A requirement reference already recorded on this scenario. Shown alongside a
 * newly-supplied one so an existing link is never silently replaced or
 * duplicated (spec edge case).
 */
const existingRequirement = computed(() =>
  (activeScenario.value?.comments ?? []).find((c) => c.startsWith('# Requirement:')) ?? null,
)

const requirementConflict = computed(() => {
  const supplied = requirementRef.value.trim()
  if (!supplied || !existingRequirement.value) return false
  return existingRequirement.value !== `# Requirement: ${supplied}`
})

watch(
  () => props.visible,
  (visible) => {
    if (visible) reset()
    else aiStore.clearScenarioOutcome()
  },
)

function reset() {
  description.value = ''
  requirementRef.value = ''
  confirmingRedraft.value = false
  aiStore.applyMode = 'extend'
  aiStore.clearScenarioOutcome()
}

function stepText(step: { pattern: string; args: { name: string; type: string; value: string }[] }) {
  return resolvePattern(step.pattern, step.args as never)
}

async function onGenerate() {
  if (!canGenerate.value) return
  confirmingRedraft.value = false

  const result = await aiStore.generateScenario(description.value.trim(), availableSteps.value, {
    scenarioText: props.scenarioText ?? null,
    requirementRef: requirementRef.value.trim() || null,
  })

  if (result?.status === 'drafted') await validateDrafts(result.scenarios)
}

/**
 * Validate each draft before it can be accepted (FR-015).
 *
 * Validates a CANDIDATE scenario built for the purpose — never
 * `scenarioStore.validate()`, which would mean mutating the tester's scenario
 * to find out whether the draft is any good.
 */
async function validateDrafts(list: ScenarioDraft[]) {
  for (const draft of list) {
    const candidate: Scenario = {
      name: draft.name,
      tags: [...draft.tags],
      steps: draft.steps.map((s, i) => ({
        id: `draft-${i}`,
        keyword: s.keyword,
        pattern: s.pattern,
        args: s.args.map((a) => ({ name: a.name, type: a.type, value: a.value })),
      })),
    }
    try {
      draft.validation = await window.api.validate.scenario(candidate)
    } catch {
      draft.validation = null
    }
  }
}

function onCancelGeneration() {
  aiStore.cancelScenarioGeneration()
}

function onAccept() {
  if (!canAccept.value) return

  if (aiStore.applyMode === 'redraft' && !confirmingRedraft.value) {
    confirmingRedraft.value = true
    return
  }

  const list = keptDrafts.value
  list.forEach((draft, index) => {
    if (requirementRef.value.trim()) draft.requirementRef = requirementRef.value.trim()
    // Only the first draft can replace; the rest always extend, so a multi-draft
    // accept can never silently discard the ones before it.
    scenarioStore.applyDraft(draft, index === 0 ? aiStore.applyMode : 'extend')
  })

  emit('applied', aiStore.applyMode)
  emit('update:visible', false)
}

function onDiscard() {
  aiStore.clearScenarioOutcome()
  confirmingRedraft.value = false
}

function onClose() {
  if (isStreaming.value) aiStore.cancelScenarioGeneration()
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Generate scenario with AI"
    :style="{ width: '720px' }"
    data-testid="ai-scenario-dialog"
    @update:visible="onClose"
  >
    <div class="dialog-content">
      <Message
        v-if="availableSteps.length === 0"
        severity="warn"
        :closable="false"
        data-testid="ai-scenario-no-steps"
      >
        This workspace has no steps yet, so there is nothing to build a scenario from.
      </Message>

      <template v-else>
        <div class="field">
          <label for="ai-scenario-description">
            Describe what you want to test, or paste acceptance criteria
          </label>
          <Textarea
            id="ai-scenario-description"
            v-model="description"
            rows="4"
            class="w-full"
            autofocus
            placeholder="A logged-in customer adds two items to the basket and checks out"
            data-testid="ai-scenario-description"
          />
          <small class="hint">
            Only steps that already exist in this workspace will be used.
          </small>
        </div>

        <div class="field">
          <label for="ai-scenario-requirement">Requirement reference (optional)</label>
          <InputText
            id="ai-scenario-requirement"
            v-model="requirementRef"
            class="w-full"
            placeholder="https://github.com/org/repo/issues/102"
            data-testid="ai-scenario-requirement"
          />
          <Message
            v-if="requirementConflict"
            severity="warn"
            :closable="false"
            data-testid="ai-scenario-requirement-conflict"
          >
            This scenario already records <code>{{ existingRequirement }}</code>. Accepting adds
            yours as a second line; neither is removed.
          </Message>
        </div>

        <div
          v-if="showModeChoice"
          class="field mode-choice"
          data-testid="ai-scenario-mode"
        >
          <label>This scenario already has steps</label>
          <div class="mode-options">
            <div class="mode-option">
              <RadioButton
                v-model="aiStore.applyMode"
                input-id="mode-extend"
                value="extend"
                data-testid="ai-scenario-mode-extend"
              />
              <label for="mode-extend">
                <strong>Add to it</strong>
                <span>Keeps every step you already have</span>
              </label>
            </div>
            <div class="mode-option">
              <RadioButton
                v-model="aiStore.applyMode"
                input-id="mode-redraft"
                value="redraft"
                data-testid="ai-scenario-mode-redraft"
              />
              <label for="mode-redraft">
                <strong>Start over</strong>
                <span>Replaces the {{ existingSteps.length }} step(s) below</span>
              </label>
            </div>
          </div>
        </div>

        <div
          v-if="isStreaming"
          class="streaming"
          data-testid="ai-scenario-streaming"
        >
          <ProgressSpinner style="width: 24px; height: 24px" />
          <span>Assembling a draft from your steps…</span>
          <Button
            label="Cancel"
            text
            size="small"
            data-testid="ai-scenario-cancel-generation"
            @click="onCancelGeneration"
          />
        </div>

        <Message
          v-if="outcome?.status === 'failed'"
          severity="error"
          :closable="false"
          data-testid="ai-scenario-failed"
        >
          {{ outcome.message }}
        </Message>

        <Message
          v-if="outcome?.status === 'empty'"
          severity="info"
          :closable="false"
          data-testid="ai-scenario-empty"
        >
          {{ outcome.reason }}
        </Message>

        <Message
          v-if="outcome?.status === 'drafted' && outcome.truncated"
          severity="info"
          :closable="false"
          data-testid="ai-scenario-truncated"
        >
          This workspace has more steps than fit in one request, so the draft was built from
          the most relevant ones. A step you expected may not have been considered.
        </Message>

        <div
          v-if="stepsLostToRedraft.length > 0 && drafts.length > 0"
          class="losing"
          data-testid="ai-scenario-losing"
        >
          <h4>These steps would be replaced</h4>
          <ol>
            <li
              v-for="step in stepsLostToRedraft"
              :key="step.id"
              class="lost-step"
            >
              <span class="keyword">{{ step.keyword }}</span>
              <span>{{ stepText(step) }}</span>
            </li>
          </ol>
        </div>

        <div
          v-for="(draft, index) in drafts"
          :key="index"
          class="draft"
          data-testid="ai-scenario-draft"
        >
          <div class="draft-header">
            <Checkbox
              v-model="kept[index]"
              :input-id="`keep-draft-${index}`"
              binary
              data-testid="ai-scenario-keep-draft"
            />
            <label :for="`keep-draft-${index}`">
              <strong>{{ draft.name || 'Untitled scenario' }}</strong>
            </label>
            <Tag
              v-for="tag in draft.tags"
              :key="tag"
              :value="`@${tag}`"
              severity="secondary"
            />
          </div>

          <ol class="draft-steps">
            <li
              v-for="(step, si) in draft.steps"
              :key="si"
              data-testid="ai-scenario-step"
            >
              <span class="keyword">{{ step.keyword }}</span>
              <span class="text">{{ stepText(step) }}</span>
              <Tag
                :value="step.tier === 'generic' ? 'generic' : 'project'"
                :severity="step.tier === 'generic' ? 'secondary' : 'success'"
                data-testid="ai-scenario-step-tier"
              />
              <Tag
                v-if="step.unresolvedArgs.length > 0"
                :value="`needs: ${step.unresolvedArgs.join(', ')}`"
                severity="warn"
                data-testid="ai-scenario-step-unresolved"
              />
            </li>
          </ol>

          <div
            v-if="draft.gaps.length > 0"
            class="gaps"
            data-testid="ai-scenario-gaps"
          >
            <h4>Not covered by your steps</h4>
            <ul>
              <li
                v-for="(gap, gi) in draft.gaps"
                :key="gi"
              >
                {{ gap.text }}
              </li>
            </ul>
            <small>No step was invented for these. Ask a developer for a step definition.</small>
          </div>

          <div
            v-if="draft.dropped.length > 0"
            class="dropped"
            data-testid="ai-scenario-dropped"
          >
            <h4>Discarded suggestions</h4>
            <ul>
              <li
                v-for="(d, di) in draft.dropped"
                :key="di"
              >
                {{ d.raw }} <em>({{ d.reason }})</em>
              </li>
            </ul>
          </div>

          <Message
            v-if="draft.validation && !draft.validation.isValid"
            severity="warn"
            :closable="false"
            data-testid="ai-scenario-validation"
          >
            <ul class="validation-issues">
              <li
                v-for="(issue, ii) in draft.validation.issues"
                :key="ii"
              >
                {{ issue.message }}
              </li>
            </ul>
          </Message>
        </div>

        <Message
          v-if="confirmingRedraft"
          severity="error"
          :closable="false"
          data-testid="ai-scenario-redraft-confirm"
        >
          This replaces the {{ existingSteps.length }} step(s) already in this scenario.
          There is no undo. Press <strong>Replace scenario</strong> again to confirm.
        </Message>
      </template>
    </div>

    <template #footer>
      <Button
        label="Close"
        text
        data-testid="ai-scenario-close"
        @click="onClose"
      />
      <Button
        v-if="drafts.length > 0"
        label="Discard draft"
        text
        severity="secondary"
        data-testid="ai-scenario-discard"
        @click="onDiscard"
      />
      <Button
        :label="drafts.length > 0 ? 'Regenerate' : 'Generate'"
        icon="pi pi-sparkles"
        :disabled="!canGenerate"
        outlined
        data-testid="ai-scenario-generate"
        @click="onGenerate"
      />
      <Button
        v-if="drafts.length > 0"
        :label="aiStore.applyMode === 'redraft' ? (confirmingRedraft ? 'Yes, replace scenario' : 'Replace scenario') : 'Add to scenario'"
        :severity="aiStore.applyMode === 'redraft' ? 'danger' : undefined"
        icon="pi pi-check"
        :disabled="!canAccept"
        data-testid="ai-scenario-accept"
        @click="onAccept"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.hint {
  color: var(--p-text-muted-color);
}

.mode-options {
  display: flex;
  gap: 1.5rem;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.mode-option label {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.mode-option span {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.streaming {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.draft {
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.draft-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.draft-steps,
.losing ol {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding-left: 1.25rem;
}

.draft-steps li,
.lost-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.keyword {
  font-weight: 600;
  min-width: 3.5rem;
}

.losing {
  border-left: 3px solid var(--p-red-500);
  padding-left: 0.75rem;
}

.lost-step {
  text-decoration: line-through;
  opacity: 0.7;
}

.gaps h4,
.dropped h4,
.losing h4 {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
}

.gaps {
  border-left: 3px solid var(--p-orange-500);
  padding-left: 0.75rem;
}

.dropped {
  border-left: 3px solid var(--p-surface-400);
  padding-left: 0.75rem;
  font-size: 0.85rem;
}

.validation-issues {
  margin: 0;
  padding-left: 1rem;
}
</style>
