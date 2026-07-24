import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import { RecorderService } from '../../services/recorder/RecorderService'
import { FakeRecorderAdapter, type FakeScriptEvent } from '../../services/recorder/FakeRecorderAdapter'
import type { RecorderEmitters } from '../../services/recorder/RecorderService'

function spyEmitters(): RecorderEmitters {
  return {
    onAction: vi.fn(),
    onActionUpdated: vi.fn(),
    onPicked: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
  }
}

const clickEvent: FakeScriptEvent = {
  type: 'action',
  action: {
    seq: 0,
    pageGuid: 'p1',
    action: { name: 'click', selector: 'internal:role=button[name="Sign in"i]', button: 'left', clickCount: 1 },
    fingerprint: {
      tagName: 'button',
      role: 'button',
      accessibleName: 'Sign in',
      testAttributes: { 'data-testid': 'login-submit' },
      text: 'Sign in',
    },
    candidates: [{ kind: 'testId', attribute: 'data-testid', value: 'login-submit', matchedElements: 1 }],
  },
}

describe('RecorderService foundation (FakeRecorderAdapter)', () => {
  it('starts a session and streams a normalized action', async () => {
    const adapter = new FakeRecorderAdapter({ script: [clickEvent] })
    // No catalog steps → the action is a deterministic-match gap (matching lands in US1).
    const service = new RecorderService({ adapter, loadCatalogSteps: async () => [], loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS })
    const emitters = spyEmitters()

    const session = await service.start({}, emitters)

    expect(session.sessionId).toBeTruthy()
    expect(session.playwrightVersion).toBe('1.60.0')
    expect(session.browser).toBe('chromium')
    expect(emitters.onStatus).toHaveBeenCalledWith(expect.objectContaining({ phase: 'recording' }))

    expect(emitters.onAction).toHaveBeenCalledTimes(1)
    const action = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(action).toMatchObject({
      sessionId: session.sessionId,
      seq: 0,
      type: 'click',
      pageId: 'p1',
      label: 'Click "Sign in"',
      status: 'gap',
    })
    expect(action.fingerprint.accessibleName).toBe('Sign in')
    // With a candidate present, the selected locator is derived from it (not the raw selector).
    expect(action.selectedLocator).toEqual({ type: 'testId', attribute: 'data-testid', value: 'login-submit' })
  })

  it('pause/resume/stop drive the session lifecycle', async () => {
    const adapter = new FakeRecorderAdapter()
    const service = new RecorderService({ adapter, loadCatalogSteps: async () => [], loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS })
    const emitters = spyEmitters()

    await service.start({}, emitters)
    await service.pause()
    expect(emitters.onStatus).toHaveBeenCalledWith(expect.objectContaining({ phase: 'paused' }))
    await service.resume()
    await service.stop()

    // After stop there is no active session.
    await expect(service.pause()).rejects.toThrow(/No active recording session/)
  })

  it('pick returns a pickId and emits a PickedElement carrying the purpose', async () => {
    const adapter = new FakeRecorderAdapter()
    const service = new RecorderService({ adapter, loadCatalogSteps: async () => [], loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS })
    const emitters = spyEmitters()

    await service.start({}, emitters)
    const pickId = await service.pick({ purpose: 'assert' })

    expect(pickId).toBeTruthy()
    expect(emitters.onPicked).toHaveBeenCalledTimes(1)
    const picked = (emitters.onPicked as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(picked).toMatchObject({ pickId, purpose: 'assert', cancelled: true })
  })

  it('validateLocator delegates to the adapter', async () => {
    const adapter = new FakeRecorderAdapter({ validation: { unique: false, matchedElements: 3, stillMatches: true } })
    const service = new RecorderService({ adapter, loadCatalogSteps: async () => [], loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS })
    await service.start({}, spyEmitters())

    const result = await service.validateLocator({ type: 'testId', attribute: 'data-testid', value: 'x' })
    expect(result).toEqual({ unique: false, matchedElements: 3, stillMatches: true })
  })
})
