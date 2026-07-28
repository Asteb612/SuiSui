import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunnerStore, updateProgressFromLine } from '../stores/runner'
import type { WorkspaceTestInfo, BatchRunResult } from '@suisui/shared'

// Mock window.api
vi.stubGlobal('window', {
  api: {
    settings: { get: vi.fn(), set: vi.fn() },
    runner: {
      runHeadless: vi.fn(),
      runUI: vi.fn(),
      runBatch: vi.fn(),
      getWorkspaceTests: vi.fn(),
      stop: vi.fn(),
      onRunnerLog: vi.fn(),
      offRunnerLog: vi.fn(),
      // Live progress subscription (feature 011); returns an unsubscribe fn.
      onProgress: vi.fn(() => vi.fn()),
      showReport: vi.fn().mockResolvedValue('http://127.0.0.1:9323/global/'),
    },
  },
})

const fakeBatch = (passed: boolean): BatchRunResult =>
  ({
    status: passed ? 'passed' : 'failed',
    summary: { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0 },
    errors: [],
    duration: 100,
    stdout: '',
    stderr: '',
  }) as unknown as BatchRunResult

const mockWorkspace: WorkspaceTestInfo = {
  features: [
    {
      relativePath: 'features/auth/login.feature',
      name: 'Login',
      tags: ['auth'],
      folder: 'features/auth',
      scenarios: [
        { name: 'Valid login', tags: ['auth', 'smoke'] },
        { name: 'Invalid login', tags: ['auth'] },
      ],
    },
    {
      relativePath: 'features/auth/register.feature',
      name: 'Register',
      tags: ['auth'],
      folder: 'features/auth',
      scenarios: [
        { name: 'New user registration', tags: ['auth', 'regression'] },
      ],
    },
    {
      relativePath: 'features/checkout/cart.feature',
      name: 'Cart',
      tags: [],
      folder: 'features/checkout',
      scenarios: [
        { name: 'Add item to cart', tags: ['smoke'] },
        { name: 'Remove item from cart', tags: [] },
      ],
    },
  ],
  allTags: ['auth', 'smoke', 'regression'],
  folders: ['features/auth', 'features/checkout'],
}

describe('Runner Store - Exclusive Tab Filtering', () => {
  let store: ReturnType<typeof useRunnerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useRunnerStore()
    store.workspaceTests = mockWorkspace
  })

  it('returns all features/scenarios when no filters are active', () => {
    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('filters by features tab only when activeFilterTab is features', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['features/auth/login.feature']
    // Also set some folders/tags that should NOT apply
    store.config.selectedFolders = ['features/checkout']
    store.config.selectedTags = ['regression']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.name).toBe('Login')
    expect(result.scenarioCount).toBe(2)
  })

  it('filters by folders tab only when activeFilterTab is folders', () => {
    store.config.activeFilterTab = 'folders'
    store.config.selectedFolders = ['features/checkout']
    // Also set some features/tags that should NOT apply
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.selectedTags = ['auth']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.name).toBe('Cart')
    expect(result.scenarioCount).toBe(2)
  })

  it('filters by tags tab only when activeFilterTab is tags', () => {
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = ['smoke']
    // Also set some features/folders that should NOT apply
    store.config.selectedFeatures = ['features/auth/register.feature']
    store.config.selectedFolders = ['features/checkout']

    const result = store.matchedTests
    // smoke tag on: login.feature (Valid login), cart.feature (Add item)
    expect(result.features).toHaveLength(2)
    expect(result.scenarioCount).toBe(2)
  })

  it('applies name filter as AND with active tab (features)', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.nameFilter = 'invalid'

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.scenarios[0]!.name).toBe('Invalid login')
  })

  it('applies name filter as AND with active tab (tags)', () => {
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = ['smoke']
    store.config.nameFilter = 'cart'

    const result = store.matchedTests
    // smoke tag + "cart" name → only "Add item to cart"
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.scenarios[0]!.name).toBe('Add item to cart')
  })

  it('tab switch does not combine filters', () => {
    // Set up features tab with selection
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['features/auth/login.feature']

    let result = store.matchedTests
    expect(result.scenarioCount).toBe(2) // Login has 2 scenarios

    // Switch to tags tab with different selection
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = ['regression']

    result = store.matchedTests
    // regression tag only on "New user registration" in register.feature
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.name).toBe('Register')
  })

  it('empty selection means all when active tab has no selection', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = [] // empty = all

    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('empty tags selection on tags tab returns all', () => {
    store.config.activeFilterTab = 'tags'
    store.config.selectedTags = []

    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('name filter works alone when no tab selection', () => {
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = []
    store.config.nameFilter = 'login'

    const result = store.matchedTests
    // "Valid login" and "Invalid login" in login.feature
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(2)
  })

  it('folders filter includes subfolders', () => {
    store.config.activeFilterTab = 'folders'
    store.config.selectedFolders = ['features/auth']

    const result = store.matchedTests
    expect(result.features).toHaveLength(2)
    expect(result.features.map(f => f.name)).toEqual(['Login', 'Register'])
  })

  it('returns empty when no workspace tests loaded', () => {
    store.workspaceTests = null
    const result = store.matchedTests
    expect(result.features).toHaveLength(0)
    expect(result.scenarioCount).toBe(0)
  })

  it('showResults defaults to false', () => {
    expect(store.showResults).toBe(false)
  })

  it('defaults to the global scope', () => {
    expect(store.activeScope).toBe('global')
    expect(store.singleRun).toBe(false)
  })
})

describe('Runner Store - scoped run state', () => {
  let store: ReturnType<typeof useRunnerStore>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runner = (window as any).api.runner

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useRunnerStore()
    runner.runBatch.mockReset()
    runner.onRunnerLog.mockReset()
    runner.offRunnerLog.mockReset()
    runner.showReport.mockReset().mockResolvedValue('http://127.0.0.1:9323/x/')
  })

  it('keeps global and per-spec results in separate scopes', async () => {
    // Global run passes.
    runner.runBatch.mockResolvedValueOnce(fakeBatch(true))
    store.setActiveScope('global')
    await store.runBatch('headless')
    expect(store.batchResult?.summary.passed).toBe(1)
    expect(store.singleRun).toBe(false)

    // A single-spec quick-run fails — its own scope.
    runner.runBatch.mockResolvedValueOnce(fakeBatch(false))
    store.setActiveScope('cart/checkout.feature')
    await store.runBatch('headless', { single: true, featurePaths: ['cart/checkout.feature'] })
    expect(store.singleRun).toBe(true)
    expect(store.batchResult?.summary.failed).toBe(1)

    // Back to global: its passing result is intact — the spec run did not clobber it.
    store.setActiveScope('global')
    expect(store.singleRun).toBe(false)
    expect(store.batchResult?.summary.passed).toBe(1)
  })

  it('a single-spec run uses explicit featurePaths and never touches the global filters', async () => {
    runner.runBatch.mockResolvedValueOnce(fakeBatch(true))
    store.config.activeFilterTab = 'features'
    store.config.selectedFeatures = ['a.feature']

    store.setActiveScope('b.feature')
    await store.runBatch('headless', { single: true, featurePaths: ['b.feature'] })

    const opts = runner.runBatch.mock.calls.at(-1)![0]
    expect(opts.featurePaths).toEqual(['b.feature'])
    // Global filter selection is untouched by the scoped run.
    expect(store.config.selectedFeatures).toEqual(['a.feature'])
  })

  it('keeps only the last report — a newer run clears the prior scope’s report URL', async () => {
    runner.runBatch.mockResolvedValue(fakeBatch(true))
    runner.showReport.mockImplementation((scope: string) =>
      Promise.resolve(`http://127.0.0.1:9323/${scope}/`),
    )

    store.setActiveScope('global')
    await store.runBatch('headless')
    store.setActiveScope('login.feature')
    await store.runBatch('headless', { single: true, featurePaths: ['login.feature'] })

    // The spec run produced the last report; global's report URL was cleared.
    expect(store.reportUrl).toBe('http://127.0.0.1:9323/login.feature/')
    store.setActiveScope('global')
    expect(store.reportUrl).toBe('')
  })
})

describe('updateProgressFromLine — live `list` reporter parsing', () => {
  const fresh = () => ({ total: 0, completed: 0, passed: 0, failed: 0, skipped: 0 })

  it('reads the total from the "Running N tests" header', () => {
    const p = fresh()
    updateProgressFromLine(p, 'Running 12 tests using 1 worker')
    expect(p.total).toBe(12)
  })

  it('counts passed and failed completion lines by their glyph', () => {
    const p = fresh()
    updateProgressFromLine(p, '  ✓  1 [chromium] › features/login.feature:3:1 › Login › Valid login (523ms)')
    updateProgressFromLine(p, '  ✘  2 [chromium] › features/login.feature:8:1 › Login › Invalid login (1.2s)')
    expect(p).toMatchObject({ completed: 2, passed: 1, failed: 1 })
  })

  it('counts skipped tests (leading "-", no duration)', () => {
    const p = fresh()
    updateProgressFromLine(p, '  -  3 [chromium] › features/cart.feature:2:1 › Cart › pending')
    expect(p).toMatchObject({ completed: 1, skipped: 1 })
  })

  it('ignores unrelated output without moving the counters', () => {
    const p = fresh()
    updateProgressFromLine(p, 'Some framework log line without a test result')
    expect(p).toEqual(fresh())
  })

  it('parses ANSI-colored list output (glyphs and duration wrapped in escapes)', () => {
    const ESC = '\u001b'
    const p = fresh()
    updateProgressFromLine(p, `${ESC}[2mRunning ${ESC}[22m6${ESC}[2m tests using ${ESC}[22m1${ESC}[2m worker${ESC}[22m`)
    expect(p.total).toBe(6)

    updateProgressFromLine(
      p,
      `  ${ESC}[32m✓${ESC}[39m  ${ESC}[2m1 ${ESC}[22m.features-gen/features/login.feature.spec.js:6:7 › Login › Sign in${ESC}[2m (257ms)${ESC}[22m`,
    )
    expect(p).toMatchObject({ total: 6, completed: 1, passed: 1 })
  })
})

/**
 * Regression: the run timer read "0s" for a whole run.
 *
 * `RunResultsPanel` is mounted by `v-if="showResults"`, and the store sets
 * `isRunning` BEFORE `showResults` — so the panel always mounts with the run
 * already in flight. A start instant measured from the panel therefore has to
 * come from the store; anything the panel derives from its own mount is either
 * late or, if its watcher never observes a transition, never set at all.
 */
describe('runner store — run start instant', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stamps startedAt while the run is still in flight', async () => {
    const store = useRunnerStore()
    const runnerApi = (
      window as unknown as {
        api: { runner: { runBatch: ReturnType<typeof vi.fn> } }
      }
    ).api.runner

    // Hold the run open so the in-flight state can be observed at all — it is
    // reset the moment the run finishes.
    let release: (value: BatchRunResult) => void = () => {}
    runnerApi.runBatch.mockImplementationOnce(
      () => new Promise<BatchRunResult>((resolve) => (release = resolve)),
    )

    const before = Date.now()
    const inFlight = store.runBatch('headless')
    await Promise.resolve()

    expect(store.isRunning).toBe(true)
    // Set before `showResults`, which is exactly why the panel — mounted by
    // that flag — cannot measure the start for itself.
    expect(store.showResults).toBe(true)
    expect(store.startedAt).toBeGreaterThanOrEqual(before)

    release(fakeBatch(true))
    await inFlight
  })

  it('clears startedAt once the run is no longer in flight', async () => {
    const store = useRunnerStore()
    await store.runBatch('headless')
    expect(store.isRunning).toBe(false)
    expect(store.startedAt).toBe(0)
  })
})
