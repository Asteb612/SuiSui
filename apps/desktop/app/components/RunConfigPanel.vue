<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRunnerStore } from '~/stores/runner'
import { buildFolderTree } from '~/utils/folderTree'

const runnerStore = useRunnerStore()
const nameFilterInput = ref(runnerStore.config.nameFilter)
let nameFilterTimer: ReturnType<typeof setTimeout> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

// Debounce name filter input
watch(nameFilterInput, (val) => {
  if (nameFilterTimer) clearTimeout(nameFilterTimer)
  nameFilterTimer = setTimeout(() => {
    runnerStore.config.nameFilter = val
  }, 300)
})

// Persist config changes (debounced)
watch(
  () => runnerStore.config,
  () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      runnerStore.persistConfig()
    }, 500)
  },
  { deep: true },
)

function runHeadless() {
  runnerStore.runBatch('headless')
}

function runUI() {
  runnerStore.runBatch('ui')
}

function stopRun() {
  runnerStore.stop()
}

// Feature selection helpers
const allFeaturesSelected = computed(() => {
  if (!runnerStore.workspaceTests) return false
  return runnerStore.config.selectedFeatures.length === 0
})

function toggleAllFeatures() {
  if (allFeaturesSelected.value) {
    runnerStore.config.selectedFeatures = runnerStore.workspaceTests?.features.map(
      (f) => f.relativePath,
    ) ?? []
  } else {
    runnerStore.config.selectedFeatures = []
  }
}

function toggleFeature(path: string) {
  const idx = runnerStore.config.selectedFeatures.indexOf(path)
  if (idx >= 0) {
    runnerStore.config.selectedFeatures.splice(idx, 1)
  } else {
    runnerStore.config.selectedFeatures.push(path)
  }
}

function isFeatureSelected(path: string): boolean {
  return (
    runnerStore.config.selectedFeatures.length === 0 ||
    runnerStore.config.selectedFeatures.includes(path)
  )
}

// Folder tree
const folderTreeNodes = computed(() => {
  if (!runnerStore.workspaceTests) return []
  return buildFolderTree(runnerStore.workspaceTests.folders)
})

const folderSelectionKeys = computed({
  get() {
    const keys: Record<string, { checked: boolean; partialChecked: boolean }> = {}
    for (const folder of runnerStore.config.selectedFolders) {
      keys[folder] = { checked: true, partialChecked: false }
    }
    return keys
  },
  set(val: Record<string, { checked: boolean; partialChecked: boolean }>) {
    runnerStore.config.selectedFolders = Object.entries(val)
      .filter(([, v]) => v.checked)
      .map(([k]) => k)
  },
})

// Tag selection
function toggleTag(tag: string) {
  const idx = runnerStore.config.selectedTags.indexOf(tag)
  if (idx >= 0) {
    runnerStore.config.selectedTags.splice(idx, 1)
  } else {
    runnerStore.config.selectedTags.push(tag)
  }
}

// Active filter count
const activeFilterCount = computed(() => {
  let count = 0
  if (runnerStore.config.selectedFeatures.length > 0) count++
  if (runnerStore.config.selectedFolders.length > 0) count++
  if (runnerStore.config.selectedTags.length > 0) count++
  if (runnerStore.config.nameFilter) count++
  return count
})

function clearAllFilters() {
  runnerStore.config.selectedFeatures = []
  runnerStore.config.selectedFolders = []
  runnerStore.config.selectedTags = []
  runnerStore.config.nameFilter = ''
  nameFilterInput.value = ''
}
</script>

<template>
  <div class="run-config-panel">
    <!-- Fixed Toolbar -->
    <div class="run-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-field">
          <label class="toolbar-label">Base URL</label>
          <InputText
            :model-value="runnerStore.config.baseUrl"
            placeholder="e.g. http://localhost:3000"
            size="small"
            class="base-url-input"
            @update:model-value="(val: string | undefined) => runnerStore.setBaseUrl(val ?? '')"
          />
        </div>
        <div class="toolbar-field">
          <label class="toolbar-label">Execution</label>
          <SelectButton
            :model-value="runnerStore.config.executionMode"
            :options="[
              { label: 'Sequential', value: 'sequential' },
              { label: 'Parallel', value: 'parallel' },
            ]"
            option-label="label"
            option-value="value"
            size="small"
            :allow-empty="false"
            @update:model-value="(val: 'sequential' | 'parallel') => { runnerStore.config.executionMode = val }"
          />
        </div>
      </div>
      <div class="toolbar-center">
        <span
          v-if="runnerStore.workspaceTests"
          class="matched-count"
        >
          <strong>{{ runnerStore.matchedTests.scenarioCount }}</strong>
          scenario{{ runnerStore.matchedTests.scenarioCount !== 1 ? 's' : '' }}
          across
          <strong>{{ runnerStore.matchedTests.features.length }}</strong>
          feature{{ runnerStore.matchedTests.features.length !== 1 ? 's' : '' }}
          will run
        </span>
        <span
          v-else
          class="loading-tests"
        >
          <i class="pi pi-spin pi-spinner" /> Loading tests...
        </span>
      </div>
      <div class="toolbar-right">
        <template v-if="!runnerStore.isRunning">
          <Button
            icon="pi pi-play"
            label="Run Headless"
            size="small"
            severity="success"
            :disabled="!runnerStore.canRun"
            title="Run all matched tests in headless mode"
            @click="runHeadless"
          />
          <Button
            icon="pi pi-desktop"
            label="Run UI"
            size="small"
            outlined
            :disabled="!runnerStore.canRun"
            title="Run with Playwright Inspector"
            @click="runUI"
          />
        </template>
        <template v-else>
          <Button
            icon="pi pi-stop"
            label="Stop"
            size="small"
            severity="danger"
            @click="stopRun"
          />
          <span class="running-indicator">
            <i class="pi pi-spin pi-spinner" /> Running...
          </span>
        </template>
      </div>
    </div>

    <!-- Content: Results or Filters -->
    <div class="run-content">
      <!-- Results view (replaces filters when showResults is true) -->
      <RunResultsPanel v-if="runnerStore.showResults" />

      <!-- Filter tabs (shown when not viewing results) -->
      <template v-else>
        <div
          v-if="runnerStore.workspaceTests"
          class="filter-section"
        >
          <div class="filter-header">
            <span class="filter-title">
              Filters
              <span
                v-if="activeFilterCount > 0"
                class="filter-badge"
              >{{ activeFilterCount }}</span>
            </span>
            <div class="filter-toggles">
              <Button
                label="Features"
                :outlined="runnerStore.config.activeFilterTab !== 'features'"
                :severity="runnerStore.config.activeFilterTab === 'features' ? undefined : 'secondary'"
                size="small"
                @click="runnerStore.config.activeFilterTab = 'features'"
              />
              <Button
                label="Folders"
                :outlined="runnerStore.config.activeFilterTab !== 'folders'"
                :severity="runnerStore.config.activeFilterTab === 'folders' ? undefined : 'secondary'"
                size="small"
                @click="runnerStore.config.activeFilterTab = 'folders'"
              />
              <Button
                v-if="runnerStore.workspaceTests.allTags.length > 0"
                label="Tags"
                :outlined="runnerStore.config.activeFilterTab !== 'tags'"
                :severity="runnerStore.config.activeFilterTab === 'tags' ? undefined : 'secondary'"
                size="small"
                @click="runnerStore.config.activeFilterTab = 'tags'"
              />
              <Button
                v-if="activeFilterCount > 0"
                icon="pi pi-filter-slash"
                label="Clear"
                text
                size="small"
                severity="secondary"
                @click="clearAllFilters"
              />
            </div>
          </div>

          <!-- Name Filter (always visible alongside active tab) -->
          <div class="config-section">
            <label class="config-label">Name</label>
            <InputText
              v-model="nameFilterInput"
              placeholder="Filter scenarios by name..."
              size="small"
              class="name-filter-input"
            />
            <Button
              v-if="nameFilterInput"
              icon="pi pi-times"
              text
              rounded
              size="small"
              severity="secondary"
              @click="nameFilterInput = ''; runnerStore.config.nameFilter = ''"
            />
          </div>

          <!-- Features Tab Content -->
          <div
            v-if="runnerStore.config.activeFilterTab === 'features'"
            class="filter-list"
          >
            <div class="filter-list-header">
              <label class="filter-list-title">Feature Files</label>
              <Button
                :label="allFeaturesSelected ? 'Deselect All' : 'Select All'"
                text
                size="small"
                @click="toggleAllFeatures"
              />
            </div>
            <div
              v-for="feature in runnerStore.workspaceTests.features"
              :key="feature.relativePath"
              class="filter-item"
              @click="toggleFeature(feature.relativePath)"
            >
              <Checkbox
                :model-value="isFeatureSelected(feature.relativePath)"
                :binary="true"
                @click.stop="toggleFeature(feature.relativePath)"
              />
              <span class="filter-item-label">{{ feature.name || feature.relativePath }}</span>
              <span class="filter-item-meta">{{ feature.scenarios.length }} scenarios</span>
            </div>
          </div>

          <!-- Folders Tab Content -->
          <div
            v-if="runnerStore.config.activeFilterTab === 'folders'"
            class="filter-list"
          >
            <label class="filter-list-title">Folders</label>
            <Tree
              v-model:selection-keys="folderSelectionKeys"
              :value="folderTreeNodes"
              selection-mode="checkbox"
              class="folder-tree"
            />
          </div>

          <!-- Tags Tab Content -->
          <div
            v-if="runnerStore.config.activeFilterTab === 'tags' && runnerStore.workspaceTests.allTags.length > 0"
            class="filter-list"
          >
            <label class="filter-list-title">Tags</label>
            <div class="tag-list">
              <Button
                v-for="tag in runnerStore.workspaceTests.allTags"
                :key="tag"
                :label="`@${tag}`"
                size="small"
                :outlined="!runnerStore.config.selectedTags.includes(tag)"
                :severity="runnerStore.config.selectedTags.includes(tag) ? undefined : 'secondary'"
                @click="toggleTag(tag)"
              />
            </div>
          </div>
        </div>

        <!-- Empty workspace -->
        <div
          v-if="runnerStore.workspaceTests && runnerStore.workspaceTests.features.length === 0"
          class="no-tests-message"
        >
          <i class="pi pi-inbox" />
          No feature files found in the workspace. Create feature files in the features/ directory to get started.
        </div>

        <!-- No tests match filters -->
        <div
          v-else-if="runnerStore.workspaceTests && runnerStore.matchedTests.scenarioCount === 0"
          class="no-tests-message"
        >
          <i class="pi pi-info-circle" />
          No tests match the current filters. Adjust filters or clear them to run all tests.
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.run-config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.run-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-surface-50);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.toolbar-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.toolbar-center {
  flex: 1;
  text-align: center;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.base-url-input {
  min-width: 180px;
}

.matched-count {
  font-size: 0.85rem;
  color: var(--p-text-color);
}

.loading-tests {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.running-indicator {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.run-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  border-radius: 50%;
  width: 1.2rem;
  height: 1.2rem;
  font-size: 0.7rem;
  font-weight: 700;
}

.filter-toggles {
  display: flex;
  gap: 0.25rem;
}

.config-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.config-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  min-width: 4rem;
}

.name-filter-input {
  flex: 1;
}

.filter-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: var(--p-surface-50);
  border-radius: var(--p-border-radius);
  max-height: 400px;
  overflow-y: auto;
}

.filter-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-list-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.35rem;
  border-radius: var(--p-border-radius);
  cursor: pointer;
  font-size: 0.8rem;
}

.filter-item:hover {
  background: var(--p-surface-hover);
}

.filter-item-label {
  flex: 1;
}

.filter-item-meta {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.folder-tree {
  border: none;
  padding: 0;
  background: transparent;
}

.folder-tree :deep(.p-tree-node-content) {
  padding: 0.2rem 0;
}

.folder-tree :deep(.p-tree-node-label) {
  font-size: 0.8rem;
}

.no-tests-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  margin: 0.75rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-100);
  border-radius: var(--p-border-radius);
}
</style>
