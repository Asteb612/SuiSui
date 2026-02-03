<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FeatureTreeNode } from '@suisui/shared'

interface Props {
  node: FeatureTreeNode
  expanded: boolean
  selected: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  toggle: []
  select: [node: FeatureTreeNode]
  rename: []
  delete: []
  newFeature: []
}>()

const menuRef = ref()

const menuItems = computed(() => {
  const items = []
  
  // Add "New Feature" for folders only
  if (props.node.type === 'folder') {
    items.push({
      label: 'New Feature',
      icon: 'pi pi-file-plus',
      command: () => {
        emit('select', props.node)
        emit('newFeature')
      },
    })
  }
  
  items.push(
    {
      label: 'Rename',
      icon: 'pi pi-pencil',
      command: () => {
        emit('select', props.node)
        emit('rename')
      },
    },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      command: () => {
        emit('select', props.node)
        emit('delete')
      },
    }
  )
  
  return items
})

function showMenu(event: MouseEvent) {
  event.stopPropagation()
  menuRef.value?.toggle(event)
}
</script>

<template>
  <div class="tree-node-item">
    <div
      class="node-content"
      :class="{ selected }"
      @click="emit('select', node)"
    >
      <span
        v-if="node.type === 'folder'"
        class="node-toggle"
        @click.stop="emit('toggle')"
      >
        <i :class="[expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right']" />
      </span>
      <span
        v-else
        class="node-toggle"
        style="width: 1.5rem"
      />

      <i :class="[node.type === 'folder' ? 'pi pi-folder' : 'pi pi-file', 'node-icon']" />
      <span class="node-label">{{ node.name }}</span>

      <div class="node-actions">
        <Button
          v-if="node.type === 'folder'"
          icon="pi pi-file-plus"
          text
          rounded
          size="small"
          title="New Feature"
          class="action-button"
          @click.stop="emit('newFeature')"
        />
        <div
          class="node-menu"
          @click.stop=""
        >
          <Menu
            ref="menuRef"
            :model="menuItems"
            :popup="true"
          />
          <Button
            icon="pi pi-ellipsis-v"
            text
            rounded
            size="small"
            @click="showMenu"
          />
        </div>
      </div>
    </div>

    <div
      v-if="node.type === 'folder' && expanded && node.children"
      class="node-children"
    >
      <TreeNodeItem
        v-for="child in node.children"
        :key="child.relativePath"
        :node="child"
        :expanded="false"
        :selected="false"
        @toggle="() => {}"
        @select="(n) => $emit('select', n)"
        @rename="() => $emit('rename')"
        @delete="() => $emit('delete')"
        @new-feature="() => $emit('newFeature')"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node-item {
  user-select: none;
}

.node-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.node-content:hover {
  background-color: var(--surface-ground);
}

.node-content.selected {
  background-color: var(--primary-color);
  color: white;
}

.node-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  cursor: pointer;
}

.node-toggle i {
  font-size: 0.875rem;
}

.node-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.node-label {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.action-button {
  opacity: 0;
  transition: opacity 0.15s;
}

.node-content:hover .action-button {
  opacity: 1;
}

.node-menu {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.node-children {
  padding-left: 1rem;
}
</style>
