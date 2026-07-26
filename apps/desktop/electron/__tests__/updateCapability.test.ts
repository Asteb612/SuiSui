import { describe, it, expect } from 'vitest'
import { computeCapability, DEFAULT_RELEASES_URL } from '../services/update/capability'

describe('computeCapability', () => {
  it('disables updates in development (unpackaged)', () => {
    expect(computeCapability('linux', false, undefined)).toEqual({
      canSelfUpdate: false,
      reason: 'dev',
      manualUpdateUrl: null,
    })
    // Even with APPIMAGE set, dev stays dev.
    expect(computeCapability('linux', false, '/tmp/app.AppImage').reason).toBe('dev')
  })

  it('supports self-update on packaged Windows', () => {
    expect(computeCapability('win32', true, undefined)).toEqual({
      canSelfUpdate: true,
      reason: 'ok',
      manualUpdateUrl: null,
    })
  })

  it('supports self-update on packaged macOS', () => {
    expect(computeCapability('darwin', true, undefined).canSelfUpdate).toBe(true)
  })

  it('supports self-update for a Linux AppImage', () => {
    expect(computeCapability('linux', true, '/opt/app.AppImage')).toEqual({
      canSelfUpdate: true,
      reason: 'ok',
      manualUpdateUrl: null,
    })
  })

  it('is notify-only for a Linux non-AppImage install (deb)', () => {
    const cap = computeCapability('linux', true, undefined)
    expect(cap.canSelfUpdate).toBe(false)
    expect(cap.reason).toBe('unsupported-package')
    expect(cap.manualUpdateUrl).toBe(DEFAULT_RELEASES_URL)
  })

  it('honors a custom releases URL for notify-only installs', () => {
    const cap = computeCapability('linux', true, undefined, 'https://example.com/dl')
    expect(cap.manualUpdateUrl).toBe('https://example.com/dl')
  })
})
