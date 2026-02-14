/**
 * Shared test utilities for Vue component testing
 */
import { vi } from 'vitest'
import type { ScenarioStep, StepDefinition, Scenario, ValidationResult, FeatureTreeNode, FeatureFile, GitStatusResult } from '@suisui/shared'

// ============================================================================
// PrimeVue Component Stubs
// ============================================================================

export const primeVueStubs = {
  Dialog: {
    name: 'Dialog',
    template: '<div v-if="visible" class="p-dialog" data-testid="dialog"><div class="p-dialog-header">{{ header }}</div><slot /><slot name="footer" /></div>',
    props: ['visible', 'header', 'modal', 'closable', 'style'],
    emits: ['update:visible'],
  },
  Button: {
    name: 'Button',
    template: '<button data-testid="button" @click="onClick" :disabled="disabled" :title="title" :icon="icon" :loading="loading" :class="[severity, { \'p-button-text\': text }]">{{ label }}<slot /></button>',
    props: ['icon', 'label', 'text', 'rounded', 'size', 'disabled', 'loading', 'title', 'severity', 'outlined'],
    emits: ['click'],
    methods: {
      onClick(this: { $emit: (e: string, payload: Event) => void }, event: Event) {
        this.$emit('click', event)
      },
    },
  },
  InputText: {
    name: 'InputText',
    template: '<input data-testid="input-text" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" :placeholder="placeholder" :disabled="disabled" :class="{ \'p-invalid\': invalid }" />',
    props: ['modelValue', 'placeholder', 'size', 'disabled', 'invalid', 'autofocus'],
    emits: ['update:modelValue'],
  },
  Checkbox: {
    name: 'Checkbox',
    template: '<input type="checkbox" data-testid="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" :id="inputId" />',
    props: ['modelValue', 'inputId', 'binary'],
    emits: ['update:modelValue'],
  },
  Select: {
    name: 'Select',
    template: '<select data-testid="select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="opt in options" :key="opt" :value="opt">{{ opt }}</option></select>',
    props: ['modelValue', 'options', 'placeholder', 'size'],
    emits: ['update:modelValue'],
  },
  SelectButton: {
    name: 'SelectButton',
    template: '<div data-testid="select-button"><slot /></div>',
    props: ['modelValue', 'options', 'allowEmpty', 'size'],
    emits: ['update:modelValue'],
  },
  Textarea: {
    name: 'Textarea',
    template: '<textarea data-testid="textarea" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'rows', 'cols'],
    emits: ['update:modelValue'],
  },
  Menu: {
    name: 'Menu',
    template: '<div v-if="visible" data-testid="menu"><slot /></div>',
    props: ['model', 'popup'],
    data(): { visible: boolean } {
      return { visible: false }
    },
    methods: {
      toggle(this: { visible: boolean }) {
        this.visible = !this.visible
      },
      hide(this: { visible: boolean }) {
        this.visible = false
      },
    },
  },
  IconField: {
    name: 'IconField',
    template: '<div class="p-icon-field"><slot /></div>',
  },
  InputIcon: {
    name: 'InputIcon',
    template: '<span class="p-input-icon"><slot /></span>',
    props: ['class'],
  },
}

// ============================================================================
// Mock Data Factories
// ============================================================================

let stepIdCounter = 0
let featureIdCounter = 0

export function resetMockCounters() {
  stepIdCounter = 0
  featureIdCounter = 0
}

export function createMockStep(overrides: Partial<ScenarioStep> = {}): ScenarioStep {
  stepIdCounter++
  return {
    id: `step-${stepIdCounter}`,
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    args: [{ name: 'page', type: 'string', value: '' }],
    ...overrides,
  }
}

export function createMockStepDefinition(overrides: Partial<StepDefinition> = {}): StepDefinition {
  stepIdCounter++
  return {
    id: `def-${stepIdCounter}`,
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    args: [{ name: 'page', type: 'string', required: true }],
    location: 'test.steps.ts:10',
    isGeneric: false,
    ...overrides,
  }
}

export function createMockScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    name: 'Test Scenario',
    steps: [],
    ...overrides,
  }
}

export function createMockFeature(overrides: Partial<FeatureFile> = {}): FeatureFile {
  featureIdCounter++
  const relativePath = overrides.relativePath ?? `test-feature-${featureIdCounter}.feature`
  return {
    path: overrides.path ?? `/test/workspace/${relativePath}`,
    name: overrides.name ?? `Test Feature ${featureIdCounter}`,
    relativePath,
    content: overrides.content ?? 'Feature: Test',
    ...overrides,
  }
}

export function createMockFeatureTreeNode(overrides: Partial<FeatureTreeNode> = {}): FeatureTreeNode {
  featureIdCounter++
  const isFolder = overrides.type === 'folder' || (!overrides.type && Math.random() > 0.5)

  if (isFolder) {
    return {
      type: 'folder',
      name: `folder-${featureIdCounter}`,
      relativePath: `folder-${featureIdCounter}`,
      children: [],
      ...overrides,
    } as FeatureTreeNode
  }

  return {
    type: 'file',
    name: `feature-${featureIdCounter}`,
    relativePath: `feature-${featureIdCounter}.feature`,
    feature: createMockFeature(),
    ...overrides,
  } as FeatureTreeNode
}

export function createMockValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    isValid: true,
    issues: [],
    ...overrides,
  }
}

export function createMockGitStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    status: 'clean',
    branch: 'main',
    ahead: 0,
    behind: 0,
    modified: [],
    staged: [],
    untracked: [],
    hasRemote: false,
    ...overrides,
  }
}

// ============================================================================
// Common Test Data Sets
// ============================================================================

export const mockStepDefinitions: StepDefinition[] = [
  {
    id: 'given-page',
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    args: [{ name: 'page', type: 'string', required: true }],
    location: 'generic.steps.ts:5',
    isGeneric: true,
  },
  {
    id: 'given-logged-in',
    keyword: 'Given',
    pattern: 'I am logged in as (admin|user|guest)',
    args: [{ name: 'role', type: 'enum', required: true, enumValues: ['admin', 'user', 'guest'] }],
    location: 'generic.steps.ts:10',
    isGeneric: true,
  },
  {
    id: 'when-click',
    keyword: 'When',
    pattern: 'I click on {string}',
    args: [{ name: 'element', type: 'string', required: true }],
    location: 'generic.steps.ts:15',
    isGeneric: true,
  },
  {
    id: 'when-fill',
    keyword: 'When',
    pattern: 'I fill {string} with {string}',
    args: [
      { name: 'field', type: 'string', required: true },
      { name: 'value', type: 'string', required: true },
    ],
    location: 'generic.steps.ts:20',
    isGeneric: true,
  },
  {
    id: 'then-see',
    keyword: 'Then',
    pattern: 'I should see {string}',
    args: [{ name: 'text', type: 'string', required: true }],
    location: 'generic.steps.ts:25',
    isGeneric: true,
  },
  {
    id: 'then-url',
    keyword: 'Then',
    pattern: 'the URL should contain {string}',
    args: [{ name: 'path', type: 'string', required: true }],
    location: 'generic.steps.ts:30',
    isGeneric: false,
  },
]

export const mockScenarioSteps: ScenarioStep[] = [
  {
    id: 'step-1',
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    args: [{ name: 'page', type: 'string', value: 'login' }],
  },
  {
    id: 'step-2',
    keyword: 'When',
    pattern: 'I fill {string} with {string}',
    args: [
      { name: 'field', type: 'string', value: 'username' },
      { name: 'value', type: 'string', value: 'testuser' },
    ],
  },
  {
    id: 'step-3',
    keyword: 'Then',
    pattern: 'I should see {string}',
    args: [{ name: 'text', type: 'string', value: 'Welcome' }],
  },
]

export const mockFeatureTree: FeatureTreeNode[] = [
  {
    type: 'folder',
    name: 'auth',
    relativePath: 'auth',
    children: [
      {
        type: 'file',
        name: 'login',
        relativePath: 'auth/login.feature',
        feature: {
          path: '/test/workspace/auth/login.feature',
          name: 'Login',
          relativePath: 'auth/login.feature',
          content: 'Feature: Login',
        },
      },
      {
        type: 'file',
        name: 'logout',
        relativePath: 'auth/logout.feature',
        feature: {
          path: '/test/workspace/auth/logout.feature',
          name: 'Logout',
          relativePath: 'auth/logout.feature',
          content: 'Feature: Logout',
        },
      },
    ],
  },
  {
    type: 'file',
    name: 'home',
    relativePath: 'home.feature',
    feature: {
      path: '/test/workspace/home.feature',
      name: 'Home',
      relativePath: 'home.feature',
      content: 'Feature: Home',
    },
  },
]

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a mock DragEvent with dataTransfer
 */
export function createMockDragEvent(type: string, data: Record<string, string> = {}): DragEvent {
  const dataTransferData: Record<string, string> = { ...data }

  const mockDataTransfer = {
    data: dataTransferData,
    effectAllowed: 'none' as DataTransfer['effectAllowed'],
    dropEffect: 'none' as DataTransfer['dropEffect'],
    setData(format: string, value: string) {
      dataTransferData[format] = value
    },
    getData(format: string) {
      return dataTransferData[format] || ''
    },
    clearData() {
      Object.keys(dataTransferData).forEach(key => delete dataTransferData[key])
    },
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: Object.keys(dataTransferData),
  }

  return {
    type,
    dataTransfer: mockDataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent
}

/**
 * Creates a mock for window.api
 */
export function createMockApi() {
  return {
    workspace: {
      get: vi.fn().mockResolvedValue({ path: '/test/workspace' }),
      select: vi.fn().mockResolvedValue({ path: '/selected/workspace' }),
      createFolder: vi.fn().mockResolvedValue(undefined),
      renameFolder: vi.fn().mockResolvedValue(undefined),
      deleteFolder: vi.fn().mockResolvedValue(undefined),
    },
    features: {
      list: vi.fn().mockResolvedValue([]),
      tree: vi.fn().mockResolvedValue([]),
      read: vi.fn().mockResolvedValue('Feature: Test'),
      write: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    steps: {
      export: vi.fn().mockResolvedValue(mockStepDefinitions),
    },
    validate: {
      scenario: vi.fn().mockResolvedValue({ isValid: true, issues: [] }),
    },
    git: {
      status: vi.fn().mockResolvedValue(createMockGitStatus()),
      pull: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
    },
    runner: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
    },
  }
}

/**
 * Wait for Vue's nextTick and a small delay for async operations
 */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Creates initial Pinia state for testing
 */
export function createInitialStoreState(overrides: Record<string, Record<string, unknown> | undefined> = {}) {
  return {
    workspace: {
      workspace: { path: '/test/workspace' },
      isLoading: false,
      error: null,
      features: [],
      featureTree: mockFeatureTree,
      featureCount: 3,
      selectedFeature: null,
      ...(overrides.workspace ?? {}),
    },
    scenario: {
      featureName: 'Test Feature',
      background: [],
      scenarios: [{ name: 'Test Scenario', steps: mockScenarioSteps }],
      activeScenarioIndex: 0,
      validation: null,
      isDirty: false,
      currentFeaturePath: 'test.feature',
      ...(overrides.scenario ?? {}),
    },
    steps: {
      steps: mockStepDefinitions,
      decorators: [],
      exportedAt: '2024-01-01T00:00:00Z',
      isLoading: false,
      error: null,
      ...(overrides.steps ?? {}),
    },
    git: {
      status: createMockGitStatus(),
      isLoading: false,
      error: null,
      ...(overrides.git ?? {}),
    },
    runner: {
      status: 'idle',
      baseUrl: 'http://localhost:3000',
      logs: [],
      isRunning: false,
      ...(overrides.runner ?? {}),
    },
  }
}
