import { describe, it, expect } from 'vitest'
import type { LiveRunState, RunProgressEvent } from '../types/run-progress'
import { emptyLiveRunState } from '../types/run-progress'
import { applyProgressEvent, reconcileLiveRun } from '../run-progress/liveRunReducer'

function apply(state: LiveRunState, ...events: RunProgressEvent[]): LiveRunState {
  return events.reduce((acc, event) => applyProgressEvent(acc, event), state)
}

const testStart = (testId: string, over: Partial<Extract<RunProgressEvent, { type: 'testStart' }>> = {}) =>
  ({
    type: 'testStart' as const,
    testId,
    relativePath: 'features/login.feature',
    title: 'Valid login',
    attempt: 0,
    at: 1,
    ...over,
  })

const stepStart = (testId: string, index: number, title: string) =>
  ({ type: 'stepStart' as const, testId, index, title, at: 10 })

const stepEnd = (
  testId: string,
  index: number,
  title: string,
  status: 'passed' | 'failed' | 'skipped' = 'passed',
) => ({ type: 'stepEnd' as const, testId, index, title, status, durationMs: 5, at: 20 })

describe('applyProgressEvent — basics', () => {
  it('starts unavailable and flips available on the first event', () => {
    const empty = emptyLiveRunState()
    expect(empty.available).toBe(false)
    expect(apply(empty, { type: 'runStart' }).available).toBe(true)
  })

  it('records a scenario and marks it running', () => {
    const state = apply(emptyLiveRunState(), testStart('a1'))
    expect(state.scenarios['a1']).toMatchObject({
      testId: 'a1',
      relativePath: 'features/login.feature',
      title: 'Valid login',
      status: 'running',
      attempt: 0,
    })
    expect(state.running).toEqual(['a1'])
  })

  it('tracks a step through running then passed', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      stepStart('a1', 0, 'Given a step'),
    )
    expect(state.scenarios['a1']!.steps[0]).toMatchObject({
      index: 0,
      title: 'Given a step',
      status: 'running',
      startedAt: 10,
    })

    const done = apply(state, stepEnd('a1', 0, 'Given a step'))
    expect(done.scenarios['a1']!.steps[0]).toMatchObject({ status: 'passed', durationMs: 5 })
  })

  it('records a step error when it fails', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      stepStart('a1', 0, 'Given a step'),
      { ...stepEnd('a1', 0, 'Given a step', 'failed'), error: 'boom' },
    )
    expect(state.scenarios['a1']!.steps[0]).toMatchObject({ status: 'failed', error: 'boom' })
  })

  it('removes a scenario from running on testEnd and records its status', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 900, at: 30 },
    )
    expect(state.running).toEqual([])
    expect(state.scenarios['a1']).toMatchObject({ status: 'failed', durationMs: 900 })
  })

  it('bumps attempt on a retry rather than creating a second scenario', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 5, at: 2 },
      testStart('a1', { attempt: 1 }),
    )
    expect(Object.keys(state.scenarios)).toEqual(['a1'])
    expect(state.scenarios['a1']).toMatchObject({ attempt: 1, status: 'running' })
  })

  it('clears the previous attempt steps when a retry starts', () => {
    // Otherwise a step that passed on attempt 0 would look passed on attempt 1
    // before it has run again.
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      stepStart('a1', 0, 'Given a step'),
      stepEnd('a1', 0, 'Given a step'),
      testStart('a1', { attempt: 1 }),
    )
    expect(state.scenarios['a1']!.steps).toEqual({})
  })
})

describe('applyProgressEvent — resilience', () => {
  it('creates the scenario when a step event arrives before testStart', () => {
    const state = apply(emptyLiveRunState(), stepStart('ghost', 0, 'Given a step'))
    expect(state.scenarios['ghost']).toBeDefined()
    expect(state.scenarios['ghost']!.steps[0]!.status).toBe('running')
  })

  it('applies stepEnd even when stepStart was never seen', () => {
    const state = apply(emptyLiveRunState(), testStart('a1'), stepEnd('a1', 3, 'Then it works'))
    expect(state.scenarios['a1']!.steps[3]).toMatchObject({ status: 'passed', index: 3 })
  })

  it('keeps interleaved tests separate', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      testStart('b2', { title: 'Other', relativePath: 'features/cart.feature' }),
      stepStart('a1', 0, 'A step'),
      stepStart('b2', 0, 'B step'),
      stepEnd('b2', 0, 'B step', 'failed'),
    )
    expect(state.running.sort()).toEqual(['a1', 'b2'])
    expect(state.scenarios['a1']!.steps[0]!.status).toBe('running')
    expect(state.scenarios['b2']!.steps[0]!.status).toBe('failed')
    expect(state.scenarios['a1']!.steps[0]!.title).toBe('A step')
  })

  it('reports ALL concurrently running tests, not just the latest', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      testStart('b2'),
      testStart('c3'),
      testStart('d4'),
    )
    expect(state.running).toHaveLength(4)
  })

  it('does not duplicate a testId in running', () => {
    const state = apply(emptyLiveRunState(), testStart('a1'), testStart('a1', { attempt: 1 }))
    expect(state.running).toEqual(['a1'])
  })
})

describe('applyProgressEvent — title mismatch guard', () => {
  const authored = ['Given a step', 'When I click', 'Then it works']

  it('applies a step event whose title matches the authored step at that index', () => {
    const state = applyProgressEvent(
      apply(emptyLiveRunState(), testStart('a1')),
      stepStart('a1', 1, 'When I click'),
      authored,
    )
    expect(state.scenarios['a1']!.steps[1]!.status).toBe('running')
  })

  it('DROPS a step event whose title disagrees with the authored step', () => {
    // A status applied to the wrong step is worse than no status at all.
    const state = applyProgressEvent(
      apply(emptyLiveRunState(), testStart('a1')),
      stepEnd('a1', 1, 'Given something completely different', 'failed'),
      authored,
    )
    expect(state.scenarios['a1']!.steps[1]).toBeUndefined()
  })

  it('drops a step event whose index is outside the authored list', () => {
    const state = applyProgressEvent(
      apply(emptyLiveRunState(), testStart('a1')),
      stepStart('a1', 99, 'Given a step'),
      authored,
    )
    expect(state.scenarios['a1']!.steps[99]).toBeUndefined()
  })

  it('applies the event when no authored list is available to check against', () => {
    // Without the feature file we cannot verify — showing status is still better
    // than showing none, and the ordinal is the reporter's own count.
    const state = applyProgressEvent(
      apply(emptyLiveRunState(), testStart('a1')),
      stepStart('a1', 1, 'When I click'),
    )
    expect(state.scenarios['a1']!.steps[1]!.status).toBe('running')
  })
})

describe('reconcileLiveRun', () => {
  it('forces every running step and scenario to a terminal status', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      stepStart('a1', 0, 'Given a step'),
      { type: 'runEnd', at: 99 },
    )
    const reconciled = reconcileLiveRun(state, 'completed')

    expect(reconciled.scenarios['a1']!.steps[0]!.status).not.toBe('running')
    expect(reconciled.scenarios['a1']!.status).not.toBe('running')
    expect(reconciled.running).toEqual([])
    expect(reconciled.reconciled).toBe(true)
  })

  it('marks in-flight work interrupted when the run was stopped', () => {
    const state = apply(emptyLiveRunState(), testStart('a1'), stepStart('a1', 0, 'Given a step'))
    const reconciled = reconcileLiveRun(state, 'stopped')

    expect(reconciled.scenarios['a1']!.steps[0]!.status).toBe('interrupted')
    expect(reconciled.scenarios['a1']!.status).toBe('interrupted')
  })

  it('never marks an unreached step as failed when stopping', () => {
    const state = apply(emptyLiveRunState(), testStart('a1'), stepStart('a1', 0, 'Given a step'))
    const reconciled = reconcileLiveRun(state, 'stopped')
    // Step 1 was never started, so it must not appear with a status at all.
    expect(reconciled.scenarios['a1']!.steps[1]).toBeUndefined()
  })

  it('leaves already-terminal statuses untouched', () => {
    const state = apply(
      emptyLiveRunState(),
      testStart('a1'),
      stepStart('a1', 0, 'Given a step'),
      stepEnd('a1', 0, 'Given a step', 'failed'),
      { type: 'testEnd', testId: 'a1', status: 'failed', durationMs: 5, at: 3 },
    )
    const reconciled = reconcileLiveRun(state, 'completed')
    expect(reconciled.scenarios['a1']!.steps[0]!.status).toBe('failed')
    expect(reconciled.scenarios['a1']!.status).toBe('failed')
  })

  it('is safe to call on an empty state', () => {
    expect(() => reconcileLiveRun(emptyLiveRunState(), 'completed')).not.toThrow()
  })
})
