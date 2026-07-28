import { describe, it, expect } from 'vitest'
import { stepTitleMatches, stripFeaturesDir, featurePathsMatch } from '../run-progress/stepTitle'
import { mergeLiveSteps, type AuthoredSteps } from '../run-progress/mergeLiveSteps'
import { applyProgressEvent, applyReportOutcomes } from '../run-progress/liveRunReducer'
import { emptyLiveRunState, type ScenarioExecution } from '../types/run-progress'

describe('stepTitleMatches', () => {
  it('matches identical titles', () => {
    expect(stepTitleMatches('Given I am logged in', 'Given I am logged in')).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(stepTitleMatches('  Given I am logged in ', 'Given I am logged in')).toBe(true)
  })

  it('rejects a different step', () => {
    expect(stepTitleMatches('Given I am logged in', 'Then I see the dashboard')).toBe(false)
  })

  it('matches a Scenario Outline step against its substituted value', () => {
    // Authored with a placeholder, reported with the example row's value.
    expect(
      stepTitleMatches('Given a cart with <count> items', 'Given a cart with 1 items'),
    ).toBe(true)
    expect(
      stepTitleMatches('Given a cart with <count> items', 'Given a cart with 30 items'),
    ).toBe(true)
  })

  it('handles several placeholders in one step', () => {
    expect(
      stepTitleMatches('When I transfer <amount> to <account>', 'When I transfer 50 to savings'),
    ).toBe(true)
  })

  it('still rejects a different outline step', () => {
    expect(
      stepTitleMatches('Given a cart with <count> items', 'When I check out'),
    ).toBe(false)
  })

  it('does not let authored punctuation act as a regex metacharacter', () => {
    // "." must mean a literal dot, not "any character".
    expect(stepTitleMatches('Then I see <x>.', 'Then I see 1X')).toBe(false)
    expect(stepTitleMatches('Then I see <x>.', 'Then I see 1.')).toBe(true)
  })

  it('treats a keyword change as a mismatch', () => {
    // "And" vs "Given" is exactly the drift the guard exists to catch.
    expect(stepTitleMatches('Given a user exists', 'And a user exists')).toBe(false)
  })
})

const authored = (titles: string[], backgroundCount = 0): AuthoredSteps => ({
  titles,
  backgroundCount,
})

const execution = (over: Partial<ScenarioExecution> = {}): ScenarioExecution => ({
  testId: 't1',
  relativePath: 'features/login.feature',
  title: 'Valid login',
  status: 'running',
  steps: {},
  attempt: 0,
  ...over,
})

describe('mergeLiveSteps', () => {
  it('shows every authored step as pending when nothing has executed', () => {
    const merged = mergeLiveSteps(authored(['Given a', 'When b']), undefined)

    expect(merged.map((s) => s.status)).toEqual(['pending', 'pending'])
    expect(merged.map((s) => s.title)).toEqual(['Given a', 'When b'])
  })

  it('overlays executions onto the authored list by index', () => {
    const merged = mergeLiveSteps(
      authored(['Given a', 'When b', 'Then c']),
      execution({
        steps: {
          0: { index: 0, title: 'Given a', status: 'passed', durationMs: 5 },
          1: { index: 1, title: 'When b', status: 'running', startedAt: 100 },
        },
      }),
    )

    expect(merged.map((s) => s.status)).toEqual(['passed', 'running', 'pending'])
    expect(merged[0]!.durationMs).toBe(5)
    expect(merged[1]!.startedAt).toBe(100)
  })

  it('puts background steps first and labels them', () => {
    const merged = mergeLiveSteps(
      authored(['Given the app runs', 'And a user exists', 'When I log in'], 2),
      undefined,
    )

    expect(merged.map((s) => s.isBackground)).toEqual([true, true, false])
  })

  it('shows steps after a failure as skipped, not pending', () => {
    // A real capture confirms Playwright emits NO events for steps after a
    // failure, so the tail is absent rather than reported as skipped.
    const merged = mergeLiveSteps(
      authored(['Given a', 'When b', 'Then c', 'And d']),
      execution({
        status: 'failed',
        steps: {
          0: { index: 0, title: 'Given a', status: 'passed' },
          1: { index: 1, title: 'When b', status: 'failed', error: 'boom' },
        },
      }),
    )

    expect(merged.map((s) => s.status)).toEqual(['passed', 'failed', 'skipped', 'skipped'])
    expect(merged[1]!.error).toBe('boom')
  })

  it('keeps unreported steps pending while the scenario is still running', () => {
    const merged = mergeLiveSteps(
      authored(['Given a', 'When b']),
      execution({
        status: 'running',
        steps: { 0: { index: 0, title: 'Given a', status: 'running' } },
      }),
    )

    expect(merged.map((s) => s.status)).toEqual(['running', 'pending'])
  })

  it('drops an execution whose title disagrees with the authored step (mismatch guard)', () => {
    // The ordinal drifted. Painting "passed" on "When b" would be a lie.
    const merged = mergeLiveSteps(
      authored(['Given a', 'When b']),
      execution({
        steps: { 1: { index: 1, title: 'Then something else entirely', status: 'passed' } },
      }),
    )

    expect(merged[1]!.status).toBe('pending')
    expect(merged[1]!.title).toBe('When b')
  })

  it('applies outline executions to their placeholder-authored steps', () => {
    const merged = mergeLiveSteps(
      authored(['Given a cart with <count> items', 'When I check out']),
      execution({
        steps: { 0: { index: 0, title: 'Given a cart with 3 items', status: 'passed' } },
      }),
    )

    // Authored text is kept for display; only the STATUS comes from the run.
    expect(merged[0]).toMatchObject({
      title: 'Given a cart with <count> items',
      status: 'passed',
    })
  })

  it('never returns more steps than the feature authors', () => {
    // A stray high ordinal must not invent a step that is not in the editor.
    const merged = mergeLiveSteps(
      authored(['Given a']),
      execution({ steps: { 7: { index: 7, title: 'Given ghost', status: 'passed' } } }),
    )

    expect(merged).toHaveLength(1)
  })
})

describe('applyReportOutcomes', () => {
  const withScenario = () =>
    applyProgressEvent(emptyLiveRunState(), {
      type: 'testStart',
      testId: 't1',
      relativePath: 'features/login.feature',
      title: 'Valid login',
      attempt: 0,
      at: 1,
    })

  it('lets the final report override a disagreeing live status (FR-017)', () => {
    const live = applyProgressEvent(withScenario(), {
      type: 'testEnd',
      testId: 't1',
      status: 'passed',
      durationMs: 10,
      at: 2,
    })

    const reconciled = applyReportOutcomes(live, [
      { relativePath: 'features/login.feature', name: 'Valid login', status: 'failed' },
    ])

    expect(reconciled.scenarios['t1']!.status).toBe('failed')
  })

  it('leaves state untouched when there is nothing to reconcile against', () => {
    const live = withScenario()
    expect(applyReportOutcomes(live, [])).toBe(live)
  })

  it('does not invent scenarios the live stream never saw', () => {
    // The report carries no step detail, so a scenario built from it alone would
    // show an outcome with no steps.
    const reconciled = applyReportOutcomes(withScenario(), [
      { relativePath: 'features/other.feature', name: 'Never streamed', status: 'passed' },
    ])

    expect(Object.keys(reconciled.scenarios)).toEqual(['t1'])
  })

  it('matches on feature path as well as name, so same-named scenarios stay distinct', () => {
    const reconciled = applyReportOutcomes(withScenario(), [
      { relativePath: 'features/OTHER.feature', name: 'Valid login', status: 'failed' },
    ])

    expect(reconciled.scenarios['t1']!.status).not.toBe('failed')
  })
})

describe('feature path namespaces', () => {
  it('strips the features dir so the reporter path matches the editor path', () => {
    // The reporter derives its path from the generated spec (relative to the
    // workspace root); the editor works relative to the features dir. Without
    // this the lookup silently never matches and NO statuses are shown.
    expect(stripFeaturesDir('features/login.feature', 'features')).toBe('login.feature')
    expect(stripFeaturesDir('features/cart/checkout.feature', 'features')).toBe(
      'cart/checkout.feature',
    )
  })

  it('honours a non-default features dir', () => {
    expect(stripFeaturesDir('tests/e2e/login.feature', 'tests/e2e')).toBe('login.feature')
  })

  it('leaves a path alone when it does not start with the features dir', () => {
    expect(stripFeaturesDir('login.feature', 'features')).toBe('login.feature')
    expect(stripFeaturesDir('other/login.feature', 'features')).toBe('other/login.feature')
  })

  it('does not strip a directory that merely shares a prefix', () => {
    expect(stripFeaturesDir('features-old/login.feature', 'features')).toBe(
      'features-old/login.feature',
    )
  })

  it('normalizes Windows separators and a leading ./', () => {
    expect(stripFeaturesDir('features\\login.feature', 'features')).toBe('login.feature')
    expect(stripFeaturesDir('./features/login.feature', './features')).toBe('login.feature')
  })

  it('passes the path through when no features dir is known', () => {
    expect(stripFeaturesDir('features/login.feature', '')).toBe('features/login.feature')
  })
})

describe('featurePathsMatch', () => {
  it('matches identical paths', () => {
    expect(featurePathsMatch('login.feature', 'login.feature')).toBe(true)
  })

  it('matches across the two namespaces', () => {
    expect(featurePathsMatch('features/login.feature', 'login.feature')).toBe(true)
    expect(featurePathsMatch('login.feature', 'features/login.feature')).toBe(true)
  })

  it('only matches on a full segment boundary', () => {
    // A bare substring match would conflate these two different files.
    expect(featurePathsMatch('my-cart/checkout.feature', 'cart/checkout.feature')).toBe(false)
    expect(featurePathsMatch('features/mylogin.feature', 'login.feature')).toBe(false)
  })

  it('does not match different files that share a basename', () => {
    expect(featurePathsMatch('features/a/login.feature', 'features/b/login.feature')).toBe(false)
  })
})
