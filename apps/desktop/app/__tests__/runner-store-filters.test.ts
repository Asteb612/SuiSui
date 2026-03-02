import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunnerStore } from '../stores/runner'
import type { WorkspaceTestInfo } from '@suisui/shared'

// Mock window.api
vi.stubGlobal('window', {
  api: {
    settings: { get: vi.fn(), set: vi.fn() },
    runner: {
      runHeadless: vi.fn(),
      runUI: vi.fn(),
      runBatch: vi.fn(),
      getWorkspaceTests: vi.fn(),
      stop: vi.fn(),
    },
  },
})

const mockWorkspace: WorkspaceTestInfo = {
  features: [
    {
      relativePath: 'features/auth/login.feature',
      name: 'Login',
      tags: ['auth'],
      folder: 'features/auth',
      scenarios: [
        { name: 'Valid login', tags: ['auth', 'smoke'] },
        { name: 'Invalid login', tags: ['auth'] },
      ],
    },
    {
      relativePath: 'features/auth/register.feature',
      name: 'Register',
      tags: ['auth'],
      folder: 'features/auth',
      scenarios: [
        { name: 'New user registration', tags: ['auth', 'regression'] },
      ],
    },
    {
      relativePath: 'features/checkout/cart.feature',
      name: 'Cart',
      tags: [],
      folder: 'features/checkout',
      scenarios: [
        { name: 'Add item to cart', tags: ['smoke'] },
        { name: 'Remove item from cart', tags: [] },
      ],
    },
  ],
  allTags: ['auth', 'smoke', 'regression'],
  folders: ['features/auth', 'features/checkout'],
}

describe('Runner Store - Exclusive Tab Filtering', () => {
  let store: ReturnType<typeof useRunnerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useRunnerStore()
    store.workspaceTests = mockWorkspace
  })

  it('returns all features/scenarios when no filters are active', () => {
    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('filters by features tab only when activeFilterTab is features', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['features/auth/login.feature']
    // Also set some folders/tags that should NOT apply
    store.config.selectedFolders = ['features/checkout']
    store.config.selectedTags = ['regression']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.name).toBe('Login')
    expect(result.scenarioCount).toBe(2)
  })

  it('filters by folders tab only when activeFilterTab is folders', () => {
    store.config.activeFilterTab = 'folders'
    store.config.selectedFolders = ['features/checkout']
    // Also set some features/tags that should NOT apply
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.selectedTags = ['auth']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.name).toBe('Cart')
    expect(result.scenarioCount).toBe(2)
  })

  it('filters by tags tab only when activeFilterTab is tags', () => {
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = ['smoke']
    // Also set some features/folders that should NOT apply
    store.config.selectedFeatures = ['features/auth/register.feature']
    store.config.selectedFolders = ['features/checkout']

    const result = store.matchedTests
    // smoke tag on: login.feature (Valid login), cart.feature (Add item)
    expect(result.features).toHaveLength(2)
    expect(result.scenarioCount).toBe(2)
  })

  it('applies name filter as AND with active tab (features)', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.nameFilter = 'invalid'

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.scenarios[0]!.name).toBe('Invalid login')
  })

  it('applies name filter as AND with active tab (tags)', () => {
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = ['smoke']
    store.config.nameFilter = 'cart'

    const result = store.matchedTests
    // smoke tag + "cart" name → only "Add item to cart"
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.scenarios[0]!.name).toBe('Add item to cart')
  })

  it('tab switch does not combine filters', () => {
    // Set up features tab with selection
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['features/auth/login.feature']

    let result = store.matchedTests
    expect(result.scenarioCount).toBe(2) // Login has 2 scenarios

    // Switch to tags tab with different selection
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = ['regression']

    result = store.matchedTests
    // regression tag only on "New user registration" in register.feature
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.name).toBe('Register')
  })

  it('empty selection means all when active tab has no selection', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = [] // empty = all

    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('empty tags selection on tags tab returns all', () => {
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = []

    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('name filter works alone when no tab selection', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = []
    store.config.nameFilter = 'login'

    const result = store.matchedTests
    // "Valid login" and "Invalid login" in login.feature
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(2)
  })

  it('folders filter includes subfolders', () => {
    store.config.activeFilterTab = 'folders'
    store.config.selectedFolders = ['features/auth']

    const result = store.matchedTests
    expect(result.features).toHaveLength(2)
    expect(result.features.map(f => f.name)).toEqual(['Login', 'Register'])
  })

  it('returns empty when no workspace tests loaded', () => {
    store.workspaceTests = null
    const result = store.matchedTests
    expect(result.features).toHaveLength(0)
    expect(result.scenarioCount).toBe(0)
  })

  it('showResults defaults to false', () => {
    expect(store.showResults).toBe(false)
  })

  it('hasEnteredRunView defaults to false', () => {
    expect(store.hasEnteredRunView).toBe(false)
  })
})
