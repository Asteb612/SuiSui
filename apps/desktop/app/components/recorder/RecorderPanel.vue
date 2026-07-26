<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import type { StepSourceLocation } from '@suisui/shared'
import { useRecorderStore } from '~/stores/recorder'
import { useScenarioStore } from '~/stores/scenario'
import RecordedActionCard from './RecordedActionCard.vue'
import StepMatchSelector from './StepMatchSelector.vue'
import LocatorCandidateSelector from './LocatorCandidateSelector.vue'
import AssertionPicker from './AssertionPicker.vue'

const props = defineProps<{ visible: boolean; startUrl?: string }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  inserted: [count: number]
  'create-scenario': []
}>()

const recorder = useRecorderStore()
const scenario = useScenarioStore()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
})

const isActive = computed(() => recorder.status === 'recording' || recorder.status === 'paused')

async function start() {
  await recorder.startRecording(props.startUrl ? { startUrl: props.startUrl } : {})
}

async function togglePause() {
  if (recorder.status === 'paused') await recorder.resumeRecording()
  else await recorder.pauseRecording()
}

async function stop() {
  await recorder.stopRecording()
}

function confirm() {
  // With a scenario already open, append to it; otherwise ask the page to create
  // a new named scenario from the recorded steps.
  if (scenario.currentFeaturePath) {
    const count = recorder.insertAcceptedActionsIntoScenario()
    emit('inserted', count)
  } else {
    emit('create-scenario')
  }
  dialogVisible.value = false
}

async function openImplementation(location: StepSourceLocation) {
  await window.api.app.openInEditor(location)
}

async function createStub() {
  const id = recorder.selectedActionId
  if (!id) return
  const stub = recorder.stubRequestFor(id)
  if (stub) await navigator.clipboard.writeText(stub.snippet)
}

onUnmounted(() => {
  if (recorder.sessionId) void recorder.stopRecording()
})
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    header="Record a scenario"
    :style="{ width: '60rem' }"
  >
    <div
      class="controls"
      data-testid="recorder-panel"
    >
      <Button
        v-if="!isActive"
        icon="pi pi-circle-fill"
        severity="danger"
        label="Record"
        data-testid="recorder-start"
        @click="start"
      />
      <template v-else>
        <Button
          :icon="recorder.status === 'paused' ? 'pi pi-play' : 'pi pi-pause'"
          :label="recorder.status === 'paused' ? 'Resume' : 'Pause'"
          @click="togglePause"
        />
        <Button
          icon="pi pi-stop"
          severity="secondary"
          label="Stop"
          data-testid="recorder-stop"
          @click="stop"
        />
      </template>
      <span class="status">{{ recorder.status }}</span>
      <span
        v-if="recorder.browserUrl"
        class="url"
      >{{ recorder.browserUrl }}</span>
    </div>

    <p
      v-if="recorder.error"
      class="error"
    >
      {{ recorder.error }}
    </p>
    <p
      v-if="recorder.gapCount > 0"
      class="gaps"
    >
      {{ recorder.gapCount }} action(s) have no matching step and won't be inserted.
    </p>

    <div
      v-if="recorder.groupingProposal"
      class="grouping"
    >
      <span>Group the login steps into <strong>{{ recorder.groupingProposal.label }}</strong>?</span>
      <span class="grouping-actions">
        <Button
          size="small"
          label="Group"
          icon="pi pi-compress"
          @click="recorder.applyGrouping()"
        />
        <Button
          text
          size="small"
          label="Dismiss"
          @click="recorder.dismissGrouping()"
        />
      </span>
    </div>

    <div class="panes">
      <div
        class="list"
        data-testid="recorder-actions"
      >
        <p
          v-if="recorder.actions.length === 0"
          class="empty"
        >
          Click <strong>Record</strong>, then interact with the opened browser. Actions appear here.
        </p>
        <RecordedActionCard
          v-for="action in recorder.actions"
          :key="action.id"
          :action="action"
          :selected="action.id === recorder.selectedActionId"
          @select="recorder.selectAction(action.id)"
          @remove="recorder.removeAction(action.id)"
          @toggle-disabled="recorder.toggleDisabled(action.id)"
          @move="(dir) => recorder.moveAction(action.id, dir)"
        />
      </div>
      <div class="detail">
        <template v-if="recorder.selectedAction">
          <StepMatchSelector
            :action="recorder.selectedAction"
            @select-match="(id) => recorder.selectStepMatch(recorder.selectedActionId!, id)"
            @open-implementation="openImplementation"
            @create-stub="createStub"
          />
          <LocatorCandidateSelector
            :action="recorder.selectedAction"
            @select-locator="(index) => recorder.selectLocator(recorder.selectedActionId!, index)"
            @highlight="(locator) => recorder.highlightLocator(locator)"
            @pick-element="recorder.pickForRetarget(recorder.selectedActionId!)"
          />
          <div
            v-if="recorder.selectedAction.secret"
            class="secret-rename"
          >
            <label>
              Secret reference
              <input
                :value="recorder.selectedAction.secretRef"
                @change="recorder.renameSecretRef(recorder.selectedActionId!, ($event.target as HTMLInputElement).value)"
              >
            </label>
            <small>The typed value is never stored — only this name is written to the feature.</small>
          </div>
        </template>
        <p
          v-else
          class="empty"
        >
          Select an action to review its matched step.
        </p>
      </div>
    </div>

    <AssertionPicker v-if="isActive" />

    <template #footer>
      <Button
        text
        label="Cancel"
        @click="dialogVisible = false"
      />
      <Button
        :label="scenario.currentFeaturePath ? 'Add to scenario' : 'Create scenario'"
        icon="pi pi-check"
        :disabled="recorder.insertableActions.length === 0"
        data-testid="recorder-confirm"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.status {
  text-transform: capitalize;
  color: var(--p-text-muted-color, #6b7280);
}
.url {
  font-family: var(--p-font-family-mono, monospace);
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #6b7280);
}
.error {
  color: #991b1b;
}
.gaps {
  color: #854d0e;
  font-size: 0.9rem;
}
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  min-height: 18rem;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
  max-height: 24rem;
}
.detail {
  border-left: 1px solid var(--p-content-border-color, #e5e7eb);
  padding-left: 1rem;
}
.empty {
  color: var(--p-text-muted-color, #6b7280);
}
.grouping {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  background: #eef2ff;
  color: #3730a3;
}
.grouping-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.secret-rename {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.secret-rename input {
  margin-left: 0.5rem;
  padding: 0.2rem 0.4rem;
}
.secret-rename small {
  color: var(--p-text-muted-color, #6b7280);
}
</style>
