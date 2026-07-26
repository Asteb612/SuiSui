<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { validateGitHubToken } from '@suisui/shared'
import { useGithubStore } from '~/stores/gitCredentials'
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
const authToken = ref('')
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

// Auth token validation
const authTokenValidation = computed(() => validateGitHubToken(authToken.value))
const authTokenError = computed(() => {
  if (authToken.value.trim() === '') return null
  return authTokenValidation.value.valid ? null : authTokenValidation.value.error
})
const canSubmitAuth = computed(() => {
  const trimmed = authToken.value.trim()
  return trimmed !== '' && authTokenValidation.value.valid
})

const gitRoot = computed(() => workspaceStore.workspace?.gitRoot ?? workspaceStore.workspace?.path ?? null)

async function refreshWorkspaceGitStatus() {
  if (!gitRoot.value) return
  await gitWorkspaceStore.refreshStatus(gitRoot.value)
}

// --- Branch management ---
const branches = ref<string[]>([])
const branchMenuRef = ref()
const showNewBranchDialog = ref(false)
const newBranchName = ref('')

async function loadBranches() {
  if (!gitRoot.value) return
  try {
    const result = await gitWorkspaceStore.listBranches(gitRoot.value)
    branches.value = result.branches
  } catch (err) {
    panelError.value = err instanceof Error ? err.message : 'Failed to list branches'
  }
}

const branchMenuItems = computed(() => {
  const items: Array<Record<string, unknown>> = branches.value.map((b) => ({
    label: b,
    icon: b === branchName.value ? 'pi pi-check' : 'pi pi-code-branch',
    command: () => void switchBranch(b),
  }))
  items.push({ separator: true })
  items.push({ label: 'Create new branch…', icon: 'pi pi-plus', command: () => openNewBranchDialog() })
  return items
})

function openBranchMenu(event: MouseEvent) {
  // Toggle synchronously so PrimeVue can position against the live event target
  // (after an await, event.currentTarget is null → the menu jumps to the corner).
  // Branches are (re)loaded in the background; the menu model is reactive.
  branchMenuRef.value?.toggle(event)
  void loadBranches()
}

async function switchBranch(branch: string) {
  if (!gitRoot.value || branch === branchName.value) return
  try {
    await gitWorkspaceStore.checkoutBranch(gitRoot.value, branch)
    lastMessage.value = `Switched to branch "${branch}"`
    panelError.value = null
  } catch (err) {
    panelError.value = err instanceof Error ? err.message : 'Failed to switch branch'
  }
}

function openNewBranchDialog() {
  newBranchName.value = ''
  showNewBranchDialog.value = true
}

async function confirmNewBranch() {
  const name = newBranchName.value.trim()
  if (!name || !gitRoot.value) return
  try {
    await gitWorkspaceStore.createBranch(gitRoot.value, name)
    lastMessage.value = `Created and switched to branch "${name}"`
    panelError.value = null
    showNewBranchDialog.value = false
  } catch (err) {
    panelError.value = err instanceof Error ? err.message : 'Failed to create branch'
  }
}

// Reload credentials when workspace changes
watch(
  () => workspaceStore.workspace?.path,
  (newPath) => {
    if (newPath) {
      void githubStore.loadCredentials(newPath)
    }
  }
)

onMounted(() => {
  const workspacePath = workspaceStore.workspace?.path
  if (workspacePath) {
    void githubStore.loadCredentials(workspacePath)
  }
  void refreshWorkspaceGitStatus()
  void loadBranches()
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
  authToken.value = ''
  pendingAction.value = null
}

function showAuthPrompt(action: 'pull' | 'commitAndPush') {
  pendingAction.value = action
  authToken.value = ''
  showAuthDialog.value = true
}

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /authentication failed|check your credentials|requires credentials|401|403/i.test(message)
}

async function pull(credentialsOverride?: GitCredentials) {
  const gitRoot = workspaceStore.workspace?.gitRoot ?? workspaceStore.workspace?.path
  if (!gitRoot) return

  const credentials = credentialsOverride ?? getCredentials()

  try {
    await gitWorkspaceStore.pull(gitRoot, credentials)
    lastMessage.value = 'Pull completed'
    panelError.value = null
    await refreshWorkspaceGitStatus()
  } catch (err) {
    if (isAuthError(err)) {
      if (credentialsOverride) {
        panelError.value = 'Authentication failed. Check your token and retry.'
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

  const gitRoot = workspaceStore.workspace?.gitRoot ?? workspaceStore.workspace?.path
  if (!gitRoot) return

  const credentials = getCredentials()

  try {
    const result = await gitWorkspaceStore.commitAndPush(gitRoot, credentials, {
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
  if (!canSubmitAuth.value || !pendingAction.value) return
  const trimmedToken = authToken.value.trim()
  const creds: GitCredentials = { token: trimmedToken }

  const workspacePath = workspaceStore.workspace?.path
  if (!workspacePath) return

  if (pendingAction.value === 'pull') {
    await pull(creds)
  } else {
    const gitRoot = workspaceStore.workspace?.gitRoot ?? workspaceStore.workspace?.path
    if (!gitRoot) return

    try {
      const result = await gitWorkspaceStore.commitAndPush(gitRoot, creds, {
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
        panelError.value = 'Authentication failed. Check your token and retry.'
        return
      }
      panelError.value = err instanceof Error ? err.message : 'Commit & Push failed'
      return
    }
  }

  if (!panelError.value) {
    try {
      await githubStore.saveCredentials(workspacePath, creds)
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
  const workspacePath = workspaceStore.workspace?.path
  if (workspacePath) {
    await githubStore.clearCredentials(workspacePath)
  }
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
      <span class="credentials-label">Token saved</span>
      <Button
        icon="pi pi-trash"
        text
        rounded
        size="small"
        title="Clear saved token"
        @click="clearCredentials"
      />
    </div>

    <!-- Branch name and the git actions share one row. -->
    <div class="git-header-row">
      <Button
        v-if="gitWorkspaceStore.status"
        class="branch-btn"
        text
        size="small"
        aria-haspopup="true"
        title="Switch or create a branch"
        data-testid="git-branch-btn"
        @click="openBranchMenu"
      >
        <i class="pi pi-code-branch" />
        <span class="branch-name">{{ branchName }}</span>
        <i class="pi pi-angle-down branch-caret" />
      </Button>
      <Menu
        ref="branchMenuRef"
        :model="branchMenuItems"
        :popup="true"
        data-testid="git-branch-menu"
      />
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
    </div>

    <div
      v-if="hasChanges"
      class="changes-indicator"
    >
      <i class="pi pi-circle-fill" />
      {{ changeCount }} changes
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
      v-model:visible="showNewBranchDialog"
      modal
      header="New Branch"
      :style="{ width: '360px' }"
    >
      <div class="commit-dialog">
        <label for="new-branch-name">Branch Name</label>
        <InputText
          id="new-branch-name"
          v-model="newBranchName"
          placeholder="e.g. feature/my-change"
          data-testid="new-branch-input"
          @keyup.enter="confirmNewBranch"
        />
        <small class="branch-hint">Created from the current branch and checked out.</small>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          @click="showNewBranchDialog = false"
        />
        <Button
          label="Create branch"
          icon="pi pi-plus"
          :disabled="!newBranchName.trim()"
          :loading="gitWorkspaceStore.isSwitchingBranch"
          data-testid="create-branch-btn"
          @click="confirmNewBranch"
        />
      </template>
    </Dialog>

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
      header="GitHub Token Required"
      :style="{ width: '420px' }"
    >
      <div class="auth-dialog">
        <p class="auth-hint">
          Enter a GitHub Personal Access Token to authenticate.
        </p>
        <div class="auth-field">
          <label for="auth-token">GitHub Token</label>
          <InputText
            id="auth-token"
            v-model="authToken"
            type="password"
            autocomplete="off"
            placeholder="ghp_... or github_pat_..."
            :invalid="!!authTokenError"
            @keyup.enter="submitAuthCredentials"
          />
          <small
            v-if="authTokenError"
            class="token-error"
          >
            {{ authTokenError }}
          </small>
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
          :disabled="!canSubmitAuth"
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

.git-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

/* Keep the actions pinned to the right even when the branch label is absent. */
.git-header-row .git-actions {
  margin-left: auto;
}

.branch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Clickable branch switcher (opens the branch menu). */
.branch-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.branch-btn .branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 10rem;
}

.branch-btn .branch-caret {
  font-size: 0.7rem;
  opacity: 0.7;
}

.branch-hint {
  font-size: 0.72rem;
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

.auth-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.auth-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
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

.token-error {
  color: var(--red-500);
  font-size: 0.75rem;
}
</style>
