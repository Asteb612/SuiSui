import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { RunProgressEvent } from '@suisui/shared'
import { useRunnerStore, GLOBAL_SCOPE } from '../stores/runner'

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

beforeEach(() => {
  featuresReadMock.mockResolvedValue(LOGIN_FEATURE)
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
