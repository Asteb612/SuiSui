<script setup lang="ts">
import { ref } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import type { TrashEntry } from '@suisui/shared'

const visible = defineModel<boolean>('visible', { default: false })

const workspaceStore = useWorkspaceStore()

const actionError = ref<string | null>(null)
const busyId = ref<string | null>(null)
const showEmptyConfirm = ref(false)

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

async function restore(entry: TrashEntry) {
  actionError.value = null
  busyId.value = entry.id
  try {
    await workspaceStore.restoreFromTrash(entry.id)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to restore item'
  } finally {
    busyId.value = null
  }
}

async function remove(entry: TrashEntry) {
  actionError.value = null
  busyId.value = entry.id
  try {
    await workspaceStore.deleteFromTrash(entry.id)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to delete item'
  } finally {
    busyId.value = null
  }
}

async function confirmEmpty() {
  actionError.value = null
  try {
    await workspaceStore.emptyTrash()
    showEmptyConfirm.value = false
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to empty trash'
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Recently Deleted"
    :modal="true"
    :closable="true"
    :style="{ width: '600px' }"
    data-testid="trash-dialog"
  >
    <div class="trash-content">
      <div
        v-if="actionError"
        class="trash-error"
      >
        <i class="pi pi-exclamation-triangle" />
        <span>{{ actionError }}</span>
      </div>

      <div
        v-if="workspaceStore.trashItems.length === 0"
        class="trash-empty"
        data-testid="trash-empty"
      >
        <i class="pi pi-trash" />
        <p>Trash is empty</p>
      </div>

      <ul
        v-else
        class="trash-list"
      >
        <li
          v-for="entry in workspaceStore.trashItems"
          :key="entry.id"
          class="trash-item"
          data-testid="trash-item"
        >
          <i :class="entry.type === 'folder' ? 'pi pi-folder' : 'pi pi-file'" />
          <div class="trash-item-info">
            <span class="trash-item-name">{{ entry.name }}</span>
            <span class="trash-item-meta">{{ entry.originalPath }} · {{ formatDate(entry.deletedAt) }}</span>
          </div>
          <div class="trash-item-actions">
            <Button
              label="Restore"
              icon="pi pi-undo"
              text
              size="small"
              :loading="busyId === entry.id"
              data-testid="trash-restore-btn"
              @click="restore(entry)"
            />
            <Button
              icon="pi pi-times"
              text
              rounded
              size="small"
              severity="danger"
              title="Delete permanently"
              :loading="busyId === entry.id"
              data-testid="trash-delete-btn"
              @click="remove(entry)"
            />
          </div>
        </li>
      </ul>
    </div>

    <template #footer>
      <Button
        v-if="workspaceStore.trashItems.length > 0"
        label="Empty Trash"
        icon="pi pi-trash"
        severity="danger"
        outlined
        data-testid="empty-trash-btn"
        @click="showEmptyConfirm = true"
      />
      <Button
        label="Close"
        text
        @click="visible = false"
      />
    </template>
  </Dialog>

  <!-- Empty trash confirmation -->
  <Dialog
    v-model:visible="showEmptyConfirm"
    header="Empty Trash"
    :modal="true"
    :closable="true"
  >
    <div class="confirm-content">
      <i class="pi pi-exclamation-triangle warning-icon" />
      <p>Permanently delete all items in the trash?</p>
      <p class="warning-text">
        This action cannot be undone.
      </p>
    </div>
    <template #footer>
      <Button
        label="Cancel"
        text
        @click="showEmptyConfirm = false"
      />
      <Button
        label="Empty Trash"
        severity="danger"
        data-testid="confirm-empty-trash-btn"
        @click="confirmEmpty"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.trash-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
  max-height: 60vh;
  overflow-y: auto;
}

.trash-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 6px;
  color: #dc3545;
  font-size: 0.875rem;
}

.trash-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  color: var(--text-color-secondary);
  gap: 1rem;
}

.trash-empty i {
  font-size: 3rem;
  opacity: 0.5;
}

.trash-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.trash-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.trash-item > i {
  font-size: 1.125rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.trash-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.trash-item-name {
  font-weight: 500;
  color: var(--text-color);
}

.trash-item-meta {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-item-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.confirm-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  text-align: center;
}

.warning-icon {
  font-size: 2rem;
  color: var(--warn-color);
}

.warning-text {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}
</style>
