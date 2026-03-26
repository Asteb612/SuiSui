<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { validateGitHubToken } from '@suisui/shared'
import { useGithubStore } from '~/stores/gitCredentials'
import { useGitWorkspaceStore } from '~/stores/gitWorkspace'
import { useWorkspaceStore } from '~/stores/workspace'

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

// Form fields
const repoUrl = ref('')
const branch = ref('main')
const token = ref('')
const localPath = ref('')
const cloneError = ref<string | null>(null)

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// Derive repo name from URL
const repoName = computed(() => {
  try {
    const url = repoUrl.value.trim()
    if (!url) return ''
    const parts = url.replace(/\.git$/, '').split('/')
    return parts[parts.length - 1] || ''
  } catch {
    return ''
  }
})

// Token validation
const tokenValidation = computed(() => validateGitHubToken(token.value))
const tokenError = computed(() => {
  if (token.value.trim() === '') return null
  return tokenValidation.value.valid ? null : tokenValidation.value.error
})

const canClone = computed(() => {
  return repoUrl.value.trim()
    && localPath.value
    && !gitWorkspaceStore.isCloning
    && (token.value.trim() === '' || tokenValidation.value.valid)
})

// Reset on close
watch(
  () => props.visible,
  (val) => {
    if (!val) {
      cloneError.value = null
    }
  }
)

async function selectDirectory() {
  const result = await workspaceStore.selectDirectory()
  if (result) {
    localPath.value = result
  }
}

async function startClone() {
  if (!canClone.value) return
  cloneError.value = null

  const url = repoUrl.value.trim()
  const name = repoName.value || 'repo'
  const fullPath = `${localPath.value}/${name}`
  const trimmedToken = token.value.trim()

  // Extract owner/repo from URL for metadata
  const urlParts = url.replace(/\.git$/, '').split('/')
  const repo = urlParts[urlParts.length - 1] || name
  const owner = urlParts[urlParts.length - 2] || ''

  try {
    await gitWorkspaceStore.cloneOrOpen({
      owner,
      repo,
      repoUrl: url,
      branch: branch.value || 'main',
      localPath: fullPath,
      token: trimmedToken || undefined,
    })

    // Save credentials if token provided
    if (trimmedToken) {
      await githubStore.saveCredentials(fullPath, { token: trimmedToken })
    }

    emit('cloned', fullPath)
    emit('update:visible', false)
  } catch (err) {
    cloneError.value = err instanceof Error ? err.message : 'Clone failed'
  }
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    header="Clone from Git"
    :style="{ width: '550px' }"
    data-testid="git-clone-dialog"
  >
    <div class="clone-form">
      <div class="form-field">
        <label for="git-clone-url">Repository URL</label>
        <InputText
          id="git-clone-url"
          v-model="repoUrl"
          placeholder="https://github.com/user/repo.git"
          class="full-width"
          data-testid="git-clone-url-input"
        />
      </div>

      <div class="form-field">
        <label for="git-clone-branch">Branch</label>
        <InputText
          id="git-clone-branch"
          v-model="branch"
          placeholder="main"
          class="full-width"
          data-testid="git-clone-branch-input"
        />
      </div>

      <div class="credentials-section">
        <p class="credentials-hint">
          Optional: provide a GitHub Personal Access Token for private repositories.
        </p>
        <div class="form-field">
          <label for="git-clone-token">GitHub Token</label>
          <InputText
            id="git-clone-token"
            v-model="token"
            type="password"
            placeholder="ghp_... or github_pat_..."
            class="full-width"
            :invalid="!!tokenError"
            data-testid="git-clone-token-input"
          />
          <small
            v-if="tokenError"
            class="token-error"
          >
            {{ tokenError }}
          </small>
        </div>
      </div>

      <div class="form-field">
        <label>Local Directory</label>
        <div class="path-input-group">
          <InputText
            v-model="localPath"
            placeholder="Select a directory..."
            class="path-input"
            readonly
            data-testid="git-clone-path-input"
          />
          <Button
            label="Browse"
            icon="pi pi-folder-open"
            outlined
            @click="selectDirectory"
          />
        </div>
      </div>

      <div
        v-if="localPath && repoName"
        class="clone-target"
      >
        Clone to: <code>{{ localPath }}/{{ repoName }}</code>
      </div>

      <div
        v-if="gitWorkspaceStore.isCloning"
        class="clone-progress"
        data-testid="git-clone-progress"
      >
        <ProgressBar
          mode="indeterminate"
          style="height: 6px"
        />
        <p>Cloning repository...</p>
      </div>

      <div
        v-if="cloneError"
        class="clone-error"
      >
        <i class="pi pi-exclamation-triangle" />
        {{ cloneError }}
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        severity="secondary"
        @click="dialogVisible = false"
      />
      <Button
        label="Clone"
        icon="pi pi-download"
        :disabled="!canClone"
        :loading="gitWorkspaceStore.isCloning"
        data-testid="git-clone-btn"
        @click="startClone"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.clone-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color);
}

.full-width {
  width: 100%;
}

.credentials-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--surface-ground);
  border-radius: 6px;
}

.credentials-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
}

.token-error {
  color: var(--red-500);
  font-size: 0.75rem;
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
  padding: 0.5rem 0;
}

.clone-progress p {
  margin: 0;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.clone-error {
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
</style>
