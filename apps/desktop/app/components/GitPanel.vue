<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useGithubStore } from '~/stores/github'
import { useGitWorkspaceStore } from '~/stores/gitWorkspace'
import { useWorkspaceStore } from '~/stores/workspace'
import type { GitCredentials } from '@suisui/shared'

const githubStore = useGithubStore()
const gitWorkspaceStore = useGitWorkspaceStore()
const workspaceStore = useWorkspaceStore()
const commitMessage = ref('')
const lastMessage = ref<string | null>(null)
const panelError = ref<string | null>(null)
const showCommitDialog = ref(false)
const showAuthDialog = ref(false)
const authUsername = ref('')
const authPassword = ref('')
const pendingAction = ref<'pull' | 'commitAndPush' | null>(null)
let statusPollTimer: ReturnType<typeof setInterval> | null = null

const hasChanges = computed(() => {
  return gitWorkspaceStore.hasChanges
})

const changeCount = computed(() => {
  return gitWorkspaceStore.totalChanges
})

const hasRemote = computed(() => Boolean(gitWorkspaceStore.status?.hasRemote))
const branchName = computed(() => gitWorkspaceStore.status?.branch ?? 'main')

async function refreshWorkspaceGitStatus() {
  const workspacePath = workspaceStore.workspace?.path
  if (!workspacePath) return
  await gitWorkspaceStore.refreshStatus(workspacePath)
}

onMounted(() => {
  void githubStore.loadCredentials()
  void refreshWorkspaceGitStatus()
  statusPollTimer = setInterval(() => {
    void refreshWorkspaceGitStatus()
  }, 2000)
})

onUnmounted(() => {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
})

function getCredentials(): GitCredentials | undefined {
  return githubStore.credentials ?? undefined
}

function closeAuthDialog() {
  showAuthDialog.value = false
  authUsername.value = ''
  authPassword.value = ''
  pendingAction.value = null
}

function showAuthPrompt(action: 'pull' | 'commitAndPush') {
  pendingAction.value = action
  authUsername.value = ''
  authPassword.value = ''
  showAuthDialog.value = true
}

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /authentication failed|check your credentials|requires credentials|401|403/i.test(message)
}

async function pull(credentialsOverride?: GitCredentials) {
  const workspacePath = workspaceStore.workspace?.path
  if (!workspacePath) return

  const credentials = credentialsOverride ?? getCredentials()

  try {
    await gitWorkspaceStore.pull(workspacePath, credentials)
    lastMessage.value = 'Pull completed'
    panelError.value = null
    await refreshWorkspaceGitStatus()
  } catch (err) {
    if (isAuthError(err)) {
      if (credentialsOverride) {
        panelError.value = 'Authentication failed. Check your credentials and retry.'
        return
      }
      showAuthPrompt('pull')
      return
    }
    panelError.value = err instanceof Error ? err.message : 'Pull failed'
  }
}

function openCommitDialog() {
  showCommitDialog.value = true
}

async function commitAndPush() {
  if (!commitMessage.value.trim()) return

  const workspacePath = workspaceStore.workspace?.path
  if (!workspacePath) return

  const credentials = getCredentials()

  try {
    const result = await gitWorkspaceStore.commitAndPush(workspacePath, credentials, {
      message: commitMessage.value,
    })
    lastMessage.value = result.pushed
      ? 'Changes committed and pushed successfully'
      : 'Changes committed successfully'
    panelError.value = null
    await refreshWorkspaceGitStatus()
    commitMessage.value = ''
    showCommitDialog.value = false
  } catch (err) {
    if (isAuthError(err)) {
      showAuthPrompt('commitAndPush')
      return
    }
    panelError.value = err instanceof Error ? err.message : 'Commit & Push failed'
  }
}

async function submitAuthCredentials() {
  if (!authUsername.value.trim() || !authPassword.value.trim() || !pendingAction.value) return
  const creds: GitCredentials = {
    username: authUsername.value.trim(),
    password: authPassword.value.trim(),
  }

  if (pendingAction.value === 'pull') {
    await pull(creds)
  } else {
    const workspacePath = workspaceStore.workspace?.path
    if (!workspacePath) return

    try {
      const result = await gitWorkspaceStore.commitAndPush(workspacePath, creds, {
        message: commitMessage.value,
      })
      lastMessage.value = result.pushed
        ? 'Changes committed and pushed successfully'
        : 'Changes committed successfully'
      panelError.value = null
      await refreshWorkspaceGitStatus()
      commitMessage.value = ''
      showCommitDialog.value = false
    } catch (err) {
      if (isAuthError(err)) {
        panelError.value = 'Authentication failed. Check your credentials and retry.'
        return
      }
      panelError.value = err instanceof Error ? err.message : 'Commit & Push failed'
      return
    }
  }

  if (!panelError.value) {
    try {
      await githubStore.saveCredentials(creds)
    } catch {
      // Keep credential in memory only
      githubStore.credentials = creds
      githubStore.hasCredentials = true
    } finally {
      closeAuthDialog()
    }
  }
}

async function clearCredentials() {
  await githubStore.clearCredentials()
}
</script>

<template>
  <div class="git-panel">
    <!-- Credentials indicator -->
    <div
      v-if="githubStore.hasCredentials"
      class="credentials-info"
    >
      <i class="pi pi-lock" />
      <span class="credentials-label">Credentials saved</span>
      <Button
        icon="pi pi-trash"
        text
        rounded
        size="small"
        title="Clear saved credentials"
        @click="clearCredentials"
      />
    </div>

    <div
      v-if="gitWorkspaceStore.status"
      class="git-status"
    >
      <div class="branch">
        <i class="pi pi-code-branch" />
        {{ branchName }}
      </div>
    </div>

    <div
      v-if="hasChanges"
      class="changes-indicator"
    >
      <i class="pi pi-circle-fill" />
      {{ changeCount }} changes
    </div>

    <div class="git-actions">
      <Button
        v-if="hasRemote"
        label="Pull"
        icon="pi pi-download"
        size="small"
        outlined
        :loading="gitWorkspaceStore.isPulling"
        @click="() => pull()"
      />
      <Button
        :label="hasRemote ? 'Commit & Push' : 'Commit'"
        :icon="hasRemote ? 'pi pi-upload' : 'pi pi-check'"
        size="small"
        :disabled="!hasChanges"
        :loading="gitWorkspaceStore.isCommitting"
        @click="openCommitDialog"
      />
    </div>

    <div
      v-if="panelError"
      class="git-error"
    >
      <i class="pi pi-exclamation-triangle" />
      {{ panelError }}
    </div>

    <div
      v-if="lastMessage"
      class="git-message"
    >
      {{ lastMessage }}
    </div>

    <Dialog
      v-model:visible="showCommitDialog"
      modal
      :header="hasRemote ? 'Commit & Push' : 'Commit'"
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
          :label="hasRemote ? 'Commit & Push' : 'Commit'"
          :icon="hasRemote ? 'pi pi-upload' : 'pi pi-check'"
          :disabled="!commitMessage.trim()"
          :loading="gitWorkspaceStore.isCommitting"
          @click="commitAndPush"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showAuthDialog"
      modal
      header="Credentials Required"
      :style="{ width: '420px' }"
    >
      <div class="auth-dialog">
        <div class="auth-field">
          <label for="auth-username">Username</label>
          <InputText
            id="auth-username"
            v-model="authUsername"
            autocomplete="off"
            placeholder="Username"
          />
        </div>
        <div class="auth-field">
          <label for="auth-password">Password / Token</label>
          <InputText
            id="auth-password"
            v-model="authPassword"
            type="password"
            autocomplete="off"
            placeholder="Password or personal access token"
            @keyup.enter="submitAuthCredentials"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          @click="closeAuthDialog"
        />
        <Button
          label="Retry"
          :disabled="!authUsername.trim() || !authPassword.trim()"
          @click="submitAuthCredentials"
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

.credentials-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.credentials-info i {
  color: #10b981;
}

.credentials-label {
  flex: 1;
  font-weight: 500;
  color: var(--text-color);
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

.auth-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.auth-field label {
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
