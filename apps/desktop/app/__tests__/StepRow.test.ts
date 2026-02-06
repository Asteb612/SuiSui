import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import StepRow from '../components/StepRow.vue'
import { primeVueStubs, createMockStep } from './testUtils'
import type { ScenarioStep, ValidationIssue } from '@suisui/shared'

function createWrapper(props: {
  step?: ScenarioStep
  index?: number
  totalSteps?: number
  issues?: ValidationIssue[]
  stepType?: 'scenario' | 'background'
  isDragging?: boolean
  isDropTarget?: boolean
} = {}) {
  const defaultStep = createMockStep()

  return render(StepRow, {
    props: {
      step: props.step ?? defaultStep,
      index: props.index ?? 0,
      totalSteps: props.totalSteps ?? 3,
      issues: props.issues ?? [],
      stepType: props.stepType ?? 'scenario',
      isDragging: props.isDragging ?? false,
      isDropTarget: props.isDropTarget ?? false,
    },
    global: {
      stubs: {
        ...primeVueStubs,
        TableEditor: { template: '<div data-testid="table-editor" />' },
      },
    },
  })
}

describe('StepRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders step row container', () => {
      createWrapper()
      expect(screen.getByTestId('scenario-step')).toBeTruthy()
    })

    it('renders with background step testid when stepType is background', () => {
      createWrapper({ stepType: 'background' })
      expect(screen.getByTestId('background-step')).toBeTruthy()
    })

    it('renders step keyword badge', () => {
      const step = createMockStep({ keyword: 'Given' })
      createWrapper({ step })

      const keyword = screen.getByTestId('step-keyword')
      expect(keyword.textContent?.trim()).toBe('Given')
    })

    it('renders correct keyword class', () => {
      const step = createMockStep({ keyword: 'When' })
      createWrapper({ step })

      const keyword = screen.getByTestId('step-keyword')
      expect(keyword.classList.contains('when')).toBe(true)
    })

    it('renders step pattern with formatting', () => {
      const step = createMockStep({ pattern: 'I click {string}' })
      createWrapper({ step })

      const pattern = screen.getByTestId('step-pattern')
      expect(pattern.innerHTML).toContain('pattern-string')
    })

    it('renders drag handle', () => {
      createWrapper()
      const handle = screen.getByTitle('Drag to reorder')
      expect(handle).toBeTruthy()
    })

    it('renders move buttons', () => {
      createWrapper()
      expect(screen.getByTestId('move-up-btn')).toBeTruthy()
      expect(screen.getByTestId('move-down-btn')).toBeTruthy()
    })

    it('renders remove button', () => {
      createWrapper()
      expect(screen.getByTestId('remove-btn')).toBeTruthy()
    })

    it('renders edit button for scenario steps', () => {
      createWrapper({ stepType: 'scenario' })
      expect(screen.getByTestId('edit-btn')).toBeTruthy()
    })

    it('does not render edit button for background steps', () => {
      createWrapper({ stepType: 'background' })
      expect(screen.queryByTestId('edit-btn')).toBeNull()
    })
  })

  describe('arguments display', () => {
    it('renders arguments section when step has args', () => {
      const step = createMockStep({
        args: [{ name: 'page', type: 'string', value: 'home' }],
      })
      createWrapper({ step })

      expect(screen.getByTestId('step-args')).toBeTruthy()
    })

    it('does not render arguments section when no args', () => {
      const step = createMockStep({ args: [] })
      createWrapper({ step })

      expect(screen.queryByTestId('step-args')).toBeNull()
    })

    it('renders input for string arguments', () => {
      const step = createMockStep({
        args: [{ name: 'page', type: 'string', value: 'login' }],
      })
      createWrapper({ step })

      const input = screen.getByTestId('input-text')
      expect(input).toBeTruthy()
      expect((input as HTMLInputElement).value).toBe('login')
    })

    it('renders select for enum arguments', () => {
      const step = createMockStep({
        args: [
          { name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] },
        ],
      })
      createWrapper({ step })

      expect(screen.getByTestId('select')).toBeTruthy()
    })

    it('renders table editor for table arguments', () => {
      const step = createMockStep({
        args: [
          { name: 'data', type: 'table', value: '[]', tableColumns: ['name', 'email'] },
        ],
      })
      createWrapper({ step })

      expect(screen.getByTestId('table-editor')).toBeTruthy()
    })

    it('renders argument label', () => {
      const step = createMockStep({
        args: [{ name: 'username', type: 'string', value: '' }],
      })
      createWrapper({ step })

      expect(screen.getByText('username')).toBeTruthy()
    })
  })

  describe('validation issues', () => {
    it('renders issues section when issues exist', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', message: 'Missing value' },
      ]
      createWrapper({ issues })

      expect(screen.getByTestId('step-issues')).toBeTruthy()
    })

    it('does not render issues section when no issues', () => {
      createWrapper({ issues: [] })
      expect(screen.queryByTestId('step-issues')).toBeNull()
    })

    it('renders error issue with correct class', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', message: 'Test error' },
      ]
      createWrapper({ issues })

      const issue = screen.getByTestId('issue')
      expect(issue.classList.contains('error')).toBe(true)
    })

    it('renders warning issue with correct class', () => {
      const issues: ValidationIssue[] = [
        { severity: 'warning', message: 'Test warning' },
      ]
      createWrapper({ issues })

      const issue = screen.getByTestId('issue')
      expect(issue.classList.contains('warning')).toBe(true)
    })

    it('displays issue message', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', message: 'Value is required' },
      ]
      createWrapper({ issues })

      expect(screen.getByText('Value is required')).toBeTruthy()
    })

    it('adds has-error class when error issues exist', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', message: 'Error' },
      ]
      createWrapper({ issues })

      const row = screen.getByTestId('scenario-step')
      expect(row.classList.contains('has-error')).toBe(true)
    })

    it('does not add has-error class for warnings only', () => {
      const issues: ValidationIssue[] = [
        { severity: 'warning', message: 'Warning' },
      ]
      createWrapper({ issues })

      const row = screen.getByTestId('scenario-step')
      expect(row.classList.contains('has-error')).toBe(false)
    })
  })

  describe('move buttons state', () => {
    it('disables move up when index is 0', () => {
      createWrapper({ index: 0, totalSteps: 3 })

      const moveUp = screen.getByTestId('move-up-btn')
      expect(moveUp.hasAttribute('disabled')).toBe(true)
    })

    it('enables move up when index > 0', () => {
      createWrapper({ index: 1, totalSteps: 3 })

      const moveUp = screen.getByTestId('move-up-btn')
      expect(moveUp.hasAttribute('disabled')).toBe(false)
    })

    it('disables move down when at last position', () => {
      createWrapper({ index: 2, totalSteps: 3 })

      const moveDown = screen.getByTestId('move-down-btn')
      expect(moveDown.hasAttribute('disabled')).toBe(true)
    })

    it('enables move down when not at last position', () => {
      createWrapper({ index: 1, totalSteps: 3 })

      const moveDown = screen.getByTestId('move-down-btn')
      expect(moveDown.hasAttribute('disabled')).toBe(false)
    })
  })

  describe('drag state classes', () => {
    it('adds is-dragging class when isDragging is true', () => {
      createWrapper({ isDragging: true })

      const row = screen.getByTestId('scenario-step')
      expect(row.classList.contains('is-dragging')).toBe(true)
    })

    it('adds is-drop-target class when isDropTarget is true', () => {
      createWrapper({ isDropTarget: true })

      const row = screen.getByTestId('scenario-step')
      expect(row.classList.contains('is-drop-target')).toBe(true)
    })

    it('adds background-step-row class for background steps', () => {
      createWrapper({ stepType: 'background' })

      const row = screen.getByTestId('background-step')
      expect(row.classList.contains('background-step-row')).toBe(true)
    })
  })

  describe('events', () => {
    it('emits move-up when move up button clicked', async () => {
      const { emitted } = createWrapper({ index: 1 })

      await fireEvent.click(screen.getByTestId('move-up-btn'))

      expect(emitted()['move-up']).toBeTruthy()
    })

    it('emits move-down when move down button clicked', async () => {
      const { emitted } = createWrapper({ index: 0, totalSteps: 2 })

      await fireEvent.click(screen.getByTestId('move-down-btn'))

      expect(emitted()['move-down']).toBeTruthy()
    })

    it('emits remove when remove button clicked', async () => {
      const { emitted } = createWrapper()

      await fireEvent.click(screen.getByTestId('remove-btn'))

      expect(emitted()['remove']).toBeTruthy()
    })

    it('emits edit when edit button clicked', async () => {
      const { emitted } = createWrapper({ stepType: 'scenario' })

      await fireEvent.click(screen.getByTestId('edit-btn'))

      expect(emitted()['edit']).toBeTruthy()
    })

    it('emits update-arg when input value changes', async () => {
      const step = createMockStep({
        args: [{ name: 'page', type: 'string', value: '' }],
      })
      const { emitted } = createWrapper({ step })

      const input = screen.getByTestId('input-text')
      await fireEvent.update(input, 'new value')

      expect(emitted()['update-arg']).toBeTruthy()
      expect(emitted()['update-arg']![0]).toContain('page')
    })

    it('has draggable attribute', () => {
      createWrapper()

      const row = screen.getByTestId('scenario-step')
      expect(row.getAttribute('draggable')).toBe('true')
    })
  })

  describe('keyword display', () => {
    const keywords = ['Given', 'When', 'Then', 'And', 'But'] as const

    keywords.forEach((keyword) => {
      it(`displays ${keyword} keyword with correct styling`, () => {
        const step = createMockStep({ keyword })
        createWrapper({ step })

        const badge = screen.getByTestId('step-keyword')
        expect(badge.textContent?.trim()).toBe(keyword)
        expect(badge.classList.contains(keyword.toLowerCase())).toBe(true)
      })
    })
  })
})
