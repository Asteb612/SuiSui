import type { RecorderStartOptions, LocatorValidationResult } from '@suisui/shared'
import type { AdapterEventHandlers, AdapterStartInfo, IRecorderAdapter } from './IRecorderAdapter'
import type { RawRecordedAction, RawPickedElement, RawAdapterStatus, RawAdapterError } from './types'

export type FakeScriptEvent =
  | { type: 'action'; action: RawRecordedAction }
  | { type: 'actionUpdated'; action: RawRecordedAction }
  | { type: 'status'; status: RawAdapterStatus }
  | { type: 'error'; error: RawAdapterError }

export interface FakeRecorderAdapterOptions {
  /** Events replayed automatically after `start()` resolves. */
  script?: FakeScriptEvent[]
  /** One `RawPickedElement` dequeued per `pick()` call. */
  pickResults?: RawPickedElement[]
  info?: AdapterStartInfo
  validation?: LocatorValidationResult
}

/**
 * Deterministic in-process adapter for tests (Constitution Principle III):
 * NO real Playwright/Chromium/CLI/network. Replays a scripted sequence of raw
 * events, and exposes manual `emit*` drivers for fine-grained unit control.
 */
export class FakeRecorderAdapter implements IRecorderAdapter {
  private handlers: AdapterEventHandlers | null = null
  private stopped = false
  private paused = false
  private readonly pickQueue: RawPickedElement[]

  constructor(private readonly opts: FakeRecorderAdapterOptions = {}) {
    this.pickQueue = [...(opts.pickResults ?? [])]
  }

  async start(_options: RecorderStartOptions, handlers: AdapterEventHandlers): Promise<AdapterStartInfo> {
    this.handlers = handlers
    this.stopped = false
    this.paused = false
    handlers.onStatus({ phase: 'recording' })
    const script = this.opts.script ?? []
    // Replay as a microtask so the caller receives the session before events flow;
    // still runs before the awaiting continuation, keeping unit tests deterministic.
    queueMicrotask(() => {
      for (const ev of script) {
        if (this.stopped) break
        if (this.paused) continue
        this.dispatch(ev)
      }
    })
    return this.opts.info ?? { playwrightVersion: '1.60.0', browser: 'chromium' }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.handlers?.onStatus({ phase: 'idle' })
  }

  async pause(): Promise<void> {
    this.paused = true
    this.handlers?.onStatus({ phase: 'paused' })
  }

  async resume(): Promise<void> {
    this.paused = false
    this.handlers?.onStatus({ phase: 'recording' })
  }

  async pick(pickId: string): Promise<void> {
    this.handlers?.onStatus({ phase: 'picking' })
    const next = this.pickQueue.shift()
    if (next) {
      this.handlers?.onPicked({ ...next, pickId })
    } else {
      this.handlers?.onPicked({
        pickId,
        pageGuid: 'fake-page',
        fingerprint: { tagName: 'div' },
        candidates: [],
        cancelled: true,
      })
    }
    this.handlers?.onStatus({ phase: 'recording' })
  }

  async cancelPick(): Promise<void> {
    this.handlers?.onStatus({ phase: 'recording' })
  }

  async highlight(_selector: string): Promise<void> {
    // no-op in the fake
  }

  async validate(_selector: string): Promise<LocatorValidationResult> {
    return this.opts.validation ?? { unique: true, matchedElements: 1, stillMatches: true }
  }

  // --- manual drivers for unit tests -------------------------------------

  emit(ev: FakeScriptEvent): void {
    if (this.handlers && !this.stopped) this.dispatch(ev)
  }

  emitAction(action: RawRecordedAction): void {
    this.emit({ type: 'action', action })
  }

  emitPicked(picked: RawPickedElement): void {
    this.handlers?.onPicked(picked)
  }

  private dispatch(ev: FakeScriptEvent): void {
    const h = this.handlers
    if (!h) return
    switch (ev.type) {
      case 'action':
        h.onAction(ev.action)
        break
      case 'actionUpdated':
        h.onActionUpdated(ev.action)
        break
      case 'status':
        h.onStatus(ev.status)
        break
      case 'error':
        h.onError(ev.error)
        break
    }
  }
}
