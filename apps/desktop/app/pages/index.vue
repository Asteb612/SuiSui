<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'
import { useGitStore } from '~/stores/git'

const workspaceStore = useWorkspaceStore()
const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()
const gitStore = useGitStore()

onMounted(async () => {
  await workspaceStore.loadWorkspace()
  if (workspaceStore.hasWorkspace) {
    await stepsStore.loadCached()
    await gitStore.refreshStatus()
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

function createNewFeature() {
  const name = prompt('Enter feature name:')
  if (!name) return
  const fileName = name.toLowerCase().replace(/\s+/g, '-') + '.feature'
  scenarioStore.clear()
  scenarioStore.setName(name)
  workspaceStore.selectFeature({
    path: '',
    name,
    relativePath: fileName,
  })
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
        <i class="pi pi-folder-open" style="font-size: 4rem; color: var(--text-color-secondary)" />
        <h2>No workspace selected</h2>
        <p>Select a workspace directory to get started</p>
        <Button
          label="Select Workspace"
          icon="pi pi-folder"
          @click="workspaceStore.selectWorkspace"
        />
      </div>

      <div v-else class="workspace-layout">
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
              @click="createNewFeature"
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

        <!-- Right Panel: Validation & Runner -->
        <aside class="panel right-panel">
          <div class="panel-header">
            <h3>Tools</h3>
          </div>
          <div class="panel-content">
            <ValidationPanel />
          </div>
        </aside>
      </div>
    </main>

    <!-- Status bar -->
    <footer class="status-bar">
      <span>{{ workspaceStore.workspace?.path ?? 'No workspace' }}</span>
      <span v-if="stepsStore.exportedAt" class="steps-info">
        {{ stepsStore.steps.length }} steps loaded
      </span>
    </footer>
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
  gap: 1rem;
  color: var(--text-color-secondary);
}

.no-workspace h2 {
  color: var(--text-color);
}

.workspace-layout {
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  height: 100%;
  gap: 1px;
  background: var(--surface-border);
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
</style>
