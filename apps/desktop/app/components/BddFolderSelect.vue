<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  candidates: string[]
  gitRoot: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'selected': [path: string]
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

function relativePath(candidate: string): string {
  if (props.gitRoot && candidate.startsWith(props.gitRoot)) {
    return candidate.slice(props.gitRoot.length + 1) || candidate
  }
  return candidate.split('/').pop() || candidate
}

function select(candidate: string) {
  emit('selected', candidate)
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    header="Select BDD Workspace"
    :style="{ width: '480px' }"
    :closable="false"
  >
    <div class="bdd-select">
      <p class="bdd-hint">
        Multiple BDD test directories were found. Select which one to use as your workspace:
      </p>
      <div class="candidate-list">
        <Button
          v-for="candidate in candidates"
          :key="candidate"
          class="candidate-btn"
          outlined
          @click="select(candidate)"
        >
          <i class="pi pi-folder" />
          <span class="candidate-path">{{ relativePath(candidate) }}</span>
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.bdd-select {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.bdd-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.candidate-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: flex-start;
  text-align: left;
  width: 100%;
}

.candidate-path {
  font-family: monospace;
  font-size: 0.875rem;
}
</style>
