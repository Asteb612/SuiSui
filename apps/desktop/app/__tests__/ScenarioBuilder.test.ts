import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import ScenarioBuilder from '../components/ScenarioBuilder.vue'
import { primeVueStubs, createMockStep, createInitialStoreState } from './testUtils'
import { useScenarioStore } from '../stores/scenario'

function createWrapper(props: {
  editMode?: 'scenario' | 'background'
  viewMode?: 'read' | 'edit' | 'run'
} = {}, storeOverrides: {
  scenario?: Record<string, unknown>
} = {}) {
  return render(ScenarioBuilder, {
    props: {
      editMode: props.editMode ?? 'scenario',
      viewMode: props.viewMode ?? 'read',
    },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: createInitialStoreState({
            scenario: storeOverrides.scenario ?? {},
          }),
        }),
      ],
      stubs: {
        ...primeVueStubs,
        TableEditor: { template: '<div data-testid="table-editor" />' },
        TagsEditor: { template: '<div data-testid="tags-editor" />' },
        ExamplesEditor: { template: '<div data-testid="examples-editor" />' },
        StepAddDialog: {
          name: 'StepAddDialog',
          template: '<div v-if="visible" data-testid="step-add-dialog"><slot /></div>',
          props: ['visible', 'target', 'insertIndex'],
          emits: ['update:visible', 'add'],
        },
      },
    },
  })
}

describe('ScenarioBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders scenario builder container', () => {
      createWrapper({}, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })
      expect(screen.getByTestId('scenario-builder')).toBeTruthy()
    })

    it('applies correct mode class based on viewMode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })
      expect(container.querySelector('.mode-edit')).toBeTruthy()
    })
  })

  describe('empty state', () => {
    it('shows empty state when no feature selected', () => {
      createWrapper({}, {
        scenario: {
          currentFeaturePath: null,
          scenarios: [{ name: '', steps: [] }],
        },
      })

      expect(screen.getByText('No Scenario Selected')).toBeTruthy()
    })

    it('shows helpful message in empty state', () => {
      createWrapper({}, {
        scenario: {
          currentFeaturePath: null,
          scenarios: [{ name: '', steps: [] }],
        },
      })

      expect(screen.getByText(/Select a scenario from the left panel/)).toBeTruthy()
    })
  })

  describe('scenario header', () => {
    it('renders scenario title in read mode', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'My Test Scenario', steps: [] }],
        },
      })

      expect(screen.getByText('My Test Scenario')).toBeTruthy()
    })

    it('shows title input in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(container.querySelector('.scenario-title-input')).toBeTruthy()
    })

    it('shows default title for unnamed scenario', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: '', steps: [] }],
        },
      })

      expect(screen.getByText('Untitled Scenario')).toBeTruthy()
    })
  })

  describe('preconditions section', () => {
    it('shows preconditions when background has steps', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText('Preconditions')).toBeTruthy()
    })

    it('shows preconditions section in background edit mode', () => {
      const { container } = createWrapper({ editMode: 'background', viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(container.querySelector('.preconditions-section')).toBeTruthy()
    })

    it('highlights preconditions in background edit mode', () => {
      const { container } = createWrapper({ editMode: 'background', viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const preconditions = container.querySelector('.preconditions-section')
      expect(preconditions?.classList.contains('edit-active')).toBe(true)
    })
  })

  describe('story section', () => {
    it('renders story section with steps', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({ keyword: 'Given' })],
          }],
        },
      })

      expect(container.querySelector('.story-section')).toBeTruthy()
    })

    it('shows step group with keyword', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({ keyword: 'Given' })],
          }],
        },
      })

      expect(screen.getByText('Given')).toBeTruthy()
    })

    it('shows empty story message when no steps', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText('No steps defined')).toBeTruthy()
    })

    it('shows empty story drop zone in edit mode', () => {
      const { container } = createWrapper({ editMode: 'scenario', viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(container.querySelector('.drop-zone.large')).toBeTruthy()
    })
  })

  describe('step display', () => {
    it('displays step pattern text', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({ pattern: 'I click the button' })],
          }],
        },
      })

      expect(screen.getByText(/I click the button/)).toBeTruthy()
    })

    it('shows drag handle in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      expect(container.querySelector('.drag-handle')).toBeTruthy()
    })

    it('step is draggable in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      const stepItem = container.querySelector('.step-item')
      expect(stepItem?.getAttribute('draggable')).toBe('true')
    })

    it('step is not draggable in read mode', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      const stepItem = container.querySelector('.step-item')
      expect(stepItem?.getAttribute('draggable')).toBe('false')
    })
  })

  describe('step arguments', () => {
    it('renders inline input for string args in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: 'home' }],
            })],
          }],
        },
      })

      // In edit mode, step-text should have step-text-editable class
      const stepText = container.querySelector('.step-text.step-text-editable')
      expect(stepText).toBeTruthy()

      // Should render inline input for the string arg
      const inputs = screen.getAllByTestId('inline-arg-input')
      expect(inputs.length).toBeGreaterThanOrEqual(1)
    })

    it('renders inline select for enum args in edit mode', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am a {enum:admin|user} user',
              args: [{ name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] }],
            })],
          }],
        },
      })

      expect(screen.getByTestId('inline-arg-select')).toBeTruthy()
    })

    it('renders table editor for table args in edit mode', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I have the following data {table}',
              args: [{ name: 'data', type: 'table', value: '[]', tableColumns: ['col1'] }],
            })],
          }],
        },
      })

      expect(screen.getByTestId('table-editor')).toBeTruthy()
    })

    it('shows formatted step text with arg values in read mode', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: 'home' }],
            })],
          }],
        },
      })

      // In read mode, value should be shown inline
      expect(container.innerHTML).toContain('home')
    })
  })

  describe('validation issues', () => {
    it('shows error class on step with errors', () => {
      const step = createMockStep({ id: 'step-with-error' })
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [step] }],
          validation: {
            isValid: false,
            issues: [{ severity: 'error', message: 'Test error', stepId: 'step-with-error' }],
          },
        },
      })

      expect(container.querySelector('.step-item.has-error')).toBeTruthy()
    })

    it('displays validation issue message in edit mode', () => {
      const step = createMockStep({ id: 'step-error' })
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [step] }],
          validation: {
            isValid: false,
            issues: [{ severity: 'error', message: 'Step definition not found', stepId: 'step-error' }],
          },
        },
      })

      expect(screen.getByText('Step definition not found')).toBeTruthy()
    })
  })

  describe('drop zones', () => {
    it('shows drop zones in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      expect(container.querySelector('.drop-zone')).toBeTruthy()
    })

    it('shows add step button on drop zone hover', () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      expect(container.querySelector('.add-step-btn')).toBeTruthy()
    })
  })

  describe('step actions', () => {
    it('shows remove button in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      expect(container.querySelector('.step-actions')).toBeTruthy()
    })

    it('calls removeStep when remove clicked', async () => {
      const step = createMockStep({ id: 'step-to-remove' })
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [step] }],
        },
      })

      const removeBtn = container.querySelector('.step-actions button')
      if (removeBtn) {
        await fireEvent.click(removeBtn)
        const store = useScenarioStore()
        expect(store.removeStep).toHaveBeenCalledWith('step-to-remove')
      }
    })
  })

  describe('scenario pagination', () => {
    it('shows pagination when multiple scenarios', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [
            { name: 'First', steps: [] },
            { name: 'Second', steps: [] },
          ],
          activeScenarioIndex: 0,
        },
      })

      expect(container.querySelector('.scenario-pagination')).toBeTruthy()
    })

    it('hides pagination in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [
            { name: 'First', steps: [] },
            { name: 'Second', steps: [] },
          ],
        },
      })

      expect(container.querySelector('.scenario-pagination')).toBeNull()
    })

    it('shows pagination dots for each scenario', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [
            { name: 'First', steps: [] },
            { name: 'Second', steps: [] },
            { name: 'Third', steps: [] },
          ],
        },
      })

      const dots = container.querySelectorAll('.pagination-dot')
      expect(dots.length).toBe(3)
    })
  })

  describe('run mode', () => {
    it('shows run section in run mode', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
      })

      expect(container.querySelector('.run-section')).toBeTruthy()
    })

    it('shows validation status in run mode', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
          validation: { isValid: true, issues: [] },
        },
      })

      expect(screen.getByText('Validation')).toBeTruthy()
    })

    it('hides story section in run mode', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
      })

      expect(container.querySelector('.story-section')).toBeNull()
    })
  })

  describe('examples section', () => {
    it('shows examples section when scenario has examples', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test Outline',
            steps: [],
            examples: {
              columns: ['variant'],
              rows: [{ variant: 'A' }, { variant: 'B' }],
            },
          }],
        },
      })

      expect(screen.getByText('Examples')).toBeTruthy()
    })

    it('shows add examples button in edit mode when no examples', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText('Add examples table')).toBeTruthy()
    })
  })

  describe('store interactions', () => {
    it('emits toggle-edit-mode when precondition edit clicked', async () => {
      const { container, emitted } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const editBtn = container.querySelector('.preconditions-section .section-action')
      if (editBtn) {
        await fireEvent.click(editBtn)
        expect(emitted()['toggle-edit-mode']).toBeTruthy()
      }
    })
  })
})
