import { describe, expect, it } from 'vitest'
import { LocatorService } from '../../services/recorder/LocatorService'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'

const svc = new LocatorService()

describe('LocatorService.score', () => {
  it('recommends a unique configured test-id as excellent (score 100)', () => {
    const [best] = svc.score([
      { kind: 'testId', attribute: 'data-testid', value: 'login-submit', matchedElements: 1 },
    ])
    expect(best).toMatchObject({ score: 100, reliability: 'excellent', unique: true })
    expect(best!.reasons).toContain('Dedicated testing attribute')
    expect(best!.reasons).toContain('Unique on the current page')
  })

  it('ranks a data-testid above a generated CSS class, and warns on the generated one', () => {
    const ranked = svc.score([
      { kind: 'css', value: '.Button_root__x8Ff2', matchedElements: 3 },
      { kind: 'testId', attribute: 'data-testid', value: 'login-submit', matchedElements: 1 },
    ])
    expect(ranked[0]!.locator).toEqual({ type: 'testId', attribute: 'data-testid', value: 'login-submit' })
    const css = ranked.find((c) => c.locator.type === 'css')!
    expect(css.warnings).toContain('Contains a value that looks generated')
    expect(css.score).toBeLessThan(ranked[0]!.score)
  })

  it('prefers role+name over an unstable CSS fallback', () => {
    const ranked = svc.score([
      { kind: 'css', value: 'div > *:nth-child(2)', matchedElements: 1 },
      { kind: 'role', role: 'button', name: 'Sign in', matchedElements: 1 },
    ])
    expect(ranked[0]!.locator.type).toBe('role')
    expect(ranked[0]!.reliability).toBe('good')
  })

  it('caps a non-unique candidate and warns', () => {
    const [c] = svc.score([{ kind: 'role', role: 'button', name: 'Go', matchedElements: 4 }])
    expect(c!.unique).toBe(false)
    expect(c!.score).toBeLessThanOrEqual(20)
    expect(c!.warnings[0]).toMatch(/Matches 4 elements/)
  })

  it('honors settings — drops CSS fallback when disallowed', () => {
    const strict = new LocatorService({ ...DEFAULT_RECORDER_LOCATOR_SETTINGS, allowCssFallback: false })
    const ranked = strict.score([
      { kind: 'css', value: '.btn', matchedElements: 1 },
      { kind: 'label', value: 'Email', matchedElements: 1 },
    ])
    expect(ranked.every((c) => c.locator.type !== 'css')).toBe(true)
  })

  it('treats a stable class as fair (not generated)', () => {
    const [c] = svc.score([{ kind: 'css', value: '.btn-primary', matchedElements: 1 }])
    expect(c!.warnings).not.toContain('Contains a value that looks generated')
    expect(c!.reliability).toBe('poor') // css class base score 25
  })
})
