import type { RecorderStartOptions, LocatorValidationResult } from '@suisui/shared'
import type {
  RawRecordedAction,
  RawPickedElement,
  RawAdapterStatus,
  RawAdapterError,
  RawAssertEvent,
} from './types'

/**
 * Callbacks the adapter invokes as raw events arrive from the browser/child.
 * `RecorderService` supplies these and normalizes each raw payload into the
 * serializable `@suisui/shared` recorder types before forwarding over IPC.
 */
export interface AdapterEventHandlers {
  onAction: (raw: RawRecordedAction) => void
  onActionUpdated: (raw: RawRecordedAction) => void
  onPicked: (raw: RawPickedElement) => void
  onStatus: (status: RawAdapterStatus) => void
  onError: (error: RawAdapterError) => void
  /** An assertion created via the in-browser overlay (optional; not all adapters emit it). */
  onAssert?: (raw: RawAssertEvent) => void
}

/** Info resolved from the browser once a session is live. */
export interface AdapterStartInfo {
  playwrightVersion: string
  browser: string
}

/**
 * The single seam behind which all Playwright-recording specifics live.
 *
 * Two implementations: `PlaywrightRecorderAdapter` (real, spawns the child
 * that drives the workspace's Playwright — Constitution Principle I) and
 * `FakeRecorderAdapter` (tests replay checked-in NDJSON — Principle III).
 * No other code depends on Playwright's private recorder API.
 */
export interface IRecorderAdapter {
  start(options: RecorderStartOptions, handlers: AdapterEventHandlers): Promise<AdapterStartInfo>
  stop(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  /** Arm SuiSui's own one-shot picker; the result arrives via `onPicked`. */
  pick(pickId: string): Promise<void>
  cancelPick(): Promise<void>
  /** `selector` is a Playwright selector string (RecorderService converts from LocatorReference). */
  highlight(selector: string): Promise<void>
  validate(selector: string): Promise<LocatorValidationResult>
}
