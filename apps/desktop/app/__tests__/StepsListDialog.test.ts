import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import StepsListDialog from '../components/StepsListDialog.vue'
import { primeVueStubs } from './testUtils'

const steps = [
  { id: '1', keyword: 'Given', pattern: 'I am on the {string} page', location: 'steps/a.ts:3', args: [], isGeneric: true },
  { id: '2', keyword: 'When', pattern: 'I click on {string}', location: 'steps/a.ts:9', args: [] },
  { id: '3', keyword: 'Then', pattern: 'I should see {string}', location: 'steps/b.ts:2', args: [] },
]

function renderDialog() {
  return render(StepsListDialog, {
    props: { visible: true },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { steps: { steps } } })],
      stubs: primeVueStubs,
    },
  })
}

describe('StepsListDialog', () => {
  it('lists every loaded step with its pattern', () => {
    const { container, getByText } = renderDialog()
    expect(container.querySelectorAll('[data-testid="step-row"]').length).toBe(3)
    expect(getByText('I click on {string}')).toBeTruthy()
    expect(getByText('steps/a.ts:3')).toBeTruthy()
  })

  it('filters the list by pattern text', async () => {
    const { container } = renderDialog()
    await fireEvent.update(container.querySelector('[data-testid="steps-filter"]')!, 'click')
    const rows = container.querySelectorAll('[data-testid="step-row"]')
    expect(rows.length).toBe(1)
    expect(rows[0]!.textContent).toContain('I click on {string}')
  })

  it('shows an empty message when the filter matches nothing', async () => {
    const { container, getByText } = renderDialog()
    await fireEvent.update(container.querySelector('[data-testid="steps-filter"]')!, 'zzz-nomatch')
    expect(container.querySelectorAll('[data-testid="step-row"]').length).toBe(0)
    expect(getByText(/No steps match/)).toBeTruthy()
  })
})
