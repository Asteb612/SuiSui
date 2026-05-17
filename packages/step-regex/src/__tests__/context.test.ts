import { describe, it, expect } from 'vitest'
import { createScenarioContext } from '../context'

describe('createScenarioContext', () => {
  it('sets and gets values', () => {
    const ctx = createScenarioContext()
    ctx.set('userId', 42)
    expect(ctx.get<number>('userId')).toBe(42)
    expect(ctx.get('missing')).toBeUndefined()
  })

  it('seeds from an initial record', () => {
    const ctx = createScenarioContext({ a: 1 })
    expect(ctx.get('a')).toBe(1)
    expect(ctx.has('a')).toBe(true)
  })

  it('getOr returns fallback when absent', () => {
    const ctx = createScenarioContext()
    expect(ctx.getOr('x', 'default')).toBe('default')
    ctx.set('x', 'value')
    expect(ctx.getOr('x', 'default')).toBe('value')
  })

  it('require throws when absent', () => {
    const ctx = createScenarioContext()
    expect(() => ctx.require('token')).toThrow(
      'ScenarioContext: missing key "token"',
    )
    ctx.set('token', 'abc')
    expect(ctx.require<string>('token')).toBe('abc')
  })

  it('has / delete / clear / entries', () => {
    const ctx = createScenarioContext()
    ctx.set('a', 1)
    ctx.set('b', 2)
    expect(ctx.has('a')).toBe(true)
    expect(ctx.delete('a')).toBe(true)
    expect(ctx.has('a')).toBe(false)
    expect(ctx.entries()).toEqual([['b', 2]])
    ctx.clear()
    expect(ctx.entries()).toEqual([])
  })
})
