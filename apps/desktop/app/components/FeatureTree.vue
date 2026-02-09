<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { useScenarioStore } from '~/stores/scenario'
import { useStepsStore } from '~/stores/steps'
import type { FeatureTreeNode } from '@suisui/shared'

const workspaceStore = useWorkspaceStore()
const scenarioStore = useScenarioStore()
const stepsStore = useStepsStore()

const expandedKeys = ref<Record<string, boolean>>({})
const selectedKey = ref<string>('')
const showNewFolderDialog = ref(false)
const showNewFeatureDialog = ref(false)
const showRenameDialog = ref(false)
const showDeleteConfirm = ref(false)

const newFolderName = ref('')
const newFolderParent = ref('')
const newFeatureParent = ref('')
const renameName = ref('')
const renameNode = ref<FeatureTreeNode | null>(null)
const deleteNode = ref<FeatureTreeNode | null>(null)

const treeData = computed(() => workspaceStore.featureTree)

function onNodeSelect(node: FeatureTreeNode) {
  selectedKey.value = node.relativePath
  if (node.type === 'file' && node.feature) {
    scenarioStore.loadFromFeature(node.feature.relativePath, stepsStore.steps)
  }
}

function toggleExpanded(path: string) {
  if (expandedKeys.value[path]) {
    delete expandedKeys.value[path]
  } else {
    expandedKeys.value[path] = true
  }
}

// Provide expansion and selection state to all nested TreeNodeItem components
provide('expandedKeys', expandedKeys)
provide('selectedKey', selectedKey)
provide('toggleExpanded', toggleExpanded)
provide('onNodeSelect', onNodeSelect)

function openNewFolderDialog(parentPath?: string) {
  newFolderName.value = ''
  newFolderParent.value = parentPath || ''
  showNewFolderDialog.value = true
}

async function createNewFolder() {
  if (!newFolderName.value.trim()) return
  await workspaceStore.createFolder(newFolderParent.value, newFolderName.value)
  await workspaceStore.loadFeatureTree()
  showNewFolderDialog.value = false
}

function openNewFeatureDialog(parentPath?: string) {
  newFeatureParent.value = parentPath || ''
  showNewFeatureDialog.value = true
}

async function createNewFeature(data: { name: string; fileName: string }) {
  const featurePath = newFeatureParent.value 
    ? `${newFeatureParent.value}/${data.fileName}` 
    : data.fileName
  
  scenarioStore.createNew(data.name)
  await scenarioStore.save(featurePath)
  await workspaceStore.loadFeatureTree()
  await workspaceStore.loadFeatures()
  showNewFeatureDialog.value = false
  
  // Load the newly created feature
  scenarioStore.loadFromFeature(featurePath, stepsStore.steps)
  selectedKey.value = featurePath
}


async function confirmRename() {
  if (!renameNode.value || !renameName.value.trim()) return
  if (renameNode.value.type === 'folder') {
    const parts = renameNode.value.relativePath.split('/')
    const newPath = [...parts.slice(0, -1), renameName.value].join('/')
    await workspaceStore.renameFolder(renameNode.value.relativePath, newPath)
  } else {
    const parts = renameNode.value.relativePath.split('/')
    const newPath = [...parts.slice(0, -1), renameName.value + '.feature'].join('/')
    await workspaceStore.renameFeature(renameNode.value.relativePath, newPath)
  }
  await workspaceStore.loadFeatureTree()
  showRenameDialog.value = false
}


async function confirmDelete() {
  if (!deleteNode.value) return
  if (deleteNode.value.type === 'folder') {
    await workspaceStore.deleteFolder(deleteNode.value.relativePath)
  } else {
    await workspaceStore.deleteFeature(deleteNode.value.relativePath)
  }
  await workspaceStore.loadFeatureTree()
  showDeleteConfirm.value = false
  selectedKey.value = ''
}

watch(
  () => workspaceStore.workspace,
  () => {
    if (workspaceStore.workspace) {
      workspaceStore.loadFeatureTree()
    }
  },
  { immediate: true }
)

async function refreshTree() {
  await workspaceStore.loadFeatureTree()
}

</script>

<template>
  <div class="feature-tree-container">
    <div class="feature-tree-header">
      <span class="feature-count">{{ workspaceStore.featureCount }} features</span>
      <div class="header-actions">
        <Button
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          :loading="workspaceStore.isLoading"
          @click="refreshTree"
        />
        <Button
          icon="pi pi-folder-plus"
          text
          rounded
          size="small"
          title="New Folder"
          @click="openNewFolderDialog()"
        />
      </div>
    </div>

    <div
      v-if="treeData.length === 0"
      class="empty-state"
    >
      <i class="pi pi-inbox" />
      <p>No features yet</p>
    </div>

    <div
      v-else
      class="tree-wrapper"
    >
      <div
        v-for="node in treeData"
        :key="node.relativePath"
        class="tree-node-group"
      >
        <TreeNodeItem
          :node="node"
          :expanded="expandedKeys[node.relativePath] || false"
          :selected="selectedKey === node.relativePath"
          @toggle="toggleExpanded(node.relativePath)"
          @select="onNodeSelect"
          @rename="() => {renameNode = node; renameName = node.name; showRenameDialog = true}"
          @delete="() => {deleteNode = node; showDeleteConfirm = true}"
          @new-feature="() => openNewFeatureDialog(node.relativePath)"
          @new-folder="() => openNewFolderDialog(node.relativePath)"
        />
      </div>
    </div>

    <!-- Dialogs -->
    <NewScenarioDialog
      v-model:visible="showNewFeatureDialog"
      @create="createNewFeature"
    />

    <Dialog
      v-model:visible="showNewFolderDialog"
      header="New Folder"
      :modal="true"
      :closable="true"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="folderName">Folder Name</label>
          <InputText
            id="folderName"
            v-model="newFolderName"
            placeholder="Enter folder name"
            @keyup.enter="createNewFolder"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          @click="showNewFolderDialog = false"
        />
        <Button
          label="Create"
          @click="createNewFolder"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showRenameDialog"
      header="Rename"
      :modal="true"
      :closable="true"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="renameName">New Name</label>
          <InputText
            id="renameName"
            v-model="renameName"
            :placeholder="`Enter new ${renameNode?.type} name`"
            @keyup.enter="confirmRename"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          @click="showRenameDialog = false"
        />
        <Button
          label="Rename"
          @click="confirmRename"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showDeleteConfirm"
      header="Delete Confirmation"
      :modal="true"
      :closable="true"
    >
      <div class="confirm-content">
        <i class="pi pi-exclamation-triangle warning-icon" />
        <p>
          Are you sure you want to delete
          <strong>{{ deleteNode?.name }}</strong>?
        </p>
        <p
          v-if="deleteNode?.type === 'folder'"
          class="warning-text"
        >
          This folder and all its contents will be permanently deleted.
        </p>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          @click="showDeleteConfirm = false"
        />
        <Button
          label="Delete"
          severity="danger"
          @click="confirmDelete"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.feature-tree-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.feature-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--surface-border);
  gap: 1rem;
}

.feature-count {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  color: var(--text-color-secondary);
  gap: 1rem;
}

.empty-state i {
  font-size: 3rem;
  opacity: 0.5;
}

.tree-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.tree-node-group {
  margin-bottom: 0.5rem;
}

.dialog-content {
  padding: 1rem 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-size: 0.875rem;
  font-weight: 500;
}

.confirm-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  text-align: center;
}

.warning-icon {
  font-size: 2rem;
  color: var(--warn-color);
}

.warning-text {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}
</style>
