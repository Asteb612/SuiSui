import { describe, it, expect } from 'vitest'
import { stableStepId, canonicalizePattern, canonicalizeRegex } from '../ids'

describe('stableStepId (US1)', () => {
  const base = {
    relPath: 'tests/steps/a.steps.ts',
    keyword: 'Given',
    canonicalPattern: 'I am logged in',
    line: 10,
  }

  it('produces the step_<12hex> shape', () => {
    expect(stableStepId(base)).toMatch(/^step_[0-9a-f]{12}$/)
  })

  it('is deterministic for identical input', () => {
    expect(stableStepId(base)).toBe(stableStepId({ ...base }))
  })

  it('changes when the file (relPath) changes', () => {
    const moved = stableStepId({ ...base, relPath: 'tests/steps/moved.steps.ts' })
    expect(moved).not.toBe(stableStepId(base))
  })

  it('changes when the pattern changes', () => {
    expect(stableStepId({ ...base, canonicalPattern: 'I am logged out' })).not.toBe(
      stableStepId(base),
    )
  })

  it('canonicalizes whitespace', () => {
    expect(canonicalizePattern('  I   fill   {string}  ')).toBe('I fill {string}')
  })

  it('canonicalizes regex flags order', () => {
    expect(canonicalizeRegex('^a$', 'ig')).toBe(canonicalizeRegex('^a$', 'gi'))
  })
})
