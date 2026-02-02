<script setup lang="ts">
import { useWorkspaceStore } from '~/stores/workspace'

const workspaceStore = useWorkspaceStore()

async function refreshFeatures() {
  await workspaceStore.loadFeatures()
}

function selectFeature(feature: typeof workspaceStore.features[0]) {
  workspaceStore.selectFeature(feature)
}
</script>

<template>
  <div
    class="feature-list"
    data-testid="feature-list"
  >
    <div class="feature-list-header">
      <span class="feature-count">{{ workspaceStore.featureCount }} features</span>
      <Button
        icon="pi pi-refresh"
        text
        rounded
        size="small"
        :loading="workspaceStore.isLoading"
        @click="refreshFeatures"
      />
    </div>

    <div
      v-if="workspaceStore.features.length === 0"
      class="empty-state"
    >
      <i class="pi pi-file" />
      <p>No features found</p>
    </div>

    <ul
      v-else
      class="feature-items"
    >
      <li
        v-for="feature in workspaceStore.features"
        :key="feature.relativePath"
        :class="{ selected: workspaceStore.selectedFeature?.relativePath === feature.relativePath }"
        @click="selectFeature(feature)"
      >
        <i class="pi pi-file" />
        <span class="feature-name">{{ feature.name }}</span>
        <span class="feature-path">{{ feature.relativePath }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.feature-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.feature-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.feature-count {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text-color-secondary);
  gap: 0.5rem;
}

.empty-state i {
  font-size: 2rem;
}

.feature-items {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.feature-items li {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--surface-border);
  transition: background-color 0.15s;
}

.feature-items li:hover {
  background-color: var(--surface-ground);
}

.feature-items li.selected {
  background-color: var(--primary-color);
  color: white;
}

.feature-items li.selected .feature-path {
  color: rgba(255, 255, 255, 0.7);
}

.feature-items li i {
  margin-right: 0.5rem;
}

.feature-name {
  font-weight: 500;
  display: flex;
  align-items: center;
}

.feature-path {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin-top: 0.25rem;
}
</style>
