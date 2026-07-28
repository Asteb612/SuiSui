import { describe, it, expect } from 'vitest'
import {
  applyProgressEvent,
  reconcileLiveRun,
  emptyLiveRunState,
  type LiveRunState,
  type RunProgressEvent,
} from '@suisui/shared'

describe('SC-006 scale', () => {
  it('handles a 200-scenario run without state growing with log volume', () => {
    const events: RunProgressEvent[] = [{ type: 'runStart', totalTests: 200 }]
    for (let t = 0; t < 200; t++) {
      const testId = `t${t}`
      events.push({ type: 'testStart', testId, relativePath: `features/f${t % 20}.feature`, title: `S${t}`, attempt: 0, at: t })
      for (let s = 0; s < 8; s++) {
        events.push({ type: 'stepStart', testId, index: s, title: `Given step ${s}`, at: t * 10 + s })
        events.push({ type: 'stepEnd', testId, index: s, title: `Given step ${s}`, status: 'passed', durationMs: 3, at: t * 10 + s })
      }
      events.push({ type: 'testEnd', testId, status: 'passed', durationMs: 30, at: t * 10 + 9 })
    }
    events.push({ type: 'runEnd', at: 99999 })

    const start = performance.now()
    let state: LiveRunState = emptyLiveRunState()
    for (const e of events) state = applyProgressEvent(state, e)
    state = reconcileLiveRun(state, 'completed')
    const elapsed = performance.now() - start

    expect(events.length).toBe(3602)
    expect(Object.keys(state.scenarios)).toHaveLength(200)
    expect(state.running).toEqual([])

    // State is bounded by scenarios x steps, NOT by how much the tests logged.
    expect(Object.values(state.scenarios).every((s) => Object.keys(s.steps).length === 8)).toBe(true)

    console.log(`3602 events reduced in ${elapsed.toFixed(0)}ms`)
    expect(elapsed).toBeLessThan(5000)
  })
})
