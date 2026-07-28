import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { RunProgressEvent } from '@suisui/shared'
import { useRunnerStore, GLOBAL_SCOPE } from '../stores/runner'

/** Captured `onProgress` callback, so tests can push events like the main process would. */
let pushProgress: ((event: RunProgressEvent) => void) | null = null
const unsubscribeProgress = vi.fn()

const runBatchMock = vi.fn()

beforeEach(() => {
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
