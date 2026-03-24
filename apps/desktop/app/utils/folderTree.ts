import type { TreeNode } from 'primevue/treenode'

/**
 * Builds a hierarchical PrimeVue TreeNode array from a flat list of folder paths.
 * Each node is keyed by its full folder path.
 */
export function buildFolderTree(folders: string[]): TreeNode[] {
  if (folders.length === 0) return []

  const nodeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Sort to ensure parents are processed before children
  const sorted = [...folders].sort()

  for (const folder of sorted) {
    const node: TreeNode = {
      key: folder,
      label: folder.includes('/') ? folder.split('/').pop()! : folder,
      icon: 'pi pi-folder',
      children: [],
    }
    nodeMap.set(folder, node)

    // Find parent by looking for the longest matching prefix
    const lastSlash = folder.lastIndexOf('/')
    if (lastSlash > 0) {
      const parentPath = folder.substring(0, lastSlash)
      const parent = nodeMap.get(parentPath)
      if (parent) {
        parent.children!.push(node)
        continue
      }
    }

    roots.push(node)
  }

  return roots
}
