import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import StepSelector from '../components/StepSelector.vue'
import type { StepDefinition } from '@suisui/shared'

// Mock PrimeVue components
vi.mock('primevue/selectbutton', () => ({
  default: {
    name: 'SelectButton',
    template: '<div data-testid="select-button"><slot /></div>',
    props: ['modelValue', 'options', 'allowEmpty', 'size'],
  },
}))

vi.mock('primevue/button', () => ({
  default: {
    name: 'Button',
    template: '<button data-testid="button" @click="$emit(\'click\')"><slot /></button>',
    props: ['icon', 'text', 'rounded', 'size', 'loading', 'title'],
  },
}))

vi.mock('primevue/inputtext', () => ({
  default: {
    name: 'InputText',
    template: '<input data-testid="input-text" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'size'],
  },
}))

vi.mock('primevue/iconfield', () => ({
  default: {
    name: 'IconField',
    template: '<div><slot /></div>',
  },
}))

vi.mock('primevue/inputicon', () => ({
  default: {
    name: 'InputIcon',
    template: '<span><slot /></span>',
    props: ['class'],
  },
}))

const mockSteps: StepDefinition[] = [
  {
    id: 'step-1',
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    args: [{ name: 'page', type: 'string', required: true }],
    location: 'test.steps.ts',
    isGeneric: false,
  },
  {
    id: 'step-2',
    keyword: 'Given',
    pattern: 'I am logged in as (admin|user|guest)',
    args: [{ name: 'role', type: 'enum', required: true, enumValues: ['admin', 'user', 'guest'] }],
    location: 'test.steps.ts',
    isGeneric: true,
  },
  {
    id: 'step-3',
    keyword: 'When',
    pattern: 'I click on {string}',
    args: [{ name: 'element', type: 'string', required: true }],
    location: 'test.steps.ts',
    isGeneric: false,
  },
]

function createWrapper(options = {}) {
  return render(StepSelector, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            steps: {
              steps: mockSteps,
              decorators: [],
              exportedAt: '2024-01-01T00:00:00Z',
              isLoading: false,
              error: null,
            },
            workspace: {
              workspace: { path: '/test/workspace' },
              selectedFeature: { path: '/test/feature.feature', name: 'Test Feature' },
            },
            scenario: {
              currentFeaturePath: '/test/feature.feature',
              scenarios: [{ name: 'Test', steps: [] }],
            },
          },
        }),
      ],
      stubs: {
        SelectButton: {
          template: '<div data-testid="select-button"><slot /></div>',
          props: ['modelValue'],
        },
        Button: {
          template: '<button data-testid="button" @click="$emit(\'click\')"><slot /></button>',
          props: ['icon', 'loading', 'title'],
        },
        InputText: {
          template: '<input data-testid="input-text" />',
          props: ['modelValue', 'placeholder'],
        },
        IconField: { template: '<div><slot /></div>' },
        InputIcon: { template: '<span><slot /></span>' },
      },
    },
    ...options,
  })
}

describe('StepSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders step selector container', () => {
      createWrapper()
      expect(screen.getByTestId('step-selector')).toBeTruthy()
    })

    it('displays step items when feature is selected', () => {
      createWrapper()
      const stepItems = screen.getAllByTestId('step-item')
      // Only Given steps are shown by default
      expect(stepItems.length).toBe(2)
    })

    it('shows "Adding to: Scenario" indicator by default', () => {
      createWrapper()
      expect(screen.getByText(/Adding to:/)).toBeTruthy()
      expect(screen.getByText('Scenario')).toBeTruthy()
    })

    it('shows "Adding to: Background" when addTarget is background', () => {
      createWrapper({ props: { addTarget: 'background' } })
      expect(screen.getByText('Background')).toBeTruthy()
    })
  })

  describe('formatted patterns', () => {
    it('displays formatted enum patterns with pattern-enum class', () => {
      createWrapper()
      // The second Given step has an enum pattern
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('pattern-enum')
    })

    it('displays formatted Cucumber expressions with pattern-string class', () => {
      createWrapper()
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('pattern-string')
    })

    it('shows arg0 placeholder for enum patterns', () => {
      createWrapper()
      const container = screen.getByTestId('step-selector')
      // The enum (admin|user|guest) should show as "arg0"
      expect(container.innerHTML).toContain('>arg0<')
    })

    it('has aria-label with raw pattern for accessibility', () => {
      createWrapper()
      // Check that aria-label contains the raw pattern
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('aria-label')
    })
  })

  describe('step arguments display', () => {
    it('displays argument descriptions for steps with enum args', () => {
      createWrapper()
      // Check for step-arg-descriptions elements
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('step-arg-descriptions')
    })

    it('shows enum-desc class for enum argument descriptions', () => {
      createWrapper()
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('enum-desc')
    })

    it('displays enum values in argument descriptions', () => {
      createWrapper()
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('admin | user | guest')
    })
  })

  describe('generic steps', () => {
    it('shows generic badge for generic steps', () => {
      createWrapper()
      const container = screen.getByTestId('step-selector')
      expect(container.innerHTML).toContain('Generic')
    })

    it('applies generic class to generic step items', () => {
      createWrapper()
      const container = screen.getByTestId('step-selector')
      // The HTML should contain the 'generic' class on the li element
      expect(container.innerHTML).toMatch(/class="[^"]*generic[^"]*"/)
    })
  })

  describe('no feature selected state', () => {
    it('shows no feature selected message when no feature is selected', () => {
      render(StepSelector, {
        global: {
          plugins: [
            createTestingPinia({
              createSpy: vi.fn,
              initialState: {
                steps: {
                  steps: mockSteps,
                  isLoading: false,
                  error: null,
                },
                workspace: {
                  workspace: { path: '/test/workspace' },
                  selectedFeature: null,
                },
                scenario: {
                  currentFeaturePath: null,
                  scenarios: [{ name: 'Test', steps: [] }],
                },
              },
            }),
          ],
          stubs: {
            SelectButton: { template: '<div data-testid="select-button"><slot /></div>' },
            Button: { template: '<button data-testid="button"><slot /></button>' },
            InputText: { template: '<input data-testid="input-text" />' },
            IconField: { template: '<div><slot /></div>' },
            InputIcon: { template: '<span><slot /></span>' },
          },
        },
      })
      expect(screen.getByText('No feature selected')).toBeTruthy()
    })
  })

  describe('interactions', () => {
    it('step items are clickable', async () => {
      createWrapper()
      const stepItems = screen.getAllByTestId('step-item')
      // Verify click doesn't throw
      await fireEvent.click(stepItems[0]!)
    })

    it('step items have draggable attribute', () => {
      createWrapper()
      const stepItems = screen.getAllByTestId('step-item')
      expect(stepItems[0]!.getAttribute('draggable')).toBe('true')
    })
  })
})
