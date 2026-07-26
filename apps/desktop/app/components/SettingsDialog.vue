<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { WorkspaceVariable } from '@suisui/shared'
import { useRunnerStore } from '~/stores/runner'
import { useAiStore } from '~/stores/ai'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'open-ai-settings': []
}>()

const runnerStore = useRunnerStore()
const aiStore = useAiStore()

const baseUrl = ref('')
const variables = ref<WorkspaceVariable[]>([])
const saving = ref(false)

/** The workspace's configured default, shown as a placeholder/hint. */
const workspaceDefault = computed(() => runnerStore.workspaceBaseUrl)

const aiSummary = computed(() =>
  aiStore.isConfigured ? `Configured (${aiStore.config.type ?? 'provider'})` : 'Not configured'
)

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    await runnerStore.loadConfig()
    baseUrl.value = runnerStore.config.baseUrl ?? ''
    variables.value = await window.api.variables.get()
  }
)

function addVariable() {
  variables.value.push({ name: '', value: '', secret: false })
}

function removeVariable(index: number) {
  variables.value.splice(index, 1)
}

async function onSave() {
  saving.value = true
  try {
    await runnerStore.setBaseUrl(baseUrl.value.trim())
    // De-proxy the reactive array so it can cross IPC (structured clone).
    await window.api.variables.set(JSON.parse(JSON.stringify(variables.value)))
    emit('update:visible', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Settings"
    :style="{ width: '760px', maxWidth: '94vw' }"
    data-testid="settings-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="dialog-content">
      <section class="group">
        <h4 class="group-title">
          General
        </h4>
        <div class="field">
          <label for="settings-base-url">Base URL</label>
          <InputText
            id="settings-base-url"
            v-model="baseUrl"
            :placeholder="workspaceDefault || 'https://your-app.example.com'"
            class="w-full"
            data-testid="settings-base-url-input"
          />
          <small class="hint">
            The address the tests and the recorder open.
            <template v-if="workspaceDefault">
              Leave blank to use the workspace default
              (<code>{{ workspaceDefault }}</code>).
            </template>
            <template v-else>
              It is passed to Playwright as <code>BASE_URL</code>.
            </template>
          </small>
        </div>
      </section>

      <section class="group">
        <div class="group-header">
          <h4 class="group-title">
            Variables &amp; Secrets
          </h4>
          <Button
            label="Add"
            icon="pi pi-plus"
            text
            size="small"
            data-testid="settings-add-variable"
            @click="addVariable"
          />
        </div>
        <small class="hint">
          Available to every feature file at run time. Reference one as
          <code>${NAME}</code> in a scenario (recorded secrets already do) and it resolves
          to its value. Secret values are encrypted on disk and never written to a .feature.
        </small>
        <div
          v-if="variables.length === 0"
          class="vars-empty"
        >
          No variables yet.
        </div>
        <div
          v-for="(variable, index) in variables"
          :key="index"
          class="var-row"
          data-testid="variable-row"
        >
          <InputText
            v-model="variable.name"
            placeholder="NAME"
            class="var-name"
            data-testid="variable-name"
          />
          <Password
            v-if="variable.secret"
            v-model="variable.value"
            :feedback="false"
            toggle-mask
            placeholder="value"
            input-class="w-full"
            class="var-value"
            data-testid="variable-value"
          />
          <InputText
            v-else
            v-model="variable.value"
            placeholder="value"
            class="var-value"
            data-testid="variable-value"
          />
          <label
            class="var-secret"
            :title="'Store this value as a secret (encrypted, masked)'"
          >
            <Checkbox
              v-model="variable.secret"
              binary
            />
            Secret
          </label>
          <Button
            icon="pi pi-trash"
            text
            size="small"
            severity="danger"
            aria-label="Remove variable"
            data-testid="variable-remove"
            @click="removeVariable(index)"
          />
        </div>
      </section>

      <section class="group">
        <h4 class="group-title">
          AI Provider
        </h4>
        <div class="ai-row">
          <span class="ai-status">
            <i :class="aiStore.isConfigured ? 'pi pi-check-circle ok' : 'pi pi-minus-circle'" />
            {{ aiSummary }}
          </span>
          <Button
            label="Configure…"
            icon="pi pi-sliders-h"
            size="small"
            outlined
            data-testid="settings-open-ai"
            @click="$emit('open-ai-settings')"
          />
        </div>
        <small class="hint">Optional assistant for drafting and troubleshooting tests. Credentials stay on this machine.</small>
      </section>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        @click="$emit('update:visible', false)"
      />
      <Button
        label="Save"
        icon="pi pi-check"
        :loading="saving"
        data-testid="settings-save"
        @click="onSave"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  /* Cap the body height so a long variables list scrolls instead of overflowing the
     dialog; short content stays compact (content-driven, not a fixed height). */
  max-height: 68vh;
  overflow-y: auto;
  /* Keep the scrollbar from crowding the inputs. */
  padding-right: 0.5rem;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.group-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color-secondary);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.vars-empty {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  font-style: italic;
}

.var-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.var-name {
  flex: 0 0 34%;
  font-family: var(--font-family-mono, monospace);
}

.var-value {
  flex: 1;
  min-width: 0;
}

.var-secret {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  white-space: nowrap;
  color: var(--text-color-secondary);
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

.hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.ai-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.ai-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
}

.ai-status .ok {
  color: var(--green-600, #16a34a);
}

.w-full {
  width: 100%;
}
</style>
