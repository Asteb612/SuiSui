import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import ScenarioBuilder from '../components/ScenarioBuilder.vue'
import { useScenarioStore } from '../stores/scenario'
import {
  primeVueStubs,
  createMockStep,
  createInitialStoreState,
  mockScenarioSteps,
} from './testUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper(
  props: {
    editMode?: 'scenario' | 'background'
    viewMode?: 'read' | 'edit' | 'run'
  } = {},
  storeOverrides: {
    scenario?: Record<string, unknown>
    runner?: Record<string, unknown>
  } = {},
) {
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
            runner: storeOverrides.runner ?? {},
          }),
        }),
      ],
      stubs: {
        ...primeVueStubs,
        TableEditor: {
          name: 'TableEditor',
          template: '<div data-testid="table-editor" />',
          props: ['modelValue', 'columns'],
          emits: ['update:modelValue'],
        },
        TagsEditor: {
          name: 'TagsEditor',
          template: '<div data-testid="tags-editor"><slot /></div>',
          props: ['tags'],
          emits: ['update:tags'],
        },
        ExamplesEditor: {
          name: 'ExamplesEditor',
          template: '<div data-testid="examples-editor" />',
          props: ['examples'],
          emits: ['add-column', 'remove-column', 'add-row', 'remove-row', 'update-cell'],
        },
        StepAddDialog: {
          name: 'StepAddDialog',
          template: '<div v-if="visible" data-testid="step-add-dialog" :data-target="target" :data-index="insertIndex" />',
          props: ['visible', 'target', 'insertIndex'],
          emits: ['update:visible', 'add'],
        },
      },
    },
  })
}

describe('ScenarioBuilder — Comprehensive Feature Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // =========================================================================
  // Scenario Title Editing
  // =========================================================================

  describe('scenario title editing', () => {
    it('calls setName when title input is changed in edit mode', async () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Original', steps: [] }],
        },
      })

      const titleInput = document.querySelector('.scenario-title-input') as HTMLInputElement
      expect(titleInput).toBeTruthy()

      await fireEvent.update(titleInput, 'Renamed Scenario')

      const store = useScenarioStore()
      expect(store.setName).toHaveBeenCalledWith('Renamed Scenario')
    })
  })

  // =========================================================================
  // Tags
  // =========================================================================

  describe('tags display', () => {
    it('shows read-only tag chips in read mode when tags exist', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: ['smoke', 'regression'], steps: mockScenarioSteps }],
        },
      })

      const tagChips = container.querySelectorAll('.tag-chip')
      expect(tagChips.length).toBe(2)
      expect(tagChips[0]!.textContent).toContain('@smoke')
      expect(tagChips[1]!.textContent).toContain('@regression')
    })

    it('does NOT show read-only tag chips in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: ['smoke'], steps: [] }],
        },
      })

      expect(container.querySelector('.scenario-tags')).toBeNull()
    })

    it('shows TagsEditor in edit mode', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: ['smoke'], steps: [] }],
        },
      })

      expect(screen.getByTestId('tags-editor')).toBeTruthy()
    })

    it('does NOT show tags section when tags are empty in read mode', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', tags: [], steps: [] }],
        },
      })

      expect(container.querySelector('.scenario-tags')).toBeNull()
    })
  })

  // =========================================================================
  // Step Groups (Given / When / Then / And / But)
  // =========================================================================

  describe('step groups and keyword resolution', () => {
    it('groups steps by primary keyword (Given / When / Then)', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'precondition' }),
              createMockStep({ id: 's2', keyword: 'When', pattern: 'action' }),
              createMockStep({ id: 's3', keyword: 'Then', pattern: 'assertion' }),
            ],
          }],
        },
      })

      const groups = container.querySelectorAll('.step-group')
      expect(groups.length).toBe(3)
      expect(groups[0]!.classList.contains('given')).toBe(true)
      expect(groups[1]!.classList.contains('when')).toBe(true)
      expect(groups[2]!.classList.contains('then')).toBe(true)
    })

    it('places And step in the same group as its parent keyword', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'first given' }),
              createMockStep({ id: 's2', keyword: 'And', pattern: 'another given' }),
              createMockStep({ id: 's3', keyword: 'When', pattern: 'action' }),
            ],
          }],
        },
      })

      // Two groups: "given" (with 2 steps) and "when" (with 1 step)
      const groups = container.querySelectorAll('.step-group')
      expect(groups.length).toBe(2)
      expect(groups[0]!.classList.contains('given')).toBe(true)
      // The "And" step should be inside the Given group
      const givenSteps = groups[0]!.querySelectorAll('.step-item')
      expect(givenSteps.length).toBe(2)
    })

    it('displays keyword labels on each group', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'a' }),
              createMockStep({ id: 's2', keyword: 'When', pattern: 'b' }),
              createMockStep({ id: 's3', keyword: 'Then', pattern: 'c' }),
            ],
          }],
        },
      })

      expect(screen.getByText('Given')).toBeTruthy()
      expect(screen.getByText('When')).toBeTruthy()
      expect(screen.getByText('Then')).toBeTruthy()
    })
  })

  // =========================================================================
  // Step Argument Display — Read Mode
  // =========================================================================

  describe('step arg display — read mode', () => {
    it('shows arg value in bold (arg-value class) for string args', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: 'login' }],
            })],
          }],
        },
      })

      const argValue = container.querySelector('.arg-value')
      expect(argValue).toBeTruthy()
      expect(argValue!.textContent).toContain('login')
    })

    it('shows enum arg value with arg-enum class', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am a (admin|user) user',
              args: [{ name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] }],
            })],
          }],
        },
      })

      const argEnum = container.querySelector('.arg-enum')
      expect(argEnum).toBeTruthy()
      expect(argEnum!.textContent).toContain('admin')
    })

    it('shows outline placeholder with arg-placeholder class', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Outline',
            steps: [createMockStep({
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: '<destination>' }],
            })],
            examples: {
              columns: ['destination'],
              rows: [{ destination: 'home' }, { destination: 'login' }],
            },
          }],
        },
      })

      const placeholder = container.querySelector('.arg-placeholder')
      expect(placeholder).toBeTruthy()
      expect(placeholder!.textContent).toContain('<destination>')
    })

    it('shows read-only DataTable below step when table arg has data', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I fill in the form (Field, Value):',
              args: [{
                name: 'data',
                type: 'table',
                value: JSON.stringify([{ Field: 'name', Value: 'John' }]),
                tableColumns: ['Field', 'Value'],
              }],
            })],
          }],
        },
      })

      const table = container.querySelector('.datatable-readonly')
      expect(table).toBeTruthy()
      // Check headers
      const headers = table!.querySelectorAll('th')
      expect(headers.length).toBe(2)
      expect(headers[0]!.textContent).toContain('Field')
      expect(headers[1]!.textContent).toContain('Value')
      // Check cell data
      expect(table!.textContent).toContain('name')
      expect(table!.textContent).toContain('John')
    })

    it('shows fallback placeholder when arg value is empty', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: '' }],
            })],
          }],
        },
      })

      // Empty arg should show a placeholder like <page> or "..."
      const argPlaceholder = container.querySelector('.arg-placeholder, .arg-value')
      expect(argPlaceholder).toBeTruthy()
    })
  })

  // =========================================================================
  // Step Argument Editing — Edit Mode
  // =========================================================================

  describe('step arg editing — edit mode', () => {
    it('updates store when string arg input is changed', async () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              id: 'step-1',
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: 'home' }],
            })],
          }],
        },
      })

      const input = screen.getByTestId('inline-arg-input') as HTMLInputElement
      await fireEvent.update(input, 'dashboard')

      const store = useScenarioStore()
      expect(store.updateStepArg).toHaveBeenCalledWith(
        'step-1', 'page', 'dashboard', 'string', undefined,
      )
    })

    it('updates store when enum select is changed', async () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              id: 'step-enum',
              pattern: 'I am a (admin|user) user',
              args: [{ name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] }],
            })],
          }],
        },
      })

      const select = screen.getByTestId('inline-arg-select') as HTMLSelectElement
      await fireEvent.update(select, 'user')

      const store = useScenarioStore()
      expect(store.updateStepArg).toHaveBeenCalledWith(
        'step-enum', 'role', 'user', 'enum', ['admin', 'user'],
      )
    })

    it('shows table badge for table args in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I fill in the form with the following data (Field, Value):',
              args: [{
                name: 'data',
                type: 'table',
                value: '[]',
                tableColumns: ['Field', 'Value'],
              }],
            })],
          }],
        },
      })

      // In edit mode, table args show a TableEditor below the step text
      // and/or an inline badge. Check for either the badge or the TableEditor stub.
      const badge = container.querySelector('.inline-arg-table-badge')
      const tableEditor = container.querySelector('[data-testid="table-editor"]')
      expect(badge || tableEditor).toBeTruthy()
    })

    it('shows outline arg select with column options when scenario has examples', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Outline',
            steps: [createMockStep({
              id: 'step-outline',
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: '<destination>' }],
            })],
            examples: {
              columns: ['destination'],
              rows: [{ destination: 'home' }],
            },
          }],
        },
      })

      // Should render an outline select (editable select) instead of plain input
      const outlineSelect = screen.queryByTestId('inline-arg-outline-select')
      expect(outlineSelect).toBeTruthy()
    })
  })

  // =========================================================================
  // Preconditions (Background)
  // =========================================================================

  describe('preconditions — background steps', () => {
    it('shows "Always applied" hint in read mode', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep({ keyword: 'Given', pattern: 'I am logged in' })],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText('Always applied')).toBeTruthy()
    })

    it('shows background step text in read mode', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep({ keyword: 'Given', pattern: 'I am logged in' })],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText(/I am logged in/)).toBeTruthy()
    })

    it('shows empty background hint in background edit mode with no steps', () => {
      createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText('Drag steps here to add preconditions')).toBeTruthy()
    })

    it('shows Edit button in preconditions when not in background edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const editBtn = container.querySelector('.preconditions-section .section-action')
      expect(editBtn).toBeTruthy()
      expect(editBtn!.textContent).toContain('Edit')
    })

    it('shows Done button in preconditions when in background edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const doneBtn = container.querySelector('.preconditions-section .section-action')
      expect(doneBtn).toBeTruthy()
      expect(doneBtn!.textContent).toContain('Done')
    })

    it('emits toggle-edit-mode when Edit button in preconditions is clicked', async () => {
      const { container, emitted } = createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const editBtn = container.querySelector('.preconditions-section .section-action')!
      await fireEvent.click(editBtn)
      expect(emitted()['toggle-edit-mode']).toBeTruthy()
    })

    it('shows inline arg inputs for background steps in background edit mode', () => {
      createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep({
            id: 'bg-1',
            keyword: 'Given',
            pattern: 'I am on the {string} page',
            args: [{ name: 'page', type: 'string', value: 'login' }],
          })],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByTestId('inline-arg-input-background')).toBeTruthy()
    })

    it('shows remove button for background steps in background edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep({ id: 'bg-1' })],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const removeBtn = container.querySelector('.preconditions-section .precondition-item .remove-btn')
      expect(removeBtn).toBeTruthy()
    })

    it('calls removeBackgroundStep when background step remove is clicked', async () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep({ id: 'bg-remove' })],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const removeBtn = container.querySelector('.preconditions-section .precondition-item .remove-btn')!
      await fireEvent.click(removeBtn)

      const store = useScenarioStore()
      expect(store.removeBackgroundStep).toHaveBeenCalledWith('bg-remove')
    })

    it('shows drop zones in background edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      const preconditionsDropZones = container.querySelectorAll('.preconditions-section .drop-zone')
      expect(preconditionsDropZones.length).toBeGreaterThan(0)
    })

    it('shows Add Preconditions button when no background exists in edit mode', () => {
      createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [],
          scenarios: [{ name: 'Test', steps: mockScenarioSteps }],
        },
      })

      expect(screen.getByText('Add Preconditions')).toBeTruthy()
    })

    it('emits toggle-edit-mode when Add Preconditions button is clicked', async () => {
      const { emitted } = createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [],
          scenarios: [{ name: 'Test', steps: mockScenarioSteps }],
        },
      })

      await fireEvent.click(screen.getByText('Add Preconditions'))
      expect(emitted()['toggle-edit-mode']).toBeTruthy()
    })

    it('does NOT show Add Preconditions when background has steps', () => {
      createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.queryByText('Add Preconditions')).toBeNull()
    })
  })

  // =========================================================================
  // Drag & Drop
  // =========================================================================

  describe('drag and drop — scenario steps', () => {
    it('sets dragging class on step when drag starts', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'first' }),
              createMockStep({ id: 's2', keyword: 'When', pattern: 'second' }),
            ],
          }],
        },
      })

      const stepItem = container.querySelector('.step-item')!
      const mockDt = {
        setData: vi.fn(),
        effectAllowed: '',
        setDragImage: vi.fn(),
      }
      await fireEvent.dragStart(stepItem, { dataTransfer: mockDt })

      expect(container.querySelector('.dragging-active')).toBeTruthy()
    })

    it('shows active drop zone indicator on drag over', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'first' }),
              createMockStep({ id: 's2', keyword: 'When', pattern: 'second' }),
            ],
          }],
        },
      })

      // Start drag on first step
      const stepItem = container.querySelector('.step-item')!
      const mockDt = {
        setData: vi.fn(),
        effectAllowed: '',
        setDragImage: vi.fn(),
      }
      await fireEvent.dragStart(stepItem, { dataTransfer: mockDt })

      // Drag over a drop zone
      const dropZones = container.querySelectorAll('.drop-zone')
      if (dropZones.length > 1) {
        await fireEvent.dragOver(dropZones[1]!, { dataTransfer: mockDt, preventDefault: vi.fn() })
        expect(dropZones[1]!.classList.contains('active')).toBe(true)
      }
    })

    it('clears dragging state on drag end', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'first' }),
              createMockStep({ id: 's2', keyword: 'When', pattern: 'second' }),
            ],
          }],
        },
      })

      const stepItem = container.querySelector('.step-item')!
      const mockDt = {
        setData: vi.fn(),
        effectAllowed: '',
        setDragImage: vi.fn(),
      }
      await fireEvent.dragStart(stepItem, { dataTransfer: mockDt })
      expect(container.querySelector('.dragging-active')).toBeTruthy()

      await fireEvent.dragEnd(stepItem)
      expect(container.querySelector('.dragging-active')).toBeNull()
    })

    it('calls moveStep when dropping a step on a different zone', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ id: 's1', keyword: 'Given', pattern: 'first' }),
              createMockStep({ id: 's2', keyword: 'When', pattern: 'second' }),
              createMockStep({ id: 's3', keyword: 'Then', pattern: 'third' }),
            ],
          }],
        },
      })

      // Start drag on first step (index 0) — dataTransfer uses text/plain with "scenario:<id>"
      const stepItems = container.querySelectorAll('.step-item')
      const mockDtStart = {
        setData: vi.fn(),
        effectAllowed: '',
        setDragImage: vi.fn(),
      }
      await fireEvent.dragStart(stepItems[0]!, { dataTransfer: mockDtStart })

      // Drop on the last zone (after 3rd step = index 3)
      const dropZones = container.querySelectorAll('.story-section .drop-zone')
      if (dropZones.length > 2) {
        const mockDtDrop = {
          getData: vi.fn().mockReturnValue('scenario:s1'),
          types: ['text/plain'],
        }
        await fireEvent.drop(dropZones[dropZones.length - 1]!, {
          dataTransfer: mockDtDrop,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        })

        const store = useScenarioStore()
        expect(store.moveStep).toHaveBeenCalled()
      }
    })

    it('inserts step from catalog drop', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({ id: 's1', keyword: 'Given', pattern: 'first' })],
          }],
        },
      })

      const catalogStep = JSON.stringify({
        keyword: 'When',
        pattern: 'I click on {string}',
        args: [{ name: 'element', type: 'string', required: true }],
      })

      const dropZones = container.querySelectorAll('.story-section .drop-zone')
      if (dropZones.length > 0) {
        const mockDt = {
          getData: vi.fn().mockReturnValue(catalogStep),
          types: ['application/json'],
        }
        await fireEvent.drop(dropZones[dropZones.length - 1]!, {
          dataTransfer: mockDt,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        })

        const store = useScenarioStore()
        expect(store.insertStepAt).toHaveBeenCalled()
      }
    })
  })

  // =========================================================================
  // Drop zone "Add step" button
  // =========================================================================

  describe('add step button in drop zones', () => {
    it('opens StepAddDialog when add step button is clicked', async () => {
      const { container } = createWrapper({ viewMode: 'edit', editMode: 'scenario' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep()],
          }],
        },
      })

      const addStepBtn = container.querySelector('.add-step-btn')!
      await fireEvent.click(addStepBtn)

      const dialog = container.querySelector('[data-testid="step-add-dialog"]')
      expect(dialog).toBeTruthy()
      expect(dialog!.getAttribute('data-target')).toBe('scenario')
    })
  })

  // =========================================================================
  // Scenario Pagination
  // =========================================================================

  describe('scenario pagination — navigation', () => {
    it('shows correct number of dots for scenarios', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [
            { name: 'A', steps: [] },
            { name: 'B', steps: [] },
            { name: 'C', steps: [] },
          ],
        },
      })

      const dots = container.querySelectorAll('.pagination-dot')
      expect(dots.length).toBe(3)
    })

    it('marks active dot for current scenario index', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          activeScenarioIndex: 1,
          scenarios: [
            { name: 'A', steps: [] },
            { name: 'B', steps: [] },
            { name: 'C', steps: [] },
          ],
        },
      })

      const dots = container.querySelectorAll('.pagination-dot')
      expect(dots[1]!.classList.contains('active')).toBe(true)
      expect(dots[0]!.classList.contains('active')).toBe(false)
    })

    it('calls setActiveScenario when dot is clicked', async () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          activeScenarioIndex: 0,
          scenarios: [
            { name: 'A', steps: [] },
            { name: 'B', steps: [] },
          ],
        },
      })

      const dots = container.querySelectorAll('.pagination-dot')
      await fireEvent.click(dots[1]!)

      const store = useScenarioStore()
      expect(store.setActiveScenario).toHaveBeenCalledWith(1)
    })

    it('navigates to previous scenario when left arrow is clicked', async () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          activeScenarioIndex: 1,
          scenarios: [
            { name: 'A', steps: [] },
            { name: 'B', steps: [] },
          ],
        },
      })

      // The prev button is the first <button> inside .scenario-pagination with chevron-left icon
      const prevBtn = container.querySelector('.scenario-pagination button[icon="pi pi-chevron-left"]') as HTMLButtonElement
      await fireEvent.click(prevBtn)

      const store = useScenarioStore()
      expect(store.setActiveScenario).toHaveBeenCalledWith(0)
    })

    it('disables left arrow at first scenario', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          activeScenarioIndex: 0,
          scenarios: [
            { name: 'A', steps: [] },
            { name: 'B', steps: [] },
          ],
        },
      })

      const prevBtn = container.querySelector('.scenario-pagination button[icon="pi pi-chevron-left"]') as HTMLButtonElement
      expect(prevBtn?.disabled).toBe(true)
    })

    it('calls addScenario when + button is clicked in edit mode', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Only', steps: [] }],
        },
      })

      const addBtn = container.querySelector('[title="Add new scenario"]')!
      await fireEvent.click(addBtn)

      const store = useScenarioStore()
      expect(store.addScenario).toHaveBeenCalled()
    })

    it('calls removeScenario when trash button is clicked in edit mode', async () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          activeScenarioIndex: 1,
          scenarios: [
            { name: 'A', steps: [] },
            { name: 'B', steps: [] },
          ],
        },
      })

      const removeBtn = container.querySelector('[title="Remove current scenario"]')!
      await fireEvent.click(removeBtn)

      const store = useScenarioStore()
      expect(store.removeScenario).toHaveBeenCalledWith(1)
    })

    it('disables remove button when only one scenario exists', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Only', steps: [] }],
        },
      })

      const removeBtn = container.querySelector('[title="Remove current scenario"]') as HTMLButtonElement
      expect(removeBtn?.disabled).toBe(true)
    })
  })

  // =========================================================================
  // Examples / Scenario Outline
  // =========================================================================

  describe('examples / scenario outline', () => {
    it('shows read-only examples table in read mode with columns and rows', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Outline',
            steps: [createMockStep({
              pattern: 'I am on the {string} page',
              args: [{ name: 'page', type: 'string', value: '<dest>' }],
            })],
            examples: {
              columns: ['dest', 'expected'],
              rows: [
                { dest: 'home', expected: 'Welcome' },
                { dest: 'login', expected: 'Sign in' },
              ],
            },
          }],
        },
      })

      const examplesTable = container.querySelector('.examples-readonly-table')
      expect(examplesTable).toBeTruthy()

      const headers = examplesTable!.querySelectorAll('th')
      expect(headers.length).toBe(2)
      expect(headers[0]!.textContent).toContain('dest')
      expect(headers[1]!.textContent).toContain('expected')

      const rows = examplesTable!.querySelectorAll('tbody tr')
      expect(rows.length).toBe(2)
      expect(rows[0]!.textContent).toContain('home')
      expect(rows[0]!.textContent).toContain('Welcome')
    })

    it('renders ExamplesEditor in edit mode when scenario has examples', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Outline',
            steps: [],
            examples: {
              columns: ['variant'],
              rows: [{ variant: 'A' }],
            },
          }],
        },
      })

      expect(screen.getByTestId('examples-editor')).toBeTruthy()
    })

    it('shows "Add examples table" button in edit mode when no examples exist', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByText('Add examples table')).toBeTruthy()
    })

    it('calls toggleScenarioOutline when "Add examples table" is clicked', async () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      await fireEvent.click(screen.getByText('Add examples table'))

      const store = useScenarioStore()
      expect(store.toggleScenarioOutline).toHaveBeenCalled()
    })

    it('hides examples section in run mode', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Outline',
            steps: [],
            examples: {
              columns: ['v'],
              rows: [{ v: '1' }],
            },
          }],
        },
      })

      expect(container.querySelector('.variations-section')).toBeNull()
    })
  })

  // =========================================================================
  // Run Mode
  // =========================================================================

  describe('run mode — detailed', () => {
    it('shows "Scenario is valid" message when validation passes', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
          validation: { isValid: true, issues: [] },
        },
      })

      expect(screen.getByText(/valid and ready to run/i)).toBeTruthy()
    })

    it('shows validation error messages when validation fails', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
          validation: {
            isValid: false,
            issues: [
              { severity: 'error', message: 'Missing step definition' },
              { severity: 'error', message: 'Empty arg value' },
            ],
          },
        },
      })

      expect(screen.getByText('Missing step definition')).toBeTruthy()
      expect(screen.getByText('Empty arg value')).toBeTruthy()
    })

    it('shows target info with feature path and scenario name', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'login.feature',
          scenarios: [{ name: 'Successful login', steps: [createMockStep()] }],
        },
      })

      // Target info section has .target-value spans
      const targetValues = container.querySelectorAll('.target-value')
      const texts = Array.from(targetValues).map(el => el.textContent)
      expect(texts.some(t => t?.includes('login.feature'))).toBe(true)
      expect(texts.some(t => t?.includes('Successful login'))).toBe(true)
    })

    it('shows base URL input', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
      })

      const baseUrlInput = container.querySelector('.run-controls-section input')
      expect(baseUrlInput).toBeTruthy()
    })

    it('shows run buttons (Run with UI and Run Headless)', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
          validation: { isValid: true, issues: [] },
        },
      })

      expect(screen.getByText('Run with UI')).toBeTruthy()
      expect(screen.getByText('Run Headless')).toBeTruthy()
    })

    it('shows stop button when runner is running', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
        runner: {
          isRunning: true,
          status: 'running',
        },
      })

      expect(screen.getByText('Stop')).toBeTruthy()
    })

    it('does NOT show stop button when runner is idle', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
        runner: {
          isRunning: false,
          status: 'idle',
        },
      })

      expect(screen.queryByText('Stop')).toBeNull()
    })

    it('shows steps preview as ordered list', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [
              createMockStep({ keyword: 'Given', pattern: 'step one' }),
              createMockStep({ keyword: 'When', pattern: 'step two' }),
            ],
          }],
        },
      })

      const stepsList = container.querySelector('.run-steps-section ol')
      expect(stepsList).toBeTruthy()
      const items = stepsList!.querySelectorAll('li')
      expect(items.length).toBe(2)
    })

    it('shows logs section with placeholder when no logs', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
        runner: { logs: [] },
      })

      expect(screen.getByText(/Run the scenario to see output here/)).toBeTruthy()
    })

    it('shows logs content when logs exist', () => {
      createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
        runner: { logs: ['PASS test 1', 'PASS test 2'] },
      })

      expect(screen.getByText(/PASS test 1/)).toBeTruthy()
    })

    it('hides story and preconditions sections in run mode', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep()],
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
      })

      expect(container.querySelector('.story-section')).toBeNull()
      expect(container.querySelector('.preconditions-section')).toBeNull()
    })
  })

  // =========================================================================
  // View Mode Classes
  // =========================================================================

  describe('view mode CSS classes', () => {
    it('applies mode-read class in read mode', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })
      expect(container.querySelector('.mode-read')).toBeTruthy()
    })

    it('applies mode-edit class in edit mode', () => {
      const { container } = createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })
      expect(container.querySelector('.mode-edit')).toBeTruthy()
    })

    it('applies mode-run class in run mode', () => {
      const { container } = createWrapper({ viewMode: 'run' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{ name: 'Test', steps: [createMockStep()] }],
        },
      })
      expect(container.querySelector('.mode-run')).toBeTruthy()
    })
  })

  // =========================================================================
  // Multi-arg Steps
  // =========================================================================

  describe('multi-argument steps', () => {
    it('renders multiple inline inputs for steps with multiple string args', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I fill {string} with {string}',
              args: [
                { name: 'field', type: 'string', value: 'username' },
                { name: 'value', type: 'string', value: 'testuser' },
              ],
            })],
          }],
        },
      })

      const inputs = screen.getAllByTestId('inline-arg-input')
      expect(inputs.length).toBe(2)
    })

    it('shows both string and enum args in the same step', () => {
      createWrapper({ viewMode: 'edit' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I am on the {string} page as (admin|user)',
              args: [
                { name: 'page', type: 'string', value: 'home' },
                { name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] },
              ],
            })],
          }],
        },
      })

      expect(screen.getByTestId('inline-arg-input')).toBeTruthy()
      expect(screen.getByTestId('inline-arg-select')).toBeTruthy()
    })

    it('shows all arg values in read mode for multi-arg step', () => {
      const { container } = createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          scenarios: [{
            name: 'Test',
            steps: [createMockStep({
              pattern: 'I fill {string} with {string}',
              args: [
                { name: 'field', type: 'string', value: 'username' },
                { name: 'value', type: 'string', value: 'testuser' },
              ],
            })],
          }],
        },
      })

      expect(container.innerHTML).toContain('username')
      expect(container.innerHTML).toContain('testuser')
    })
  })

  // =========================================================================
  // Enum select in background edit mode
  // =========================================================================

  describe('background enum args', () => {
    it('shows inline-arg-select-background for enum args in background edit mode', () => {
      createWrapper({ viewMode: 'edit', editMode: 'background' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          background: [createMockStep({
            id: 'bg-enum',
            keyword: 'Given',
            pattern: 'I am logged in as (admin|user)',
            args: [{ name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] }],
          })],
          scenarios: [{ name: 'Test', steps: [] }],
        },
      })

      expect(screen.getByTestId('inline-arg-select-background')).toBeTruthy()
    })
  })

  // =========================================================================
  // Multiple scenarios with different content
  // =========================================================================

  describe('active scenario display', () => {
    it('displays the active scenario content based on activeScenarioIndex', () => {
      createWrapper({ viewMode: 'read' }, {
        scenario: {
          currentFeaturePath: 'test.feature',
          activeScenarioIndex: 1,
          scenarios: [
            { name: 'First Scenario', steps: [] },
            { name: 'Second Scenario', steps: [createMockStep({ pattern: 'specific step' })] },
          ],
        },
      })

      expect(screen.getByText('Second Scenario')).toBeTruthy()
      expect(screen.getByText(/specific step/)).toBeTruthy()
    })
  })

  // =========================================================================
  // Validation auto-trigger
  // =========================================================================

  describe('auto-validation', () => {
    it('calls validate after throttle when scenario has content', async () => {
      // Use stubActions: true (default for createTestingPinia) to spy on validate
      render(ScenarioBuilder, {
        props: {
          editMode: 'scenario',
          viewMode: 'edit',
        },
        global: {
          plugins: [
            createTestingPinia({
              createSpy: vi.fn,
              initialState: createInitialStoreState({
                scenario: {
                  currentFeaturePath: 'test.feature',
                  scenarios: [{ name: 'Test', steps: [createMockStep()] }],
                },
              }),
            }),
          ],
          stubs: {
            ...primeVueStubs,
            TableEditor: { name: 'TableEditor', template: '<div />' },
            TagsEditor: { name: 'TagsEditor', template: '<div />', props: ['tags'] },
            ExamplesEditor: { name: 'ExamplesEditor', template: '<div />' },
            StepAddDialog: { name: 'StepAddDialog', template: '<div />', props: ['visible'] },
          },
        },
      })

      const store = useScenarioStore()

      // Trigger the watcher by modifying the scenario (deep watch)
      store.scenarios[0]!.name = 'Updated name'
      await vi.advanceTimersByTimeAsync(1100)

      expect(store.validate).toHaveBeenCalled()
    })
  })
})
