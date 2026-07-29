import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { RunProgressEvent } from '@suisui/shared'
import { useRunnerStore, GLOBAL_SCOPE } from '../stores/runner'
import { useScenarioStore } from '../stores/scenario'

/** Captured `onProgress` callback, so tests can push events like the main process would. */
let pushProgress: ((event: RunProgressEvent) => void) | null = null
const unsubscribeProgress = vi.fn()

const runBatchMock = vi.fn()

/** The feature file the live events in these tests refer to. */
const LOGIN_FEATURE = `Feature: Login

  Background:
    Given the application is running

  Scenario: Valid login
    When I log in
    Then I should see the dashboard
    And I should see a banner
`

const featuresReadMock = vi.fn()

/** Stand-in for the on-disk snapshot under `<workspace>/.app/`. */
const saveLastRunMock = vi.fn()
const getLastRunMock = vi.fn()

beforeEach(() => {
  featuresReadMock.mockResolvedValue(LOGIN_FEATURE)
  saveLastRunMock.mockResolvedValue(undefined)
  getLastRunMock.mockResolvedValue(null)
  setActivePinia(createPinia())
  vi.clearAllMocks()
  pushProgress = null

  runBatchMock.mockResolvedValue({
    status: 'passed',
    featureResults: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
    duration: 10,
    stdout: '',
    stderr: '',
    errors: [],
  })

  // Assign onto the real jsdom window rather than replacing it.
  ;(window as unknown as { api: unknown }).api = {
    runner: {
      runBatch: runBatchMock,
      getWorkspaceTests: vi.fn().mockResolvedValue({ features: [], allTags: [], folders: [] }),
      stop: vi.fn().mockResolvedValue(undefined),
      showReport: vi.fn(),
      onRunnerLog: vi.fn(),
      offRunnerLog: vi.fn(),
      onProgress: vi.fn((cb: (event: RunProgressEvent) => void) => {
        pushProgress = cb
        return unsubscribeProgress
      }),
      saveLastRun: saveLastRunMock,
      getLastRun: getLastRunMock,
    },
    settings: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
    workspace: { getBaseUrl: vi.fn().mockResolvedValue(null) },
    features: { read: featuresReadMock },
  }
})

const testStart = (testId: string, over: Record<string, unknown> = {}): RunProgressEvent => ({
  type: 'testStart',
  testId,
  relativePath: 'features/login.feature',
  title: 'Valid login',
  attempt: 0,
  at: 1,
  ...over,
})

describe('runner store — live progress subscription', () => {
  it('subscribes when a run starts', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)
    await store.runBatch('headless')

    expect(window.api.runner.onProgress).toHaveBeenCalled()
  })

  it('unsubscribes when the run ends', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)
    await store.runBatch('headless')

    expect(unsubscribeProgress).toHaveBeenCalled()
  })

  it('starts unavailable so the UI falls back to aggregate counters', () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)
    expect(store.live.available).toBe(false)
  })

  it('stays unavailable when a run produces no progress events', async () => {
    // A missing or broken reporter must not break anything (FR-019).
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)
    await store.runBatch('headless')

    expect(store.live.available).toBe(false)
    expect(store.status).toBe('passed')
  })

  it('applies pushed events to live state', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1'))
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 0, title: 'Given a step', at: 2 })
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')

    expect(store.live.available).toBe(true)
    expect(store.live.scenarios['a1']).toBeDefined()
    expect(store.live.scenarios['a1']!.steps[0]!.title).toBe('Given a step')
  })

  it('leaves nothing running once the run ends', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1'))
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 0, title: 'Given a step', at: 2 })
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')

    expect(store.live.running).toEqual([])
    expect(store.live.scenarios['a1']!.steps[0]!.status).not.toBe('running')
    expect(store.live.reconciled).toBe(true)
  })

  it('clears live state from the previous run when a new one starts', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementationOnce(async () => {
      pushProgress!(testStart('old'))
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')
    expect(store.live.scenarios['old']).toBeDefined()

    await store.runBatch('headless')
    expect(store.live.scenarios['old']).toBeUndefined()
  })

  it('marks in-flight work interrupted when the user stops the run', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1'))
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 0, title: 'Given a step', at: 2 })
      await store.stop()
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')

    // Stopped, not failed — the user ended it, they did not break it.
    expect(store.live.scenarios['a1']!.steps[0]!.status).toBe('interrupted')
    expect(store.live.scenarios['a1']!.status).toBe('interrupted')
  })
})

/** Drive a run whose reporter emits `events`, then let pending reads settle. */
async function runWith(
  store: ReturnType<typeof useRunnerStore>,
  events: RunProgressEvent[],
  result?: Record<string, unknown>,
) {
  runBatchMock.mockImplementation(async () => {
    for (const event of events) pushProgress!(event)
    // The authored step list is fetched asynchronously on testStart; let it land
    // before the run finishes, as it would in a real run lasting longer than 0ms.
    await Promise.resolve()
    await Promise.resolve()
    return (
      result ?? {
        status: 'passed',
        featureResults: [],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    )
  })
  await store.runBatch('headless')
}

const LOGIN = 'features/login.feature'
const VALID = 'Valid login'

const stepStart = (index: number, title: string): RunProgressEvent => ({
  type: 'stepStart',
  testId: 'a1',
  index,
  title,
  at: 10 + index,
})

const stepEnd = (
  index: number,
  title: string,
  status: 'passed' | 'failed' | 'skipped',
  error?: string,
): RunProgressEvent => ({
  type: 'stepEnd',
  testId: 'a1',
  index,
  title,
  status,
  durationMs: 5,
  ...(error === undefined ? {} : { error }),
  at: 20 + index,
})

describe('runner store — live step display (US1)', () => {
  it('shows authored steps as pending before anything reports', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [testStart('a1', { relativePath: LOGIN, title: VALID })])

    const steps = store.liveStepsFor(LOGIN, VALID)
    expect(steps).not.toBeNull()
    expect(steps!.map((s) => s.title)).toEqual([
      'Given the application is running',
      'When I log in',
      'Then I should see the dashboard',
      'And I should see a banner',
    ])
  })

  it('labels background steps so they are identifiable', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [testStart('a1', { relativePath: LOGIN, title: VALID })])

    expect(store.liveStepsFor(LOGIN, VALID)!.map((s) => s.isBackground)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('overlays executions onto the authored list by index', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepStart(0, 'Given the application is running'),
      stepEnd(0, 'Given the application is running', 'passed'),
      stepStart(1, 'When I log in'),
      stepEnd(1, 'When I log in', 'passed'),
    ])

    const steps = store.liveStepsFor(LOGIN, VALID)!
    expect(steps.map((s) => s.status)).toEqual(['passed', 'passed', 'skipped', 'skipped'])
  })

  it('shows steps after a failure as skipped rather than pending', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepEnd(0, 'Given the application is running', 'passed'),
      stepEnd(1, 'When I log in', 'failed', 'boom'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 30, at: 40 },
    ])

    const steps = store.liveStepsFor(LOGIN, VALID)!
    expect(steps.map((s) => s.status)).toEqual(['passed', 'failed', 'skipped', 'skipped'])
    expect(steps[1]!.error).toBe('boom')
  })

  it('drops a step whose reported title disagrees with the authored one', async () => {
    // A status on the wrong step is worse than no status at all.
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepEnd(1, 'Then something else entirely', 'passed'),
    ])

    const steps = store.liveStepsFor(LOGIN, VALID)!
    // `skipped` rather than `pending` only because the run has ended by now; what
    // matters is that the reported `passed` was NOT applied to this step.
    expect(steps[1]).toMatchObject({ title: 'When I log in', status: 'skipped' })
    expect(steps.some((s) => s.status === 'passed')).toBe(false)
  })

  it('returns null when no progress events arrived at all', async () => {
    // A missing or broken reporter must leave the caller rendering what it always did.
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [])

    expect(store.liveStepsFor(LOGIN, VALID)).toBeNull()
  })

  it('returns null for a scenario whose feature could not be read', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)
    featuresReadMock.mockRejectedValue(new Error('ENOENT'))

    await runWith(store, [testStart('a1', { relativePath: LOGIN, title: VALID })])

    expect(store.liveStepsFor(LOGIN, VALID)).toBeNull()
    // The run itself is unaffected.
    expect(store.status).toBe('passed')
  })

  it('re-reads authored steps on the next run, picking up edits', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [testStart('a1', { relativePath: LOGIN, title: VALID })])
    expect(store.liveStepsFor(LOGIN, VALID)).toHaveLength(4)

    featuresReadMock.mockResolvedValue(`Feature: Login

  Scenario: Valid login
    When I log in
`)
    await runWith(store, [testStart('a1', { relativePath: LOGIN, title: VALID })])

    expect(store.liveStepsFor(LOGIN, VALID)).toHaveLength(1)
  })
})

describe('runner store — end-of-run reconciliation (US1)', () => {
  it('lets the final report override a disagreeing live status (FR-017)', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(
      store,
      [
        testStart('a1', { relativePath: LOGIN, title: VALID }),
        { type: 'testEnd', testId: 'a1', status: 'passed', durationMs: 10, at: 40 },
      ],
      {
        status: 'failed',
        featureResults: [
          {
            relativePath: LOGIN,
            name: 'Login',
            status: 'failed',
            duration: 10,
            scenarioResults: [{ name: VALID, status: 'failed', duration: 10 }],
          },
        ],
        summary: { total: 1, passed: 0, failed: 1, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      },
    )

    expect(store.executionFor(LOGIN, VALID)!.status).toBe('failed')
  })

  it('resolves a step that never reported completion instead of leaving it running', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepStart(1, 'When I log in'),
      // No stepEnd, no testEnd — the run just ends.
    ])

    const steps = store.liveStepsFor(LOGIN, VALID)!
    expect(steps.every((s) => s.status !== 'running')).toBe(true)
    expect(store.live.reconciled).toBe(true)
  })

  it('leaves live state alone when the report carries no scenario results', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      { type: 'testEnd', testId: 'a1', status: 'passed', durationMs: 10, at: 40 },
    ])

    expect(store.executionFor(LOGIN, VALID)!.status).toBe('passed')
  })
})

describe('runner store — parallel execution (US2)', () => {
  const started = (testId: string, title: string, at: number): RunProgressEvent => ({
    type: 'testStart',
    testId,
    relativePath: LOGIN,
    title,
    attempt: 0,
    at,
  })

  it('reports every in-flight scenario as running, not just one (FR-009)', async () => {
    // A parallel run genuinely has several tests executing at once.
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(started('a1', 'One', 1))
      pushProgress!(started('a2', 'Two', 2))
      pushProgress!(started('a3', 'Three', 3))
      expect(store.live.running).toEqual(['a1', 'a2', 'a3'])
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 3, passed: 3, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')
  })

  it('removes only the scenario that ended', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(started('a1', 'One', 1))
      pushProgress!(started('a2', 'Two', 2))
      pushProgress!({ type: 'testEnd', testId: 'a1', status: 'passed', durationMs: 5, at: 3 })
      expect(store.live.running).toEqual(['a2'])
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 2, passed: 2, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')
  })

  it('does not let interleaved step events cross-contaminate', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(started('a1', 'One', 1))
      pushProgress!(started('a2', 'Two', 2))
      // Interleaved exactly as a real 2-worker run produces them.
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 0, title: 'Given one', at: 3 })
      pushProgress!({ type: 'stepStart', testId: 'a2', index: 0, title: 'Given two', at: 4 })
      pushProgress!({
        type: 'stepEnd',
        testId: 'a1',
        index: 0,
        title: 'Given one',
        status: 'passed',
        durationMs: 1,
        at: 5,
      })
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 2, passed: 2, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')

    expect(store.live.scenarios['a1']!.steps[0]!.title).toBe('Given one')
    expect(store.live.scenarios['a2']!.steps[0]!.title).toBe('Given two')
    expect(store.live.scenarios['a1']!.steps[0]!.status).toBe('passed')
  })

  it('tracks each Scenario Outline example row as its own scenario (FR-010)', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      started('row1', 'Buying 1 items', 1),
      started('row2', 'Buying 3 items', 2),
    ])

    expect(store.liveScenarios.map((s) => s.title)).toEqual([
      'Buying 1 items',
      'Buying 3 items',
    ])
    expect(new Set(store.liveScenarios.map((s) => s.testId)).size).toBe(2)
  })

  it('lists running scenarios before finished ones', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(started('done', 'Finished first', 1))
      pushProgress!({ type: 'testEnd', testId: 'done', status: 'passed', durationMs: 5, at: 2 })
      pushProgress!(started('busy', 'Still going', 3))

      // Ordering matters while the run is in flight, which is the only time the
      // live list is on screen with a mix of both.
      expect(store.liveScenarios.map((s) => s.title)).toEqual([
        'Still going',
        'Finished first',
      ])
      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 2, passed: 2, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')
  })

  it('exposes an empty live list before anything has run', () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)
    expect(store.liveScenarios).toEqual([])
  })
})

describe('run progress never navigates the editor (FR-013)', () => {
  it('leaves the open feature and selected scenario untouched', async () => {
    // Progress arriving for a DIFFERENT feature must not pull the editor away
    // from what the user is looking at.
    const editor = useScenarioStore()
    editor.currentFeaturePath = 'features/other.feature'
    editor.activeScenarioIndex = 2

    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepStart(0, 'Given the application is running'),
      { type: 'testEnd', testId: 'a1', status: 'passed', durationMs: 10, at: 40 },
    ])

    expect(editor.currentFeaturePath).toBe('features/other.feature')
    expect(editor.activeScenarioIndex).toBe(2)
  })

  it('does not mutate scenario content while reflecting statuses (FR-023)', async () => {
    const editor = useScenarioStore()
    editor.currentFeaturePath = LOGIN
    editor.scenarios = [
      {
        name: VALID,
        steps: [{ id: 's1', keyword: 'When', pattern: 'I log in', args: [] }],
      },
    ]
    const before = JSON.stringify(editor.scenarios)

    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      { type: 'stepStart', testId: 'a1', index: 0, title: 'When I log in', at: 5 },
    ])

    expect(JSON.stringify(editor.scenarios)).toBe(before)
    expect(editor.isDirty).toBe(false)
  })
})

describe('runner store — stuck and interrupted runs (US3)', () => {
  it('exposes startedAt on a running step so elapsed time can be derived', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1', { relativePath: LOGIN, title: VALID }))
      pushProgress!({
        type: 'stepStart',
        testId: 'a1',
        index: 0,
        title: 'Given the application is running',
        at: 1_000,
      })

      // Mid-run: the step carries the instant it began, which is all a single
      // shared ticker needs to render a climbing elapsed time.
      const step = store.live.scenarios['a1']!.steps[0]!
      expect(step.status).toBe('running')
      expect(step.startedAt).toBe(1_000)

      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')
  })

  it('never auto-marks a step that has not completed as passed (FR-015)', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1', { relativePath: LOGIN, title: VALID }))
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 0, title: 'Given a', at: 1 })
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 1, title: 'When b', at: 2 })

      // Step 0 never reported an end. Starting the next step must NOT be taken
      // as evidence it passed — only an explicit stepEnd says that.
      expect(store.live.scenarios['a1']!.steps[0]!.status).toBe('running')

      return {
        status: 'passed',
        featureResults: [],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, features: 1 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')
  })

  it('marks in-flight work interrupted on stop, never failed (FR-020)', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1', { relativePath: LOGIN, title: VALID }))
      pushProgress!({
        type: 'stepStart',
        testId: 'a1',
        index: 0,
        title: 'Given the application is running',
        at: 5,
      })
      await store.stop()
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')

    const scenario = store.live.scenarios['a1']!
    expect(scenario.status).toBe('interrupted')
    expect(scenario.steps[0]!.status).toBe('interrupted')
    // Never failed — the user ended the run, they did not break the test.
    expect(scenario.steps[0]!.status).not.toBe('failed')
  })

  it('leaves steps that were never reached unmarked rather than failed (FR-020)', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1', { relativePath: LOGIN, title: VALID }))
      pushProgress!({
        type: 'stepStart',
        testId: 'a1',
        index: 0,
        title: 'Given the application is running',
        at: 5,
      })
      await store.stop()
      return {
        status: 'error',
        featureResults: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
        duration: 10,
        stdout: '',
        stderr: '',
        errors: [],
      }
    })

    await store.runBatch('headless')

    // Steps 1..3 were never reached; none of them may read as a failure.
    const steps = store.liveStepsFor(LOGIN, VALID)!
    expect(steps.slice(1).some((s) => s.status === 'failed')).toBe(false)
  })

  it('settles a run that died with nothing left running (FR-021)', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    runBatchMock.mockImplementation(async () => {
      pushProgress!(testStart('a1', { relativePath: LOGIN, title: VALID }))
      pushProgress!({ type: 'stepStart', testId: 'a1', index: 0, title: 'Given a', at: 5 })
      // The process dies: no testEnd, no runEnd, and the call rejects.
      throw new Error('spawn ENOENT')
    })

    await store.runBatch('headless')

    expect(store.status).toBe('error')
    expect(store.live.running).toEqual([])
    expect(store.live.scenarios['a1']!.steps[0]!.status).not.toBe('running')
  })
})

describe('feature path namespaces reach the editor (regression)', () => {
  // The reporter emits a path relative to the WORKSPACE root
  // ("features/login.feature"); the editor uses one relative to the features dir
  // ("login.feature"). When these did not reconcile, the editor silently showed
  // no statuses at all — nothing threw, the lookup just never matched.
  const REPORTER_PATH = 'features/login.feature'
  const EDITOR_PATH = 'login.feature'

  it('resolves steps when the event still carries the workspace-relative path', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: REPORTER_PATH, title: VALID }),
      stepEnd(0, 'Given the application is running', 'passed'),
      stepEnd(1, 'When I log in', 'failed', 'boom'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 30, at: 40 },
    ])

    // Looked up the way the editor asks for it.
    const steps = store.liveStepsFor(EDITOR_PATH, VALID)
    expect(steps, 'editor lookup must resolve across path namespaces').not.toBeNull()
    expect(steps!.map((s) => s.status)).toEqual(['passed', 'failed', 'skipped', 'skipped'])
  })

  it('still resolves when the event was normalized in the main process', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: EDITOR_PATH, title: VALID }),
      stepEnd(1, 'When I log in', 'failed', 'boom'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 30, at: 40 },
    ])

    expect(store.liveStepsFor(EDITOR_PATH, VALID)).not.toBeNull()
  })

  it('does not conflate same-named features in different folders', async () => {
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: 'features/admin/login.feature', title: VALID }),
    ])

    expect(store.liveStepsFor('public/login.feature', VALID)).toBeNull()
  })
})

describe('statuses persist after the run so the failing step can be found', () => {
  it('keeps step statuses in the editor once the run has finished', async () => {
    // The during-run animation is the lesser half; locating the failing step
    // afterwards is the point.
    const store = useRunnerStore()
    store.setActiveScope(GLOBAL_SCOPE)

    await runWith(store, [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepEnd(0, 'Given the application is running', 'passed'),
      stepEnd(1, 'When I log in', 'failed', 'kaboom'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 30, at: 40 },
    ])

    expect(store.isRunning).toBe(false)
    expect(store.live.reconciled).toBe(true)

    const steps = store.liveStepsFor(LOGIN, VALID)!
    expect(steps[1]).toMatchObject({ status: 'failed', error: 'kaboom' })
    expect(store.live.available).toBe(true)
  })
})

describe('the previous run survives a reload', () => {
  const failedRun = () =>
    runWith(store(), [
      testStart('a1', { relativePath: LOGIN, title: VALID }),
      stepEnd(0, 'Given the application is running', 'passed'),
      stepEnd(1, 'When I log in', 'failed', 'kaboom'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 30, at: 40 },
    ])

  let current: ReturnType<typeof useRunnerStore> | null = null
  const store = () => (current ??= useRunnerStore())

  beforeEach(() => {
    current = null
  })

  it('saves the finished run', async () => {
    const s = store()
    s.setActiveScope(GLOBAL_SCOPE)
    await failedRun()

    expect(saveLastRunMock).toHaveBeenCalledTimes(1)
    const [live, scopeId] = saveLastRunMock.mock.calls[0]!
    expect(scopeId).toBe(GLOBAL_SCOPE)
    expect(live.scenarios.a1.steps[1]).toMatchObject({ status: 'failed', error: 'kaboom' })
  })

  it('saves a plain object, not a reactive proxy', async () => {
    // Reactive objects cannot be structured-cloned across IPC.
    const s = store()
    s.setActiveScope(GLOBAL_SCOPE)
    await failedRun()

    const [live] = saveLastRunMock.mock.calls[0]!
    expect(() => structuredClone(live)).not.toThrow()
  })

  it('restores the failing step after a reload', async () => {
    const s = store()
    getLastRunMock.mockResolvedValue({
      version: 1,
      savedAt: Date.now(),
      scopeId: GLOBAL_SCOPE,
      live: {
        available: true,
        reconciled: true,
        running: [],
        scenarios: {
          a1: {
            testId: 'a1',
            relativePath: LOGIN,
            title: VALID,
            status: 'failed',
            attempt: 0,
            steps: {
              0: { index: 0, title: 'Given the application is running', status: 'passed' },
              1: { index: 1, title: 'When I log in', status: 'failed', error: 'kaboom' },
            },
          },
        },
      },
    })

    await s.restoreLastRun()

    const steps = s.liveStepsFor(LOGIN, VALID)
    expect(steps, 'restored run must be renderable in the editor').not.toBeNull()
    expect(steps!.map((step) => step.status)).toEqual(['passed', 'failed', 'skipped', 'skipped'])
    expect(steps![1]!.error).toBe('kaboom')
  })

  it('re-reads the step list from disk, so edits since the run are respected', async () => {
    const s = store()
    getLastRunMock.mockResolvedValue({
      version: 1,
      savedAt: Date.now(),
      scopeId: GLOBAL_SCOPE,
      live: {
        available: true,
        reconciled: true,
        running: [],
        scenarios: {
          a1: {
            testId: 'a1',
            relativePath: LOGIN,
            title: VALID,
            status: 'passed',
            attempt: 0,
            steps: { 0: { index: 0, title: 'Given the application is running', status: 'passed' } },
          },
        },
      },
    })

    await s.restoreLastRun()

    expect(featuresReadMock).toHaveBeenCalled()
    // 4 steps come from the CURRENT file, not from the snapshot (which had 1).
    expect(s.liveStepsFor(LOGIN, VALID)).toHaveLength(4)
  })

  it('does nothing when there is no snapshot', async () => {
    const s = store()
    getLastRunMock.mockResolvedValue(null)

    await s.restoreLastRun()

    expect(s.live.available).toBe(false)
  })

  it('does not throw when the snapshot cannot be read', async () => {
    const s = store()
    getLastRunMock.mockRejectedValue(new Error('EACCES'))

    await expect(s.restoreLastRun()).resolves.toBeUndefined()
    expect(s.live.available).toBe(false)
  })

  it('never clobbers a run that is in flight', async () => {
    const s = store()
    s.isRunning = true
    await s.restoreLastRun()

    expect(getLastRunMock).not.toHaveBeenCalled()
  })
})

describe('runs that mix Gherkin with plain Playwright specs (regression)', () => {
  // A config can keep legacy `*.spec.ts` projects alongside the bdd one. Those
  // tests have no feature file, so the reporter reports no path for them.
  // Asking the main process to read one as a feature always throws — and
  // ipcMain logs every rejection, so a single run filled the console with
  // "Invalid file: must be a .feature file".
  const LEGACY = 'home/me/project/playwright/tests/architect/account'

  it('does not read a path that is not a feature file', async () => {
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)

    await runWith(s, [
      testStart('legacy-1', { relativePath: '', title: 'signs in' }),
      testStart('legacy-2', { relativePath: LEGACY, title: 'signs out' }),
    ])

    expect(featuresReadMock).not.toHaveBeenCalled()
  })

  it('lists them under the file they are written in, so the failure is locatable', async () => {
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)

    await runWith(s, [
      testStart('legacy-1', {
        relativePath: '',
        specPath: 'playwright/tests/architect/forms.spec.ts',
        title: 'architect fills the land form',
      }),
      { type: 'testEnd', testId: 'legacy-1', status: 'failed', durationMs: 30, at: 40 },
    ])

    // Kept out of the feature list — it has no feature — and given its own group.
    expect(s.liveFeatureScenarios).toEqual([])
    expect(s.liveOtherSpecGroups.map((group) => group.key)).toEqual([
      'playwright/tests/architect/forms.spec.ts',
    ])
    expect(s.liveOtherSpecGroups[0]).toMatchObject({ status: 'failed', failed: 1 })
  })

  it('drops them from a snapshot that recorded them, rather than restoring rows a run would no longer produce', async () => {
    // Snapshots written before the reporter stopped emitting these still exist
    // on disk, so the restore path has to hold the line too.
    const s = useRunnerStore()
    getLastRunMock.mockResolvedValue({
      version: 1,
      savedAt: 1,
      scopeId: GLOBAL_SCOPE,
      live: {
        available: true,
        reconciled: true,
        running: [],
        scenarios: {
          legacy: {
            testId: 'legacy',
            relativePath: LEGACY,
            title: 'signs in',
            status: 'failed',
            attempt: 0,
            steps: {},
          },
          bdd: {
            testId: 'bdd',
            relativePath: LOGIN,
            title: VALID,
            status: 'passed',
            attempt: 0,
            steps: { 0: { index: 0, title: 'Given the application is running', status: 'passed' } },
          },
        },
      },
    })

    await s.restoreLastRun()

    expect(s.liveScenarios.map((scenario) => scenario.testId)).toEqual(['bdd'])
    expect(featuresReadMock).toHaveBeenCalledTimes(1)
    expect(featuresReadMock).toHaveBeenCalledWith(LOGIN)
  })
})

describe('a large run stays readable', () => {
  // A real suite reports hundreds of scenarios. Listed flat they are unreadable,
  // so they are grouped by the file they came from and the groups carry the
  // verdict — which is also what the tree badges are built from.
  const CART = 'cart/checkout.feature'

  const started = (
    testId: string,
    relativePath: string,
    title: string,
    at: number,
  ): RunProgressEvent => ({ type: 'testStart', testId, relativePath, title, attempt: 0, at })

  const ended = (
    testId: string,
    status: 'passed' | 'failed',
    at: number,
  ): RunProgressEvent => ({ type: 'testEnd', testId, status, durationMs: 5, at })

  async function twoFeatures(s: ReturnType<typeof useRunnerStore>) {
    await runWith(s, [
      started('a1', LOGIN, 'Valid login', 10),
      started('a2', LOGIN, 'Invalid login', 11),
      started('b1', CART, 'Checkout', 12),
      ended('a1', 'passed', 20),
      ended('a2', 'failed', 21),
      ended('b1', 'passed', 22),
    ])
  }

  it('collapses a run into one group per feature, carrying the worst status', async () => {
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)
    await twoFeatures(s)

    const groups = s.liveFeatureGroups
    expect(groups.map((group) => group.key)).toEqual([LOGIN, CART])
    expect(groups[0]).toMatchObject({ status: 'failed', passed: 1, failed: 1 })
    expect(groups[1]).toMatchObject({ status: 'passed', passed: 1, failed: 0 })
    expect(groups[0]!.scenarios).toHaveLength(2)
  })

  it('puts the groups that need attention first', async () => {
    // Failures before greens: with 47 files on screen, the order is the only
    // thing making the failure findable without scrolling.
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)

    await runWith(s, [
      started('b1', CART, 'Checkout', 10),
      ended('b1', 'passed', 11),
      started('a1', LOGIN, 'Valid login', 12),
      ended('a1', 'failed', 13),
    ])

    expect(s.liveFeatureGroups.map((group) => group.key)).toEqual([LOGIN, CART])
  })

  it('reports the worst status per feature file, for the tree badge', async () => {
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)
    await twoFeatures(s)

    // One failing example row makes the whole file failed — the badge answers
    // "does this need me", not "did everything in it fail".
    expect(s.statusForFeature(LOGIN)).toBe('failed')
    expect(s.statusForFeature(CART)).toBe('passed')
    expect(s.statusForFeature('untouched.feature')).toBeNull()
  })

  it('resolves the badge across the two feature-path namespaces', async () => {
    // The reporter's path includes the features dir; the tree's does not.
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)
    await twoFeatures(s)

    expect(s.statusForFeature('login.feature')).toBe('failed')
  })

  it('rolls the worst status inside a folder up to the folder', async () => {
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)
    await twoFeatures(s)

    expect(s.statusForFolder('cart')).toBe('passed')
    expect(s.statusForFolder('features')).toBe('failed')
    // Matched on a path boundary, so a folder cannot claim a similarly named one.
    expect(s.statusForFolder('car')).toBeNull()
  })

  it('lets a later single-feature run clear the red an earlier global run left', async () => {
    // Badges span every scope, so quick-running one feature must not blank the
    // others — but where two runs disagree about a file, the later one is true.
    const s = useRunnerStore()
    s.setActiveScope(GLOBAL_SCOPE)
    await twoFeatures(s)
    expect(s.statusForFeature(LOGIN)).toBe('failed')

    s.setActiveScope(LOGIN)
    await runWith(s, [started('a1', LOGIN, 'Valid login', 100), ended('a1', 'passed', 101)])

    expect(s.statusForFeature(LOGIN)).toBe('passed')
    // The global run's verdict on the feature it did not re-run still stands.
    expect(s.statusForFeature(CART)).toBe('passed')
  })
})
