import { describe, it, expect } from 'vitest'
import { parseProgressLine } from '../run-progress/parseProgressLine'
import { PROGRESS_SENTINEL } from '../types/run-progress'

const line = (payload: unknown) => `${PROGRESS_SENTINEL}${JSON.stringify(payload)}`

describe('parseProgressLine — valid events', () => {
  it('parses runStart', () => {
    expect(parseProgressLine(line({ type: 'runStart', totalTests: 12 }))).toEqual({
      type: 'runStart',
      totalTests: 12,
    })
  })

  it('parses runStart without a total', () => {
    expect(parseProgressLine(line({ type: 'runStart' }))).toEqual({ type: 'runStart' })
  })

  it('parses testStart', () => {
    const event = {
      type: 'testStart',
      testId: 'a1',
      relativePath: 'features/login.feature',
      title: 'Valid login',
      attempt: 0,
      at: 1730000000000,
    }
    expect(parseProgressLine(line(event))).toEqual(event)
  })

  it('parses stepStart', () => {
    const event = { type: 'stepStart', testId: 'a1', index: 2, title: 'When I click', at: 1 }
    expect(parseProgressLine(line(event))).toEqual(event)
  })

  it('parses stepEnd, including the optional error', () => {
    const event = {
      type: 'stepEnd',
      testId: 'a1',
      index: 2,
      title: 'When I click',
      status: 'failed',
      durationMs: 120,
      error: 'boom',
      at: 1,
    }
    expect(parseProgressLine(line(event))).toEqual(event)
  })

  it('parses testEnd', () => {
    const event = { type: 'testEnd', testId: 'a1', status: 'passed', durationMs: 500, at: 1 }
    expect(parseProgressLine(line(event))).toEqual(event)
  })

  it('parses runEnd', () => {
    expect(parseProgressLine(line({ type: 'runEnd', at: 5 }))).toEqual({ type: 'runEnd', at: 5 })
  })

  it('tolerates trailing whitespace and a carriage return', () => {
    expect(parseProgressLine(`${line({ type: 'runEnd', at: 5 })}\r`)).toEqual({
      type: 'runEnd',
      at: 5,
    })
  })
})

describe('parseProgressLine — anything unrecognized returns null', () => {
  it('returns null for an ordinary log line', () => {
    expect(parseProgressLine('  ✓  1 [chromium] › login.feature:3:1 › Login (523ms)')).toBeNull()
  })

  it('returns null for an empty line', () => {
    expect(parseProgressLine('')).toBeNull()
  })

  it('returns null when the sentinel is present but the payload is not JSON', () => {
    expect(parseProgressLine(`${PROGRESS_SENTINEL}not json`)).toBeNull()
  })

  it('returns null when the payload is JSON but not an object', () => {
    expect(parseProgressLine(`${PROGRESS_SENTINEL}"a string"`)).toBeNull()
    expect(parseProgressLine(`${PROGRESS_SENTINEL}42`)).toBeNull()
    expect(parseProgressLine(`${PROGRESS_SENTINEL}null`)).toBeNull()
  })

  it('returns null for an unknown event type', () => {
    expect(parseProgressLine(line({ type: 'somethingElse', testId: 'a' }))).toBeNull()
  })

  it('returns null when a required field is missing', () => {
    expect(parseProgressLine(line({ type: 'stepStart', testId: 'a1', index: 2 }))).toBeNull()
    expect(parseProgressLine(line({ type: 'testStart', testId: 'a1' }))).toBeNull()
    expect(parseProgressLine(line({ type: 'testEnd', testId: 'a1', durationMs: 5 }))).toBeNull()
  })

  it('returns null when a required field has the wrong type', () => {
    expect(
      parseProgressLine(line({ type: 'stepStart', testId: 'a1', index: '2', title: 'x', at: 1 })),
    ).toBeNull()
    expect(
      parseProgressLine(line({ type: 'stepStart', testId: 1, index: 2, title: 'x', at: 1 })),
    ).toBeNull()
  })

  it('returns null for an invalid stepEnd status', () => {
    expect(
      parseProgressLine(
        line({ type: 'stepEnd', testId: 'a', index: 0, title: 'x', status: 'weird', durationMs: 1, at: 1 }),
      ),
    ).toBeNull()
  })

  it('does NOT treat a log line that merely contains the sentinel mid-line as an event', () => {
    // A test could legitimately print the sentinel; only a line that STARTS with
    // it is ours, otherwise user output could forge progress events.
    expect(parseProgressLine(`some output ${PROGRESS_SENTINEL}{"type":"runEnd","at":1}`)).toBeNull()
  })

  it('ignores unknown extra fields rather than rejecting the event', () => {
    const parsed = parseProgressLine(line({ type: 'runEnd', at: 5, somethingNew: true }))
    expect(parsed).toEqual({ type: 'runEnd', at: 5 })
  })
})
