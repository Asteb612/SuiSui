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
        { name: 'Valid login', tags: ['auth', 'smoke'], testCount: 1 },
        { name: 'Invalid login', tags: ['auth'], testCount: 1 },
      ],
    },
    {
      relativePath: 'features/auth/register.feature',
      name: 'Register',
      tags: ['auth'],
      folder: 'features/auth',
      scenarios: [
        { name: 'New user registration', tags: ['auth', 'regression'], testCount: 1 },
      ],
    },
    {
      relativePath: 'features/checkout/cart.feature',
      name: 'Cart',
      tags: [],
      folder: 'features/checkout',
      scenarios: [
        { name: 'Add item to cart', tags: ['smoke'], testCount: 1 },
        { name: 'Remove item from cart', tags: [], testCount: 1 },
      ],
    },
  ],
  allTags: ['auth', 'smoke', 'regression'],
  folders: ['features/auth', 'features/checkout'],
}

describe('Runner Store — combining filters', () => {
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

  it('narrows to the selected features', () => {
    store.config.selectedFeatures = ['features/auth/login.feature']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.name).toBe('Login')
    expect(result.scenarioCount).toBe(2)
  })

  it('narrows to the selected folders', () => {
    store.config.selectedFolders = ['features/checkout']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.name).toBe('Cart')
    expect(result.scenarioCount).toBe(2)
  })

  it('narrows to the selected tags', () => {
    store.config.selectedTags = ['smoke']

    const result = store.matchedTests
    expect(result.features).toHaveLength(2)
    expect(result.scenarioCount).toBe(2)
  })

  it('UNIONS features with folders — both answer "which files"', () => {
    // Selecting a folder plus one extra feature adds that feature. Intersecting
    // them would give nothing whenever the feature is outside the folder, which
    // is the normal case and would read as the filter being broken.
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.selectedFolders = ['features/checkout']

    const result = store.matchedTests
    expect(result.features.map((f) => f.name)).toEqual(['Login', 'Cart'])
    expect(result.scenarioCount).toBe(4)
  })

  it('ANDs a tag with a folder — the point of having both', () => {
    store.config.selectedFolders = ['features/auth']
    store.config.selectedTags = ['smoke']

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.features[0]!.scenarios.map((s) => s.name)).toEqual(['Valid login'])
    expect(result.scenarioCount).toBe(1)
  })

  it('ANDs a tag with a feature, down to nothing when they disagree', () => {
    store.config.selectedFeatures = ['features/auth/register.feature']
    store.config.selectedTags = ['smoke']

    const result = store.matchedTests
    expect(result.features).toHaveLength(0)
    expect(result.scenarioCount).toBe(0)
  })

  it('applies the name filter on top of a feature selection', () => {
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.nameFilter = 'invalid'

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.scenarios[0]!.name).toBe('Invalid login')
  })

  it('applies the name filter on top of a tag selection', () => {
    store.config.selectedTags = ['smoke']
    store.config.nameFilter = 'cart'

    const result = store.matchedTests
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(1)
    expect(result.features[0]!.scenarios[0]!.name).toBe('Add item to cart')
  })

  it('is unaffected by which tab is open — that only says which list is shown', () => {
    store.config.selectedFeatures = ['features/auth/login.feature']
    store.config.selectedTags = ['smoke']

    store.config.activeFilterTab = 'features'
    const fromFeaturesTab = store.matchedTests.scenarioCount

    store.config.activeFilterTab = 'tags'
    expect(store.matchedTests.scenarioCount).toBe(fromFeaturesTab)
    expect(fromFeaturesTab).toBe(1)
  })

  it('treats an empty feature selection as no filter, not as nothing', () => {
    store.config.selectedFeatures = []

    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('treats an empty tag selection as no filter', () => {
    store.config.selectedTags = []

    const result = store.matchedTests
    expect(result.features).toHaveLength(3)
    expect(result.scenarioCount).toBe(5)
  })

  it('applies the name filter on its own', () => {
    store.config.nameFilter = 'login'

    const result = store.matchedTests
    // "Valid login" and "Invalid login" in login.feature
    expect(result.features).toHaveLength(1)
    expect(result.scenarioCount).toBe(2)
  })

  it('folders filter includes subfolders', () => {
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
