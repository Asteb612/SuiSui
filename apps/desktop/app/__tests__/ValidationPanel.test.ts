import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import ValidationPanel from '../components/ValidationPanel.vue'
import { primeVueStubs, createMockValidationResult } from './testUtils'
import { useRunnerStore } from '../stores/runner'

function createWrapper(overrides: {
  scenario?: Record<string, unknown>
  runner?: Record<string, unknown>
} = {}) {
  return render(ValidationPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            scenario: {
              currentFeaturePath: 'test.feature',
              scenarios: [{ name: 'Test Scenario', steps: [] }],
              activeScenarioIndex: 0,
              validation: null,
              isValid: true,
              errors: [],
              warnings: [],
              ...overrides.scenario,
            },
            runner: {
              status: 'idle',
              baseUrl: 'http://localhost:3000',
              logs: [],
              isRunning: false,
              lastResult: null,
              ...overrides.runner,
            },
          },
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

describe('ValidationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders validation panel container', () => {
      createWrapper()
      expect(screen.getByTestId('validation-panel')).toBeTruthy()
    })

    it('renders Validation section header', () => {
      createWrapper()
      expect(screen.getByText('Validation')).toBeTruthy()
    })

    it('renders Test Runner section header', () => {
      createWrapper()
      expect(screen.getByText('Test Runner')).toBeTruthy()
    })

    it('renders Logs section header', () => {
      createWrapper()
      expect(screen.getByText('Logs')).toBeTruthy()
    })
  })

  describe('validation section', () => {
    it('shows prompt when no validation run', () => {
      createWrapper({ scenario: { validation: null } })
      expect(screen.getByText(/Click "Validate" to check the scenario/)).toBeTruthy()
    })

    it('shows success message when valid', () => {
      createWrapper({
        scenario: {
          validation: createMockValidationResult({ isValid: true }),
          isValid: true,
        },
      })

      expect(screen.getByText('Scenario is valid')).toBeTruthy()
    })

    it('shows check icon when valid', () => {
      const { container } = createWrapper({
        scenario: {
          validation: createMockValidationResult({ isValid: true }),
          isValid: true,
        },
      })

      expect(container.querySelector('.pi-check-circle')).toBeTruthy()
    })

    it('shows errors when validation fails', () => {
      createWrapper({
        scenario: {
          validation: createMockValidationResult({
            isValid: false,
            issues: [{ severity: 'error', message: 'Missing step definition' }],
          }),
          isValid: false,
          errors: [{ severity: 'error', message: 'Missing step definition' }],
        },
      })

      expect(screen.getByText('Missing step definition')).toBeTruthy()
    })

    it('shows warnings', () => {
      // Note: The component only shows warnings in validation-issues section
      // which is only visible when isValid is false. When isValid is true,
      // it shows "Scenario is valid" message instead of the issues list.
      // Warnings are shown alongside errors when there are validation issues.
      createWrapper({
        scenario: {
          validation: createMockValidationResult({
            isValid: false,
            issues: [{ severity: 'warning', message: 'Step may be slow' }],
          }),
        },
      })

      expect(screen.getByText('Step may be slow')).toBeTruthy()
    })

    it('shows error icon for errors', () => {
      const { container } = createWrapper({
        scenario: {
          validation: createMockValidationResult({
            isValid: false,
            issues: [{ severity: 'error', message: 'Error' }],
          }),
        },
      })

      expect(container.querySelector('.issue.error .pi-times-circle')).toBeTruthy()
    })

    it('shows warning icon for warnings', () => {
      // Warnings are only visible when isValid is false (validation-issues section)
      const { container } = createWrapper({
        scenario: {
          validation: createMockValidationResult({
            isValid: false,
            issues: [{ severity: 'warning', message: 'Warning' }],
          }),
        },
      })

      expect(container.querySelector('.issue.warning .pi-exclamation-triangle')).toBeTruthy()
    })
  })

  describe('runner status', () => {
    it('shows idle status', () => {
      createWrapper({ runner: { status: 'idle' } })
      expect(screen.getByText('idle')).toBeTruthy()
    })

    it('shows running status', () => {
      createWrapper({ runner: { status: 'running' } })
      expect(screen.getByText('running')).toBeTruthy()
    })

    it('shows passed status', () => {
      createWrapper({ runner: { status: 'passed' } })
      expect(screen.getByText('passed')).toBeTruthy()
    })

    it('shows failed status', () => {
      createWrapper({ runner: { status: 'failed' } })
      expect(screen.getByText('failed')).toBeTruthy()
    })

    it('shows duration when lastResult exists', () => {
      createWrapper({
        runner: {
          status: 'passed',
          lastResult: { duration: 1500 },
        },
      })

      expect(screen.getByText('1500ms')).toBeTruthy()
    })

    it('shows status dot', () => {
      const { container } = createWrapper()
      expect(container.querySelector('.status-dot')).toBeTruthy()
    })
  })

  describe('base URL input', () => {
    it('renders base URL input', () => {
      createWrapper()
      expect(screen.getByTestId('input-text')).toBeTruthy()
    })

    it('displays current base URL', () => {
      createWrapper({ runner: { baseUrl: 'http://example.com' } })

      const input = screen.getByTestId('input-text')
      expect((input as HTMLInputElement).value).toBe('http://example.com')
    })

    it('disables input when running', () => {
      createWrapper({ runner: { isRunning: true } })

      const input = screen.getByTestId('input-text')
      expect(input.hasAttribute('disabled')).toBe(true)
    })

    it('calls setBaseUrl when value changes', async () => {
      createWrapper()

      const input = screen.getByTestId('input-text')
      await fireEvent.update(input, 'http://newurl.com')

      const store = useRunnerStore()
      expect(store.setBaseUrl).toHaveBeenCalled()
    })
  })

  describe('run buttons', () => {
    it('renders UI button', () => {
      createWrapper()
      expect(screen.getByText('UI')).toBeTruthy()
    })

    it('renders Headless button', () => {
      createWrapper()
      expect(screen.getByText('Headless')).toBeTruthy()
    })

    it('disables run buttons when running', () => {
      createWrapper({ runner: { isRunning: true } })

      const uiButton = screen.getByText('UI').closest('button')
      const headlessButton = screen.getByText('Headless').closest('button')

      expect(uiButton?.hasAttribute('disabled')).toBe(true)
      expect(headlessButton?.hasAttribute('disabled')).toBe(true)
    })

    it('shows Stop button when running', () => {
      createWrapper({ runner: { isRunning: true } })
      expect(screen.getByText('Stop')).toBeTruthy()
    })

    it('does not show Stop button when not running', () => {
      createWrapper({ runner: { isRunning: false } })
      expect(screen.queryByText('Stop')).toBeNull()
    })

    it('calls runUI when UI button clicked', async () => {
      createWrapper()

      await fireEvent.click(screen.getByText('UI'))

      const store = useRunnerStore()
      expect(store.runUI).toHaveBeenCalled()
    })

    it('calls runHeadless when Headless button clicked', async () => {
      createWrapper()

      await fireEvent.click(screen.getByText('Headless'))

      const store = useRunnerStore()
      expect(store.runHeadless).toHaveBeenCalled()
    })

    it('calls stop when Stop button clicked', async () => {
      createWrapper({ runner: { isRunning: true } })

      await fireEvent.click(screen.getByText('Stop'))

      const store = useRunnerStore()
      expect(store.stop).toHaveBeenCalled()
    })
  })

  describe('logs section', () => {
    it('shows empty logs message when no logs', () => {
      createWrapper({ runner: { logs: [] } })
      expect(screen.getByText('No logs yet')).toBeTruthy()
    })

    it('displays logs when present', () => {
      const { container } = createWrapper({
        runner: {
          logs: ['Log line 1', 'Log line 2'],
        },
      })

      // The logs are joined with newlines in a pre element
      const logsText = container.querySelector('.logs-text')
      expect(logsText?.textContent).toContain('Log line 1')
      expect(logsText?.textContent).toContain('Log line 2')
    })

    it('renders clear logs button', () => {
      const { container } = createWrapper()
      expect(container.querySelector('.logs-header button')).toBeTruthy()
    })

    it('disables clear button when no logs', () => {
      const { container } = createWrapper({ runner: { logs: [] } })

      const clearBtn = container.querySelector('.logs-header button')
      expect(clearBtn?.hasAttribute('disabled')).toBe(true)
    })

    it('enables clear button when logs exist', () => {
      const { container } = createWrapper({
        runner: { logs: ['Some log'] },
      })

      const clearBtn = container.querySelector('.logs-header button')
      expect(clearBtn?.hasAttribute('disabled')).toBe(false)
    })

    it('calls clearLogs when clear button clicked', async () => {
      const { container } = createWrapper({
        runner: { logs: ['Log'] },
      })

      const clearBtn = container.querySelector('.logs-header button')!
      await fireEvent.click(clearBtn)

      const store = useRunnerStore()
      expect(store.clearLogs).toHaveBeenCalled()
    })
  })

  describe('scenario context', () => {
    it('passes feature path to runUI', async () => {
      createWrapper({
        scenario: { currentFeaturePath: 'my/feature.feature' },
      })

      await fireEvent.click(screen.getByText('UI'))

      const store = useRunnerStore()
      expect(store.runUI).toHaveBeenCalledWith('my/feature.feature', expect.anything())
    })

    it('passes scenario name to runUI', async () => {
      createWrapper({
        scenario: {
          scenarios: [{ name: 'My Scenario', steps: [] }],
          activeScenarioIndex: 0,
        },
      })

      await fireEvent.click(screen.getByText('UI'))

      const store = useRunnerStore()
      expect(store.runUI).toHaveBeenCalledWith(expect.anything(), 'My Scenario')
    })
  })
})
