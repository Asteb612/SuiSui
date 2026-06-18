<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AIProviderType } from '@suisui/shared'
import { useAiStore } from '~/stores/ai'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const aiStore = useAiStore()

const providerOptions: Array<{ label: string; value: AIProviderType }> = [
  { label: 'Local model (Ollama)', value: 'ollama' },
  { label: 'Bring your own key (OpenAI-compatible)', value: 'openai-compatible' },
  { label: 'Claude subscription', value: 'claude-subscription' },
]

const type = ref<AIProviderType | null>(null)
const model = ref('')
const baseUrl = ref('')
const apiKey = ref('')
const hasStoredKey = ref(false)
const saving = ref(false)

const needsBaseUrl = computed(() => type.value === 'ollama' || type.value === 'openai-compatible')
const needsKey = computed(() => type.value === 'openai-compatible')

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    await aiStore.loadConfig()
    type.value = aiStore.config.type
    model.value = aiStore.config.model ?? ''
    baseUrl.value = aiStore.config.baseUrl ?? (aiStore.config.type === 'ollama' ? 'http://127.0.0.1:11434' : '')
    hasStoredKey.value = aiStore.config.hasApiKey
    apiKey.value = ''
    aiStore.status = null
  }
)

watch(type, (next) => {
  if (next === 'ollama' && !baseUrl.value) baseUrl.value = 'http://127.0.0.1:11434'
})

async function onTestConnection() {
  // Persist the current config (and any new key) before testing so the backend uses it.
  await persist()
  await aiStore.refreshStatus()
  // If Ollama returned models and none is selected, default to the first.
  if (!model.value && aiStore.status?.models?.length) {
    model.value = aiStore.status.models[0]!
  }
}

async function persist() {
  if (needsKey.value && apiKey.value.trim()) {
    await aiStore.setKey(apiKey.value.trim())
    hasStoredKey.value = true
    apiKey.value = ''
  }
  await aiStore.saveConfig({
    type: type.value,
    model: model.value.trim() || null,
    baseUrl: needsBaseUrl.value ? baseUrl.value.trim() || null : null,
    hasApiKey: hasStoredKey.value,
  })
}

async function onSave() {
  saving.value = true
  try {
    await persist()
    emit('update:visible', false)
  } finally {
    saving.value = false
  }
}

async function onClearKey() {
  await aiStore.clearKey()
  hasStoredKey.value = false
}

function onDisable() {
  type.value = null
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="AI Settings"
    :style="{ width: '520px' }"
    data-testid="ai-settings-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="dialog-content">
      <div class="field">
        <label for="ai-provider-type">Provider</label>
        <Select
          id="ai-provider-type"
          v-model="type"
          :options="providerOptions"
          option-label="label"
          option-value="value"
          placeholder="No provider (AI disabled)"
          show-clear
          class="w-full"
          data-testid="ai-provider-select"
        />
        <small class="hint">With no provider selected, AI features stay disabled and the rest of the app is unaffected.</small>
      </div>

      <div
        v-if="needsBaseUrl"
        class="field"
      >
        <label for="ai-base-url">Base URL</label>
        <InputText
          id="ai-base-url"
          v-model="baseUrl"
          :placeholder="type === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.example.com/v1'"
          class="w-full"
        />
      </div>

      <div
        v-if="needsKey"
        class="field"
      >
        <label for="ai-api-key">API Key</label>
        <Password
          v-if="!hasStoredKey"
          id="ai-api-key"
          v-model="apiKey"
          :feedback="false"
          toggle-mask
          placeholder="sk-..."
          input-class="w-full"
          class="w-full"
          data-testid="ai-api-key-input"
        />
        <div
          v-else
          class="stored-key"
        >
          <span><i class="pi pi-lock" /> Key stored (encrypted)</span>
          <Button
            label="Clear"
            text
            size="small"
            @click="onClearKey"
          />
        </div>
        <small class="hint">Stored encrypted on this machine. Never exposed to the app's interface.</small>
      </div>

      <div
        v-if="type"
        class="field"
      >
        <label for="ai-model">Model</label>
        <Select
          v-if="aiStore.status?.models?.length"
          id="ai-model"
          v-model="model"
          :options="aiStore.status.models"
          editable
          class="w-full"
        />
        <InputText
          v-else
          id="ai-model"
          v-model="model"
          placeholder="e.g., llama3.2"
          class="w-full"
        />
      </div>

      <div
        v-if="type === 'claude-subscription'"
        class="callout"
      >
        <i class="pi pi-info-circle" />
        <span>Uses your logged-in <code>claude</code> CLI. Ensure <code>ANTHROPIC_API_KEY</code> is unset so the subscription is used, not API billing. Best-effort.</span>
      </div>

      <div
        v-if="type"
        class="status-row"
      >
        <Button
          label="Test connection"
          icon="pi pi-bolt"
          size="small"
          outlined
          :loading="aiStore.isCheckingStatus"
          data-testid="ai-test-connection"
          @click="onTestConnection"
        />
        <span
          v-if="aiStore.status"
          :class="['status', aiStore.status.available ? 'ok' : 'fail']"
        >
          <i :class="aiStore.status.available ? 'pi pi-check-circle' : 'pi pi-times-circle'" />
          {{ aiStore.status.available ? 'Connected' : (aiStore.status.reason ?? 'Unavailable') }}
        </span>
      </div>
    </div>

    <template #footer>
      <Button
        v-if="type"
        label="Disable AI"
        text
        severity="secondary"
        @click="onDisable"
      />
      <Button
        label="Cancel"
        text
        @click="$emit('update:visible', false)"
      />
      <Button
        label="Save"
        icon="pi pi-check"
        :loading="saving"
        data-testid="ai-settings-save"
        @click="onSave"
      />
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

.hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.stored-key {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.875rem;
}

.callout {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

.w-full {
  width: 100%;
}
</style>
