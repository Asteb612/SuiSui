import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import ScenarioBuilder from '../components/ScenarioBuilder.vue'
import NewScenarioDialog from '../components/NewScenarioDialog.vue'
import { primeVueStubs, createInitialStoreState, mockScenarioSteps } from './testUtils'

function createScenarioBuilderWrapper(props: {
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
        TagsEditor: { template: '<div data-testid="tags-editor"><slot /></div>' },
        ExamplesEditor: { template: '<div data-testid="examples-editor" />' },
        StepAddDialog: {
          name: 'StepAddDialog',
          template: '<div v-if="visible" data-testid="step-add-dialog" />',
          props: ['visible', 'target', 'insertIndex'],
          emits: ['update:visible', 'add'],
        },
      },
    },
  })
}

describe('UI Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Tags display', () => {
    it('shows read-only tags in read mode when tags exist', () => {
      createScenarioBuilderWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: ['smoke', 'regression'], steps: mockScenarioSteps }],
        },
      })

      const tagChips = screen.getAllByText(/@(smoke|regression)/)
      expect(tagChips.length).toBeGreaterThanOrEqual(2)
    })

    it('does NOT show read-only tag chips in edit mode', () => {
      const { container } = createScenarioBuilderWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: ['smoke'], steps: mockScenarioSteps }],
        },
      })

      // The .scenario-tags container (read-only) should not be rendered
      const readOnlyTags = container.querySelector('.scenario-tags')
      expect(readOnlyTags).toBeNull()

      // TagsEditor should be rendered instead
      expect(screen.getByTestId('tags-editor')).toBeTruthy()
    })

    it('shows TagsEditor in edit mode', () => {
      createScenarioBuilderWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: ['smoke'], steps: [] }],
        },
      })

      expect(screen.getByTestId('tags-editor')).toBeTruthy()
    })
  })

  describe('Add Preconditions button', () => {
    it('shows Add Preconditions button in edit mode when no background exists', () => {
      createScenarioBuilderWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [],
          scenarios: [{ name: 'Test', tags: [], steps: mockScenarioSteps }],
        },
      })

      const btn = screen.getByText('Add Preconditions')
      expect(btn).toBeTruthy()
    })

    it('does NOT show Add Preconditions button in read mode', () => {
      createScenarioBuilderWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [],
          scenarios: [{ name: 'Test', tags: [], steps: mockScenarioSteps }],
        },
      })

      expect(screen.queryByText('Add Preconditions')).toBeNull()
    })

    it('does NOT show Add Preconditions button when background exists', () => {
      createScenarioBuilderWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [{ id: 'bg-1', keyword: 'Given', pattern: 'I am logged in', args: [] }],
          scenarios: [{ name: 'Test', tags: [], steps: mockScenarioSteps }],
        },
      })

      expect(screen.queryByText('Add Preconditions')).toBeNull()
    })

    it('emits toggle-edit-mode when Add Preconditions is clicked', async () => {
      const { emitted } = createScenarioBuilderWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [],
          scenarios: [{ name: 'Test', tags: [], steps: mockScenarioSteps }],
        },
      })

      const btn = screen.getByText('Add Preconditions')
      await fireEvent.click(btn)

      expect(emitted()['toggle-edit-mode']).toBeTruthy()
    })
  })

  describe('Scenario pagination', () => {
    it('shows pagination in edit mode even with single scenario', () => {
      const { container } = createScenarioBuilderWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Single', tags: [], steps: [] }],
        },
      })

      const pagination = container.querySelector('.scenario-pagination')
      expect(pagination).toBeTruthy()
    })

    it('does NOT show pagination in read mode with single scenario', () => {
      const { container } = createScenarioBuilderWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Single', tags: [], steps: [] }],
        },
      })

      const pagination = container.querySelector('.scenario-pagination')
      expect(pagination).toBeNull()
    })

    it('shows add and remove buttons in edit mode', () => {
      const { container } = createScenarioBuilderWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [
            { name: 'First', tags: [], steps: [] },
            { name: 'Second', tags: [], steps: [] },
          ],
        },
      })

      const addBtn = container.querySelector('[title="Add new scenario"]')
      const deleteBtn = container.querySelector('[title="Remove current scenario"]')
      expect(addBtn).toBeTruthy()
      expect(deleteBtn).toBeTruthy()
    })

    it('disables remove button when only one scenario', () => {
      const { container } = createScenarioBuilderWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Only', tags: [], steps: [] }],
        },
      })

      const deleteBtn = container.querySelector('[title="Remove current scenario"]') as HTMLButtonElement
      expect(deleteBtn?.disabled).toBe(true)
    })
  })

  describe('NewScenarioDialog .feature warning', () => {
    function renderDialog(visible = true) {
      return render(NewScenarioDialog, {
        props: { visible },
        global: {
          stubs: primeVueStubs,
        },
      })
    }

    it('shows warning when custom filename lacks .feature extension', async () => {
      renderDialog()

      // Enable custom filename
      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      // Type a filename without .feature
      const input = screen.getByTestId('custom-filename-input')
      await fireEvent.update(input, 'my-test')

      expect(screen.getByText('File name must end with .feature')).toBeTruthy()
    })

    it('does not show warning when custom filename ends with .feature', async () => {
      renderDialog()

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      const input = screen.getByTestId('custom-filename-input')
      await fireEvent.update(input, 'my-test.feature')

      expect(screen.queryByText('File name must end with .feature')).toBeNull()
    })

    it('does not show warning when custom filename is empty', async () => {
      renderDialog()

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      expect(screen.queryByText('File name must end with .feature')).toBeNull()
    })

    it('does not show warning when using auto-generated filename', async () => {
      renderDialog()

      // Type a scenario name (auto-generates filename)
      const nameInput = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(nameInput, 'My Test')

      // Should NOT show warning since auto-generated adds .feature
      expect(screen.queryByText('File name must end with .feature')).toBeNull()
    })
  })
})
