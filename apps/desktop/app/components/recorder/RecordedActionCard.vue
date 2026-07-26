<script setup lang="ts">
import { computed } from 'vue'
import type { RecordedAction } from '@suisui/shared'

const props = defineProps<{ action: RecordedAction; selected: boolean }>()
const emit = defineEmits<{
  select: []
  remove: []
  toggleDisabled: []
  move: [dir: -1 | 1]
}>()

const statusLabel = computed(() => {
  switch (props.action.status) {
    case 'matched':
      return 'Matched'
    case 'needs-review':
      return 'Needs review'
    case 'gap':
      return 'No step'
    case 'accepted':
      return 'Added'
    default:
      return 'Draft'
  }
})
</script>

<template>
  <div
    class="recorded-action-card"
    :class="{ selected, disabled: action.disabled, [`status-${action.status}`]: true }"
    data-testid="recorded-action"
    @click="emit('select')"
  >
    <div class="body">
      <span class="seq">{{ action.seq + 1 }}</span>
      <span class="label">{{ action.label }}</span>
      <span
        v-if="action.secret"
        class="secret"
        data-testid="secret-chip"
        :title="`Protected — committed as ${action.secretRef}`"
      >🔒 {{ action.secretRef }}</span>
      <span
        class="status"
        :class="`status-${action.status}`"
      >{{ statusLabel }}</span>
    </div>
    <div
      class="actions"
      @click.stop
    >
      <Button
        text
        rounded
        size="small"
        icon="pi pi-arrow-up"
        aria-label="Move up"
        @click="emit('move', -1)"
      />
      <Button
        text
        rounded
        size="small"
        icon="pi pi-arrow-down"
        aria-label="Move down"
        @click="emit('move', 1)"
      />
      <Button
        text
        rounded
        size="small"
        :icon="action.disabled ? 'pi pi-eye-slash' : 'pi pi-eye'"
        :aria-label="action.disabled ? 'Enable' : 'Disable'"
        @click="emit('toggleDisabled')"
      />
      <Button
        text
        rounded
        severity="danger"
        size="small"
        icon="pi pi-trash"
        aria-label="Delete"
        @click="emit('remove')"
      />
    </div>
  </div>
</template>

<style scoped>
.recorded-action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
}
.recorded-action-card.selected {
  border-color: var(--p-primary-color, #3b82f6);
  background: var(--p-highlight-background, rgba(59, 130, 246, 0.08));
}
.recorded-action-card.disabled {
  opacity: 0.5;
}
.body {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.seq {
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color, #6b7280);
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.secret {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  white-space: nowrap;
}
.status {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
}
.status.status-matched,
.status.status-accepted {
  background: #dcfce7;
  color: #166534;
}
.status.status-needs-review {
  background: #fef9c3;
  color: #854d0e;
}
.status.status-gap {
  background: #fee2e2;
  color: #991b1b;
}
.actions {
  display: flex;
  gap: 0.1rem;
}
</style>
