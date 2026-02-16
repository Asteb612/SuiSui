import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkspaceStore } from '../stores/workspace'
import type { WorkspaceInfo, FeatureFile, FeatureTreeNode } from '@suisui/shared'

// ---------------------------------------------------------------------------
// Mock window.api
// ---------------------------------------------------------------------------

const mockApi = {
  workspace: {
    get: vi.fn(),
    select: vi.fn(),
    set: vi.fn(),
    init: vi.fn(),
  },
  features: {
    list: vi.fn(),
    getTree: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn(),
  },
}

const mockWorkspace: WorkspaceInfo = {
  path: '/test/workspace',
  name: 'workspace',
  isValid: true,
  hasPackageJson: true,
  hasFeaturesDir: true,
  hasCucumberJson: true,
}

const mockFeatures: FeatureFile[] = [
  { path: '/test/workspace/features/login.feature', name: 'Login', relativePath: 'login.feature', content: '' },
  { path: '/test/workspace/features/cart.feature', name: 'Cart', relativePath: 'cart.feature', content: '' },
]

const mockTree: FeatureTreeNode[] = [
  { type: 'file', name: 'login', relativePath: 'login.feature', feature: mockFeatures[0]! },
  { type: 'file', name: 'cart', relativePath: 'cart.feature', feature: mockFeatures[1]! },
]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()

  // Set up default mocks
  Object.defineProperty(window, 'api', { value: mockApi, writable: true })
  mockApi.features.list.mockResolvedValue(mockFeatures)
  mockApi.features.getTree.mockResolvedValue(mockTree)
})

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

describe('workspace store — getters', () => {
  it('hasWorkspace returns false when no workspace', () => {
    const store = useWorkspaceStore()
    expect(store.hasWorkspace).toBe(false)
  })

  it('hasWorkspace returns true when workspace is set', () => {
    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    expect(store.hasWorkspace).toBe(true)
  })

  it('featureCount returns number of features', () => {
    const store = useWorkspaceStore()
    store.features = mockFeatures
    expect(store.featureCount).toBe(2)
  })

  it('featureCount returns 0 when no features', () => {
    const store = useWorkspaceStore()
    expect(store.featureCount).toBe(0)
  })

  it('needsInit returns true when pendingPath and invalid validation', () => {
    const store = useWorkspaceStore()
    store.pendingPath = '/some/path'
    store.pendingValidation = { isValid: false, errors: ['Missing package.json'] }
    expect(store.needsInit).toBe(true)
  })

  it('needsInit returns false when pendingPath is null', () => {
    const store = useWorkspaceStore()
    store.pendingValidation = { isValid: false, errors: ['err'] }
    expect(store.needsInit).toBe(false)
  })

  it('needsInit returns false when validation is valid', () => {
    const store = useWorkspaceStore()
    store.pendingPath = '/some/path'
    store.pendingValidation = { isValid: true, errors: [] }
    expect(store.needsInit).toBe(false)
  })

  it('needsInit returns false when pendingValidation is null', () => {
    const store = useWorkspaceStore()
    store.pendingPath = '/some/path'
    expect(store.needsInit).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// loadWorkspace
// ---------------------------------------------------------------------------

describe('workspace store — loadWorkspace', () => {
  it('sets workspace and loads features and tree on success', async () => {
    mockApi.workspace.get.mockResolvedValue(mockWorkspace)

    const store = useWorkspaceStore()
    await store.loadWorkspace()

    expect(store.workspace).toEqual(mockWorkspace)
    expect(store.features).toEqual(mockFeatures)
    expect(store.featureTree).toEqual(mockTree)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets isLoading during load', async () => {
    let loadingDuringCall = false
    mockApi.workspace.get.mockImplementation(async () => {
      const store = useWorkspaceStore()
      loadingDuringCall = store.isLoading
      return mockWorkspace
    })

    const store = useWorkspaceStore()
    await store.loadWorkspace()
    expect(loadingDuringCall).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('does NOT load features when workspace.get returns null', async () => {
    mockApi.workspace.get.mockResolvedValue(null)

    const store = useWorkspaceStore()
    await store.loadWorkspace()

    expect(store.workspace).toBeNull()
    expect(mockApi.features.list).not.toHaveBeenCalled()
    expect(mockApi.features.getTree).not.toHaveBeenCalled()
  })

  it('sets error when API throws', async () => {
    mockApi.workspace.get.mockRejectedValue(new Error('Network failure'))

    const store = useWorkspaceStore()
    await store.loadWorkspace()

    expect(store.error).toBe('Network failure')
    expect(store.isLoading).toBe(false)
  })

  it('sets generic error when non-Error is thrown', async () => {
    mockApi.workspace.get.mockRejectedValue('string error')

    const store = useWorkspaceStore()
    await store.loadWorkspace()

    expect(store.error).toBe('Failed to load workspace')
  })

  it('clears previous error before loading', async () => {
    mockApi.workspace.get.mockResolvedValue(mockWorkspace)

    const store = useWorkspaceStore()
    store.error = 'old error'
    await store.loadWorkspace()

    expect(store.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// selectWorkspace
// ---------------------------------------------------------------------------

describe('workspace store — selectWorkspace', () => {
  it('sets workspace when dialog returns valid workspace', async () => {
    mockApi.workspace.select.mockResolvedValue({
      workspace: mockWorkspace,
      validation: { isValid: true, errors: [] },
      selectedPath: '/test/workspace',
    })

    const store = useWorkspaceStore()
    await store.selectWorkspace()

    expect(store.workspace).toEqual(mockWorkspace)
    expect(store.features).toEqual(mockFeatures)
    expect(store.featureTree).toEqual(mockTree)
    expect(store.error).toBeNull()
  })

  it('returns early when dialog is canceled (null result)', async () => {
    mockApi.workspace.select.mockResolvedValue(null)

    const store = useWorkspaceStore()
    await store.selectWorkspace()

    expect(store.workspace).toBeNull()
    expect(mockApi.features.list).not.toHaveBeenCalled()
    expect(store.isLoading).toBe(false)
  })

  it('sets pendingPath and error when validation fails', async () => {
    mockApi.workspace.select.mockResolvedValue({
      workspace: null,
      validation: { isValid: false, errors: ['Missing package.json', 'Missing features/ directory'] },
      selectedPath: '/invalid/path',
    })

    const store = useWorkspaceStore()
    await store.selectWorkspace()

    expect(store.pendingPath).toBe('/invalid/path')
    expect(store.pendingValidation).toEqual({ isValid: false, errors: ['Missing package.json', 'Missing features/ directory'] })
    expect(store.error).toBe('Invalid workspace: Missing package.json, Missing features/ directory')
    expect(store.workspace).toBeNull()
  })

  it('clears pendingPath before selecting', async () => {
    mockApi.workspace.select.mockResolvedValue({
      workspace: mockWorkspace,
      validation: { isValid: true, errors: [] },
      selectedPath: '/test/workspace',
    })

    const store = useWorkspaceStore()
    store.pendingPath = '/old/path'
    store.pendingValidation = { isValid: false, errors: ['old'] }
    await store.selectWorkspace()

    expect(store.pendingPath).toBeNull()
    expect(store.pendingValidation).toBeNull()
  })

  it('sets error when API throws', async () => {
    mockApi.workspace.select.mockRejectedValue(new Error('Dialog error'))

    const store = useWorkspaceStore()
    await store.selectWorkspace()

    expect(store.error).toBe('Dialog error')
    expect(store.isLoading).toBe(false)
  })

  it('does NOT set pending when validation is valid but workspace is null', async () => {
    // Edge case: valid validation but no workspace returned
    mockApi.workspace.select.mockResolvedValue({
      workspace: null,
      validation: { isValid: true, errors: [] },
      selectedPath: '/some/path',
    })

    const store = useWorkspaceStore()
    await store.selectWorkspace()

    // No workspace set, no pending set (validation is valid)
    expect(store.workspace).toBeNull()
    expect(store.pendingPath).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// initWorkspace
// ---------------------------------------------------------------------------

describe('workspace store — initWorkspace', () => {
  it('initializes workspace and clears pending state', async () => {
    mockApi.workspace.init.mockResolvedValue(mockWorkspace)

    const store = useWorkspaceStore()
    store.pendingPath = '/new/workspace'
    store.pendingValidation = { isValid: false, errors: ['Missing package.json'] }

    await store.initWorkspace()

    expect(store.workspace).toEqual(mockWorkspace)
    expect(store.pendingPath).toBeNull()
    expect(store.pendingValidation).toBeNull()
    expect(store.isInitializing).toBe(false)
    expect(mockApi.features.list).toHaveBeenCalled()
    expect(mockApi.features.getTree).toHaveBeenCalled()
  })

  it('does nothing when pendingPath is null', async () => {
    const store = useWorkspaceStore()
    await store.initWorkspace()

    expect(mockApi.workspace.init).not.toHaveBeenCalled()
    expect(store.isInitializing).toBe(false)
  })

  it('sets isInitializing during initialization', async () => {
    let initializingDuringCall = false
    mockApi.workspace.init.mockImplementation(async () => {
      const store = useWorkspaceStore()
      initializingDuringCall = store.isInitializing
      return mockWorkspace
    })

    const store = useWorkspaceStore()
    store.pendingPath = '/new/workspace'
    await store.initWorkspace()

    expect(initializingDuringCall).toBe(true)
    expect(store.isInitializing).toBe(false)
  })

  it('sets error when init API throws', async () => {
    mockApi.workspace.init.mockRejectedValue(new Error('Init failed'))

    const store = useWorkspaceStore()
    store.pendingPath = '/new/workspace'
    await store.initWorkspace()

    expect(store.error).toBe('Init failed')
    expect(store.isInitializing).toBe(false)
  })

  it('passes pendingPath to the API', async () => {
    mockApi.workspace.init.mockResolvedValue(mockWorkspace)

    const store = useWorkspaceStore()
    store.pendingPath = '/specific/path'
    await store.initWorkspace()

    expect(mockApi.workspace.init).toHaveBeenCalledWith('/specific/path')
  })
})

// ---------------------------------------------------------------------------
// setWorkspacePath
// ---------------------------------------------------------------------------

describe('workspace store — setWorkspacePath', () => {
  it('sets workspace when validation passes', async () => {
    mockApi.workspace.set.mockResolvedValue({ isValid: true, errors: [] })
    mockApi.workspace.get.mockResolvedValue(mockWorkspace)

    const store = useWorkspaceStore()
    await store.setWorkspacePath('/test/workspace')

    expect(mockApi.workspace.set).toHaveBeenCalledWith('/test/workspace')
    expect(mockApi.workspace.get).toHaveBeenCalled()
    expect(store.workspace).toEqual(mockWorkspace)
    expect(store.features).toEqual(mockFeatures)
    expect(store.featureTree).toEqual(mockTree)
  })

  it('does NOT load workspace when validation fails', async () => {
    mockApi.workspace.set.mockResolvedValue({ isValid: false, errors: ['Missing package.json'] })

    const store = useWorkspaceStore()
    await store.setWorkspacePath('/invalid/path')

    expect(mockApi.workspace.get).not.toHaveBeenCalled()
    expect(store.workspace).toBeNull()
  })

  it('sets isLoading during operation', async () => {
    let loadingDuringCall = false
    mockApi.workspace.set.mockImplementation(async () => {
      const store = useWorkspaceStore()
      loadingDuringCall = store.isLoading
      return { isValid: true, errors: [] }
    })
    mockApi.workspace.get.mockResolvedValue(mockWorkspace)

    const store = useWorkspaceStore()
    await store.setWorkspacePath('/test/workspace')

    expect(loadingDuringCall).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('sets error when API throws', async () => {
    mockApi.workspace.set.mockRejectedValue(new Error('Set failed'))

    const store = useWorkspaceStore()
    await store.setWorkspacePath('/test/workspace')

    expect(store.error).toBe('Set failed')
    expect(store.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// clearWorkspace / clearPending
// ---------------------------------------------------------------------------

describe('workspace store — clearWorkspace', () => {
  it('resets all workspace state', () => {
    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    store.features = mockFeatures
    store.featureTree = mockTree
    store.selectedFeature = mockFeatures[0]!
    store.expandedFolders.add('auth')

    store.clearWorkspace()

    expect(store.workspace).toBeNull()
    expect(store.features).toEqual([])
    expect(store.featureTree).toEqual([])
    expect(store.selectedFeature).toBeNull()
    expect(store.expandedFolders.size).toBe(0)
  })
})

describe('workspace store — clearPending', () => {
  it('clears pending state and error', () => {
    const store = useWorkspaceStore()
    store.pendingPath = '/pending/path'
    store.pendingValidation = { isValid: false, errors: ['err'] }
    store.error = 'some error'

    store.clearPending()

    expect(store.pendingPath).toBeNull()
    expect(store.pendingValidation).toBeNull()
    expect(store.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// loadFeatures / loadFeatureTree
// ---------------------------------------------------------------------------

describe('workspace store — loadFeatures', () => {
  it('loads features list when workspace is set', async () => {
    const store = useWorkspaceStore()
    store.workspace = mockWorkspace

    await store.loadFeatures()

    expect(store.features).toEqual(mockFeatures)
  })

  it('does nothing when workspace is null', async () => {
    const store = useWorkspaceStore()
    await store.loadFeatures()

    expect(mockApi.features.list).not.toHaveBeenCalled()
  })

  it('sets error when list API throws', async () => {
    mockApi.features.list.mockRejectedValue(new Error('List failed'))

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.loadFeatures()

    expect(store.error).toBe('List failed')
  })
})

describe('workspace store — loadFeatureTree', () => {
  it('loads feature tree when workspace is set', async () => {
    const store = useWorkspaceStore()
    store.workspace = mockWorkspace

    await store.loadFeatureTree()

    expect(store.featureTree).toEqual(mockTree)
  })

  it('does nothing when workspace is null', async () => {
    const store = useWorkspaceStore()
    await store.loadFeatureTree()

    expect(mockApi.features.getTree).not.toHaveBeenCalled()
  })

  it('sets error when getTree API throws', async () => {
    mockApi.features.getTree.mockRejectedValue(new Error('Tree failed'))

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.loadFeatureTree()

    expect(store.error).toBe('Tree failed')
  })
})

// ---------------------------------------------------------------------------
// selectFeature
// ---------------------------------------------------------------------------

describe('workspace store — selectFeature', () => {
  it('sets selectedFeature', () => {
    const store = useWorkspaceStore()
    store.selectFeature(mockFeatures[0]!)
    expect(store.selectedFeature).toEqual(mockFeatures[0])
  })

  it('clears selectedFeature when null', () => {
    const store = useWorkspaceStore()
    store.selectedFeature = mockFeatures[0]!
    store.selectFeature(null)
    expect(store.selectedFeature).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// expandFolder / collapseFolder
// ---------------------------------------------------------------------------

describe('workspace store — folder expansion', () => {
  it('expandFolder adds path to expandedFolders', () => {
    const store = useWorkspaceStore()
    store.expandFolder('auth')
    expect(store.expandedFolders.has('auth')).toBe(true)
  })

  it('collapseFolder removes path from expandedFolders', () => {
    const store = useWorkspaceStore()
    store.expandedFolders.add('auth')
    store.collapseFolder('auth')
    expect(store.expandedFolders.has('auth')).toBe(false)
  })

  it('expanding same folder twice does not duplicate', () => {
    const store = useWorkspaceStore()
    store.expandFolder('auth')
    store.expandFolder('auth')
    expect(store.expandedFolders.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Feature CRUD actions
// ---------------------------------------------------------------------------

describe('workspace store — feature CRUD', () => {
  it('createFolder calls API and refreshes tree', async () => {
    mockApi.features.createFolder.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.createFolder('auth', 'login')

    expect(mockApi.features.createFolder).toHaveBeenCalledWith('auth/login')
    expect(mockApi.features.getTree).toHaveBeenCalled()
  })

  it('createFolder with empty parentPath creates root folder', async () => {
    mockApi.features.createFolder.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.createFolder('', 'new-folder')

    expect(mockApi.features.createFolder).toHaveBeenCalledWith('new-folder')
  })

  it('createFolder sets error and rethrows on failure', async () => {
    mockApi.features.createFolder.mockRejectedValue(new Error('Folder exists'))

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace

    await expect(store.createFolder('', 'dup')).rejects.toThrow('Folder exists')
    expect(store.error).toBe('Folder exists')
  })

  it('renameFolder calls API and refreshes tree', async () => {
    mockApi.features.renameFolder.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.renameFolder('old-name', 'new-name')

    expect(mockApi.features.renameFolder).toHaveBeenCalledWith('old-name', 'new-name')
    expect(mockApi.features.getTree).toHaveBeenCalled()
  })

  it('deleteFolder refreshes both tree and features list', async () => {
    mockApi.features.deleteFolder.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.deleteFolder('auth')

    expect(mockApi.features.deleteFolder).toHaveBeenCalledWith('auth')
    expect(mockApi.features.getTree).toHaveBeenCalled()
    expect(mockApi.features.list).toHaveBeenCalled()
  })

  it('renameFeature refreshes both tree and features list', async () => {
    mockApi.features.rename.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.renameFeature('old.feature', 'new.feature')

    expect(mockApi.features.rename).toHaveBeenCalledWith('old.feature', 'new.feature')
    expect(mockApi.features.getTree).toHaveBeenCalled()
    expect(mockApi.features.list).toHaveBeenCalled()
  })

  it('moveFeature refreshes both tree and features list', async () => {
    mockApi.features.move.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.moveFeature('login.feature', 'auth')

    expect(mockApi.features.move).toHaveBeenCalledWith('login.feature', 'auth')
    expect(mockApi.features.getTree).toHaveBeenCalled()
    expect(mockApi.features.list).toHaveBeenCalled()
  })

  it('copyFeature refreshes both tree and features list', async () => {
    mockApi.features.copy.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.copyFeature('login.feature', 'auth/login.feature')

    expect(mockApi.features.copy).toHaveBeenCalledWith('login.feature', 'auth/login.feature')
    expect(mockApi.features.getTree).toHaveBeenCalled()
    expect(mockApi.features.list).toHaveBeenCalled()
  })

  it('deleteFeature refreshes both tree and features list', async () => {
    mockApi.features.delete.mockResolvedValue(undefined)

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace
    await store.deleteFeature('login.feature')

    expect(mockApi.features.delete).toHaveBeenCalledWith('login.feature')
    expect(mockApi.features.getTree).toHaveBeenCalled()
    expect(mockApi.features.list).toHaveBeenCalled()
  })

  it('deleteFeature sets error and rethrows on failure', async () => {
    mockApi.features.delete.mockRejectedValue(new Error('File not found'))

    const store = useWorkspaceStore()
    store.workspace = mockWorkspace

    await expect(store.deleteFeature('missing.feature')).rejects.toThrow('File not found')
    expect(store.error).toBe('File not found')
  })
})

// ---------------------------------------------------------------------------
// selectDirectory
// ---------------------------------------------------------------------------

describe('workspace store — selectDirectory', () => {
  it('returns selected path from dialog', async () => {
    mockApi.workspace.select.mockResolvedValue({
      workspace: null,
      validation: null,
      selectedPath: '/chosen/dir',
    })

    const store = useWorkspaceStore()
    const result = await store.selectDirectory()

    expect(result).toBe('/chosen/dir')
  })

  it('returns null when dialog is canceled', async () => {
    mockApi.workspace.select.mockResolvedValue(null)

    const store = useWorkspaceStore()
    const result = await store.selectDirectory()

    expect(result).toBeNull()
  })

  it('returns null when no selectedPath in result', async () => {
    mockApi.workspace.select.mockResolvedValue({
      workspace: null,
      validation: null,
      selectedPath: null,
    })

    const store = useWorkspaceStore()
    const result = await store.selectDirectory()

    expect(result).toBeNull()
  })
})
