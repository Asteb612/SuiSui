import { describe, expect, it } from 'vitest'
import { isSensitiveField, secretReferenceName } from '../../services/recorder/secretDetection'
import { normalizeRawAction } from '../../services/recorder/RecorderService'
import type { ElementFingerprint } from '@suisui/shared'
import type { RawRecordedAction } from '../../services/recorder/types'

function fp(over: Partial<ElementFingerprint>): ElementFingerprint {
  return { tagName: 'input', testAttributes: {}, ...over }
}

describe('isSensitiveField', () => {
  it('flags password inputs and password autocomplete', () => {
    expect(isSensitiveField(fp({ inputType: 'password' }))).toBe(true)
    expect(isSensitiveField(fp({ autocomplete: 'current-password' }))).toBe(true)
    expect(isSensitiveField(fp({ autocomplete: 'new-password' }))).toBe(true)
  })

  it('flags sensitive names/labels', () => {
    for (const label of ['Password', 'API Key', 'Auth Token', 'Client Secret', 'authorization']) {
      expect(isSensitiveField(fp({ label }))).toBe(true)
    }
    expect(isSensitiveField(fp({ name: 'user_password' }))).toBe(true)
  })

  it('does not flag ordinary fields', () => {
    expect(isSensitiveField(fp({ label: 'Email', inputType: 'email' }))).toBe(false)
    expect(isSensitiveField(fp({ label: 'Username' }))).toBe(false)
  })
})

describe('secretReferenceName', () => {
  it('derives an UPPER_SNAKE reference from the field name', () => {
    expect(secretReferenceName(fp({ label: 'Password' }))).toBe('<PASSWORD>')
    expect(secretReferenceName(fp({ label: 'API Key' }))).toBe('<API_KEY>')
    expect(secretReferenceName(undefined)).toBe('<SECRET>')
  })
})

describe('normalizeRawAction — redaction invariant (SC-004)', () => {
  function raw(action: RawRecordedAction['action'], over: Partial<RawRecordedAction> = {}): RawRecordedAction {
    return { seq: 0, pageGuid: 'p', action, ...over }
  }

  it('redacts a value the child already marked secret', () => {
    const a = normalizeRawAction(
      raw({ name: 'fill' }, { secret: true, fingerprint: { tagName: 'input', label: 'Password' } }),
      's'
    )
    expect(a.secret).toBe(true)
    expect(a.value).toBeUndefined()
    expect(a.secretRef).toBe('<PASSWORD>')
    expect(a.label).toBe('Fill a protected value in the Password field')
  })

  it('defensively redacts a password field even if the child did not flag it', () => {
    const a = normalizeRawAction(
      raw({ name: 'fill', text: 'hunter2' }, { fingerprint: { tagName: 'input', label: 'Password', inputType: 'password' } }),
      's'
    )
    expect(a.secret).toBe(true)
    expect(a.value).toBeUndefined()
    // The clear-text value never appears anywhere on the action.
    expect(JSON.stringify(a)).not.toContain('hunter2')
  })

  it('leaves ordinary values intact', () => {
    const a = normalizeRawAction(
      raw({ name: 'fill', text: 'a@b.com' }, { fingerprint: { tagName: 'input', label: 'Email' } }),
      's'
    )
    expect(a.secret).toBeUndefined()
    expect(a.value).toBe('a@b.com')
  })
})
