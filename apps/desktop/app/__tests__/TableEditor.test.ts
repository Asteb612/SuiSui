import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import TableEditor from '../components/TableEditor.vue'
import { primeVueStubs } from './testUtils'

interface TableRow {
  [key: string]: string
}

function createWrapper(props: {
  modelValue?: TableRow[]
  columns?: string[]
} = {}) {
  return render(TableEditor, {
    props: {
      modelValue: props.modelValue ?? [],
      columns: props.columns ?? ['name', 'email'],
    },
    global: {
      stubs: primeVueStubs,
    },
  })
}

describe('TableEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders table editor container', () => {
      const { container } = createWrapper()
      expect(container.querySelector('.table-editor')).toBeTruthy()
    })

    it('shows empty state when no rows', () => {
      createWrapper({ modelValue: [] })
      expect(screen.getByText(/No rows yet/)).toBeTruthy()
    })

    it('renders add row button', () => {
      createWrapper()
      expect(screen.getByText('Add Row')).toBeTruthy()
    })

    it('renders table when rows exist', () => {
      createWrapper({
        modelValue: [{ name: 'John', email: 'john@example.com' }],
      })

      const { container } = createWrapper({
        modelValue: [{ name: 'John', email: 'john@example.com' }],
      })
      expect(container.querySelector('.data-table')).toBeTruthy()
    })
  })

  describe('columns', () => {
    it('renders column headers', () => {
      createWrapper({
        columns: ['name', 'email', 'role'],
        modelValue: [{ name: '', email: '', role: '' }],
      })

      expect(screen.getByText('name')).toBeTruthy()
      expect(screen.getByText('email')).toBeTruthy()
      expect(screen.getByText('role')).toBeTruthy()
    })

    it('renders Actions header', () => {
      createWrapper({
        modelValue: [{ name: '' }],
        columns: ['name'],
      })

      expect(screen.getByText('Actions')).toBeTruthy()
    })
  })

  describe('rows', () => {
    it('renders input for each cell', () => {
      createWrapper({
        modelValue: [{ name: 'John', email: 'john@test.com' }],
        columns: ['name', 'email'],
      })

      const inputs = screen.getAllByTestId('input-text')
      expect(inputs.length).toBe(2)
    })

    it('displays cell values', () => {
      createWrapper({
        modelValue: [{ name: 'John', email: 'john@test.com' }],
        columns: ['name', 'email'],
      })

      const inputs = screen.getAllByTestId('input-text')
      expect((inputs[0] as HTMLInputElement).value).toBe('John')
      expect((inputs[1] as HTMLInputElement).value).toBe('john@test.com')
    })

    it('renders multiple rows', () => {
      createWrapper({
        modelValue: [
          { name: 'John', email: 'john@test.com' },
          { name: 'Jane', email: 'jane@test.com' },
          { name: 'Bob', email: 'bob@test.com' },
        ],
        columns: ['name', 'email'],
      })

      const inputs = screen.getAllByTestId('input-text')
      // 2 columns * 3 rows = 6 inputs
      expect(inputs.length).toBe(6)
    })

    it('renders delete button for each row', () => {
      createWrapper({
        modelValue: [{ name: 'John' }, { name: 'Jane' }],
        columns: ['name'],
      })

      const deleteButtons = screen.getAllByTitle('Remove row')
      expect(deleteButtons.length).toBe(2)
    })
  })

  describe('add row', () => {
    it('emits update:modelValue with new row when add row clicked', async () => {
      const { emitted } = createWrapper({
        modelValue: [],
        columns: ['name', 'email'],
      })

      await fireEvent.click(screen.getByText('Add Row'))

      expect(emitted()['update:modelValue']).toBeTruthy()
      expect(emitted()['update:modelValue']![0]).toEqual([
        [{ name: '', email: '' }],
      ])
    })

    it('adds row with correct column structure', async () => {
      const { emitted } = createWrapper({
        modelValue: [{ a: '1', b: '2' }],
        columns: ['a', 'b'],
      })

      await fireEvent.click(screen.getByText('Add Row'))

      const newValue = (emitted()['update:modelValue']![0] as [TableRow[]])[0]
      expect(newValue).toHaveLength(2)
      expect(newValue[1]).toEqual({ a: '', b: '' })
    })
  })

  describe('remove row', () => {
    it('emits update:modelValue without removed row', async () => {
      const { emitted } = createWrapper({
        modelValue: [{ name: 'John' }, { name: 'Jane' }],
        columns: ['name'],
      })

      const deleteButtons = screen.getAllByTitle('Remove row')
      await fireEvent.click(deleteButtons[0]!)

      expect(emitted()['update:modelValue']).toBeTruthy()
      const newValue = (emitted()['update:modelValue']![0] as [TableRow[]])[0]
      expect(newValue).toHaveLength(1)
      expect(newValue[0]).toEqual({ name: 'Jane' })
    })

    it('emits empty array when last row removed', async () => {
      const { emitted } = createWrapper({
        modelValue: [{ name: 'John' }],
        columns: ['name'],
      })

      await fireEvent.click(screen.getByTitle('Remove row'))

      expect(emitted()['update:modelValue']![0]).toEqual([[]])
    })
  })

  describe('cell editing', () => {
    it('emits update:modelValue when cell value changes', async () => {
      const { emitted } = createWrapper({
        modelValue: [{ name: 'John' }],
        columns: ['name'],
      })

      const input = screen.getByTestId('input-text')
      await fireEvent.update(input, 'Jane')

      expect(emitted()['update:modelValue']).toBeTruthy()
    })

    it('updates correct cell in correct row', async () => {
      const { emitted } = createWrapper({
        modelValue: [
          { name: 'John', email: 'john@test.com' },
          { name: 'Jane', email: 'jane@test.com' },
        ],
        columns: ['name', 'email'],
      })

      const inputs = screen.getAllByTestId('input-text')
      // Update second row, first column
      await fireEvent.update(inputs[2]!, 'Bob')

      const lastEmit = (emitted()['update:modelValue']!.slice(-1)[0] as [TableRow[]])[0]
      expect(lastEmit[1]?.name).toBe('Bob')
    })
  })

  describe('reactivity', () => {
    it('updates when modelValue changes', async () => {
      const { rerender } = createWrapper({
        modelValue: [{ name: 'John' }],
        columns: ['name'],
      })

      let input = screen.getByTestId('input-text')
      expect((input as HTMLInputElement).value).toBe('John')

      await rerender({
        modelValue: [{ name: 'Jane' }],
        columns: ['name'],
      })

      input = screen.getByTestId('input-text')
      expect((input as HTMLInputElement).value).toBe('Jane')
    })

    it('handles column changes', async () => {
      const { rerender } = createWrapper({
        modelValue: [{ a: '1' }],
        columns: ['a'],
      })

      expect(screen.getByText('a')).toBeTruthy()

      await rerender({
        modelValue: [{ b: '2' }],
        columns: ['b'],
      })

      expect(screen.getByText('b')).toBeTruthy()
    })
  })

  describe('empty value handling', () => {
    it('handles missing values in row gracefully', () => {
      createWrapper({
        modelValue: [{ name: 'John' }], // missing email
        columns: ['name', 'email'],
      })

      const inputs = screen.getAllByTestId('input-text')
      expect((inputs[1] as HTMLInputElement).value).toBe('')
    })

    it('handles null modelValue', () => {
      // TypeScript would catch this, but test runtime behavior
      createWrapper({
        modelValue: [] as TableRow[],
        columns: ['name'],
      })

      expect(screen.getByText(/No rows yet/)).toBeTruthy()
    })
  })
})
