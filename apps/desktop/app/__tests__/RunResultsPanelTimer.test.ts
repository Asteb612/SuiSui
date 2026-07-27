import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import RunResultsPanel from '../components/RunResultsPanel.vue'
import { primeVueStubs, createInitialStoreState } from './testUtils'

/**
 * Regression: the elapsed-time readout sat at "0s" for an entire run.
 *
 * The panel is mounted by `v-if="runnerStore.showResults"`, and the store turns
 * `isRunning` on BEFORE `showResults`. So by the time this component exists the
 * run is already in flight — a plain `watch` on `isRunning` observes no
 * transition, never starts its interval, and the readout never moves.
 */
function renderPanel(runner: Record<string, unknown>) {
  return render(RunResultsPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: createInitialStoreState({ runner }),
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

describe('RunResultsPanel — elapsed timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows elapsed time on mount when the run is already in flight', async () => {
    const now = Date.now()
    renderPanel({
      isRunning: true,
      showResults: true,
      status: 'running',
      // Started 65s ago — the panel is mounting mid-run, as it always does.
      startedAt: now - 65_000,
    })

    // Must be populated immediately, without waiting for any state to change.
    const elapsed = await screen.findByTestId('run-elapsed')
    expect(elapsed.textContent).toBe('1m 5s')
  })

  it('keeps counting while the run continues', async () => {
    const now = Date.now()
    renderPanel({
      isRunning: true,
      showResults: true,
      status: 'running',
      startedAt: now - 10_000,
    })

    const elapsed = await screen.findByTestId('run-elapsed')
    expect(elapsed.textContent).toBe('10s')

    await vi.advanceTimersByTimeAsync(5_000)
    expect(elapsed.textContent).toBe('15s')
  })
})
