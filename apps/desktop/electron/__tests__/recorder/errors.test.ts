import { describe, expect, it, vi } from 'vitest'
import { RecorderService, type RecorderEmitters } from '../../services/recorder/RecorderService'
import { RECORDER_ERROR_INFO, makeRecorderError } from '../../services/recorder/recorderErrors'
import { FakeRecorderAdapter, type FakeScriptEvent } from '../../services/recorder/FakeRecorderAdapter'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import type { RecordedAction, RecorderErrorCode } from '@suisui/shared'

function spyEmitters(): RecorderEmitters {
  return { onAction: vi.fn(), onActionUpdated: vi.fn(), onPicked: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
}
function serviceWith(script: FakeScriptEvent[] = []) {
  const adapter = new FakeRecorderAdapter({ script })
  const service = new RecorderService({
    adapter,
    loadCatalogSteps: async () => [],
    loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS,
  })
  return { service, emitters: spyEmitters() }
}

describe('recorder error catalog (SC-008)', () => {
  it('has a specific, non-empty message for every error code', () => {
    for (const [code, info] of Object.entries(RECORDER_ERROR_INFO)) {
      expect(info.message.length, code).toBeGreaterThan(0)
    }
  })

  it('makeRecorderError fills a default message + recovery from the code', () => {
    const e = makeRecorderError('BROWSER_BINARY_MISSING', { fatal: true, sessionId: 's' })
    expect(e).toMatchObject({ code: 'BROWSER_BINARY_MISSING', fatal: true, sessionId: 's' })
    expect(e.message).toMatch(/browser binary/i)
    expect(e.recovery).toMatch(/playwright install/i)
  })

  it('lets the child override the message while keeping the code', () => {
    const e = makeRecorderError('ADAPTER_CRASHED', { message: 'exit code 1' })
    expect(e.message).toBe('exit code 1')
  })

  it('forwards a code-only adapter error with a filled user-facing message', async () => {
    const code: RecorderErrorCode = 'TARGET_PAGE_CLOSED'
    const { service, emitters } = serviceWith([{ type: 'error', error: { code, fatal: true } }])
    const session = await service.start({}, emitters)
    expect(emitters.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code, fatal: true, sessionId: session.sessionId, message: RECORDER_ERROR_INFO[code].message })
    )
  })
})

describe('pick lifecycle', () => {
  it('cancelPick returns to the recording state', async () => {
    const { service, emitters } = serviceWith()
    await service.start({}, emitters)
    await service.pick({ purpose: 'assert' })
    ;(emitters.onStatus as ReturnType<typeof vi.fn>).mockClear()
    await service.cancelPick()
    expect(emitters.onStatus).toHaveBeenCalledWith(expect.objectContaining({ phase: 'recording' }))
  })
})

describe('SC-010 — large session ordering', () => {
  it('preserves order for 200 actions with no loss', async () => {
    const script: FakeScriptEvent[] = Array.from({ length: 200 }, (_, i) => ({
      type: 'action',
      action: { seq: i, pageGuid: 'p1', action: { name: 'click', selector: `.b${i}` } },
    }))
    const { service, emitters } = serviceWith(script)
    await service.start({}, emitters)
    const seqs = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as RecordedAction).seq)
    expect(seqs).toEqual(Array.from({ length: 200 }, (_, i) => i))
  })
})
