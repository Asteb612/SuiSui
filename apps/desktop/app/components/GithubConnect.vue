<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGithubStore } from '~/stores/github'
import { useGitWorkspaceStore } from '~/stores/gitWorkspace'
import { useWorkspaceStore } from '~/stores/workspace'
import type { GithubRepo, DeviceFlowResponse } from '@suisui/shared'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'cloned': [localPath: string]
}>()

const githubStore = useGithubStore()
const gitWorkspaceStore = useGitWorkspaceStore()
const workspaceStore = useWorkspaceStore()

// Step management
const currentStep = ref<'auth' | 'repo' | 'clone'>('auth')
//const authTab = ref<'pat' | 'device'>('pat')

// PAT auth
const tokenInput = ref('')
const isValidating = ref(false)
const validationError = ref<string | null>(null)

// Device flow
const deviceFlow = ref<DeviceFlowResponse | null>(null)
const isPolling = ref(false)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

// Repo selection
const selectedRepo = ref<GithubRepo | null>(null)
const repoSearch = ref('')
const selectedBranch = ref('')

// Clone
const localPath = ref('')
const cloneError = ref<string | null>(null)

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

const filteredRepos = computed(() => {
  if (!repoSearch.value) return githubStore.repos
  const search = repoSearch.value.toLowerCase()
  return githubStore.repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search) ||
      r.fullName.toLowerCase().includes(search)
  )
})

// Watch for dialog close to reset
watch(
  () => props.visible,
  (val) => {
    if (!val) {
      stopPolling()
      // Reset on close only if not connected
      if (!githubStore.isConnected) {
        currentStep.value = 'auth'
        tokenInput.value = ''
        validationError.value = null
      }
    }
  }
)

async function validateToken() {
  if (!tokenInput.value.trim()) return
  isValidating.value = true
  validationError.value = null
  try {
    await githubStore.connect(tokenInput.value.trim())
    currentStep.value = 'repo'
    await githubStore.loadRepos()
  } catch (err) {
    validationError.value = err instanceof Error ? err.message : 'Validation failed'
  } finally {
    isValidating.value = false
  }
}

async function startDeviceFlow() {
  try {
    const flow = await githubStore.connectViaDeviceFlow()
    deviceFlow.value = flow
    startPolling(flow.deviceCode, flow.interval)
  } catch {
    // error set in store
  }
}

function startPolling(deviceCode: string, interval: number) {
  isPolling.value = true
  pollTimer.value = setInterval(async () => {
    try {
      const result = await githubStore.pollDeviceFlow(deviceCode)
      if (result.status === 'success') {
        stopPolling()
        currentStep.value = 'repo'
        await githubStore.loadRepos()
      } else if (result.status === 'expired' || result.status === 'access_denied' || result.status === 'error') {
        stopPolling()
      }
    } catch {
      stopPolling()
    }
  }, (interval + 1) * 1000)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
  isPolling.value = false
}

function selectRepo(repo: GithubRepo) {
  selectedRepo.value = repo
  selectedBranch.value = repo.defaultBranch
}

function proceedToClone() {
  if (!selectedRepo.value) return
  currentStep.value = 'clone'
}

async function selectDirectory() {
  const result = await workspaceStore.selectDirectory()
  if (result) {
    localPath.value = result
  }
}

async function startClone() {
  if (!selectedRepo.value || !localPath.value || !githubStore.token) return
  cloneError.value = null
  const repo = selectedRepo.value
  const fullPath = `${localPath.value}/${repo.name}`

  try {
    await gitWorkspaceStore.cloneOrOpen({
      owner: repo.owner,
      repo: repo.name,
      repoUrl: repo.cloneUrl,
      branch: selectedBranch.value || repo.defaultBranch,
      localPath: fullPath,
      token: githubStore.token,
    })
    emit('cloned', fullPath)
    emit('update:visible', false)
  } catch (err) {
    cloneError.value = err instanceof Error ? err.message : 'Clone failed'
  }
}

function goBack() {
  if (currentStep.value === 'clone') {
    currentStep.value = 'repo'
  } else if (currentStep.value === 'repo') {
    currentStep.value = 'auth'
  }
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    header="Clone from GitHub"
    :style="{ width: '600px' }"
    data-testid="github-dialog"
  >
    <!-- Step 1: Auth -->
    <div
      v-if="currentStep === 'auth'"
      class="github-step"
    >
      <TabView>
        <TabPanel
          header="Personal Access Token"
          value="pat"
        >
          <div class="auth-form">
            <p class="auth-description">
              Enter a GitHub Personal Access Token with <code>repo</code> scope.
            </p>
            <div class="token-input-group">
              <InputText
                v-model="tokenInput"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                class="token-input"
                data-testid="github-token-input"
                @keyup.enter="validateToken"
              />
              <Button
                label="Connect"
                icon="pi pi-check"
                :loading="isValidating"
                :disabled="!tokenInput.trim()"
                data-testid="github-validate-btn"
                @click="validateToken"
              />
            </div>
            <div
              v-if="validationError"
              class="auth-error"
            >
              <i class="pi pi-exclamation-triangle" />
              {{ validationError }}
            </div>
          </div>
        </TabPanel>
        <TabPanel
          header="Sign in with GitHub"
          value="device"
        >
          <div class="auth-form">
            <template v-if="!deviceFlow">
              <p class="auth-description">
                Sign in using the GitHub device authorization flow.
              </p>
              <Button
                label="Start Sign In"
                icon="pi pi-github"
                :loading="githubStore.isLoading"
                @click="startDeviceFlow"
              />
            </template>
            <template v-else>
              <div class="device-flow-info">
                <p>Enter this code on GitHub:</p>
                <div class="device-code">
                  {{ deviceFlow.userCode }}
                </div>
                <p>
                  Open
                  <a
                    :href="deviceFlow.verificationUri"
                    target="_blank"
                    rel="noopener"
                  >{{ deviceFlow.verificationUri }}</a>
                </p>
                <ProgressBar
                  v-if="isPolling"
                  mode="indeterminate"
                  style="height: 4px"
                />
                <p
                  v-if="isPolling"
                  class="polling-hint"
                >
                  Waiting for authorization...
                </p>
              </div>
            </template>
            <div
              v-if="githubStore.error"
              class="auth-error"
            >
              <i class="pi pi-exclamation-triangle" />
              {{ githubStore.error }}
            </div>
          </div>
        </TabPanel>
      </TabView>

      <!-- Connected user info -->
      <div
        v-if="githubStore.isConnected && githubStore.user"
        class="user-info"
        data-testid="github-user-info"
      >
        <img
          :src="githubStore.user.avatarUrl"
          :alt="githubStore.user.login"
          class="user-avatar"
        >
        <div class="user-details">
          <span class="user-name">{{ githubStore.user.name || githubStore.user.login }}</span>
          <span class="user-login">@{{ githubStore.user.login }}</span>
        </div>
        <Button
          label="Continue"
          icon="pi pi-arrow-right"
          size="small"
          @click="currentStep = 'repo'; githubStore.loadRepos()"
        />
      </div>
    </div>

    <!-- Step 2: Select Repo -->
    <div
      v-else-if="currentStep === 'repo'"
      class="github-step"
    >
      <div class="repo-header">
        <InputText
          v-model="repoSearch"
          placeholder="Search repositories..."
          class="repo-search"
        />
      </div>

      <div
        v-if="githubStore.isLoading"
        class="loading-repos"
      >
        <i class="pi pi-spin pi-spinner" />
        <span>Loading repositories...</span>
      </div>

      <div
        v-else
        class="repo-list"
        data-testid="github-repo-list"
      >
        <div
          v-for="repo in filteredRepos"
          :key="repo.fullName"
          class="repo-item"
          :class="{ selected: selectedRepo?.fullName === repo.fullName }"
          data-testid="github-repo-item"
          @click="selectRepo(repo)"
        >
          <div class="repo-info">
            <span class="repo-name">
              <i :class="repo.private ? 'pi pi-lock' : 'pi pi-book'" />
              {{ repo.fullName }}
            </span>
            <span class="repo-branch">{{ repo.defaultBranch }}</span>
          </div>
        </div>
        <div
          v-if="filteredRepos.length === 0"
          class="no-repos"
        >
          No repositories found
        </div>
      </div>
    </div>

    <!-- Step 3: Clone -->
    <div
      v-else-if="currentStep === 'clone'"
      class="github-step"
    >
      <div class="clone-info">
        <h4>Repository</h4>
        <p class="clone-repo-name">
          <i :class="selectedRepo?.private ? 'pi pi-lock' : 'pi pi-book'" />
          {{ selectedRepo?.fullName }}
        </p>

        <h4>Branch</h4>
        <InputText
          v-model="selectedBranch"
          :placeholder="selectedRepo?.defaultBranch"
          class="branch-input"
        />

        <h4>Local Directory</h4>
        <div class="path-input-group">
          <InputText
            v-model="localPath"
            placeholder="Select a directory..."
            class="path-input"
            readonly
          />
          <Button
            label="Browse"
            icon="pi pi-folder-open"
            outlined
            @click="selectDirectory"
          />
        </div>

        <div
          v-if="localPath && selectedRepo"
          class="clone-target"
        >
          Clone to: <code>{{ localPath }}/{{ selectedRepo.name }}</code>
        </div>
      </div>

      <div
        v-if="gitWorkspaceStore.isCloning"
        class="clone-progress"
        data-testid="github-clone-progress"
      >
        <ProgressBar
          mode="indeterminate"
          style="height: 6px"
        />
        <p>Cloning repository...</p>
      </div>

      <div
        v-if="cloneError"
        class="auth-error"
      >
        <i class="pi pi-exclamation-triangle" />
        {{ cloneError }}
      </div>
    </div>

    <template #footer>
      <Button
        v-if="currentStep !== 'auth'"
        label="Back"
        text
        severity="secondary"
        icon="pi pi-arrow-left"
        @click="goBack"
      />
      <div class="footer-spacer" />
      <Button
        label="Cancel"
        text
        severity="secondary"
        @click="dialogVisible = false"
      />
      <Button
        v-if="currentStep === 'repo'"
        label="Next"
        icon="pi pi-arrow-right"
        :disabled="!selectedRepo"
        @click="proceedToClone"
      />
      <Button
        v-if="currentStep === 'clone'"
        label="Clone"
        icon="pi pi-download"
        :disabled="!localPath || gitWorkspaceStore.isCloning"
        :loading="gitWorkspaceStore.isCloning"
        data-testid="github-clone-btn"
        @click="startClone"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.github-step {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 300px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 0;
}

.auth-description {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 0.9375rem;
  line-height: 1.6;
}

.auth-description code {
  background: var(--surface-ground);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.token-input-group {
  display: flex;
  gap: 0.5rem;
}

.token-input {
  flex: 1;
}

.auth-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 6px;
  color: #dc3545;
  font-size: 0.875rem;
}

.device-flow-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
}

.device-code {
  font-size: 2rem;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.2em;
  padding: 0.75rem 1.5rem;
  background: var(--surface-ground);
  border-radius: 8px;
  border: 2px solid var(--primary-color);
  color: var(--primary-color);
}

.polling-hint {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 6px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.user-details {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.user-name {
  font-weight: 600;
  font-size: 0.9375rem;
}

.user-login {
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
}

.repo-header {
  display: flex;
  gap: 0.5rem;
}

.repo-search {
  flex: 1;
}

.loading-repos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--text-color-secondary);
}

.repo-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 350px;
  overflow-y: auto;
}

.repo-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
  border: 1px solid transparent;
}

.repo-item:hover {
  background: var(--surface-ground);
}

.repo-item.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--primary-color);
}

.repo-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.repo-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
}

.repo-branch {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  background: var(--surface-ground);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.no-repos {
  text-align: center;
  padding: 2rem;
  color: var(--text-color-secondary);
}

.clone-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.clone-info h4 {
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.clone-repo-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

.branch-input {
  width: 100%;
}

.path-input-group {
  display: flex;
  gap: 0.5rem;
}

.path-input {
  flex: 1;
}

.clone-target {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  padding: 0.5rem 0.75rem;
  background: var(--surface-ground);
  border-radius: 4px;
}

.clone-target code {
  color: var(--primary-color);
  font-family: monospace;
}

.clone-progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 0;
}

.clone-progress p {
  margin: 0;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.footer-spacer {
  flex: 1;
}
</style>
