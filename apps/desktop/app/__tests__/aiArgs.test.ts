import { describe, it, expect } from 'vitest'
import { parseSuggestedArgs } from '../utils/aiArgs'

describe('parseSuggestedArgs (FR-011)', () => {
  const params = ['username', 'password']

  it('maps values to known parameter names', () => {
    expect(parseSuggestedArgs('{"username":"admin","password":"secret"}', params)).toEqual({
      username: 'admin',
      password: 'secret',
    })
  })

  it('drops keys that are not real parameters', () => {
    expect(parseSuggestedArgs('{"username":"admin","role":"root"}', params)).toEqual({ username: 'admin' })
  })

  it('extracts the object even with surrounding prose / code fences', () => {
    const reply = 'Here you go:\n```json\n{"username":"bob"}\n```'
    expect(parseSuggestedArgs(reply, params)).toEqual({ username: 'bob' })
  })

  it('coerces non-string values to strings', () => {
    expect(parseSuggestedArgs('{"username":42}', params)).toEqual({ username: '42' })
  })

  it('skips null/undefined values', () => {
    expect(parseSuggestedArgs('{"username":null,"password":"x"}', params)).toEqual({ password: 'x' })
  })

  it('returns an empty map on non-JSON / empty replies', () => {
    expect(parseSuggestedArgs('no json here', params)).toEqual({})
    expect(parseSuggestedArgs('', params)).toEqual({})
  })
})
