import { describe, expect, it } from 'vitest'
import { looksGenerated } from '../../services/recorder/LocatorService'

describe('looksGenerated', () => {
  it.each([
    ['550e8400-e29b-41d4-a716-446655440000', 'UUID'],
    ['a1b2c3d4', 'long hex hash'],
    ['Button_root__x8Ff2', 'CSS-module hash'],
    ['user-42391', 'long numeric id'],
    ['1712345678', 'timestamp'],
    ['css-1a2b3c', 'random alnum token'],
    ['item:nth-child(3)', 'nth-child'],
    ['div > *', 'wildcard descendant'],
  ])('flags %s (%s)', (value) => {
    expect(looksGenerated(value)).toBe(true)
  })

  it.each([
    ['login-submit'],
    ['btn-primary'],
    ['Welcome'],
    ['Sign in'],
    ['Email'],
    ['submit-button'],
    [''],
  ])('does not flag the stable/human value %s', (value) => {
    expect(looksGenerated(value)).toBe(false)
  })
})
