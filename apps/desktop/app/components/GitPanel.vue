<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useGithubStore } from '~/stores/github'
import { useGitWorkspaceStore } from '~/stores/gitWorkspace'
import { useWorkspaceStore } from '~/stores/workspace'

const githubStore = useGithubStore()
const gitWorkspaceStore = useGitWorkspaceStore()
const workspaceStore = useWorkspaceStore()
const commitMessage = ref('')
const lastMessage = ref<string | null>(null)
const panelError = ref<string | null>(null)
const showCommitDialog = ref(false)
const showAuthDialog = ref(false)
const authSecret = ref('')
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

async function getGithubToken(): Promise<string | null> {
  try {
    return githubStore.token ?? (await window.api.github.getToken())
  } catch {
    return null
  }
}

function closeAuthDialog() {
  showAuthDialog.value = false
  authSecret.value = ''
  pendingAction.value = null
}

function showAuthPrompt(action: 'pull' | 'commitAndPush') {
  pendingAction.value = action
  authSecret.value = ''
  showAuthDialog.value = true
}

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /authentication failed|check your github token|requires credentials|401|403/i.test(message)
}

async function pull(tokenOverride?: string) {
  const workspacePath = workspaceStore.workspace?.path
  if (!workspacePath) return

  const token = tokenOverride ?? (await getGithubToken()) ?? undefined

  try {
    await gitWorkspaceStore.pull(workspacePath, token)
    lastMessage.value = 'Pull completed'
    panelError.value = null
    await refreshWorkspaceGitStatus()
  } catch (err) {
    if (isAuthError(err)) {
      if (tokenOverride) {
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

  const token = await getGithubToken()

  try {
    const result = await gitWorkspaceStore.commitAndPush(workspacePath, token ?? undefined, {
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

async function submitAuthSecret() {
  if (!authSecret.value.trim() || !pendingAction.value) return
  const secret = authSecret.value.trim()

  if (pendingAction.value === 'pull') {
    await pull(secret)
  } else {
    const workspacePath = workspaceStore.workspace?.path
    if (!workspacePath) return

    try {
      const result = await gitWorkspaceStore.commitAndPush(workspacePath, secret, {
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
      await window.api.github.saveToken(secret)
      githubStore.token = secret
      if (!githubStore.isConnected) {
        const user = await window.api.github.validateToken(secret)
        githubStore.user = user
        githubStore.isConnected = true
      }
    } catch {
      // Keep credential in memory only if token validation/save fails
      githubStore.token = secret
    } finally {
      closeAuthDialog()
    }
  }
}

async function disconnectGithub() {
  await githubStore.disconnect()
}
</script>

<template>
  <div class="git-panel">
    <!-- GitHub connected user -->
    <div
      v-if="githubStore.isConnected && githubStore.user"
      class="github-user"
    >
      <img
        :src="githubStore.user.avatarUrl"
        :alt="githubStore.user.login"
        class="github-avatar"
      >
      <span class="github-login">{{ githubStore.user.login }}</span>
      <Button
        icon="pi pi-sign-out"
        text
        rounded
        size="small"
        title="Disconnect from GitHub"
        @click="disconnectGithub"
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
      <div class="commit-dialog">
        <label for="auth-secret">Token / Passphrase</label>
        <InputText
          id="auth-secret"
          v-model="authSecret"
          type="password"
          autocomplete="off"
          placeholder="Enter token or passphrase"
          @keyup.enter="submitAuthSecret"
        />
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          @click="closeAuthDialog"
        />
        <Button
          label="Retry"
          :disabled="!authSecret.trim()"
          @click="submitAuthSecret"
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

.github-user {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.github-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.github-login {
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
