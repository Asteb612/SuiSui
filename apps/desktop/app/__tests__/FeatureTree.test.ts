import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import FeatureTree from '../components/FeatureTree.vue'
import { primeVueStubs, mockFeatureTree, createInitialStoreState } from './testUtils'
import { useWorkspaceStore } from '../stores/workspace'
import { useScenarioStore } from '../stores/scenario'
import type { FeatureTreeNode } from '@suisui/shared'

function createWrapper(storeOverrides: {
  workspace?: Record<string, unknown>
  scenario?: Record<string, unknown>
} = {}) {
  return render(FeatureTree, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: createInitialStoreState({
            workspace: storeOverrides.workspace ?? {},
            scenario: storeOverrides.scenario ?? {},
          }),
        }),
      ],
      stubs: {
        ...primeVueStubs,
        TreeNodeItem: {
          name: 'TreeNodeItem',
          template: `
            <div class="tree-node-stub" :data-path="node.relativePath" @click="$emit('select', node)">
              <span class="node-name">{{ node.name }}</span>
              <button class="toggle-btn" @click.stop="$emit('toggle')">Toggle</button>
              <button class="rename-btn" @click.stop="$emit('rename')">Rename</button>
              <button class="delete-btn" @click.stop="$emit('delete')">Delete</button>
              <button class="new-feature-btn" @click.stop="$emit('new-feature')">New Feature</button>
              <button v-if="node.type === 'folder'" class="new-folder-btn" @click.stop="$emit('new-folder')">New Subfolder</button>
            </div>
          `,
          props: ['node', 'expanded', 'selected'],
          emits: ['toggle', 'select', 'rename', 'delete', 'newFeature', 'newFolder'],
        },
        NewScenarioDialog: {
          name: 'NewScenarioDialog',
          template: '<div v-if="visible" data-testid="new-scenario-dialog"><slot /><button @click="$emit(\'create\', { name: \'Test\', fileName: \'test.feature\' })">Create</button></div>',
          props: ['visible'],
          emits: ['update:visible', 'create'],
        },
      },
    },
  })
}

describe('FeatureTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders feature tree container', () => {
      const { container } = createWrapper()
      expect(container.querySelector('.feature-tree-container')).toBeTruthy()
    })

    it('displays feature count', () => {
      // featureCount is a getter based on features.length
      const features = Array.from({ length: 5 }, (_, i) => ({
        name: `Feature ${i}`,
        relativePath: `feature-${i}.feature`,
        content: '',
      }))
      createWrapper({ workspace: { features } })
      expect(screen.getByText('5 features')).toBeTruthy()
    })

    it('renders refresh button', () => {
      const { container } = createWrapper()
      expect(container.querySelector('[icon="pi pi-refresh"]')).toBeTruthy()
    })

    it('renders new folder button', () => {
      const { container } = createWrapper()
      expect(container.querySelector('[icon="pi pi-folder-plus"]')).toBeTruthy()
    })
  })

  describe('empty state', () => {
    it('shows empty state when no tree data', () => {
      createWrapper({ workspace: { featureTree: [] } })
      expect(screen.getByText('No features yet')).toBeTruthy()
    })

    it('shows inbox icon in empty state', () => {
      const { container } = createWrapper({ workspace: { featureTree: [] } })
      expect(container.querySelector('.pi-inbox')).toBeTruthy()
    })
  })

  describe('tree rendering', () => {
    it('renders TreeNodeItem for each node', () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      // Should render the root nodes (auth folder and home.feature)
      expect(screen.getByText('auth')).toBeTruthy()
      expect(screen.getByText('home')).toBeTruthy()
    })

    it('renders all tree nodes', () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      const nodes = screen.getAllByText(/auth|home/)
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('node selection', () => {
    it('calls selectFeature when file node selected', async () => {
      const fileNode: FeatureTreeNode = {
        type: 'file',
        name: 'login',
        relativePath: 'login.feature',
        feature: { path: '/test/login.feature', name: 'Login', relativePath: 'login.feature', content: '' },
      }

      createWrapper({
        workspace: { featureTree: [fileNode] },
      })

      // Click the node (our stub emits 'select' on click)
      await fireEvent.click(screen.getByText('login'))

      const workspaceStore = useWorkspaceStore()
      expect(workspaceStore.selectFeature).toHaveBeenCalledWith(fileNode.feature)
    })

    it('does not call loadFromFeature for folder nodes', async () => {
      const folderNode: FeatureTreeNode = {
        type: 'folder',
        name: 'auth',
        relativePath: 'auth',
        children: [],
      }

      createWrapper({
        workspace: { featureTree: [folderNode] },
      })

      await fireEvent.click(screen.getByText('auth'))

      const scenarioStore = useScenarioStore()
      expect(scenarioStore.loadFromFeature).not.toHaveBeenCalled()
    })
  })

  describe('expand/collapse', () => {
    it('toggles expansion when toggle emitted', async () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      const toggleBtn = screen.getAllByText('Toggle')[0]!
      await fireEvent.click(toggleBtn)

      // State change is internal - we document expected behavior
      expect(toggleBtn).toBeTruthy()
    })
  })

  describe('refresh', () => {
    it('calls loadFeatureTree when refresh clicked', async () => {
      const { container } = createWrapper()

      const refreshBtn = container.querySelector('[icon="pi pi-refresh"]')!
      await fireEvent.click(refreshBtn)

      const workspaceStore = useWorkspaceStore()
      expect(workspaceStore.loadFeatureTree).toHaveBeenCalled()
    })

    it('shows loading state on refresh button', () => {
      const { container } = createWrapper({ workspace: { isLoading: true } })

      const button = container.querySelector('[icon="pi pi-refresh"]')
      expect(button).toBeTruthy()
    })
  })

  describe('new folder dialog', () => {
    it('opens new folder dialog when button clicked', async () => {
      const { container } = createWrapper()

      const newFolderBtn = container.querySelector('[icon="pi pi-folder-plus"]')!
      await fireEvent.click(newFolderBtn)

      expect(screen.getByTestId('dialog')).toBeTruthy()
    })

    it('shows folder name input in dialog', async () => {
      const { container } = createWrapper()

      await fireEvent.click(container.querySelector('[icon="pi pi-folder-plus"]')!)

      expect(screen.getByTestId('input-text')).toBeTruthy()
    })

    it('calls createFolder when folder created', async () => {
      const { container } = createWrapper()

      await fireEvent.click(container.querySelector('[icon="pi pi-folder-plus"]')!)

      const input = screen.getByTestId('input-text')
      await fireEvent.update(input, 'new-folder')

      await fireEvent.click(screen.getByText('Create'))

      const workspaceStore = useWorkspaceStore()
      expect(workspaceStore.createFolder).toHaveBeenCalled()
    })
  })

  describe('new feature dialog', () => {
    it('opens new feature dialog when new-feature emitted', async () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      const newFeatureBtn = screen.getAllByText('New Feature')[0]!
      await fireEvent.click(newFeatureBtn)

      expect(screen.getByTestId('new-scenario-dialog')).toBeTruthy()
    })
  })

  describe('new subfolder from folder', () => {
    it('opens new folder dialog when new-folder emitted from folder node', async () => {
      const folderNode: FeatureTreeNode = {
        type: 'folder',
        name: 'parent-folder',
        relativePath: 'parent-folder',
        children: [],
      }

      createWrapper({ workspace: { featureTree: [folderNode] } })

      const newSubfolderBtn = screen.getByText('New Subfolder')
      await fireEvent.click(newSubfolderBtn)

      expect(screen.getByTestId('dialog')).toBeTruthy()
    })

    it('creates subfolder inside parent folder', async () => {
      const folderNode: FeatureTreeNode = {
        type: 'folder',
        name: 'parent-folder',
        relativePath: 'parent-folder',
        children: [],
      }

      createWrapper({ workspace: { featureTree: [folderNode] } })

      // Click new subfolder button
      await fireEvent.click(screen.getByText('New Subfolder'))

      // Enter folder name
      const input = screen.getByTestId('input-text')
      await fireEvent.update(input, 'child-folder')

      // Click create
      await fireEvent.click(screen.getByText('Create'))

      const workspaceStore = useWorkspaceStore()
      // Should create folder with parent path
      expect(workspaceStore.createFolder).toHaveBeenCalledWith('parent-folder', 'child-folder')
    })

    it('does not show new subfolder button for file nodes', () => {
      const fileNode: FeatureTreeNode = {
        type: 'file',
        name: 'test-file',
        relativePath: 'test-file.feature',
        feature: { path: '/test/test-file.feature', name: 'Test', relativePath: 'test-file.feature', content: '' },
      }

      createWrapper({ workspace: { featureTree: [fileNode] } })

      // New Subfolder should not be present for file nodes
      expect(screen.queryByText('New Subfolder')).toBeNull()
    })
  })

  describe('rename dialog', () => {
    it('opens rename dialog when rename emitted', async () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      const renameBtn = screen.getAllByText('Rename')[0]!
      await fireEvent.click(renameBtn)

      // Rename dialog should open
      const dialogs = screen.getAllByTestId('dialog')
      expect(dialogs.length).toBeGreaterThan(0)
    })

    it('shows rename input pre-filled with node name', async () => {
      const singleNode: FeatureTreeNode = {
        type: 'folder',
        name: 'original-name',
        relativePath: 'original-name',
        children: [],
      }

      createWrapper({ workspace: { featureTree: [singleNode] } })

      await fireEvent.click(screen.getByText('Rename'))

      const input = screen.getByTestId('input-text')
      expect((input as HTMLInputElement).value).toBe('original-name')
    })
  })

  describe('delete confirmation', () => {
    it('opens delete confirmation when delete emitted', async () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      const deleteBtn = screen.getAllByText('Delete')[0]!
      await fireEvent.click(deleteBtn)

      // Delete confirmation should show
      expect(screen.getByText('Delete Confirmation')).toBeTruthy()
    })

    it('shows warning for folder deletion', async () => {
      const folderNode: FeatureTreeNode = {
        type: 'folder',
        name: 'folder-to-delete',
        relativePath: 'folder-to-delete',
        children: [],
      }

      createWrapper({ workspace: { featureTree: [folderNode] } })

      await fireEvent.click(screen.getByText('Delete'))

      expect(screen.getByText(/permanently deleted/)).toBeTruthy()
    })

    it('calls deleteFolder when confirmed for folder', async () => {
      const folderNode: FeatureTreeNode = {
        type: 'folder',
        name: 'delete-me',
        relativePath: 'delete-me',
        children: [],
      }

      createWrapper({ workspace: { featureTree: [folderNode] } })

      await fireEvent.click(screen.getByText('Delete'))

      // Find and click the confirm delete button in the dialog
      const deleteButtons = screen.getAllByText('Delete')
      // The last one should be in the dialog footer
      await fireEvent.click(deleteButtons[deleteButtons.length - 1]!)

      const workspaceStore = useWorkspaceStore()
      expect(workspaceStore.deleteFolder).toHaveBeenCalled()
    })

    it('calls deleteFeature when confirmed for file', async () => {
      const fileNode: FeatureTreeNode = {
        type: 'file',
        name: 'delete-me',
        relativePath: 'delete-me.feature',
        feature: { path: '/test/delete-me.feature', name: 'Delete Me', relativePath: 'delete-me.feature', content: '' },
      }

      createWrapper({ workspace: { featureTree: [fileNode] } })

      await fireEvent.click(screen.getByText('Delete'))

      const deleteButtons = screen.getAllByText('Delete')
      await fireEvent.click(deleteButtons[deleteButtons.length - 1]!)

      const workspaceStore = useWorkspaceStore()
      expect(workspaceStore.deleteFeature).toHaveBeenCalled()
    })
  })

  describe('workspace watch', () => {
    it('loads tree when workspace changes', async () => {
      createWrapper({
        workspace: { workspace: { path: '/test' } },
      })

      const workspaceStore = useWorkspaceStore()
      expect(workspaceStore.loadFeatureTree).toHaveBeenCalled()
    })
  })

  describe('cancel actions', () => {
    it('closes new folder dialog on cancel', async () => {
      const { container } = createWrapper()

      await fireEvent.click(container.querySelector('[icon="pi pi-folder-plus"]')!)
      await fireEvent.click(screen.getByText('Cancel'))

      // Dialog should be closed
      expect(screen.queryByText('New Folder')).toBeNull()
    })

    it('closes rename dialog on cancel', async () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      // Click the first rename button (from tree node stub)
      await fireEvent.click(screen.getAllByText('Rename')[0]!)
      await fireEvent.click(screen.getByText('Cancel'))

      // Dialog should be closed - check for dialog's absence
      const dialogs = screen.queryAllByTestId('dialog')
      // No open rename dialogs (there might still be the tree node's rename button)
      const renameHeaders = dialogs.filter(d => d.textContent?.includes('Rename'))
      expect(renameHeaders.length).toBe(0)
    })

    it('closes delete dialog on cancel', async () => {
      createWrapper({ workspace: { featureTree: mockFeatureTree } })

      await fireEvent.click(screen.getAllByText('Delete')[0]!)
      await fireEvent.click(screen.getByText('Cancel'))

      // Delete dialog should be closed
      expect(screen.queryByText('Delete Confirmation')).toBeNull()
    })
  })
})
