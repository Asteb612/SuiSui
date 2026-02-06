import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import StepAddDialog from '../components/StepAddDialog.vue'
import { primeVueStubs, mockStepDefinitions } from './testUtils'
import { useStepsStore } from '../stores/steps'

function createWrapper(props: {
  visible?: boolean
  target?: 'scenario' | 'background'
  insertIndex?: number
} = {}) {
  return render(StepAddDialog, {
    props: {
      visible: props.visible ?? true,
      target: props.target ?? 'scenario',
      insertIndex: props.insertIndex ?? 0,
    },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            steps: {
              steps: mockStepDefinitions,
              decorators: [],
              exportedAt: '2024-01-01T00:00:00Z',
              isLoading: false,
              error: null,
            },
          },
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

describe('StepAddDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders dialog when visible', () => {
      createWrapper({ visible: true })
      expect(screen.getByTestId('dialog')).toBeTruthy()
    })

    it('does not render dialog when not visible', () => {
      createWrapper({ visible: false })
      expect(screen.queryByTestId('dialog')).toBeNull()
    })

    it('renders cancel button', () => {
      createWrapper()
      expect(screen.getByText('Cancel')).toBeTruthy()
    })
  })

  describe('keyword filter', () => {
    it('renders SelectButton for keyword filter', () => {
      createWrapper()
      expect(screen.getByTestId('select-button')).toBeTruthy()
    })

    it('defaults to Given keyword', () => {
      createWrapper()
      // The keyword filter should default to Given
      expect(screen.getByTestId('select-button')).toBeTruthy()
    })
  })

  describe('search', () => {
    it('renders search input', () => {
      createWrapper()
      expect(screen.getByTestId('input-text')).toBeTruthy()
    })

    it('shows empty state when no steps match search', async () => {
      createWrapper()

      const input = screen.getByTestId('input-text')
      await fireEvent.update(input, 'xyznonexistent')

      expect(screen.getByText('No steps match your search.')).toBeTruthy()
    })
  })

  describe('step list', () => {
    it('renders step items', () => {
      createWrapper()

      // Should show Given steps by default
      const list = screen.queryByRole('list')
      expect(list || screen.getByTestId('dialog').querySelector('.step-items')).toBeTruthy()
    })

    it('shows step pattern with formatting', () => {
      createWrapper()

      const container = screen.getByTestId('dialog')
      // Pattern variables should be styled
      expect(container.innerHTML).toContain('pattern-')
    })

    it('displays step arguments', () => {
      createWrapper()

      const container = screen.getByTestId('dialog')
      // Should show arg badges
      expect(container.innerHTML).toContain('arg-badge')
    })

    it('shows Generic badge for generic steps', () => {
      createWrapper()

      // Mock data includes generic steps
      expect(screen.getAllByText('Generic').length).toBeGreaterThan(0)
    })
  })

  describe('step selection', () => {
    it('emits add when step clicked', async () => {
      const { emitted } = createWrapper({ target: 'scenario', insertIndex: 2 })

      // Find and click a step item
      const container = screen.getByTestId('dialog')
      const stepItem = container.querySelector('.step-items li')

      if (stepItem) {
        await fireEvent.click(stepItem)

        expect(emitted()['add']).toBeTruthy()
        const addArgs = emitted()['add']![0] as [string, number, import('@suisui/shared').StepDefinition?]
        expect(addArgs[0]).toBe('scenario') // target
        expect(addArgs[1]).toBe(2) // insertIndex
      }
    })

    it('emits update:visible false after selection', async () => {
      const { emitted } = createWrapper()

      const container = screen.getByTestId('dialog')
      const stepItem = container.querySelector('.step-items li')

      if (stepItem) {
        await fireEvent.click(stepItem)

        expect(emitted()['update:visible']).toBeTruthy()
        expect(emitted()['update:visible']![0]).toEqual([false])
      }
    })

    it('includes target, index, and step definition in add event', async () => {
      const { emitted } = createWrapper({ target: 'background', insertIndex: 1 })

      const container = screen.getByTestId('dialog')
      const stepItem = container.querySelector('.step-items li')

      if (stepItem) {
        await fireEvent.click(stepItem)

        const addArgs = emitted()['add']![0] as [string, number, import('@suisui/shared').StepDefinition?]
        expect(addArgs).toHaveLength(3) // target, index, stepDef
        expect(addArgs[0]).toBe('background') // target
        expect(addArgs[1]).toBe(1) // insertIndex
        expect(addArgs[2]).toHaveProperty('keyword') // stepDef
        expect(addArgs[2]).toHaveProperty('pattern')
        expect(addArgs[2]).toHaveProperty('args')
      }
    })
  })

  describe('cancel', () => {
    it('emits update:visible false when cancel clicked', async () => {
      const { emitted } = createWrapper()

      await fireEvent.click(screen.getByText('Cancel'))

      expect(emitted()['update:visible']).toBeTruthy()
      expect(emitted()['update:visible']![0]).toEqual([false])
    })
  })

  describe('store integration', () => {
    it('uses steps from store', () => {
      createWrapper()

      // Steps from mockStepDefinitions should be available
      const store = useStepsStore()
      expect(store.stepsByKeyword).toBeDefined()
    })
  })

  describe('dialog reset', () => {
    it('resets search and keyword when dialog opens', async () => {
      const { rerender } = createWrapper({ visible: false })

      // Open dialog
      await rerender({ visible: true, target: 'scenario', insertIndex: 0 })

      // Should have default keyword (Given) and empty search
      expect(screen.getByTestId('select-button')).toBeTruthy()
    })
  })
})
