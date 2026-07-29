import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import type { ScenarioExecution } from '@suisui/shared'
import RunResultsPanel from '../components/RunResultsPanel.vue'
import { primeVueStubs, createInitialStoreState } from './testUtils'

/**
 * A run of any real size reports hundreds of scenarios. Listed flat they are not
 * readable — the panel groups them by the file they came from, opens only the
 * groups that need attention, and offers a failures-only filter.
 */

const LOGIN = 'access/sign-in.feature'
const CART = 'cart/checkout.feature'
const LEGACY = 'playwright/tests/architect/forms.spec.ts'

function scenario(over: Partial<ScenarioExecution> & { testId: string }): ScenarioExecution {
  return {
    relativePath: LOGIN,
    title: 'a scenario',
    status: 'passed',
    steps: {},
    attempt: 0,
    startedAt: 1,
    ...over,
  }
}

function renderPanel(
  scenarios: ScenarioExecution[],
  running: string[] = [],
  logs: string[] = [],
  showLogs = false,
) {
  return render(RunResultsPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: createInitialStoreState({
            runner: {
              isRunning: true,
              activeScope: 'global',
              showLogs,
              scopes: {
                global: {
                  status: 'running',
                  logs,
                  errors: [],
                  batchResult: null,
                  showResults: true,
                  reportUrl: '',
                  reportLoading: false,
                  singleRun: false,
                  progress: { total: 0, completed: 0, passed: 0, failed: 0, skipped: 0 },
                  startedAt: 1,
                  live: {
                    available: true,
                    reconciled: false,
                    running,
                    scenarios: Object.fromEntries(scenarios.map((s) => [s.testId, s])),
                  },
                },
              },
            },
          }),
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

describe('RunResultsPanel — grouped live view', () => {
  it('shows one row per file rather than one per scenario', async () => {
    const { container } = renderPanel([
      scenario({ testId: 'a1', title: 'Signs in' }),
      scenario({ testId: 'a2', title: 'Rejects a bad password' }),
      scenario({ testId: 'b1', relativePath: CART, title: 'Checks out' }),
    ])

    await screen.findByTestId('live-scenarios')
    expect(container.querySelectorAll('.live-group')).toHaveLength(2)
    expect(screen.getByText(LOGIN)).toBeTruthy()
    expect(screen.getByText(CART)).toBeTruthy()
  })

  it('keeps a passing group shut, so a green run stays one screen', async () => {
    renderPanel([scenario({ testId: 'a1', title: 'Signs in' })])

    await screen.findByTestId('live-scenarios')
    expect(screen.queryByText('Signs in')).toBeNull()
  })

  it('opens a group that failed, without being asked', async () => {
    renderPanel([
      scenario({ testId: 'a1', title: 'Signs in' }),
      scenario({ testId: 'a2', title: 'Rejects a bad password', status: 'failed' }),
    ])

    // Both rows show: the failure, and its neighbours for context.
    expect(await screen.findByText('Rejects a bad password')).toBeTruthy()
    expect(screen.getByText('Signs in')).toBeTruthy()
  })

  it('opens and closes a group on click', async () => {
    renderPanel([scenario({ testId: 'a1', title: 'Signs in' })])

    const toggle = (await screen.findAllByTestId('live-group-toggle'))[0]!
    await fireEvent.click(toggle)
    expect(screen.getByText('Signs in')).toBeTruthy()

    await fireEvent.click(toggle)
    expect(screen.queryByText('Signs in')).toBeNull()
  })

  it('cuts the list down to the failures when asked', async () => {
    renderPanel([
      scenario({ testId: 'a1', title: 'Signs in' }),
      scenario({ testId: 'a2', title: 'Rejects a bad password', status: 'failed' }),
      scenario({ testId: 'b1', relativePath: CART, title: 'Checks out' }),
    ])

    await fireEvent.click(await screen.findByTestId('live-failures-only'))

    // The green feature goes entirely; the failing one keeps only what failed.
    expect(screen.queryByText(CART)).toBeNull()
    expect(screen.getByText('Rejects a bad password')).toBeTruthy()
    expect(screen.queryByText('Signs in')).toBeNull()
  })

  it('offers no filter when nothing failed', async () => {
    renderPanel([scenario({ testId: 'a1', title: 'Signs in' })])

    await screen.findByTestId('live-scenarios')
    expect(screen.queryByTestId('live-failures-only')).toBeNull()
  })

  it('lists a plain Playwright spec under its own file, in its own section', async () => {
    renderPanel([
      scenario({ testId: 'a1', title: 'Signs in' }),
      scenario({
        testId: 'x1',
        relativePath: '',
        specPath: LEGACY,
        title: 'architect fills the land form',
        status: 'failed',
      }),
    ])

    expect(await screen.findByTestId('live-other-specs')).toBeTruthy()
    expect(screen.getByText(LEGACY)).toBeTruthy()
  })
})

describe('RunResultsPanel — the log is not the default view', () => {
  // Shown, the raw log takes the panel. The live list is the point: it says where
  // the run is without anyone having to read stdout. The toggle itself lives in
  // the runner header (pages/index.vue); this panel only obeys it.
  const LOG = ['Running 286 tests using 4 workers', '  ok 1 access/sign-in.feature']

  it('keeps the log out of the way while the run is in flight', async () => {
    const { container } = renderPanel([scenario({ testId: 'a1', title: 'Signs in' })], [], LOG)

    await screen.findByTestId('live-scenarios')
    expect(container.querySelector('.logs-output')).toBeNull()
  })

  it('shows the log once the header toggle has been turned on', async () => {
    const { container } = renderPanel(
      [scenario({ testId: 'a1', title: 'Signs in' })],
      [],
      LOG,
      true,
    )

    await screen.findByTestId('live-scenarios')
    expect(container.querySelector('.logs-output')).toBeTruthy()
  })

  it('owns no logs toggle of its own', async () => {
    renderPanel([scenario({ testId: 'a1', title: 'Signs in' })], [], LOG)

    await screen.findByTestId('live-scenarios')
    expect(screen.queryByTestId('toggle-logs-btn')).toBeNull()
  })
})
