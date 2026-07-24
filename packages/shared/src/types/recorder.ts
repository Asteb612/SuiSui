import type { StepArg } from './feature'
import type { StepSourceLocation } from './step-catalog'

/**
 * Serializable contract types for the SuiSui-native Playwright recorder.
 *
 * These cross the IPC boundary, so they are the single source of truth
 * (Constitution Principle V). Adapter/child-internal (raw) types live in
 * `apps/desktop/electron/services/recorder` and never appear here.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type RecordedActionType =
  | 'navigate'
  | 'click'
  | 'doubleClick'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'press'
  | 'upload'
  // assertions:
  | 'assertVisible'
  | 'assertHidden'
  | 'assertText'
  | 'assertValue'
  | 'assertChecked'
  | 'assertEnabled'
  | 'assertCount'
  | 'assertUrl'
  | 'assertTitle'

export type RecordedActionStatus = 'draft' | 'matched' | 'needs-review' | 'accepted' | 'gap'

export type RecorderStatusPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  /** Recording is temporarily suspended while SuiSui's own element picker is armed. */
  | 'picking'
  | 'stopping'
  | 'error'

/** Why pick mode was entered. */
export type PickPurpose = 'retarget' | 'assert'

export type LocatorKind = 'testId' | 'role' | 'label' | 'placeholder' | 'text' | 'name' | 'id' | 'css'

export type MatchSource = 'deterministic' | 'project-metadata' | 'ai' | 'user'

export type Reliability = 'excellent' | 'good' | 'fair' | 'poor'

export type RecorderErrorCode =
  | 'PLAYWRIGHT_NOT_INSTALLED'
  | 'UNSUPPORTED_PLAYWRIGHT'
  | 'BROWSER_BINARY_MISSING'
  | 'BROWSER_LAUNCH_FAILED'
  | 'RECORDER_API_CHANGED'
  | 'TARGET_PAGE_CLOSED'
  | 'WORKSPACE_CHANGED'
  | 'NO_STEP_DEFINITIONS'
  | 'LOCATOR_NOT_UNIQUE'
  | 'LOCATOR_NO_LONGER_MATCHES'
  | 'STEP_MISSING_ARGUMENTS'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'ADAPTER_CRASHED'
  | 'NO_WORKSPACE'

// ---------------------------------------------------------------------------
// Locator model
// ---------------------------------------------------------------------------

/** A semantic way to identify an element; convertible to a Playwright locator. */
export type LocatorReference =
  | { type: 'testId'; attribute: string; value: string }
  | { type: 'role'; role: string; name?: string; exact?: boolean }
  | { type: 'label'; value: string; exact?: boolean }
  | { type: 'placeholder'; value: string; exact?: boolean }
  | { type: 'text'; value: string; exact?: boolean }
  | { type: 'name'; value: string }
  | { type: 'id'; value: string }
  | { type: 'css'; value: string }

export interface LocatorCandidate {
  locator: LocatorReference
  /** 0–100 reliability score (locator-scoring contract). */
  score: number
  reliability: Reliability
  unique: boolean
  matchedElements: number
  /** Human-readable positives shown in the UI. */
  reasons: string[]
  /** Human-readable concerns (e.g. "Contains a value that looks generated"). */
  warnings: string[]
}

/** Durable descriptive information about a recorded element (labels + repair). */
export interface ElementFingerprint {
  tagName: string
  role?: string
  accessibleName?: string
  label?: string
  placeholder?: string
  /** All matched test-oriented data attributes present on the element. */
  testAttributes: Record<string, string>
  id?: string
  name?: string
  ariaLabel?: string
  text?: string
  nearbyText?: string[]
  inputType?: string
  autocomplete?: string
}

// ---------------------------------------------------------------------------
// Step matching
// ---------------------------------------------------------------------------

export interface StepMatch {
  /** Catalog `CatalogStep.id` (stable). */
  definitionId: string
  keyword: 'Given' | 'When' | 'Then'
  pattern: string
  args: StepArg[]
  /** 0–1. */
  confidence: number
  source: MatchSource
  definitionLocation?: StepSourceLocation
  reason?: string
  /** Name of the arg fed by the element target, if any — lets the renderer
   *  re-fill it when the user changes the locator. */
  targetArgName?: string
  /** Name of the arg fed by the recorded value, if any — lets the renderer
   *  re-fill it when the user renames a secret reference. */
  valueArgName?: string
}

// ---------------------------------------------------------------------------
// Recorded action
// ---------------------------------------------------------------------------

export interface RecordedAction {
  id: string
  sessionId: string
  /** Monotonic capture order (drives list order). */
  seq: number
  type: RecordedActionType
  /** From the originating frame's page guid (multi-page support). */
  pageId: string
  timestamp: number
  /** Human-readable target/action description. */
  label: string
  /** Typed/selected value; omitted entirely when `secret`. */
  value?: string
  /** True → value redacted at source. */
  secret?: boolean
  /** Committable name: profile name or `<UPPER_SNAKE>`. */
  secretRef?: string
  fingerprint?: ElementFingerprint
  /** Ranked descending by score. */
  locatorCandidates?: LocatorCandidate[]
  selectedLocator?: LocatorReference
  match?: StepMatch
  matchAlternatives?: StepMatch[]
  status: RecordedActionStatus
  /** 0–1 (from match). */
  confidence?: number
  /** Excluded from insertion when true. */
  disabled?: boolean
  /** Playwright's generated snippet — advanced/debug only, never shown by default. */
  rawCode?: string
}

// ---------------------------------------------------------------------------
// Session, status, errors, picking
// ---------------------------------------------------------------------------

export interface RecorderLocatorSettings {
  preferredTestIdAttributes: string[]
  allowRoleLocators: boolean
  allowTextLocators: boolean
  allowCssFallback: boolean
}

export const DEFAULT_RECORDER_LOCATOR_SETTINGS: RecorderLocatorSettings = {
  preferredTestIdAttributes: ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa', 'data-e2e'],
  allowRoleLocators: true,
  allowTextLocators: true,
  allowCssFallback: true,
}

export interface RecorderStartOptions {
  /** Initial navigation; defaults to the workspace BASE_URL. */
  startUrl?: string
  /** Target scenario for insertion (context only; insertion is a store op). */
  scenarioId?: string
  /** Overrides workspace defaults for this session. */
  locatorSettings?: RecorderLocatorSettings
}

export interface RecorderSession {
  sessionId: string
  playwrightVersion: string
  browser: string
  startedAt: number
}

export interface RecorderStatus {
  sessionId: string
  phase: RecorderStatusPhase
  browserUrl?: string
  actionCount: number
}

export interface RecorderError {
  sessionId?: string
  code: RecorderErrorCode
  message: string
  recovery?: string
  /** True ⇒ session ended; captured actions preserved. */
  fatal: boolean
}

export interface LocatorValidationResult {
  unique: boolean
  matchedElements: number
  stillMatches: boolean
}

export interface PickRequest {
  purpose: PickPurpose
  /** For `retarget`: which action's target to replace. */
  actionId?: string
}

/** Request to add an explicit assertion (US4), built from a picked element. */
export interface RecorderAssertionRequest {
  /** One of the `assert*` action types. */
  type: RecordedActionType
  /** The element to assert on (absent for URL/title assertions). */
  target?: LocatorReference
  /** Expected value/fragment (text, value, count, URL fragment, title fragment). */
  value?: string
}

/** A non-binding assertion suggestion derived from a page-state change (US4). */
export interface AssertionSuggestion {
  id: string
  type: RecordedActionType
  label: string
  value?: string
  target?: LocatorReference
}

/** Pushed via `recorder:picked` after the user clicks in pick mode. */
export interface PickedElement {
  sessionId: string
  /** Correlates to the `recorder:pick` request that armed the picker. */
  pickId: string
  purpose: PickPurpose
  actionId?: string
  pageId: string
  fingerprint: ElementFingerprint
  locatorCandidates: LocatorCandidate[]
  /** True if the pick was cancelled — no element. */
  cancelled?: boolean
}
