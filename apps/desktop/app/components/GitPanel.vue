<script setup lang="ts">
import { ref } from 'vue'
import { useGitStore } from '~/stores/git'

const gitStore = useGitStore()
const commitMessage = ref('')
const showCommitDialog = ref(false)

async function pull() {
  await gitStore.pull()
}

function openCommitDialog() {
  showCommitDialog.value = true
}

async function commitAndPush() {
  if (!commitMessage.value.trim()) return
  await gitStore.commitPush(commitMessage.value)
  if (!gitStore.error) {
    commitMessage.value = ''
    showCommitDialog.value = false
  }
}
</script>

<template>
  <div class="git-panel">
    <div v-if="gitStore.status" class="git-status">
      <div class="branch">
        <i class="pi pi-code-branch" />
        {{ gitStore.branchName }}
      </div>
      <div v-if="gitStore.status.ahead > 0 || gitStore.status.behind > 0" class="sync-status">
        <span v-if="gitStore.status.ahead > 0">
          <i class="pi pi-arrow-up" /> {{ gitStore.status.ahead }}
        </span>
        <span v-if="gitStore.status.behind > 0">
          <i class="pi pi-arrow-down" /> {{ gitStore.status.behind }}
        </span>
      </div>
    </div>

    <div v-if="gitStore.hasChanges" class="changes-indicator">
      <i class="pi pi-circle-fill" />
      {{ (gitStore.status?.modified.length ?? 0) + (gitStore.status?.untracked.length ?? 0) }} changes
    </div>

    <div class="git-actions">
      <Button
        label="Pull"
        icon="pi pi-download"
        size="small"
        outlined
        :loading="gitStore.isPulling"
        @click="pull"
      />
      <Button
        label="Commit & Push"
        icon="pi pi-upload"
        size="small"
        :disabled="!gitStore.hasChanges"
        :loading="gitStore.isPushing"
        @click="openCommitDialog"
      />
    </div>

    <div v-if="gitStore.error" class="git-error">
      <i class="pi pi-exclamation-triangle" />
      {{ gitStore.error }}
    </div>

    <div v-if="gitStore.lastMessage" class="git-message">
      {{ gitStore.lastMessage }}
    </div>

    <Dialog
      v-model:visible="showCommitDialog"
      modal
      header="Commit & Push"
      :style="{ width: '400px' }"
    >
      <div class="commit-dialog">
        <label for="commit-message">Commit Message</label>
        <Textarea
          id="commit-message"
          v-model="commitMessage"
          rows="3"
          placeholder="Enter commit message..."
          auto-resize
        />
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          @click="showCommitDialog = false"
        />
        <Button
          label="Commit & Push"
          icon="pi pi-upload"
          :disabled="!commitMessage.trim()"
          :loading="gitStore.isPushing"
          @click="commitAndPush"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border-top: 1px solid var(--surface-border);
  background: var(--surface-ground);
}

.git-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.branch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.sync-status {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.changes-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #f59e0b;
}

.changes-indicator i {
  font-size: 0.5rem;
}

.git-actions {
  display: flex;
  gap: 0.5rem;
}

.git-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #dc3545;
  padding: 0.5rem;
  background: rgba(220, 53, 69, 0.1);
  border-radius: 4px;
}

.git-message {
  font-size: 0.75rem;
  color: #10b981;
  padding: 0.5rem;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 4px;
}

.commit-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.commit-dialog label {
  font-size: 0.875rem;
  font-weight: 500;
}

.commit-dialog :deep(textarea) {
  width: 100%;
}
</style>
