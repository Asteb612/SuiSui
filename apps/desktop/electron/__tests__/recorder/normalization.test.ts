import { describe, expect, it } from 'vitest'
import { normalizeRawAction } from '../../services/recorder/RecorderService'
import type { RawRecordedAction } from '../../services/recorder/types'

function raw(partial: Partial<RawRecordedAction> & { action: RawRecordedAction['action'] }): RawRecordedAction {
  return { seq: 0, pageGuid: 'p1', ...partial }
}

describe('normalizeRawAction', () => {
  it('normalizes a navigation', () => {
    const a = normalizeRawAction(raw({ action: { name: 'navigate', url: '/login' } }), 's1')
    expect(a).toMatchObject({ type: 'navigate', value: '/login', label: 'Open "/login"', status: 'draft', sessionId: 's1', seq: 0 })
  })

  it('normalizes a click and derives the target from the first candidate', () => {
    const a = normalizeRawAction(
      raw({
        action: { name: 'click', selector: 'internal:role=button', button: 'left', clickCount: 1 },
        fingerprint: { tagName: 'button', accessibleName: 'Sign in', testAttributes: { 'data-testid': 'login-submit' } },
        candidates: [{ kind: 'testId', attribute: 'data-testid', value: 'login-submit', matchedElements: 1 }],
      }),
      's1'
    )
    expect(a.type).toBe('click')
    expect(a.label).toBe('Click "Sign in"')
    expect(a.selectedLocator).toEqual({ type: 'testId', attribute: 'data-testid', value: 'login-submit' })
  })

  it('detects a double click via clickCount', () => {
    const a = normalizeRawAction(raw({ action: { name: 'click', clickCount: 2 } }), 's1')
    expect(a.type).toBe('doubleClick')
  })

  it('normalizes a fill with a labelled field', () => {
    const a = normalizeRawAction(
      raw({ action: { name: 'fill', text: 'a@b.com' }, fingerprint: { tagName: 'input', label: 'Email' } }),
      's1'
    )
    expect(a).toMatchObject({ type: 'fill', value: 'a@b.com', label: 'Fill "a@b.com" in the Email field' })
  })

  it('redacts a secret fill — no value, secret flag set', () => {
    const a = normalizeRawAction(
      raw({ action: { name: 'fill' }, secret: true, fingerprint: { tagName: 'input', label: 'Password' } }),
      's1'
    )
    expect(a.type).toBe('fill')
    expect(a.value).toBeUndefined()
    expect(a.secret).toBe(true)
  })

  it('normalizes select / check / uncheck / press / upload', () => {
    expect(normalizeRawAction(raw({ action: { name: 'select', options: ['Option A'] } }), 's1')).toMatchObject({
      type: 'select',
      value: 'Option A',
    })
    expect(normalizeRawAction(raw({ action: { name: 'check' } }), 's1').type).toBe('check')
    expect(normalizeRawAction(raw({ action: { name: 'uncheck' } }), 's1').type).toBe('uncheck')
    expect(normalizeRawAction(raw({ action: { name: 'press', key: 'Enter' } }), 's1')).toMatchObject({
      type: 'press',
      value: 'Enter',
      label: 'Press "Enter"',
    })
    expect(normalizeRawAction(raw({ action: { name: 'setInputFiles', files: ['resume.pdf'] } }), 's1')).toMatchObject({
      type: 'upload',
      value: 'resume.pdf',
    })
  })

  it('falls back to a css locator when no candidate is present', () => {
    const a = normalizeRawAction(raw({ action: { name: 'click', selector: '.btn' } }), 's1')
    expect(a.selectedLocator).toEqual({ type: 'css', value: '.btn' })
  })
})
