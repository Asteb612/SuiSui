import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import { nextTick } from 'vue'
import ScenarioBuilder from '../components/ScenarioBuilder.vue'
import { useScenarioStore } from '../stores/scenario'

// Minimal stubs that let inputs render properly
const testStubs = {
  Dialog: {
    template: '<div v-if="visible" data-testid="dialog"><slot /><slot name="footer" /></div>',
    props: ['visible'],
  },
  Button: {
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>',
    props: ['label', 'icon', 'disabled', 'text', 'rounded', 'size', 'severity'],
  },
  InputText: {
    template: `<input
      :value="modelValue"
      :placeholder="placeholder"
      :class="$attrs.class"
      :data-testid="$attrs['data-testid']"
      @input="$emit('update:modelValue', $event.target.value)"
    />`,
    props: ['modelValue', 'placeholder', 'size'],
    emits: ['update:modelValue'],
  },
  Select: {
    template: `<select
      :class="$attrs.class"
      :data-testid="$attrs['data-testid']"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-for="opt in options" :key="opt" :value="opt">{{ opt }}</option>
    </select>`,
    props: ['modelValue', 'options', 'placeholder', 'size'],
    emits: ['update:modelValue'],
  },
  SelectButton: { template: '<div data-testid="select-button"><slot /></div>', props: ['modelValue', 'options'] },
  IconField: { template: '<div><slot /></div>' },
  InputIcon: { template: '<span />' },
  TableEditor: { template: '<div data-testid="table-editor" />' },
  TagsEditor: { template: '<div data-testid="tags-editor" />' },
  ExamplesEditor: { template: '<div data-testid="examples-editor" />' },
  StepAddDialog: {
    template: '<div v-if="visible" data-testid="step-add-dialog" />',
    props: ['visible', 'target', 'insertIndex'],
  },
}

function createStep(overrides: Record<string, unknown> = {}) {
  const id = 'step-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
  return {
    id: overrides.id ?? id,
    keyword: overrides.keyword ?? 'Given',
    pattern: overrides.pattern ?? 'I do something',
    args: overrides.args ?? [],
  }
}

describe('ScenarioBuilder Inline Editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders inline input for string arg in edit mode', async () => {
    const step = createStep({
      id: 'test-step',
      pattern: 'I am on the {string} page',
      args: [{ name: 'page', type: 'string', value: 'home' }],
    })

    const { container } = render(ScenarioBuilder, {
      props: {
        editMode: 'scenario',
        viewMode: 'edit',
      },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              scenario: {
                currentFeaturePath: 'test.feature',
                featureName: 'Test Feature',
                scenarios: [{ name: 'Test Scenario', steps: [step] }],
                activeScenarioIndex: 0,
                background: [],
                validation: null,
                isDirty: false,
              },
            },
          }),
        ],
        stubs: testStubs,
      },
    })

    await nextTick()

    // The container should have mode-edit class
    const scenarioView = container.querySelector('.scenario-view')
    expect(scenarioView?.classList.contains('mode-edit')).toBe(true)

    // The step-text should have step-text-editable class
    const stepTextEditable = container.querySelector('.step-text.step-text-editable')
    expect(stepTextEditable).toBeTruthy()

    // There MUST be an inline-arg-input
    const inlineInput = container.querySelector('input.inline-arg-input')
    expect(inlineInput).toBeTruthy()

    // The input should have the correct value
    expect((inlineInput as HTMLInputElement)?.value).toBe('home')
  })

  it('allows typing in the inline input', async () => {
    const step = createStep({
      id: 'type-test-step',
      pattern: 'I am on the {string} page',
      args: [{ name: 'page', type: 'string', value: '' }],
    })

    const { container } = render(ScenarioBuilder, {
      props: {
        editMode: 'scenario',
        viewMode: 'edit',
      },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              scenario: {
                currentFeaturePath: 'test.feature',
                featureName: 'Test Feature',
                scenarios: [{ name: 'Test Scenario', steps: [step] }],
                activeScenarioIndex: 0,
                background: [],
                validation: null,
                isDirty: false,
              },
            },
          }),
        ],
        stubs: testStubs,
      },
    })

    await nextTick()

    const store = useScenarioStore()
    const inlineInput = container.querySelector('input.inline-arg-input') as HTMLInputElement

    expect(inlineInput).toBeTruthy()

    // Type into the input
    await fireEvent.update(inlineInput, 'dashboard')

    // Store should be updated (now includes arg type and enumValues)
    expect(store.updateStepArg).toHaveBeenCalledWith('type-test-step', 'page', 'dashboard', 'string', undefined)
  })

  it('renders multiple inputs for multiple args', async () => {
    const step = createStep({
      pattern: 'I fill {string} with {string}',
      args: [
        { name: 'field', type: 'string', value: 'email' },
        { name: 'value', type: 'string', value: 'test@example.com' },
      ],
    })

    const { container } = render(ScenarioBuilder, {
      props: {
        editMode: 'scenario',
        viewMode: 'edit',
      },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              scenario: {
                currentFeaturePath: 'test.feature',
                featureName: 'Test Feature',
                scenarios: [{ name: 'Test Scenario', steps: [step] }],
                activeScenarioIndex: 0,
                background: [],
                validation: null,
                isDirty: false,
              },
            },
          }),
        ],
        stubs: testStubs,
      },
    })

    await nextTick()

    const inputs = container.querySelectorAll('input.inline-arg-input')
    expect(inputs.length).toBe(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('email')
    expect((inputs[1] as HTMLInputElement).value).toBe('test@example.com')
  })

  it('does NOT render inline inputs in read mode', async () => {
    const step = createStep({
      pattern: 'I am on the {string} page',
      args: [{ name: 'page', type: 'string', value: 'home' }],
    })

    const { container } = render(ScenarioBuilder, {
      props: {
        editMode: 'scenario',
        viewMode: 'read', // READ MODE
      },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              scenario: {
                currentFeaturePath: 'test.feature',
                featureName: 'Test Feature',
                scenarios: [{ name: 'Test Scenario', steps: [step] }],
                activeScenarioIndex: 0,
                background: [],
                validation: null,
                isDirty: false,
              },
            },
          }),
        ],
        stubs: testStubs,
      },
    })

    await nextTick()

    // Should NOT have editable class
    const stepTextEditable = container.querySelector('.step-text.step-text-editable')
    expect(stepTextEditable).toBeNull()

    // Should NOT have inline inputs (except the scenario title input)
    const inlineInputs = container.querySelectorAll('input.inline-arg-input')
    expect(inlineInputs.length).toBe(0)

    // Should have formatted text with "home" visible
    const stepText = container.querySelector('.step-text')
    expect(stepText?.innerHTML).toContain('home')
  })

  it('renders select for regex enum patterns', async () => {
    const step = createStep({
      pattern: '^I am logged in as (admin|user|guest)$',
      args: [{ name: 'arg0', type: 'enum', value: 'admin', enumValues: ['admin', 'user', 'guest'] }],
    })

    const { container } = render(ScenarioBuilder, {
      props: {
        editMode: 'scenario',
        viewMode: 'edit',
      },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              scenario: {
                currentFeaturePath: 'test.feature',
                featureName: 'Test Feature',
                scenarios: [{ name: 'Test Scenario', steps: [step] }],
                activeScenarioIndex: 0,
                background: [],
                validation: null,
                isDirty: false,
              },
            },
          }),
        ],
        stubs: testStubs,
      },
    })

    await nextTick()

    // Should render a select for the enum arg
    const select = container.querySelector('select.inline-arg-select')
    expect(select).toBeTruthy()

    // Should have the enum options
    const options = select?.querySelectorAll('option')
    expect(options?.length).toBe(3)
  })

  it('cleans regex anchors from displayed text', async () => {
    const step = createStep({
      pattern: '^I am on the {string} page$',
      args: [{ name: 'page', type: 'string', value: 'home' }],
    })

    const { container } = render(ScenarioBuilder, {
      props: {
        editMode: 'scenario',
        viewMode: 'edit',
      },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              scenario: {
                currentFeaturePath: 'test.feature',
                featureName: 'Test Feature',
                scenarios: [{ name: 'Test Scenario', steps: [step] }],
                activeScenarioIndex: 0,
                background: [],
                validation: null,
                isDirty: false,
              },
            },
          }),
        ],
        stubs: testStubs,
      },
    })

    await nextTick()

    // The displayed text should not contain ^ or $
    const stepText = container.querySelector('.step-text-editable')
    const textContent = stepText?.textContent || ''
    expect(textContent).not.toContain('^')
    expect(textContent).not.toContain('$')
    expect(textContent).toContain('I am on the')
  })
})
