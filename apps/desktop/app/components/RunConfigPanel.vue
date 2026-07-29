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

// --- Feature selection ---
//
// An EMPTY selection means "no feature filter", so everything runs. The checkbox
// used to render that as every box ticked, which made clicking a ticked box
// deselect all the others — it was really the first tick of an empty list. The
// boxes now show the actual selection, and the header says what empty means.

const allFeaturesSelected = computed(() => {
  const total = runnerStore.workspaceTests?.features.length ?? 0
  return total > 0 && runnerStore.config.selectedFeatures.length === total
})

const noFeatureFilter = computed(() => runnerStore.config.selectedFeatures.length === 0)

function toggleAllFeatures() {
  runnerStore.config.selectedFeatures = allFeaturesSelected.value
    ? []
    : (runnerStore.workspaceTests?.features.map((f) => f.relativePath) ?? [])
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
  return runnerStore.config.selectedFeatures.includes(path)
}

/** Tests a feature will run — outlines count once per example row, not once. */
function featureTestCount(feature: { scenarios: { testCount?: number }[] }): number {
  return feature.scenarios.reduce((sum, s) => sum + (s.testCount ?? 1), 0)
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
        <!-- Only while choosing what to run: it configures the next run, and has
             nothing to say once the results are on screen. -->
        <div
          v-if="!runnerStore.singleRun && !runnerStore.showResults"
          class="toolbar-field"
          data-testid="execution-selector"
        >
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
      <!-- The matched-test count lives on the header row (pages/index.vue), beside
           the back button — same line as the logs toggle it alternates with. -->
      <div class="toolbar-right">
        <!-- Stopping a run lives in the Test Runner header (pages/index.vue), on the
             row with the back button — it is a control over the run, not over the
             filters, and it must stay put as this toolbar empties out.
             Idle + global: the filter-based run buttons.
             Idle + single-spec: nothing (re-run from the editor's quick-run instead). -->
        <template v-if="!runnerStore.isRunning && !runnerStore.singleRun">
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
                data-testid="filter-tab-features"
                @click="runnerStore.config.activeFilterTab = 'features'"
              />
              <Button
                label="Folders"
                :outlined="runnerStore.config.activeFilterTab !== 'folders'"
                :severity="runnerStore.config.activeFilterTab === 'folders' ? undefined : 'secondary'"
                size="small"
                data-testid="filter-tab-folders"
                @click="runnerStore.config.activeFilterTab = 'folders'"
              />
              <Button
                v-if="runnerStore.workspaceTests.allTags.length > 0"
                label="Tags"
                :outlined="runnerStore.config.activeFilterTab !== 'tags'"
                :severity="runnerStore.config.activeFilterTab === 'tags' ? undefined : 'secondary'"
                size="small"
                data-testid="filter-tab-tags"
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
              <label class="filter-list-title">
                Feature Files
                <span
                  v-if="noFeatureFilter"
                  class="filter-list-hint"
                  data-testid="features-no-filter-hint"
                >none selected — all run</span>
              </label>
              <Button
                :label="allFeaturesSelected ? 'Deselect All' : 'Select All'"
                text
                size="small"
                data-testid="features-select-all"
                @click="toggleAllFeatures"
              />
            </div>
            <div
              v-for="feature in runnerStore.workspaceTests.features"
              :key="feature.relativePath"
              class="filter-item"
              data-testid="feature-filter-item"
              :data-path="feature.relativePath"
              :data-selected="isFeatureSelected(feature.relativePath)"
              @click="toggleFeature(feature.relativePath)"
            >
              <!-- A plain input, not PrimeVue's Checkbox: that one keeps its own
                   copy of the value and only writes it back through
                   `update:modelValue`. Driving it from `@click` left the two
                   diverging — the filter applied but the box never ticked, and
                   boxes it had ticked internally survived Clear. Here `checked`
                   is a pure function of the selection, so it cannot disagree. -->
              <input
                type="checkbox"
                class="filter-item-checkbox"
                :checked="isFeatureSelected(feature.relativePath)"
                :aria-label="feature.name || feature.relativePath"
                @click.stop="toggleFeature(feature.relativePath)"
              >
              <span class="filter-item-label">{{ feature.name || feature.relativePath }}</span>
              <span class="filter-item-meta">{{ featureTestCount(feature) }} tests</span>
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
                data-testid="tag-filter-item"
                :data-tag="tag"
                :data-selected="runnerStore.config.selectedTags.includes(tag)"
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
  /* Pushes the run buttons to the right now that nothing sits between them. */
  flex: 1;
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

/* Says what an empty selection means, so unticked boxes do not read as "nothing". */
.filter-list-hint {
  margin-left: 0.4rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
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

.filter-item-checkbox {
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  margin: 0;
  accent-color: var(--p-primary-color);
  cursor: pointer;
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
