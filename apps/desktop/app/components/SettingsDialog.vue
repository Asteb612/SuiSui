<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
  }
)

async function onSave() {
  saving.value = true
  try {
    await runnerStore.setBaseUrl(baseUrl.value.trim())
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
    :style="{ width: '520px' }"
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
