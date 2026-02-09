import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import NewScenarioDialog from '../components/NewScenarioDialog.vue'
import { primeVueStubs } from './testUtils'

function createWrapper(props: { visible?: boolean } = {}) {
  return render(NewScenarioDialog, {
    props: {
      visible: props.visible ?? true,
    },
    global: {
      stubs: primeVueStubs,
    },
  })
}

describe('NewScenarioDialog', () => {
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

    it('renders scenario name input', () => {
      createWrapper()
      expect(screen.getByTestId('new-scenario-name-input')).toBeTruthy()
    })

    it('renders create button', () => {
      createWrapper()
      expect(screen.getByTestId('create-scenario-button')).toBeTruthy()
    })

    it('renders cancel button', () => {
      const { container } = createWrapper()
      // Cancel button is the first button (without create-scenario-button data-testid)
      const buttons = container.querySelectorAll('button[data-testid="button"]')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('filename generation', () => {
    it('generates kebab-case filename from scenario name', async () => {
      createWrapper()

      const input = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(input, 'My Test Scenario')

      // Check suggested filename is displayed
      expect(screen.getByText('my-test-scenario.feature')).toBeTruthy()
    })

    it('handles multiple spaces in name', async () => {
      createWrapper()

      const input = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(input, 'Multiple Spaces Here')

      // The component converts spaces to dashes and lowercases
      expect(screen.getByText('multiple-spaces-here.feature')).toBeTruthy()
    })

    it('shows placeholder when name is empty', async () => {
      createWrapper()

      expect(screen.getByText('Enter a scenario name...')).toBeTruthy()
    })
  })

  describe('custom filename toggle', () => {
    it('shows checkbox for custom filename', () => {
      createWrapper()
      expect(screen.getByTestId('checkbox')).toBeTruthy()
    })

    it('shows custom filename input when checkbox is checked', async () => {
      createWrapper()

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      expect(screen.getByTestId('custom-filename-input')).toBeTruthy()
    })

    it('hides suggested filename when custom is enabled', async () => {
      createWrapper()

      const nameInput = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(nameInput, 'Test')

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      expect(screen.queryByText('test.feature')).toBeNull()
    })
  })

  describe('validation', () => {
    it('disables create button when name is empty', () => {
      createWrapper()

      const createBtn = screen.getByTestId('create-scenario-button')
      expect(createBtn.hasAttribute('disabled')).toBe(true)
    })

    it('enables create button when name is provided', async () => {
      createWrapper()

      const input = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(input, 'Valid Name')

      const createBtn = screen.getByTestId('create-scenario-button')
      expect(createBtn.hasAttribute('disabled')).toBe(false)
    })

    it('disables create button when custom filename does not end with .feature', async () => {
      createWrapper()

      const nameInput = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(nameInput, 'Test')

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      const customInput = screen.getByTestId('custom-filename-input')
      await fireEvent.update(customInput, 'invalid-name')

      const createBtn = screen.getByTestId('create-scenario-button')
      expect(createBtn.hasAttribute('disabled')).toBe(true)
    })

    it('enables create button when custom filename ends with .feature', async () => {
      createWrapper()

      const nameInput = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(nameInput, 'Test')

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      const customInput = screen.getByTestId('custom-filename-input')
      await fireEvent.update(customInput, 'valid-name.feature')

      const createBtn = screen.getByTestId('create-scenario-button')
      expect(createBtn.hasAttribute('disabled')).toBe(false)
    })
  })

  describe('events', () => {
    it('emits create event with name and filename', async () => {
      const { emitted } = createWrapper()

      const input = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(input, 'Test Scenario')

      const createBtn = screen.getByTestId('create-scenario-button')
      await fireEvent.click(createBtn)

      expect(emitted()['create']).toBeTruthy()
      expect(emitted()['create']![0]).toEqual([
        { name: 'Test Scenario', fileName: 'test-scenario.feature' },
      ])
    })

    it('emits create with custom filename', async () => {
      const { emitted } = createWrapper()

      const nameInput = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(nameInput, 'Test')

      const checkbox = screen.getByTestId('checkbox')
      await fireEvent.click(checkbox)

      const customInput = screen.getByTestId('custom-filename-input')
      await fireEvent.update(customInput, 'custom.feature')

      const createBtn = screen.getByTestId('create-scenario-button')
      await fireEvent.click(createBtn)

      expect(emitted()['create']![0]).toEqual([
        { name: 'Test', fileName: 'custom.feature' },
      ])
    })

    it('emits update:visible false on create', async () => {
      const { emitted } = createWrapper()

      const input = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(input, 'Test')

      const createBtn = screen.getByTestId('create-scenario-button')
      await fireEvent.click(createBtn)

      expect(emitted()['update:visible']).toBeTruthy()
      expect(emitted()['update:visible']![0]).toEqual([false])
    })

    it('emits update:visible false on cancel', async () => {
      const { emitted, container } = createWrapper()

      // Find the cancel button (first button in footer without disabled attribute)
      const buttons = container.querySelectorAll('button[data-testid="button"]:not([disabled])')
      const cancelBtn = buttons[0]!
      await fireEvent.click(cancelBtn)

      expect(emitted()['update:visible']).toBeTruthy()
      expect(emitted()['update:visible']![0]).toEqual([false])
    })

    it('does not emit create when validation fails', async () => {
      const { emitted } = createWrapper()

      const createBtn = screen.getByTestId('create-scenario-button')
      await fireEvent.click(createBtn)

      expect(emitted()['create']).toBeFalsy()
    })
  })

  describe('form reset', () => {
    it('trims whitespace from scenario name', async () => {
      const { emitted } = createWrapper()

      const input = screen.getByTestId('new-scenario-name-input')
      await fireEvent.update(input, '  Test  ')

      const createBtn = screen.getByTestId('create-scenario-button')
      await fireEvent.click(createBtn)

      expect(emitted()['create']![0]).toEqual([
        { name: 'Test', fileName: 'test.feature' },
      ])
    })
  })
})
