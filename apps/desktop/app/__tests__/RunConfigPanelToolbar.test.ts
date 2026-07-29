import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import RunConfigPanel from '../components/RunConfigPanel.vue'
import { primeVueStubs, createInitialStoreState } from './testUtils'

/**
 * What the runner's toolbar is allowed to hold.
 *
 * Base URL is not one of them — it is a workspace setting, edited in Settings
 * (which also explains the Playwright-config default), and a second field for it
 * beside the run buttons only invited the two to disagree.
 */

function renderPanel(runner: Record<string, unknown> = {}) {
  return render(RunConfigPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: createInitialStoreState({
            runner: {
              isRunning: false,
              activeScope: 'global',
              workspaceTests: { features: [], allTags: [], folders: [] },
              ...runner,
            },
          }),
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

/** A run scope, since the panel reads everything through `currentScope`. */
function scope(over: Record<string, unknown> = {}) {
  return {
    global: {
      status: 'idle',
      logs: [],
      errors: [],
      batchResult: null,
      showResults: false,
      reportUrl: '',
      reportLoading: false,
      singleRun: false,
      progress: { total: 0, completed: 0, passed: 0, failed: 0, skipped: 0 },
      startedAt: 0,
      live: { available: false, reconciled: false, running: [], scenarios: {} },
      ...over,
    },
  }
}

describe('RunConfigPanel — toolbar', () => {
  it('has no Base URL field: that setting lives in Settings', () => {
    const { container } = renderPanel({ scopes: scope() })

    expect(container.querySelector('.base-url-input')).toBeNull()
    expect(screen.queryByPlaceholderText(/http:\/\/localhost/)).toBeNull()
  })

  it('offers the execution mode while filters are being chosen', () => {
    renderPanel({ scopes: scope() })

    expect(screen.getByTestId('execution-selector')).toBeTruthy()
  })

  it('drops the execution mode once results are on screen', () => {
    // It configures the NEXT run and has nothing to say about the one shown.
    renderPanel({ scopes: scope({ showResults: true, batchResult: null }) })

    expect(screen.queryByTestId('execution-selector')).toBeNull()
  })

  it('does not hold the stop control while a run is in flight', () => {
    // Stopping is a control over the RUN, so it sits in the Test Runner header
    // (pages/index.vue) and stays put as this toolbar empties out.
    renderPanel({ isRunning: true, scopes: scope({ showResults: true, status: 'running' }) })

    expect(screen.queryByTestId('stop-run-btn')).toBeNull()
    expect(screen.queryByText('Stop')).toBeNull()
  })
})
