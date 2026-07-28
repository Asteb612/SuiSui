import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseProgressLine,
  applyProgressEvent,
  reconcileLiveRun,
  emptyLiveRunState,
  parseFeatureSteps,
  authoredStepsFor,
  mergeLiveSteps,
  type LiveRunState,
  type RunProgressEvent,
} from '@suisui/shared'

/**
 * Replay of a REAL reporter capture.
 *
 * Constitution III forbids running Playwright from the test suite, so the reporter is
 * covered by capturing its output once from a genuine run and replaying it through the
 * real parser and the real reducer. See fixtures/README.md for how it was produced and
 * which cases it covers.
 */

const FIXTURE = path.join(__dirname, 'fixtures', 'progress-capture.ndjson')

function loadEvents(): RunProgressEvent[] {
  return fs
    .readFileSync(FIXTURE, 'utf-8')
    .split('\n')
    .map((line) => parseProgressLine(line))
    .filter((event): event is RunProgressEvent => event !== null)
}

function replay(events: RunProgressEvent[]): LiveRunState {
  return events.reduce<LiveRunState>(
    (state, event) => applyProgressEvent(state, event),
    emptyLiveRunState(),
  )
}

/** Scenario titles as authored, so lookups read as the feature file does. */
const VALID_LOGIN = 'Valid login'
const INVALID_LOGIN = 'Invalid login is rejected'
const SLOW_CHECKOUT = 'Slow checkout'

function byTitle(state: LiveRunState, title: string) {
  const found = Object.values(state.scenarios).find((scenario) => scenario.title === title)
  if (!found) throw new Error(`no scenario titled "${title}" in the replayed state`)
  return found
}

describe('replaying a real reporter capture', () => {
  it('parses every captured line — the fixture is all sentinel lines', () => {
    const raw = fs.readFileSync(FIXTURE, 'utf-8').split('\n').filter(Boolean)
    expect(loadEvents()).toHaveLength(raw.length)
  })

  it('brackets the run with runStart and runEnd', () => {
    const events = loadEvents()
    expect(events[0]).toMatchObject({ type: 'runStart', totalTests: 5 })
    expect(events[events.length - 1]).toMatchObject({ type: 'runEnd' })
  })

  it('tracks all five scenarios of the captured suite separately', () => {
    const state = replay(loadEvents())
    expect(Object.keys(state.scenarios)).toHaveLength(5)
  })

  it('keeps each Scenario Outline example row as its own execution (FR-010)', () => {
    const state = replay(loadEvents())
    const rows = Object.values(state.scenarios).filter((s) => s.title.startsWith('Buying '))

    expect(rows.map((r) => r.title).sort()).toEqual(['Buying 1 items', 'Buying 3 items'])
    // Distinct ids, not one shared outline entry.
    expect(new Set(rows.map((r) => r.testId)).size).toBe(2)
  })

  it('does not let interleaved parallel tests cross-contaminate', () => {
    // The capture is a real fullyParallel run on 2 workers: checkout and login
    // events are genuinely interleaved in the stream.
    const state = replay(loadEvents())

    expect(byTitle(state, VALID_LOGIN).steps[2]!.title).toBe(
      'When I log in with valid credentials',
    )
    expect(byTitle(state, SLOW_CHECKOUT).steps[1]!.title).toBe('When I wait a while')
  })

  it('resolves the passing scenarios to passed with every step passed', () => {
    const state = replay(loadEvents())
    const valid = byTitle(state, VALID_LOGIN)

    expect(valid.status).toBe('passed')
    // Background contributes the first two steps.
    expect(Object.values(valid.steps).map((s) => s.title)).toEqual([
      'Given the application is running',
      'And a user account exists',
      'When I log in with valid credentials',
      'Then I should see the dashboard',
    ])
    expect(Object.values(valid.steps).every((s) => s.status === 'passed')).toBe(true)
  })

  it('marks the failing step failed and reports nothing for the steps after it', () => {
    // Playwright emits NO events for steps after a failure — there is no `skipped`
    // step event to consume. The tail is absent, which is what lets the display show
    // it as skipped rather than inventing a status here.
    const state = replay(loadEvents())
    const invalid = byTitle(state, INVALID_LOGIN)

    expect(invalid.status).toBe('failed')
    expect(invalid.steps[2]).toMatchObject({
      title: 'When I log in with invalid credentials',
      status: 'failed',
    })
    // The feature authors 5 steps (2 background + 3); only 0..2 ever reported.
    expect(Object.keys(invalid.steps)).toEqual(['0', '1', '2'])
    expect(invalid.steps[3]).toBeUndefined()
    expect(invalid.steps[4]).toBeUndefined()
  })

  it('carries the error message off the failing step', () => {
    const state = replay(loadEvents())
    expect(byTitle(state, INVALID_LOGIN).steps[2]!.error).toContain('credentials rejected')
  })

  it('maps generated spec paths back to the authored .feature files', () => {
    const state = replay(loadEvents())
    expect(new Set(Object.values(state.scenarios).map((s) => s.relativePath))).toEqual(
      new Set(['features/login.feature', 'features/checkout.feature']),
    )
  })

  it('leaves nothing running once the whole capture is replayed (FR-006)', () => {
    const state = replay(loadEvents())

    expect(state.running).toEqual([])
    for (const scenario of Object.values(state.scenarios)) {
      expect(scenario.status, scenario.title).not.toBe('running')
      for (const step of Object.values(scenario.steps)) {
        expect(step.status, `${scenario.title} / ${step.title}`).not.toBe('running')
      }
    }
  })

  it('survives a truncated capture — reconciliation settles what the stream left open', () => {
    // Simulates a crashed or killed run: cut the stream mid-flight and confirm no
    // step is left spinning forever.
    const events = loadEvents()
    const truncated = events.slice(0, Math.floor(events.length / 2))
    const midRun = replay(truncated)

    expect(midRun.running.length).toBeGreaterThan(0)

    const settled = reconcileLiveRun(midRun, 'stopped')
    expect(settled.running).toEqual([])
    for (const scenario of Object.values(settled.scenarios)) {
      expect(scenario.status).not.toBe('running')
      for (const step of Object.values(scenario.steps)) {
        // Stopped, not broken — in-flight work is interrupted, never failed.
        expect(step.status).not.toBe('running')
        expect(step.status).not.toBe('failed')
      }
    }
  })

  it('merges into the display model using the real .feature sources', () => {
    // The full US1 chain on real data: capture → parse → reduce → merge against the
    // very files that were run.
    const state = replay(loadEvents())
    const login = parseFeatureSteps(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'login.feature'), 'utf-8'),
    )

    const authored = authoredStepsFor(login, INVALID_LOGIN)!
    const merged = mergeLiveSteps(authored, byTitle(state, INVALID_LOGIN))

    expect(merged.map((s) => ({ title: s.title, status: s.status, bg: s.isBackground }))).toEqual([
      { title: 'Given the application is running', status: 'passed', bg: true },
      { title: 'And a user account exists', status: 'passed', bg: true },
      { title: 'When I log in with invalid credentials', status: 'failed', bg: false },
      // Never reported by Playwright — shown as skipped because the scenario is over.
      { title: 'Then I should see the dashboard', status: 'skipped', bg: false },
      { title: 'And I should see a welcome banner', status: 'skipped', bg: false },
    ])
  })

  it('merges a real Scenario Outline row onto its placeholder-authored steps', () => {
    const state = replay(loadEvents())
    const checkout = parseFeatureSteps(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'checkout.feature'), 'utf-8'),
    )

    const authored = authoredStepsFor(checkout, 'Buying 3 items')!
    const merged = mergeLiveSteps(authored, byTitle(state, 'Buying 3 items'))

    // The reporter said "Given a cart with 3 items"; the file says "<count>". Without
    // placeholder-tolerant matching every outline step would be dropped by the guard.
    expect(merged.map((s) => s.status)).toEqual(['passed', 'passed', 'passed'])
    expect(merged[0]!.title).toBe('Given a cart with <count> items')
  })

  it('compares test ids whole — the per-file prefix is shared', () => {
    // Every test in one feature file shares a 20-char file-hash prefix. A prefix or
    // truncated comparison would silently merge all scenarios of a file into one.
    const state = replay(loadEvents())
    const ids = Object.keys(state.scenarios)
    const prefixes = new Set(ids.map((id) => id.slice(0, 20)))

    expect(ids).toHaveLength(5)
    expect(prefixes.size).toBe(2)
  })
})
