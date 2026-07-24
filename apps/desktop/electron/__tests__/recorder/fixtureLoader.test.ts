import { describe, expect, it } from 'vitest'
import { parseFakeRecorderFixture } from '../../services/recorder/fixtureLoader'

const NDJSON = [
  '{"v":1,"t":"ready","playwrightVersion":"1.60.0","browser":"chromium"}',
  '{"v":1,"t":"status","phase":"recording","url":"/login"}',
  '{"v":1,"t":"action","seq":0,"pageGuid":"p1","action":{"name":"navigate","url":"/login"}}',
  '{"v":1,"t":"actionUpdated","seq":1,"pageGuid":"p1","action":{"name":"fill"},"secret":true,"fingerprint":{"tagName":"input","label":"Password"}}',
  '{"v":1,"t":"picked","pageGuid":"p1","fingerprint":{"tagName":"h1"},"candidates":[{"kind":"text","value":"Hi","matchedElements":1}]}',
  '', // blank line ignored
  'not json', // malformed line ignored
].join('\n')

describe('parseFakeRecorderFixture', () => {
  it('maps NDJSON lines to fake script events + a pick queue', () => {
    const { script, pickResults } = parseFakeRecorderFixture(NDJSON)

    // ready is ignored; status + 2 actions become script events.
    expect(script.map((e) => e.type)).toEqual(['status', 'action', 'actionUpdated'])
    const fill = script[2]
    expect(fill.type).toBe('actionUpdated')
    if (fill.type === 'actionUpdated') {
      expect(fill.action.secret).toBe(true)
      expect(fill.action.seq).toBe(1)
    }
    // picked → pick queue (pickId is filled in by the fake on pick()).
    expect(pickResults).toHaveLength(1)
    expect(pickResults[0]!.fingerprint.tagName).toBe('h1')
  })

  it('returns empty results for empty input', () => {
    expect(parseFakeRecorderFixture('')).toEqual({ script: [], pickResults: [] })
  })
})
