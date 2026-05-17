import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../ipc/channels'

describe('IPC channel contract', () => {
  const entries = Object.entries(IPC_CHANNELS)

  it('exposes at least one channel', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('has no duplicate channel string values', () => {
    const values = entries.map(([, value]) => value)
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i)
    expect(duplicates).toEqual([])
  })

  it('uses SCREAMING_SNAKE_CASE keys', () => {
    for (const [key] of entries) {
      expect(key, `channel key "${key}"`).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  it('uses a single "namespace:action" colon convention for values', () => {
    for (const [key, value] of entries) {
      expect(typeof value, `channel "${key}"`).toBe('string')
      expect(value, `channel "${key}"`).toMatch(/^[a-z]+:[a-zA-Z]+$/)
    }
  })
})
