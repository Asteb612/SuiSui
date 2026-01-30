<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'
import { useGitStore } from '~/stores/git'
import { useRunnerStore } from '~/stores/runner'

const workspaceStore = useWorkspaceStore()
const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()
const gitStore = useGitStore()
const runnerStore = useRunnerStore()

const showNewScenarioDialog = ref(false)
const showToolsDialog = ref(false)
const showInitDialog = computed(() => workspaceStore.needsInit)

onMounted(async () => {
  await workspaceStore.loadWorkspace()
  if (workspaceStore.hasWorkspace) {
    await stepsStore.loadCached()
    await gitStore.refreshStatus()
    await runnerStore.loadBaseUrl()
  }
})

watch(
  () => workspaceStore.selectedFeature,
  async (feature) => {
    if (feature) {
      await scenarioStore.loadFromFeature(feature.relativePath)
    } else {
      scenarioStore.clear()
    }
  }
)

async function saveScenario() {
  if (!workspaceStore.selectedFeature) return
  await scenarioStore.save(workspaceStore.selectedFeature.relativePath)
  await workspaceStore.loadFeatures()
}

function openNewScenarioDialog() {
  showNewScenarioDialog.value = true
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
  if (workspaceStore.hasWorkspace) {
    await stepsStore.loadCached()
    await gitStore.refreshStatus()
  }
}

function cancelInit() {
  workspaceStore.clearPending()
}
</script>

<template>
  <div class="main-container">
    <!-- Header -->
    <header class="header titlebar">
      <h1 class="title">SuiSui</h1>
      <span class="subtitle">BDD Test Builder</span>
      <div class="header-spacer" />
      <Button
        v-if="workspaceStore.hasWorkspace"
        label="Change Workspace"
        icon="pi pi-folder"
        text
        size="small"
        @click="workspaceStore.selectWorkspace"
      />
    </header>

    <!-- Main content -->
    <main class="content">
      <div v-if="workspaceStore.isLoading" class="loading">
        <i class="pi pi-spin pi-spinner" style="font-size: 2rem" />
        <p>Loading...</p>
      </div>

      <div v-else-if="!workspaceStore.hasWorkspace" class="no-workspace">
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
          </div>
          <div class="workspace-requirements">
            <p class="requirements-title">Workspace Requirements:</p>
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
          <div v-if="workspaceStore.error && !workspaceStore.needsInit" class="workspace-error">
            <i class="pi pi-exclamation-triangle" />
            <span>{{ workspaceStore.error }}</span>
          </div>
        </div>
      </div>

      <div v-else class="workspace-layout workspace-two-panel">
        <!-- Left Panel: Features List -->
        <aside class="panel left-panel">
          <div class="panel-header">
            <h3>Features</h3>
            <Button
              icon="pi pi-plus"
              text
              rounded
              size="small"
              title="New Feature"
              data-testid="new-feature-button"
              @click="openNewScenarioDialog"
            />
          </div>
          <div class="panel-content">
            <FeatureList />
          </div>
          <GitPanel />
        </aside>

        <!-- Center: Scenario Builder -->
        <section class="panel center-panel">
          <div class="panel-header">
            <h3>Scenario Builder</h3>
            <div class="header-actions">
              <Button
                icon="pi pi-cog"
                label="Tools"
                outlined
                size="small"
                @click="showToolsDialog = true"
              />
              <Button
                v-if="scenarioStore.isDirty"
                label="Save"
                icon="pi pi-save"
                size="small"
                @click="saveScenario"
              />
            </div>
          </div>
          <div class="panel-content builder-content">
            <div class="builder-area">
              <ScenarioBuilder />
            </div>
            <div class="step-selector-area">
              <StepSelector />
            </div>
          </div>
        </section>

      </div>
    </main>

    <!-- Status bar -->
    <footer class="status-bar">
      <span>{{ workspaceStore.workspace?.path ?? 'No workspace' }}</span>
      <span v-if="stepsStore.exportedAt" class="steps-info">
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
          <p class="init-question">Would you like to initialize this folder as a new BDD workspace?</p>
          <p class="init-hint">
            <i class="pi pi-lightbulb" />
            This will automatically create the missing <code>package.json</code> and <code>features/</code> directory for you.
          </p>
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          severity="secondary"
          @click="cancelInit"
        />
        <Button
          label="Initialize Workspace"
          icon="pi pi-check"
          @click="initializeWorkspace"
        />
      </template>
    </Dialog>

    <!-- Tools Dialog -->
    <Dialog
      v-model:visible="showToolsDialog"
      header="Tools"
      :style="{ width: '450px' }"
      modal
      :draggable="true"
    >
      <ValidationPanel />
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
  grid-template-columns: 280px 1fr 320px;
  height: 100%;
  gap: 1px;
  background: var(--surface-border);
}

.workspace-layout.workspace-two-panel {
  grid-template-columns: 280px 1fr;
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
  gap: 0.5rem;
}

.panel-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.left-panel .panel-content {
  padding: 0;
}

.center-panel .panel-content {
  padding: 1rem;
}

.right-panel .panel-content {
  padding: 1rem;
}

.builder-content {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 1rem;
  height: 100%;
}

.builder-area {
  overflow: auto;
}

.step-selector-area {
  overflow: hidden;
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
</style>
