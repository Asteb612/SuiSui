<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  create: [data: { name: string; fileName: string }]
}>()

const scenarioName = ref('')
const customFileName = ref('')
const useCustomFileName = ref(false)

const suggestedFileName = computed(() => {
  if (!scenarioName.value.trim()) return ''
  return scenarioName.value.trim().toLowerCase().replace(/\s+/g, '-') + '.feature'
})

const fileName = computed(() => {
  return useCustomFileName.value ? customFileName.value : suggestedFileName.value
})

const isValid = computed(() => {
  return scenarioName.value.trim() !== '' && fileName.value.endsWith('.feature')
})

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      reset()
    }
  }
)

function reset() {
  scenarioName.value = ''
  customFileName.value = ''
  useCustomFileName.value = false
}

function onCreate() {
  if (!isValid.value) return
  emit('create', { name: scenarioName.value.trim(), fileName: fileName.value })
  emit('update:visible', false)
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="New Scenario"
    :style="{ width: '450px' }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="dialog-content">
      <div class="field">
        <label for="scenario-name-input">Scenario Name</label>
        <InputText
          id="scenario-name-input"
          v-model="scenarioName"
          placeholder="e.g., User Login"
          class="w-full"
          autofocus
          data-testid="new-scenario-name-input"
          @keyup.enter="onCreate"
        />
      </div>

      <div class="field">
        <div class="filename-header">
          <label>File Name</label>
          <div class="custom-toggle">
            <Checkbox
              v-model="useCustomFileName"
              input-id="custom-filename"
              binary
            />
            <label
              for="custom-filename"
              class="toggle-label"
            >Custom</label>
          </div>
        </div>
        <InputText
          v-if="useCustomFileName"
          v-model="customFileName"
          placeholder="custom-name.feature"
          class="w-full"
          data-testid="custom-filename-input"
        />
        <div
          v-else
          class="suggested-filename"
        >
          <i class="pi pi-file" />
          <span>{{ suggestedFileName || 'Enter a scenario name...' }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        @click="onCancel"
      />
      <Button
        label="Create"
        icon="pi pi-plus"
        :disabled="!isValid"
        data-testid="create-scenario-button"
        @click="onCreate"
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

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.filename-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.custom-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-label {
  font-size: 0.75rem;
  cursor: pointer;
}

.suggested-filename {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.suggested-filename i {
  color: var(--primary-color);
}

.w-full {
  width: 100%;
}
</style>
