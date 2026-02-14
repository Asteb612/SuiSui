<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'
import { useGitStore } from '~/stores/git'
import { useRunnerStore } from '~/stores/runner'
//import { useGithubStore } from '~/stores/github'

const workspaceStore = useWorkspaceStore()
const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()
const gitStore = useGitStore()
const runnerStore = useRunnerStore()
//const githubStore = useGithubStore()

const showGithubConnect = ref(false)
const changeWorkspaceMenuRef = ref()

const changeWorkspaceMenuItems = [
  {
    label: 'Open Local Workspace',
    icon: 'pi pi-folder',
    command: () => workspaceStore.selectWorkspace(),
  },
  {
    label: 'Clone from GitHub',
    icon: 'pi pi-github',
    command: () => { showGithubConnect.value = true },
  },
]

function showChangeWorkspaceMenu(event: Event) {
  changeWorkspaceMenuRef.value?.toggle(event)
}

async function handleGithubCloned(localPath: string) {
  // After clone, set the cloned directory as workspace and initialize it
  await workspaceStore.setWorkspacePath(localPath)
  if (!isMounted.value) return
  if (workspaceStore.hasWorkspace) {
    await loadWorkspaceDependencies()
  }
}

// Guard against async operations completing after unmount
const isMounted = ref(true)
onUnmounted(() => {
  isMounted.value = false
})

const showNewScenarioDialog = ref(false)
const showHelpDialog = ref(false)
const showValidationDialog = ref(false)
const showInitDialog = computed(() => workspaceStore.needsInit)
const editMode = ref<'scenario' | 'background'>('scenario')

// Panel visibility
const showFolderPanel = ref(true)
const showStepPanel = ref(false) // Hidden by default, shown in edit mode

// Current view mode from ScenarioBuilder
const currentViewMode = ref<'read' | 'edit' | 'run'>('read')

function handleModeChange(mode: 'read' | 'edit' | 'run') {
  currentViewMode.value = mode
  // Show step panel only in edit mode
  showStepPanel.value = mode === 'edit'
  // Hide folder panel in edit/run modes to maximize workspace
  if (mode !== 'read') {
    showFolderPanel.value = false
  }
}

// Git availability - hide if workspace is not a git repo
const isGitAvailable = computed(() => {
  return gitStore.status !== null && gitStore.error === null
})

function toggleEditMode() {
  editMode.value = editMode.value === 'scenario' ? 'background' : 'scenario'
}

onMounted(async () => {
  await workspaceStore.loadWorkspace()
  if (!isMounted.value) return
  if (workspaceStore.hasWorkspace) {
    await loadWorkspaceDependencies()
  }
})

// When workspace changes (e.g. user selects a workspace from welcome screen),
// load steps, git status, and runner config
watch(
  () => workspaceStore.workspace,
  async (workspace) => {
    if (workspace && !stepsStore.exportedAt) {
      await loadWorkspaceDependencies()
    }
  }
)

async function loadWorkspaceDependencies() {
  await stepsStore.loadCached()
  if (!isMounted.value) return
  await gitStore.refreshStatus()
  if (!isMounted.value) return
  await runnerStore.loadBaseUrl()
}

watch(
  () => workspaceStore.selectedFeature,
  async (feature) => {
    if (feature) {
      await scenarioStore.loadFromFeature(feature.relativePath, stepsStore.steps)
      // When a feature is selected, auto-hide folder panel
      showFolderPanel.value = false
      // Step panel visibility controlled by mode (will be shown if in edit mode)
    } else {
      scenarioStore.clear()
    }
  }
)

async function saveScenario() {
  if (!scenarioStore.currentFeaturePath) return
  await scenarioStore.save(scenarioStore.currentFeaturePath)
  await workspaceStore.loadFeatures()
}

function getRunButtonTitle(): string {
  if (currentViewMode.value === 'edit') return 'Exit edit mode first'
  if (scenarioStore.isDirty) return 'Save changes first'
  if (!scenarioStore.isValid) return 'Fix validation errors first'
  return 'Run scenario'
}

async function resetScenario() {
  if (!scenarioStore.currentFeaturePath) return
  await scenarioStore.loadFromFeature(scenarioStore.currentFeaturePath, stepsStore.steps)
}


function handleCreateScenario(data: { name: string; fileName: string }) {
  scenarioStore.createNew(data.name)
  workspaceStore.selectFeature({
    path: '',
    name: data.name,
    relativePath: data.fileName,
  })
}

async function initializeWorkspace() {
  await workspaceStore.initWorkspace()
  if (!isMounted.value) return
  if (workspaceStore.hasWorkspace) {
    await stepsStore.loadCached()
    if (!isMounted.value) return
    await gitStore.refreshStatus()
  }
}

function cancelInit() {
  workspaceStore.clearPending()
}
</script>

<template>
  <div
    class="main-container"
    data-testid="main-container"
  >
    <!-- Header -->
    <header class="header titlebar">
      <h1 class="title">
        SuiSui
      </h1>
      <span class="subtitle">BDD Test Builder</span>
      <div class="header-spacer" />
      <Button
        icon="pi pi-question-circle"
        text
        size="small"
        @click="showHelpDialog = true"
      />
      <Button
        v-if="workspaceStore.hasWorkspace"
        label="Change Workspace"
        icon="pi pi-folder"
        text
        size="small"
        aria-haspopup="true"
        data-testid="change-workspace-btn"
        @click="showChangeWorkspaceMenu"
      />
      <Menu
        ref="changeWorkspaceMenuRef"
        :model="changeWorkspaceMenuItems"
        :popup="true"
      />
    </header>

    <!-- Main content -->
    <main class="content">
      <div
        v-if="workspaceStore.isLoading && !workspaceStore.isInitializing"
        class="loading"
      >
        <i
          class="pi pi-spin pi-spinner"
          style="font-size: 2rem"
        />
        <p>Loading...</p>
      </div>

      <div
        v-else-if="!workspaceStore.hasWorkspace"
        class="no-workspace"
        data-testid="welcome-screen"
      >
        <div class="no-workspace-content">
          <div class="workspace-icon">
            <i class="pi pi-folder-open" />
          </div>
          <h2>Welcome to SuiSui</h2>
          <p class="workspace-description">
            Get started by selecting a workspace directory or creating a new one
          </p>
          <div class="workspace-actions">
            <Button
              label="Select Existing Workspace"
              icon="pi pi-folder"
              size="large"
              data-testid="select-workspace-btn"
              @click="workspaceStore.selectWorkspace"
            />
            <Button
              label="Create New Workspace"
              icon="pi pi-plus-circle"
              severity="secondary"
              size="large"
              outlined
              @click="workspaceStore.selectWorkspace"
            />
            <Button
              label="Clone from GitHub"
              icon="pi pi-github"
              severity="info"
              size="large"
              outlined
              data-testid="github-connect-btn"
              @click="showGithubConnect = true"
            />
          </div>
          <div class="workspace-requirements">
            <p class="requirements-title">
              Workspace Requirements:
            </p>
            <ul class="requirements-list">
              <li>
                <i class="pi pi-check-circle" />
                <span><code>package.json</code> file</span>
              </li>
              <li>
                <i class="pi pi-check-circle" />
                <span><code>features/</code> directory</span>
              </li>
            </ul>
            <p class="workspace-hint">
              Don't have these? Select a folder and we'll initialize it for you!
            </p>
          </div>
          <div
            v-if="workspaceStore.error && !workspaceStore.needsInit"
            class="workspace-error"
          >
            <i class="pi pi-exclamation-triangle" />
            <span>{{ workspaceStore.error }}</span>
          </div>
        </div>
      </div>

      <div
        v-else
        class="workspace-layout"
        :class="{
          'with-folder-panel': showFolderPanel,
          'with-step-panel': showStepPanel && currentViewMode === 'edit',
        }"
      >
        <!-- Left Panel: Features Tree -->
        <aside
          v-if="showFolderPanel"
          class="panel left-panel"
        >
          <div class="panel-header">
            <h3>Features</h3>
            <Button
              icon="pi pi-angle-double-left"
              text
              rounded
              size="small"
              title="Hide folder panel"
              @click="showFolderPanel = false"
            />
          </div>
          <div class="panel-content">
            <FeatureTree />
          </div>
          <GitPanel v-if="isGitAvailable" />
        </aside>

        <!-- Center: Scenario Builder -->
        <section class="panel center-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <Button
                v-if="!showFolderPanel"
                icon="pi pi-folder"
                text
                rounded
                size="small"
                title="Show features"
                @click="showFolderPanel = true"
              />
              <h3>{{ scenarioStore.featureName || 'Scenario' }}</h3>
            </div>
            <div class="header-actions">
              <!-- Mode Controls -->
              <div
                v-if="scenarioStore.currentFeaturePath || scenarioStore.scenario.name"
                class="mode-controls"
              >
                <!-- Validation indicator (edit mode only) -->
                <span
                  v-if="currentViewMode === 'edit' && !scenarioStore.isValid && scenarioStore.errors.length > 0"
                  class="validation-indicator error clickable"
                  :title="`${scenarioStore.errors.length} validation error${scenarioStore.errors.length > 1 ? 's' : ''} - Click to view details`"
                  @click="showValidationDialog = true"
                >
                  <i class="pi pi-exclamation-circle" />
                  {{ scenarioStore.errors.length }}
                </span>
                <span
                  v-else-if="currentViewMode === 'edit' && scenarioStore.warnings.length > 0"
                  class="validation-indicator warning clickable"
                  :title="`${scenarioStore.warnings.length} warning${scenarioStore.warnings.length > 1 ? 's' : ''} - Click to view details`"
                  @click="showValidationDialog = true"
                >
                  <i class="pi pi-exclamation-triangle" />
                  {{ scenarioStore.warnings.length }}
                </span>
                <span
                  v-else-if="currentViewMode !== 'edit' && scenarioStore.isValid"
                  class="validation-indicator valid"
                  data-testid="validation-indicator"
                  title="Scenario is valid"
                >
                  <i class="pi pi-check-circle" />
                </span>

                <!-- Save indicator (edit mode only) -->
                <span
                  v-if="currentViewMode === 'edit' && scenarioStore.isDirty"
                  class="dirty-indicator"
                  title="Unsaved changes"
                >
                  <i class="pi pi-circle-fill" />
                </span>

                <!-- Edit button (toggle) -->
                <Button
                  v-if="currentViewMode !== 'edit'"
                  icon="pi pi-pencil"
                  label="Edit"
                  text
                  size="small"
                  data-testid="edit-mode-btn"
                  :disabled="currentViewMode === 'run'"
                  @click="handleModeChange('edit')"
                />
                <!-- Edit mode buttons -->
                <template v-else>
                  <!-- Reset button (only if dirty) -->
                  <Button
                    v-if="scenarioStore.isDirty"
                    icon="pi pi-refresh"
                    text
                    size="small"
                    severity="secondary"
                    title="Discard changes and reload from file"
                    @click="resetScenario"
                  />
                  <!-- Save button (only if dirty) -->
                  <Button
                    v-if="scenarioStore.isDirty"
                    icon="pi pi-save"
                    label="Save"
                    size="small"
                    data-testid="save-btn"
                    :disabled="!scenarioStore.isValid"
                    :title="!scenarioStore.isValid ? 'Fix validation errors before saving' : 'Save changes'"
                    @click="saveScenario"
                  />
                  <!-- Done button (close edit mode) -->
                  <Button
                    icon="pi pi-check"
                    label="Done"
                    text
                    size="small"
                    data-testid="done-btn"
                    :disabled="scenarioStore.isDirty"
                    :title="scenarioStore.isDirty ? 'Save or discard changes first' : 'Close edit mode'"
                    @click="handleModeChange('read')"
                  />
                </template>

                <!-- Run button -->
                <Button
                  v-if="currentViewMode !== 'run'"
                  icon="pi pi-play"
                  label="Run"
                  text
                  size="small"
                  data-testid="run-mode-btn"
                  :disabled="currentViewMode === 'edit' || !scenarioStore.isValid || scenarioStore.isDirty"
                  :title="getRunButtonTitle()"
                  @click="handleModeChange('run')"
                />
                <Button
                  v-else
                  icon="pi pi-times"
                  label="Close"
                  text
                  size="small"
                  @click="handleModeChange('read')"
                />
              </div>

              <!-- Steps catalog button (edit mode, when panel hidden) -->
              <Button
                v-if="!showStepPanel && currentViewMode === 'edit'"
                icon="pi pi-list"
                label="Steps"
                text
                size="small"
                title="Show step catalog"
                @click="showStepPanel = true"
              />
            </div>
          </div>
          <div class="panel-content">
            <ScenarioBuilder
              :edit-mode="editMode"
              :view-mode="currentViewMode"
              @toggle-edit-mode="toggleEditMode"
            />
          </div>
        </section>

        <!-- Right Panel: Steps (edit mode only) -->
        <aside
          v-if="showStepPanel && currentViewMode === 'edit'"
          class="panel right-panel"
        >
          <div class="panel-header">
            <h3>Step Catalog</h3>
            <Button
              icon="pi pi-times"
              text
              rounded
              size="small"
              title="Hide step catalog"
              @click="showStepPanel = false"
            />
          </div>
          <div class="panel-content">
            <StepSelector :add-target="editMode" />
          </div>
        </aside>
      </div>
    </main>

    <!-- Status bar -->
    <footer
      class="status-bar"
      data-testid="status-bar"
    >
      <span>{{ workspaceStore.workspace?.path ?? 'No workspace' }}</span>
      <span
        v-if="stepsStore.exportedAt"
        class="steps-info"
      >
        {{ stepsStore.steps.length }} steps loaded
      </span>
    </footer>

    <!-- Dialogs -->
    <NewScenarioDialog
      v-model:visible="showNewScenarioDialog"
      @create="handleCreateScenario"
    />

    <!-- Initialize Workspace Dialog -->
    <Dialog
      :visible="showInitDialog"
      modal
      header="Initialize Workspace"
      :style="{ width: '500px' }"
      :closable="false"
    >
      <div class="init-dialog-content">
        <template v-if="workspaceStore.isInitializing">
          <!-- Loading state -->
          <div class="init-loading">
            <i
              class="pi pi-spin pi-spinner"
              style="font-size: 2rem"
            />
            <h3>Creating files and installing dependencies…</h3>
            <p>This may take a minute. Please wait.</p>
            <ProgressBar
              :value="undefined"
              class="progress-indeterminate"
            />
          </div>
        </template>
        <template v-else>
          <!-- Initial state -->
          <div class="init-icon">
            <i class="pi pi-info-circle" />
          </div>
          <h3>Missing Required Files</h3>
          <p class="init-description">
            The selected folder is missing some required files to be a valid BDD workspace:
          </p>
          <div class="missing-items">
            <div
              v-for="error in workspaceStore.pendingValidation?.errors"
              :key="error"
              class="missing-item"
            >
              <i class="pi pi-times-circle" />
              <span>{{ error }}</span>
            </div>
          </div>
          <div class="init-info">
            <p class="init-question">
              Would you like to initialize this folder as a new BDD workspace?
            </p>
            <p class="init-hint">
              <i class="pi pi-lightbulb" />
              This will automatically create the missing <code>package.json</code>, <code>cucumber.json</code>, and <code>features/</code> directory, and run <code>npm install</code> to set up dependencies for you.
            </p>
          </div>
        </template>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          severity="secondary"
          :disabled="workspaceStore.isInitializing"
          @click="cancelInit"
        />
        <Button
          label="Initialize Workspace"
          icon="pi pi-check"
          data-testid="init-workspace-btn"
          :disabled="workspaceStore.isInitializing"
          :loading="workspaceStore.isInitializing"
          @click="initializeWorkspace"
        />
      </template>
    </Dialog>

    <!-- Validation Errors Dialog -->
    <Dialog
      v-model:visible="showValidationDialog"
      header="Validation Errors"
      :style="{ width: '600px' }"
      modal
      :draggable="true"
    >
      <div class="validation-dialog-content">
        <div
          v-if="scenarioStore.errors.length === 0 && scenarioStore.warnings.length === 0"
          class="no-issues"
        >
          <i class="pi pi-check-circle" />
          <p>No validation issues found</p>
        </div>
        
        <div v-else>
          <!-- Errors Section -->
          <div
            v-if="scenarioStore.errors.length > 0"
            class="issues-section"
          >
            <h4 class="issues-header error">
              <i class="pi pi-times-circle" />
              Errors ({{ scenarioStore.errors.length }})
            </h4>
            <div class="issues-list">
              <div
                v-for="(error, index) in scenarioStore.errors"
                :key="`error-${index}`"
                class="issue-item error"
              >
                <i class="pi pi-exclamation-circle" />
                <div class="issue-content">
                  <p class="issue-message">
                    {{ error.message }}
                  </p>
                  <span
                    v-if="error.stepId"
                    class="issue-meta"
                  >Step ID: {{ error.stepId }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Warnings Section -->
          <div
            v-if="scenarioStore.warnings.length > 0"
            class="issues-section"
          >
            <h4 class="issues-header warning">
              <i class="pi pi-exclamation-triangle" />
              Warnings ({{ scenarioStore.warnings.length }})
            </h4>
            <div class="issues-list">
              <div
                v-for="(warning, index) in scenarioStore.warnings"
                :key="`warning-${index}`"
                class="issue-item warning"
              >
                <i class="pi pi-exclamation-triangle" />
                <div class="issue-content">
                  <p class="issue-message">
                    {{ warning.message }}
                  </p>
                  <span
                    v-if="warning.stepId"
                    class="issue-meta"
                  >Step ID: {{ warning.stepId }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button
          label="Close"
          @click="showValidationDialog = false"
        />
      </template>
    </Dialog>

    <!-- GitHub Connect Dialog -->
    <GithubConnect
      v-model:visible="showGithubConnect"
      @cloned="handleGithubCloned"
    />

    <!-- Help Dialog -->
    <Dialog
      v-model:visible="showHelpDialog"
      header="Help"
      :style="{ width: '600px' }"
      modal
      :draggable="true"
    >
      <div class="help-dialog-content">
        <div class="help-section">
          <h4>How SuiSui Works</h4>
          <ol class="help-steps">
            <li>
              <strong>Workspace:</strong> Select or create a workspace directory that contains your BDD tests and step definitions.
            </li>
            <li>
              <strong>Features:</strong> Manage feature files organized by folder structure. Each feature file contains scenarios written in Gherkin syntax.
            </li>
            <li>
              <strong>Scenarios:</strong> Build test scenarios visually using Given/When/Then steps. The step catalog is automatically populated from your workspace.
            </li>
            <li>
              <strong>Validation:</strong> Validate your scenarios to ensure they use correct steps and syntax.
            </li>
            <li>
              <strong>Execution:</strong> Run your tests in Headless mode (automated) or Primary mode (interactive with browser UI).
            </li>
          </ol>
        </div>

        <div class="help-section">
          <h4>Useful Resources</h4>
          <div class="help-links">
            <a
              href="https://github.com/nicholasgrose/bddgen"
              target="_blank"
              rel="noopener noreferrer"
              class="help-link"
            >
              <i class="pi pi-external-link" />
              <span>bddgen - BDD Code Generator</span>
            </a>
            <a
              href="https://playwright.dev/"
              target="_blank"
              rel="noopener noreferrer"
              class="help-link"
            >
              <i class="pi pi-external-link" />
              <span>Playwright - End-to-end Testing</span>
            </a>
            <a
              href="https://vitalets.github.io/playwright-bdd/"
              target="_blank"
              rel="noopener noreferrer"
              class="help-link"
            >
              <i class="pi pi-external-link" />
              <span>Playwright-BDD - Documentation</span>
            </a>
            <a
              href="https://cucumber.io/docs/gherkin/"
              target="_blank"
              rel="noopener noreferrer"
              class="help-link"
            >
              <i class="pi pi-external-link" />
              <span>Gherkin - Feature File Syntax</span>
            </a>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.main-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--surface-border);
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-color);
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.header-spacer {
  flex: 1;
}

.content {
  flex: 1;
  overflow: hidden;
}

.loading,
.no-workspace {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}

.no-workspace-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 600px;
  text-align: center;
  gap: 1.5rem;
}

.workspace-icon {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  margin-bottom: 0.5rem;
}

.workspace-icon i {
  font-size: 4rem;
  color: white;
}

.no-workspace-content h2 {
  font-size: 2rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.workspace-description {
  font-size: 1.125rem;
  color: var(--text-color-secondary);
  margin: 0;
  line-height: 1.6;
}

.workspace-actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.workspace-requirements {
  margin-top: 1rem;
  padding: 1.5rem;
  background: var(--surface-ground);
  border-radius: 8px;
  width: 100%;
  text-align: left;
}

.requirements-title {
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.requirements-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.requirements-list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-color-secondary);
  font-size: 0.9375rem;
}

.requirements-list li i {
  color: var(--primary-color);
  font-size: 1.125rem;
}

.requirements-list code {
  background: var(--surface-card);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  color: var(--primary-color);
  border: 1px solid var(--surface-border);
}

.workspace-hint {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0;
  font-style: italic;
  text-align: center;
}

.workspace-error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 8px;
  color: #dc3545;
  font-size: 0.9375rem;
  width: 100%;
  text-align: left;
}

.workspace-error i {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.workspace-layout {
  display: grid;
  grid-template-columns: 1fr;
  height: 100%;
  gap: 1px;
  background: var(--surface-border);
}

.workspace-layout.with-folder-panel {
  grid-template-columns: 280px 1fr;
}

.workspace-layout.with-step-panel {
  grid-template-columns: 1fr 380px;
}

.workspace-layout.with-folder-panel.with-step-panel {
  grid-template-columns: 280px 1fr 380px;
}

.panel {
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.panel-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.left-panel {
  display: flex;
  flex-direction: column;
}

.left-panel .panel-header {
  flex-shrink: 0;
}

.left-panel .panel-content {
  padding: 0;
  flex: 1;
  min-height: 0;
}

.center-panel .panel-content {
  padding: 1rem;
}

.right-panel .panel-content {
  padding: 1rem;
}

.right-panel {
  display: flex;
  flex-direction: column;
}

.right-panel .panel-header {
  flex-shrink: 0;
}

.right-panel .panel-content {
  flex: 1;
  min-height: 0;
  padding: 0;
}

.right-panel :deep(.step-selector) {
  border: none;
  border-radius: 0;
  height: 100%;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  background: var(--surface-card);
  border-top: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.steps-info {
  color: var(--primary-color);
}

.dirty-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.dirty-indicator i {
  font-size: 0.5rem;
  color: #f59e0b;
}

.mode-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem;
  background: var(--surface-ground);
  border-radius: 6px;
}

.validation-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: all 0.2s;
}

.validation-indicator.error {
  color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
}

.validation-indicator.warning {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.validation-indicator.valid {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.validation-indicator.clickable {
  cursor: pointer;
}

.validation-indicator.clickable:hover {
  transform: translateY(-1px);
}

.validation-indicator.error.clickable:hover {
  background: rgba(220, 53, 69, 0.2);
}

.validation-indicator.warning.clickable:hover {
  background: rgba(245, 158, 11, 0.2);
}

.validation-indicator i {
  font-size: 0.875rem;
}

.validation-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0.5rem 0;
  max-height: 60vh;
  overflow-y: auto;
}

.no-issues {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  color: var(--text-color-secondary);
  gap: 1rem;
}

.no-issues i {
  font-size: 3rem;
  color: #10b981;
}

.no-issues p {
  margin: 0;
  font-size: 1rem;
}

.issues-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.issues-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid;
}

.issues-header.error {
  color: #dc3545;
  border-color: rgba(220, 53, 69, 0.3);
}

.issues-header.warning {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.3);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.issue-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem;
  border-radius: 6px;
  border-left: 3px solid;
}

.issue-item.error {
  background: rgba(220, 53, 69, 0.05);
  border-color: #dc3545;
}

.issue-item.warning {
  background: rgba(245, 158, 11, 0.05);
  border-color: #f59e0b;
}

.issue-item i {
  font-size: 1.125rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.issue-item.error i {
  color: #dc3545;
}

.issue-item.warning i {
  color: #f59e0b;
}

.issue-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.issue-message {
  margin: 0;
  color: var(--text-color);
  font-size: 0.9375rem;
  line-height: 1.5;
}

.issue-meta {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.init-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 0.5rem 0;
}

.init-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.init-icon i {
  font-size: 3rem;
  color: var(--primary-color);
}

.init-dialog-content h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: center;
}

.init-description {
  margin: 0;
  color: var(--text-color-secondary);
  text-align: center;
  line-height: 1.6;
}

.missing-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(220, 53, 69, 0.05);
  border: 1px solid rgba(220, 53, 69, 0.2);
  border-radius: 6px;
}

.missing-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #dc3545;
  font-size: 0.9375rem;
}

.missing-item i {
  font-size: 1.125rem;
  flex-shrink: 0;
}

.init-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.init-question {
  margin: 0;
  font-weight: 500;
  color: var(--text-color);
  text-align: center;
}

.init-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem;
  background: var(--surface-ground);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.init-hint i {
  color: var(--primary-color);
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.init-hint code {
  background: var(--surface-card);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--primary-color);
  border: 1px solid var(--surface-border);
}

.init-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  text-align: center;
}

.init-loading i {
  color: var(--primary-color);
}

.init-loading h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text-color);
}

.init-loading p {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.progress-indeterminate {
  width: 100%;
}

.help-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.help-section h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.help-steps {
  margin: 0;
  padding-left: 1.5rem;
  color: var(--text-color-secondary);
  line-height: 1.8;
}

.help-steps li {
  margin-bottom: 0.75rem;
}

.help-steps strong {
  color: var(--text-color);
}

.help-links {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.help-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 6px;
  background: var(--surface-ground);
  color: var(--primary-color);
  text-decoration: none;
  transition: background-color 0.2s;
  font-size: 0.9375rem;
}

.help-link:hover {
  background: var(--surface-border);
}

.help-link i {
  font-size: 0.875rem;
}

</style>
