import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFeatureTree, type UseFeatureTreeOptions } from '../composables/useFeatureTree'
import { mockFeatureTree, createMockFeatureTreeNode } from './testUtils'
import type { FeatureTreeNode } from '@suisui/shared'

describe('useFeatureTree', () => {
  let options: UseFeatureTreeOptions

  beforeEach(() => {
    options = {
      loadTree: vi.fn().mockResolvedValue(undefined),
      loadFeature: vi.fn().mockResolvedValue(undefined),
      saveFeature: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      renameFolder: vi.fn().mockResolvedValue(undefined),
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      renameFeature: vi.fn().mockResolvedValue(undefined),
      deleteFeature: vi.fn().mockResolvedValue(undefined),
    }
  })

  describe('initial state', () => {
    it('initializes with empty expandedKeys', () => {
      const { expandedKeys } = useFeatureTree(options)
      expect(expandedKeys.value).toEqual({})
    })

    it('initializes with empty selectedKey', () => {
      const { selectedKey } = useFeatureTree(options)
      expect(selectedKey.value).toBe('')
    })
  })

  describe('expand/collapse', () => {
    describe('toggleExpanded', () => {
      it('expands a collapsed node', () => {
        const { expandedKeys, toggleExpanded } = useFeatureTree(options)

        toggleExpanded('auth')

        expect(expandedKeys.value['auth']).toBe(true)
      })

      it('collapses an expanded node', () => {
        const { expandedKeys, toggleExpanded } = useFeatureTree(options)

        toggleExpanded('auth')
        toggleExpanded('auth')

        expect(expandedKeys.value['auth']).toBeUndefined()
      })
    })

    describe('expand', () => {
      it('expands a specific node', () => {
        const { expandedKeys, expand } = useFeatureTree(options)

        expand('folder/path')

        expect(expandedKeys.value['folder/path']).toBe(true)
      })

      it('keeps already expanded nodes expanded', () => {
        const { expandedKeys, expand } = useFeatureTree(options)

        expand('path1')
        expand('path2')

        expect(expandedKeys.value['path1']).toBe(true)
        expect(expandedKeys.value['path2']).toBe(true)
      })
    })

    describe('collapse', () => {
      it('collapses an expanded node', () => {
        const { expandedKeys, expand, collapse } = useFeatureTree(options)

        expand('folder')
        collapse('folder')

        expect(expandedKeys.value['folder']).toBeUndefined()
      })

      it('does nothing for already collapsed node', () => {
        const { expandedKeys, collapse } = useFeatureTree(options)

        collapse('nonexistent')

        expect(Object.keys(expandedKeys.value)).toHaveLength(0)
      })
    })

    describe('expandAll', () => {
      it('expands all folder nodes', () => {
        const { expandedKeys, expandAll } = useFeatureTree(options)

        expandAll(mockFeatureTree)

        expect(expandedKeys.value['auth']).toBe(true)
      })

      it('does not include file nodes in expandedKeys', () => {
        const { expandedKeys, expandAll } = useFeatureTree(options)

        expandAll(mockFeatureTree)

        expect(expandedKeys.value['home.feature']).toBeUndefined()
        expect(expandedKeys.value['auth/login.feature']).toBeUndefined()
      })

      it('handles nested folders', () => {
        const nestedTree: FeatureTreeNode[] = [
          {
            type: 'folder',
            name: 'level1',
            relativePath: 'level1',
            children: [
              {
                type: 'folder',
                name: 'level2',
                relativePath: 'level1/level2',
                children: [
                  {
                    type: 'folder',
                    name: 'level3',
                    relativePath: 'level1/level2/level3',
                    children: [],
                  },
                ],
              },
            ],
          },
        ]

        const { expandedKeys, expandAll } = useFeatureTree(options)

        expandAll(nestedTree)

        expect(expandedKeys.value['level1']).toBe(true)
        expect(expandedKeys.value['level1/level2']).toBe(true)
        expect(expandedKeys.value['level1/level2/level3']).toBe(true)
      })

      it('handles empty tree', () => {
        const { expandedKeys, expandAll } = useFeatureTree(options)

        expandAll([])

        expect(Object.keys(expandedKeys.value)).toHaveLength(0)
      })
    })

    describe('collapseAll', () => {
      it('clears all expanded keys', () => {
        const { expandedKeys, expand, collapseAll } = useFeatureTree(options)

        expand('path1')
        expand('path2')
        expand('path3')

        collapseAll()

        expect(Object.keys(expandedKeys.value)).toHaveLength(0)
      })
    })
  })

  describe('isNodeExpanded', () => {
    it('returns true for expanded node', () => {
      const { expand, isNodeExpanded } = useFeatureTree(options)

      expand('folder')

      expect(isNodeExpanded('folder')).toBe(true)
    })

    it('returns false for collapsed node', () => {
      const { isNodeExpanded } = useFeatureTree(options)

      expect(isNodeExpanded('folder')).toBe(false)
    })
  })

  describe('isNodeSelected', () => {
    it('returns true for selected node', async () => {
      const { selectNode, isNodeSelected } = useFeatureTree(options)
      const node = createMockFeatureTreeNode({ type: 'folder', relativePath: 'auth' })

      await selectNode(node)

      expect(isNodeSelected('auth')).toBe(true)
    })

    it('returns false for non-selected node', () => {
      const { isNodeSelected } = useFeatureTree(options)

      expect(isNodeSelected('any-path')).toBe(false)
    })
  })

  describe('selectNode', () => {
    it('sets selectedKey to node path', async () => {
      const { selectedKey, selectNode } = useFeatureTree(options)
      const node = createMockFeatureTreeNode({ type: 'folder', relativePath: 'auth' })

      await selectNode(node)

      expect(selectedKey.value).toBe('auth')
    })

    it('loads feature when selecting file node', async () => {
      const { selectNode } = useFeatureTree(options)
      const node: FeatureTreeNode = {
        type: 'file',
        name: 'login',
        relativePath: 'auth/login.feature',
        feature: {
          path: '/test/auth/login.feature',
          name: 'Login',
          relativePath: 'auth/login.feature',
          content: 'Feature: Login',
        },
      }

      await selectNode(node)

      expect(options.loadFeature).toHaveBeenCalledWith('auth/login.feature')
    })

    it('does not load feature for folder node', async () => {
      const { selectNode } = useFeatureTree(options)
      const node: FeatureTreeNode = {
        type: 'folder',
        name: 'auth',
        relativePath: 'auth',
        children: [],
      }

      await selectNode(node)

      expect(options.loadFeature).not.toHaveBeenCalled()
    })
  })

  describe('clearSelection', () => {
    it('clears the selected key', async () => {
      const { selectedKey, selectNode, clearSelection } = useFeatureTree(options)
      const node = createMockFeatureTreeNode({ relativePath: 'test' })

      await selectNode(node)
      clearSelection()

      expect(selectedKey.value).toBe('')
    })
  })

  describe('CRUD operations', () => {
    describe('createNewFolder', () => {
      it('calls createFolder with correct arguments', async () => {
        const { createNewFolder } = useFeatureTree(options)

        await createNewFolder('parent', 'newFolder')

        expect(options.createFolder).toHaveBeenCalledWith('parent', 'newFolder')
      })

      it('reloads tree after creation', async () => {
        const { createNewFolder } = useFeatureTree(options)

        await createNewFolder('', 'folder')

        expect(options.loadTree).toHaveBeenCalled()
      })

      it('expands parent folder after creation', async () => {
        const { expandedKeys, createNewFolder } = useFeatureTree(options)

        await createNewFolder('parent', 'child')

        expect(expandedKeys.value['parent']).toBe(true)
      })

      it('does not expand when parent is empty string', async () => {
        const { expandedKeys, createNewFolder } = useFeatureTree(options)

        await createNewFolder('', 'rootFolder')

        expect(Object.keys(expandedKeys.value)).toHaveLength(0)
      })
    })

    describe('createNewFeature', () => {
      it('saves feature with correct path and content', async () => {
        const { createNewFeature } = useFeatureTree(options)

        await createNewFeature('auth', 'Login Test', 'Feature: Login Test')

        expect(options.saveFeature).toHaveBeenCalledWith(
          'auth/login-test.feature',
          'Feature: Login Test'
        )
      })

      it('converts name to kebab-case for filename', async () => {
        const { createNewFeature } = useFeatureTree(options)

        await createNewFeature('', 'My Test Feature', 'content')

        expect(options.saveFeature).toHaveBeenCalledWith('my-test-feature.feature', 'content')
      })

      it('handles root level feature', async () => {
        const { createNewFeature } = useFeatureTree(options)

        await createNewFeature('', 'RootFeature', 'content')

        expect(options.saveFeature).toHaveBeenCalledWith('rootfeature.feature', 'content')
      })

      it('selects newly created feature', async () => {
        const { selectedKey, createNewFeature } = useFeatureTree(options)

        await createNewFeature('folder', 'New Feature', 'content')

        expect(selectedKey.value).toBe('folder/new-feature.feature')
      })

      it('expands parent folder', async () => {
        const { expandedKeys, createNewFeature } = useFeatureTree(options)

        await createNewFeature('parent', 'Test', 'content')

        expect(expandedKeys.value['parent']).toBe(true)
      })

      it('reloads tree after creation', async () => {
        const { createNewFeature } = useFeatureTree(options)

        await createNewFeature('', 'Test', 'content')

        expect(options.loadTree).toHaveBeenCalled()
      })
    })

    describe('renameNode', () => {
      it('renames folder with correct paths', async () => {
        const { renameNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'folder',
          name: 'old',
          relativePath: 'parent/old',
          children: [],
        }

        await renameNode(node, 'new')

        expect(options.renameFolder).toHaveBeenCalledWith('parent/old', 'parent/new')
      })

      it('renames root folder correctly', async () => {
        const { renameNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'folder',
          name: 'old',
          relativePath: 'old',
          children: [],
        }

        await renameNode(node, 'new')

        expect(options.renameFolder).toHaveBeenCalledWith('old', 'new')
      })

      it('renames feature file with extension', async () => {
        const { renameNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'file',
          name: 'old',
          relativePath: 'folder/old.feature',
          feature: { path: '/test/folder/old.feature', name: 'Old', relativePath: 'folder/old.feature', content: '' },
        }

        await renameNode(node, 'new')

        expect(options.renameFeature).toHaveBeenCalledWith('folder/old.feature', 'folder/new.feature')
      })

      it('does not double .feature extension', async () => {
        const { renameNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'file',
          name: 'old',
          relativePath: 'old.feature',
          feature: { path: '/test/old.feature', name: 'Old', relativePath: 'old.feature', content: '' },
        }

        await renameNode(node, 'new.feature')

        expect(options.renameFeature).toHaveBeenCalledWith('old.feature', 'new.feature')
      })

      it('updates selection when renamed node was selected', async () => {
        const { selectedKey, selectNode, renameNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'file',
          name: 'old',
          relativePath: 'old.feature',
          feature: { path: '/test/old.feature', name: 'Old', relativePath: 'old.feature', content: '' },
        }

        await selectNode(node)
        await renameNode(node, 'new')

        expect(selectedKey.value).toBe('new.feature')
      })

      it('reloads tree after rename', async () => {
        const { renameNode } = useFeatureTree(options)
        const node = createMockFeatureTreeNode({ type: 'folder', relativePath: 'test' })

        await renameNode(node, 'newname')

        expect(options.loadTree).toHaveBeenCalled()
      })
    })

    describe('deleteNode', () => {
      it('deletes folder', async () => {
        const { deleteNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'folder',
          name: 'toDelete',
          relativePath: 'toDelete',
          children: [],
        }

        await deleteNode(node)

        expect(options.deleteFolder).toHaveBeenCalledWith('toDelete')
      })

      it('deletes feature file', async () => {
        const { deleteNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'file',
          name: 'toDelete',
          relativePath: 'toDelete.feature',
          feature: { path: '/test/toDelete.feature', name: 'Delete', relativePath: 'toDelete.feature', content: '' },
        }

        await deleteNode(node)

        expect(options.deleteFeature).toHaveBeenCalledWith('toDelete.feature')
      })

      it('clears selection when deleted node was selected', async () => {
        const { selectedKey, selectNode, deleteNode } = useFeatureTree(options)
        const node: FeatureTreeNode = {
          type: 'folder',
          name: 'selected',
          relativePath: 'selected',
          children: [],
        }

        await selectNode(node)
        await deleteNode(node)

        expect(selectedKey.value).toBe('')
      })

      it('keeps selection when different node deleted', async () => {
        const { selectedKey, selectNode, deleteNode } = useFeatureTree(options)
        const selectedNode: FeatureTreeNode = {
          type: 'folder',
          name: 'keep',
          relativePath: 'keep',
          children: [],
        }
        const toDelete: FeatureTreeNode = {
          type: 'folder',
          name: 'delete',
          relativePath: 'delete',
          children: [],
        }

        await selectNode(selectedNode)
        await deleteNode(toDelete)

        expect(selectedKey.value).toBe('keep')
      })

      it('reloads tree after delete', async () => {
        const { deleteNode } = useFeatureTree(options)
        const node = createMockFeatureTreeNode({ type: 'folder', relativePath: 'test' })

        await deleteNode(node)

        expect(options.loadTree).toHaveBeenCalled()
      })
    })
  })

  describe('utility functions', () => {
    describe('findNode', () => {
      it('finds node at root level', () => {
        const { findNode } = useFeatureTree(options)

        const result = findNode(mockFeatureTree, 'home.feature')

        expect(result).not.toBeNull()
        expect(result?.name).toBe('home')
      })

      it('finds node in nested folder', () => {
        const { findNode } = useFeatureTree(options)

        const result = findNode(mockFeatureTree, 'auth/login.feature')

        expect(result).not.toBeNull()
        expect(result?.name).toBe('login')
      })

      it('returns null for non-existent path', () => {
        const { findNode } = useFeatureTree(options)

        const result = findNode(mockFeatureTree, 'nonexistent')

        expect(result).toBeNull()
      })

      it('handles empty tree', () => {
        const { findNode } = useFeatureTree(options)

        const result = findNode([], 'any')

        expect(result).toBeNull()
      })
    })

    describe('getParentPath', () => {
      it('returns parent path for nested file', () => {
        const { getParentPath } = useFeatureTree(options)

        expect(getParentPath('auth/login.feature')).toBe('auth')
      })

      it('returns empty string for root level', () => {
        const { getParentPath } = useFeatureTree(options)

        expect(getParentPath('root.feature')).toBe('')
      })

      it('handles deeply nested paths', () => {
        const { getParentPath } = useFeatureTree(options)

        expect(getParentPath('a/b/c/d/file.feature')).toBe('a/b/c/d')
      })
    })
  })
})
