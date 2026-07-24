import type { LocatorKind, RecorderErrorCode, RecorderStatusPhase } from '@suisui/shared'

/**
 * Adapter/child-internal ("raw") recorder types.
 *
 * These NEVER cross IPC — they model the NDJSON boundary between the child
 * `recorder-adapter.js` and the main-process adapter. `RecorderService`
 * normalizes them into the serializable `@suisui/shared` recorder types.
 */

/** Mirrors Playwright's recorded `action` object (the fields we consume). */
export interface RawPlaywrightAction {
  /** Playwright action name: openPage/navigate/click/fill/press/select/setInputFiles/check/uncheck/assert*… */
  name: string
  selector?: string
  text?: string
  key?: string
  /** Playwright modifier bitmask (Alt=1, Control=2, Meta=4, Shift=8). */
  modifiers?: number
  options?: string[]
  files?: string[]
  checked?: boolean
  url?: string
  button?: string
  clickCount?: number
}

/** Raw element description produced by the child's `page.evaluate`. */
export interface RawFingerprint {
  tagName: string
  role?: string
  accessibleName?: string
  label?: string
  placeholder?: string
  testAttributes?: Record<string, string>
  id?: string
  name?: string
  ariaLabel?: string
  text?: string
  nearbyText?: string[]
  inputType?: string
  autocomplete?: string
}

/** Raw candidate locator + its measured uniqueness (scoring happens in main). */
export interface RawCandidate {
  kind: LocatorKind
  attribute?: string
  value?: string
  role?: string
  name?: string
  exact?: boolean
  matchedElements: number
}

/** One captured interaction as delivered by the adapter (pre-normalization). */
export interface RawRecordedAction {
  seq: number
  pageGuid: string
  action: RawPlaywrightAction
  fingerprint?: RawFingerprint
  candidates?: RawCandidate[]
  /** True when the value was redacted at the source (never carries the value). */
  secret?: boolean
  /** Playwright's generated snippet — advanced/debug only. */
  code?: string
}

/** An element the user picked with SuiSui's own picker. */
export interface RawPickedElement {
  pickId: string
  pageGuid: string
  fingerprint: RawFingerprint
  candidates: RawCandidate[]
  cancelled?: boolean
}

export interface RawAdapterStatus {
  phase: RecorderStatusPhase
  url?: string
}

export interface RawAdapterError {
  code: RecorderErrorCode
  /** Optional — a default message/recovery is filled from the code (SC-008). */
  message?: string
  recovery?: string
  fatal?: boolean
}
