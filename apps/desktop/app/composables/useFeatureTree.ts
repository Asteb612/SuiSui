/**
 * Feature tree management composable
 *
 * Handles tree state and CRUD operations for the feature tree,
 * including expand/collapse, selection, and file/folder operations.
 */

import { ref, type Ref } from 'vue'
import type { FeatureTreeNode } from '@suisui/shared'

export interface UseFeatureTreeOptions {
  /** Function to load feature tree from workspace */
  loadTree: () => Promise<void>
  /** Function to load single feature by path */
  loadFeature: (path: string) => Promise<void>
  /** Function to save feature content */
  saveFeature: (path: string, content: string) => Promise<void>
  /** Function to create a new folder */
  createFolder: (parent: string, name: string) => Promise<void>
  /** Function to rename a folder */
  renameFolder: (oldPath: string, newPath: string) => Promise<void>
  /** Function to delete a folder */
  deleteFolder: (path: string) => Promise<void>
  /** Function to rename a feature file */
  renameFeature: (oldPath: string, newPath: string) => Promise<void>
  /** Function to delete a feature file */
  deleteFeature: (path: string) => Promise<void>
}

export interface UseFeatureTreeReturn {
  // State
  expandedKeys: Ref<Record<string, boolean>>
  selectedKey: Ref<string>

  // Computed
  isNodeExpanded: (path: string) => boolean
  isNodeSelected: (path: string) => boolean

  // Actions
  toggleExpanded: (path: string) => void
  expand: (path: string) => void
  collapse: (path: string) => void
  expandAll: (nodes: FeatureTreeNode[]) => void
  collapseAll: () => void
  selectNode: (node: FeatureTreeNode) => Promise<void>
  clearSelection: () => void

  // CRUD operations
  createNewFolder: (parentPath: string, name: string) => Promise<void>
  createNewFeature: (parentPath: string, name: string, content: string) => Promise<void>
  renameNode: (node: FeatureTreeNode, newName: string) => Promise<void>
  deleteNode: (node: FeatureTreeNode) => Promise<void>

  // Utility
  findNode: (nodes: FeatureTreeNode[], path: string) => FeatureTreeNode | null
  getParentPath: (path: string) => string
}

/**
 * Creates feature tree management functionality
 *
 * @param options - Callbacks for tree operations
 * @returns Object with state, computed properties, and actions
 *
 * @example
 * ```ts
 * const {
 *   expandedKeys,
 *   selectedKey,
 *   toggleExpanded,
 *   selectNode,
 *   createNewFolder
 * } = useFeatureTree({
 *   loadTree: () => workspaceStore.loadFeatureTree(),
 *   loadFeature: (path) => scenarioStore.loadFromFeature(path),
 *   // ...
 * })
 * ```
 */
export function useFeatureTree(options: UseFeatureTreeOptions): UseFeatureTreeReturn {
  // Reactive state
  const expandedKeys = ref<Record<string, boolean>>({})
  const selectedKey = ref<string>('')

  // =========================================================================
  // Computed / Helper functions
  // =========================================================================

  /**
   * Checks if a node is expanded
   */
  function isNodeExpanded(path: string): boolean {
    return expandedKeys.value[path] === true
  }

  /**
   * Checks if a node is selected
   */
  function isNodeSelected(path: string): boolean {
    return selectedKey.value === path
  }

  /**
   * Gets the parent path from a file/folder path
   */
  function getParentPath(path: string): string {
    const parts = path.split('/')
    return parts.slice(0, -1).join('/')
  }

  /**
   * Finds a node in the tree by its path
   */
  function findNode(nodes: FeatureTreeNode[], path: string): FeatureTreeNode | null {
    for (const node of nodes) {
      if (node.relativePath === path) {
        return node
      }
      if (node.type === 'folder' && node.children) {
        const found = findNode(node.children, path)
        if (found) return found
      }
    }
    return null
  }

  // =========================================================================
  // Expand/Collapse actions
  // =========================================================================

  /**
   * Toggles the expanded state of a node
   */
  function toggleExpanded(path: string): void {
    if (expandedKeys.value[path]) {
      delete expandedKeys.value[path]
    } else {
      expandedKeys.value[path] = true
    }
  }

  /**
   * Expands a specific node
   */
  function expand(path: string): void {
    expandedKeys.value[path] = true
  }

  /**
   * Collapses a specific node
   */
  function collapse(path: string): void {
    delete expandedKeys.value[path]
  }

  /**
   * Expands all nodes in the tree
   */
  function expandAll(nodes: FeatureTreeNode[]): void {
    function expandRecursive(nodeList: FeatureTreeNode[]) {
      for (const node of nodeList) {
        if (node.type === 'folder') {
          expandedKeys.value[node.relativePath] = true
          if (node.children) {
            expandRecursive(node.children)
          }
        }
      }
    }
    expandRecursive(nodes)
  }

  /**
   * Collapses all nodes
   */
  function collapseAll(): void {
    expandedKeys.value = {}
  }

  // =========================================================================
  // Selection actions
  // =========================================================================

  /**
   * Selects a node and loads its feature if it's a file
   */
  async function selectNode(node: FeatureTreeNode): Promise<void> {
    selectedKey.value = node.relativePath

    if (node.type === 'file' && node.feature) {
      await options.loadFeature(node.feature.relativePath)
    }
  }

  /**
   * Clears the current selection
   */
  function clearSelection(): void {
    selectedKey.value = ''
  }

  // =========================================================================
  // CRUD operations
  // =========================================================================

  /**
   * Creates a new folder
   */
  async function createNewFolder(parentPath: string, name: string): Promise<void> {
    await options.createFolder(parentPath, name)
    await options.loadTree()

    // Expand the parent folder
    if (parentPath) {
      expand(parentPath)
    }
  }

  /**
   * Creates a new feature file
   */
  async function createNewFeature(
    parentPath: string,
    name: string,
    content: string
  ): Promise<void> {
    const fileName = name.trim().toLowerCase().replace(/\s+/g, '-')
    const featurePath = parentPath ? `${parentPath}/${fileName}.feature` : `${fileName}.feature`

    await options.saveFeature(featurePath, content)
    await options.loadTree()

    // Expand parent and select new file
    if (parentPath) {
      expand(parentPath)
    }
    selectedKey.value = featurePath
  }

  /**
   * Renames a node (folder or file)
   */
  async function renameNode(node: FeatureTreeNode, newName: string): Promise<void> {
    const parts = node.relativePath.split('/')
    const parentPath = parts.slice(0, -1).join('/')

    if (node.type === 'folder') {
      const newPath = parentPath ? `${parentPath}/${newName}` : newName
      await options.renameFolder(node.relativePath, newPath)
    } else {
      // For files, append .feature extension
      const extension = newName.endsWith('.feature') ? '' : '.feature'
      const newPath = parentPath ? `${parentPath}/${newName}${extension}` : `${newName}${extension}`
      await options.renameFeature(node.relativePath, newPath)

      // Update selection if renamed node was selected
      if (selectedKey.value === node.relativePath) {
        selectedKey.value = newPath
      }
    }

    await options.loadTree()
  }

  /**
   * Deletes a node (folder or file)
   */
  async function deleteNode(node: FeatureTreeNode): Promise<void> {
    if (node.type === 'folder') {
      await options.deleteFolder(node.relativePath)
    } else {
      await options.deleteFeature(node.relativePath)
    }

    await options.loadTree()

    // Clear selection if deleted node was selected
    if (selectedKey.value === node.relativePath) {
      clearSelection()
    }
  }

  return {
    // State
    expandedKeys,
    selectedKey,

    // Computed
    isNodeExpanded,
    isNodeSelected,

    // Actions
    toggleExpanded,
    expand,
    collapse,
    expandAll,
    collapseAll,
    selectNode,
    clearSelection,

    // CRUD
    createNewFolder,
    createNewFeature,
    renameNode,
    deleteNode,

    // Utility
    findNode,
    getParentPath,
  }
}
