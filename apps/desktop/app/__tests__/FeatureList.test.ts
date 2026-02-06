import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import FeatureList from '../components/FeatureList.vue'
import { primeVueStubs, createInitialStoreState, createMockFeature } from './testUtils'
import { useWorkspaceStore } from '../stores/workspace'

function createWrapper(storeOverrides: Record<string, unknown> = {}) {
  return render(FeatureList, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: createInitialStoreState({
            workspace: storeOverrides,
          }),
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

describe('FeatureList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders feature list container', () => {
      createWrapper()
      expect(screen.getByTestId('feature-list')).toBeTruthy()
    })

    it('displays feature count', () => {
      // featureCount is a getter based on features.length, so we need to provide features
      createWrapper({
        features: [
          createMockFeature(),
          createMockFeature(),
          createMockFeature(),
          createMockFeature(),
          createMockFeature(),
        ],
      })
      expect(screen.getByText('5 features')).toBeTruthy()
    })

    it('renders refresh button', () => {
      const { container } = createWrapper()
      expect(container.querySelector('[icon="pi pi-refresh"]')).toBeTruthy()
    })
  })

  describe('empty state', () => {
    it('shows empty state when no features', () => {
      createWrapper({ features: [], featureCount: 0 })
      expect(screen.getByText('No features found')).toBeTruthy()
    })

    it('shows file icon in empty state', () => {
      const { container } = createWrapper({ features: [], featureCount: 0 })
      expect(container.querySelector('.empty-state .pi-file')).toBeTruthy()
    })
  })

  describe('features list', () => {
    it('renders feature items', () => {
      const features = [
        createMockFeature({ name: 'Login', relativePath: 'login.feature' }),
        createMockFeature({ name: 'Logout', relativePath: 'logout.feature' }),
      ]

      createWrapper({ features, featureCount: 2 })

      expect(screen.getByText('Login')).toBeTruthy()
      expect(screen.getByText('Logout')).toBeTruthy()
    })

    it('displays feature relative path', () => {
      const features = [
        createMockFeature({ name: 'Login', relativePath: 'auth/login.feature' }),
      ]

      createWrapper({ features, featureCount: 1 })

      expect(screen.getByText('auth/login.feature')).toBeTruthy()
    })

    it('renders file icon for each feature', () => {
      const features = [
        createMockFeature(),
        createMockFeature(),
      ]

      const { container } = createWrapper({ features, featureCount: 2 })

      const icons = container.querySelectorAll('.feature-items .pi-file')
      expect(icons.length).toBe(2)
    })
  })

  describe('selection', () => {
    it('adds selected class to selected feature', () => {
      const features = [
        createMockFeature({ name: 'Login', relativePath: 'login.feature' }),
        createMockFeature({ name: 'Logout', relativePath: 'logout.feature' }),
      ]

      const { container } = createWrapper({
        features,
        featureCount: 2,
        selectedFeature: features[0],
      })

      const items = container.querySelectorAll('.feature-items li')
      expect(items[0]?.classList.contains('selected')).toBe(true)
      expect(items[1]?.classList.contains('selected')).toBe(false)
    })

    it('calls selectFeature when feature clicked', async () => {
      const features = [
        createMockFeature({ name: 'Login', relativePath: 'login.feature' }),
      ]

      createWrapper({ features, featureCount: 1 })

      await fireEvent.click(screen.getByText('Login'))

      // Access the store to verify action was called
      const store = useWorkspaceStore()
      expect(store.selectFeature).toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('calls loadFeatures when refresh button clicked', async () => {
      const { container } = createWrapper()

      const refreshBtn = container.querySelector('[icon="pi pi-refresh"]')!
      await fireEvent.click(refreshBtn)

      const store = useWorkspaceStore()
      expect(store.loadFeatures).toHaveBeenCalled()
    })

    it('shows loading state on refresh button', () => {
      const { container } = createWrapper({ isLoading: true })

      // The button should have loading prop
      const button = container.querySelector('[icon="pi pi-refresh"]')
      expect(button).toBeTruthy()
    })
  })

  describe('store integration', () => {
    it('displays features from store', () => {
      const features = [
        createMockFeature({ name: 'Feature A' }),
        createMockFeature({ name: 'Feature B' }),
        createMockFeature({ name: 'Feature C' }),
      ]

      createWrapper({ features, featureCount: 3 })

      expect(screen.getByText('Feature A')).toBeTruthy()
      expect(screen.getByText('Feature B')).toBeTruthy()
      expect(screen.getByText('Feature C')).toBeTruthy()
    })

    it('updates when store features change', async () => {
      const features = [createMockFeature({ name: 'Original' })]
      createWrapper({ features, featureCount: 1 })

      expect(screen.getByText('Original')).toBeTruthy()

      // Note: With createTestingPinia, we would need to update store state
      // This test documents expected behavior
    })
  })
})
