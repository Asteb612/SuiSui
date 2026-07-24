import { randomUUID } from 'node:crypto'
import type {
  CatalogStep,
  RecordedAction,
  RecordedActionType,
  RecorderStartOptions,
  RecorderSession,
  RecorderStatus,
  RecorderStatusPhase,
  RecorderError,
  RecorderLocatorSettings,
  RecorderAssertionRequest,
  PickedElement,
  PickRequest,
  PickPurpose,
  LocatorReference,
  LocatorValidationResult,
  ElementFingerprint,
} from '@suisui/shared'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import type { AdapterEventHandlers, IRecorderAdapter } from './IRecorderAdapter'
import { PlaywrightRecorderAdapter } from './PlaywrightRecorderAdapter'
import { StepMatcherService } from './StepMatcherService'
import { LocatorService } from './LocatorService'
import { AiRecorderMatcher, validateAiSuggestion, type IRecorderAiMatcher } from './RecorderAiMatcher'
import { getStepCatalogService } from '../StepCatalogService'
import { getSettingsService } from '../SettingsService'
import { locatorToSelector, rawCandidateToLocator } from './locators'
import { isSensitiveField, secretReferenceName } from './secretDetection'
import { makeRecorderError } from './recorderErrors'
import type { RawRecordedAction, RawFingerprint, RawPickedElement } from './types'

/** Renderer-facing emitters wired by the IPC handler to `webContents.send`. */
export interface RecorderEmitters {
  onAction: (action: RecordedAction) => void
  onActionUpdated: (action: RecordedAction) => void
  onPicked: (picked: PickedElement) => void
  onStatus: (status: RecorderStatus) => void
  onError: (error: RecorderError) => void
}

interface ActiveSession {
  sessionId: string
  emitters: RecorderEmitters
  actionCount: number
  browserUrl?: string
  lastPageId?: string
  pendingPick?: { pickId: string; purpose: PickPurpose; actionId?: string }
}

export interface RecorderServiceDeps {
  adapter?: IRecorderAdapter
  matcher?: StepMatcherService
  locator?: LocatorService
  aiMatcher?: IRecorderAiMatcher
  loadCatalogSteps?: () => Promise<CatalogStep[]>
  loadLocatorSettings?: () => Promise<RecorderLocatorSettings>
}

/**
 * Orchestrates a recording session: owns the adapter + session state,
 * normalizes raw adapter events into serializable `@suisui/shared` types,
 * runs deterministic step matching, and pushes results to the renderer.
 * Singleton + constructor DI (Constitution IV).
 */
export class RecorderService {
  private readonly adapter: IRecorderAdapter
  private readonly matcher: StepMatcherService
  private readonly locator: LocatorService
  private readonly aiMatcher: IRecorderAiMatcher
  private readonly loadCatalogSteps: () => Promise<CatalogStep[]>
  private readonly loadLocatorSettings: () => Promise<RecorderLocatorSettings>
  private catalogSteps: CatalogStep[] = []
  private session: ActiveSession | null = null

  constructor(deps: RecorderServiceDeps = {}) {
    this.adapter = deps.adapter ?? new PlaywrightRecorderAdapter()
    this.matcher = deps.matcher ?? new StepMatcherService()
    this.locator = deps.locator ?? new LocatorService()
    this.aiMatcher = deps.aiMatcher ?? new AiRecorderMatcher()
    this.loadCatalogSteps = deps.loadCatalogSteps ?? defaultLoadCatalogSteps
    this.loadLocatorSettings =
      deps.loadLocatorSettings ??
      (async () => (await getSettingsService().get()).recorderLocatorSettings ?? DEFAULT_RECORDER_LOCATOR_SETTINGS)
  }

  async start(options: RecorderStartOptions, emitters: RecorderEmitters): Promise<RecorderSession> {
    if (this.session) await this.stop()
    const sessionId = randomUUID()
    const startedAt = Date.now()
    const active: ActiveSession = { sessionId, emitters, actionCount: 0 }
    this.session = active

    // Snapshot the catalog + locator settings so matching/scoring run
    // synchronously per action.
    this.catalogSteps = await this.loadCatalogSteps()
    this.matcher.setSteps(this.catalogSteps)
    this.locator.setSettings(options.locatorSettings ?? (await this.loadLocatorSettings()))

    const handlers: AdapterEventHandlers = {
      onAction: (raw) => this.handleRawAction(raw, false),
      onActionUpdated: (raw) => this.handleRawAction(raw, true),
      onPicked: (raw) => this.handleRawPicked(raw),
      onStatus: (s) => {
        if (s.url !== undefined) active.browserUrl = s.url
        this.emitStatus(s.phase)
      },
      onError: (e) =>
        emitters.onError(
          makeRecorderError(e.code, { message: e.message, recovery: e.recovery, fatal: e.fatal, sessionId })
        ),
    }

    try {
      const info = await this.adapter.start(options, handlers)
      return { sessionId, playwrightVersion: info.playwrightVersion, browser: info.browser, startedAt }
    } catch (err) {
      this.session = null
      throw err
    }
  }

  async stop(): Promise<void> {
    if (!this.session) return
    this.session = null
    await this.adapter.stop().catch(() => {})
  }

  async pause(): Promise<void> {
    this.requireSession()
    await this.adapter.pause()
  }

  async resume(): Promise<void> {
    this.requireSession()
    await this.adapter.resume()
  }

  async pick(request: PickRequest): Promise<string> {
    const session = this.requireSession()
    const pickId = randomUUID()
    session.pendingPick = { pickId, purpose: request.purpose, actionId: request.actionId }
    await this.adapter.pick(pickId)
    return pickId
  }

  async cancelPick(): Promise<void> {
    const session = this.requireSession()
    session.pendingPick = undefined
    await this.adapter.cancelPick()
  }

  async highlight(locator: LocatorReference): Promise<void> {
    this.requireSession()
    await this.adapter.highlight(locatorToSelector(locator))
  }

  async validateLocator(locator: LocatorReference): Promise<LocatorValidationResult> {
    this.requireSession()
    return this.adapter.validate(locatorToSelector(locator))
  }

  /** Build, match, and emit an explicit assertion action (US4). */
  addAssertion(request: RecorderAssertionRequest): void {
    const s = this.requireSession()
    const seq = s.actionCount
    const action: RecordedAction = {
      id: `rec-${seq}-${s.sessionId}`,
      sessionId: s.sessionId,
      seq,
      type: request.type,
      pageId: s.lastPageId ?? 'page',
      timestamp: Date.now(),
      label: buildAssertionLabel(request),
      status: 'draft',
      ...(request.target ? { selectedLocator: request.target } : {}),
      ...(request.value !== undefined ? { value: request.value } : {}),
    }
    const matched = this.matcher.match(action)
    action.match = matched.match
    action.matchAlternatives = matched.alternatives
    action.confidence = matched.match?.confidence
    action.status = matched.status
    s.actionCount = seq + 1
    s.emitters.onAction(action)
  }

  // --- internals ---------------------------------------------------------

  private requireSession(): ActiveSession {
    if (!this.session) throw new Error('No active recording session')
    return this.session
  }

  private emitStatus(phase: RecorderStatusPhase): void {
    const s = this.session
    if (!s) return
    s.emitters.onStatus({
      sessionId: s.sessionId,
      phase,
      browserUrl: s.browserUrl,
      actionCount: s.actionCount,
    })
  }

  private handleRawAction(raw: RawRecordedAction, updated: boolean): void {
    const s = this.session
    if (!s) return
    s.lastPageId = raw.pageGuid
    const action = normalizeRawAction(raw, s.sessionId)

    // Score candidates → ranked LocatorCandidate[]; the top-scored one becomes
    // the selected locator (used by matching below).
    if (raw.candidates?.length) {
      const candidates = this.locator.score(raw.candidates)
      if (candidates.length) {
        action.locatorCandidates = candidates
        action.selectedLocator = candidates[0]!.locator
      }
    }

    const matched = this.matcher.match(action)
    action.match = matched.match
    action.matchAlternatives = matched.alternatives
    action.confidence = matched.match?.confidence
    // A matched action whose best locator is unreliable still needs review.
    const poorLocator = (action.locatorCandidates?.[0]?.score ?? 100) < 40
    action.status = matched.status === 'matched' && poorLocator ? 'needs-review' : matched.status

    s.actionCount = Math.max(s.actionCount, raw.seq + 1)
    if (updated) s.emitters.onActionUpdated(action)
    else s.emitters.onAction(action)

    // Optional, flagged-off AI enrichment for unmatched/uncertain actions (US6).
    if (action.status === 'gap' || action.status === 'needs-review') {
      this.enrichWithAi(action)
    }
  }

  /**
   * Best-effort AI suggestion for a gap/needs-review action. Runs only when the
   * AI layer is enabled; validated + gated; NEVER auto-accepted (the action must
   * still be confirmed before insertion). Emits an update when it improves.
   */
  private enrichWithAi(action: RecordedAction): void {
    const sessionId = action.sessionId
    void (async () => {
      if (!(await this.aiMatcher.isEnabled())) return
      let suggestion
      try {
        suggestion = await this.aiMatcher.suggest({ action, candidateSteps: this.catalogSteps })
      } catch {
        return // AI unavailable/invalid → keep the deterministic result
      }
      const match = validateAiSuggestion(suggestion, this.catalogSteps)
      if (!match) return
      // Bail if the session ended or this action was already resolved by the user.
      if (this.session?.sessionId !== sessionId) return
      if (action.status === 'accepted' || action.match?.source === 'user') return
      action.match = match
      action.matchAlternatives = []
      action.confidence = match.confidence
      // ≥0.90 preselect (matched); 0.65–0.89 recommendation (needs-review).
      action.status = match.confidence >= 0.9 ? 'matched' : 'needs-review'
      this.session.emitters.onActionUpdated(action)
    })()
  }

  private handleRawPicked(raw: RawPickedElement): void {
    const s = this.session
    if (!s) return
    const pending = s.pendingPick
    const picked: PickedElement = {
      sessionId: s.sessionId,
      pickId: raw.pickId,
      purpose: pending?.purpose ?? 'retarget',
      actionId: pending?.actionId,
      pageId: raw.pageGuid,
      fingerprint: toFingerprint(raw.fingerprint),
      locatorCandidates: this.locator.score(raw.candidates),
      cancelled: raw.cancelled,
    }
    s.pendingPick = undefined
    s.emitters.onPicked(picked)
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers (locator scoring is enriched in US2)
// ---------------------------------------------------------------------------

const PLAYWRIGHT_ACTION_TO_TYPE: Record<string, RecordedActionType> = {
  openPage: 'navigate',
  navigate: 'navigate',
  click: 'click',
  fill: 'fill',
  select: 'select',
  check: 'check',
  uncheck: 'uncheck',
  press: 'press',
  setInputFiles: 'upload',
  assertVisible: 'assertVisible',
  assertText: 'assertText',
  assertValue: 'assertValue',
  assertChecked: 'assertChecked',
}

export function normalizeRawAction(raw: RawRecordedAction, sessionId: string): RecordedAction {
  const a = raw.action
  const type: RecordedActionType =
    a.name === 'click' && (a.clickCount ?? 1) >= 2 ? 'doubleClick' : PLAYWRIGHT_ACTION_TO_TYPE[a.name] ?? 'click'
  const fingerprint = raw.fingerprint ? toFingerprint(raw.fingerprint) : undefined
  // The child redacts at the source (raw.secret); we also classify defensively
  // so a sensitive field is never captured in clear text even if the child missed it.
  const isSecret = raw.secret === true || (fingerprint ? isSensitiveField(fingerprint) : false)
  const value = isSecret ? undefined : rawValue(type, a)
  const secretRef = isSecret ? secretReferenceName(fingerprint) : undefined
  const label = buildLabel(type, a, fingerprint, isSecret)
  const selectedLocator = pickSelectedLocator(raw)

  return {
    id: `rec-${raw.seq}-${sessionId}`,
    sessionId,
    seq: raw.seq,
    type,
    pageId: raw.pageGuid,
    timestamp: Date.now(),
    label,
    ...(value !== undefined ? { value } : {}),
    ...(isSecret ? { secret: true } : {}),
    ...(secretRef ? { secretRef } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    ...(selectedLocator ? { selectedLocator } : {}),
    status: 'draft',
    ...(raw.code ? { rawCode: raw.code } : {}),
  }
}

/** Best-guess target: first raw candidate (if any) else the raw Playwright selector. */
function pickSelectedLocator(raw: RawRecordedAction): LocatorReference | undefined {
  const first = raw.candidates?.[0]
  if (first) {
    const ref = rawCandidateToLocator(first)
    if (ref) return ref
  }
  return raw.action.selector ? { type: 'css', value: raw.action.selector } : undefined
}

function rawValue(type: RecordedActionType, a: RawRecordedAction['action']): string | undefined {
  switch (type) {
    case 'navigate':
      return a.url
    case 'fill':
      return a.text
    case 'select':
      return a.options?.join(', ')
    case 'press':
      return a.key
    case 'upload':
      return a.files?.[0]
    default:
      return undefined
  }
}

function buildLabel(
  type: RecordedActionType,
  a: RawRecordedAction['action'],
  fp?: ElementFingerprint,
  isSecret = false
): string {
  const target = fp ? elementName(fp) : a.selector ?? 'element'
  switch (type) {
    case 'navigate':
      return `Open "${a.url ?? ''}"`
    case 'fill':
      return isSecret ? `Fill a protected value in ${target}` : `Fill "${a.text ?? ''}" in ${target}`
    case 'select':
      return `Select "${a.options?.join(', ') ?? ''}" in ${target}`
    case 'check':
      return `Check ${target}`
    case 'uncheck':
      return `Uncheck ${target}`
    case 'press':
      return `Press "${a.key ?? ''}"`
    case 'upload':
      return `Upload "${a.files?.[0] ?? ''}" to ${target}`
    case 'doubleClick':
      return `Double-click ${target}`
    default:
      return `Click ${target}`
  }
}

function buildAssertionLabel(req: RecorderAssertionRequest): string {
  const target = req.target ? describeLocator(req.target) : 'the page'
  switch (req.type) {
    case 'assertVisible':
      return `Verify that ${target} is visible`
    case 'assertHidden':
      return `Verify that ${target} is hidden`
    case 'assertText':
      return `Verify that ${target} contains "${req.value ?? ''}"`
    case 'assertValue':
      return `Verify that ${target} has value "${req.value ?? ''}"`
    case 'assertChecked':
      return `Verify that ${target} is checked`
    case 'assertEnabled':
      return `Verify that ${target} is enabled`
    case 'assertCount':
      return `Verify there are ${req.value ?? ''} ${target}`
    case 'assertUrl':
      return `Verify the URL contains "${req.value ?? ''}"`
    case 'assertTitle':
      return `Verify the page title contains "${req.value ?? ''}"`
    default:
      return 'Verify'
  }
}

function describeLocator(locator: LocatorReference): string {
  switch (locator.type) {
    case 'role':
      return locator.name ? `"${locator.name}"` : `the ${locator.role}`
    case 'testId':
    case 'label':
    case 'placeholder':
    case 'text':
    case 'name':
    case 'id':
    case 'css':
      return `"${locator.value}"`
  }
}

/** Human-readable element name (locator-scoring §7 order). */
export function elementName(fp: ElementFingerprint): string {
  if (fp.accessibleName) return `"${fp.accessibleName}"`
  if (fp.label) return `the ${fp.label} field`
  if (fp.ariaLabel) return `"${fp.ariaLabel}"`
  if (fp.text) return `"${fp.text}"`
  if (fp.placeholder) return `"${fp.placeholder}"`
  const testId = Object.values(fp.testAttributes)[0]
  if (testId) return `"${deslugify(testId)}"`
  return `the ${fp.tagName} element`
}

function deslugify(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function toFingerprint(raw: RawFingerprint): ElementFingerprint {
  return {
    tagName: raw.tagName,
    ...(raw.role ? { role: raw.role } : {}),
    ...(raw.accessibleName ? { accessibleName: raw.accessibleName } : {}),
    ...(raw.label ? { label: raw.label } : {}),
    ...(raw.placeholder ? { placeholder: raw.placeholder } : {}),
    testAttributes: raw.testAttributes ?? {},
    ...(raw.id ? { id: raw.id } : {}),
    ...(raw.name ? { name: raw.name } : {}),
    ...(raw.ariaLabel ? { ariaLabel: raw.ariaLabel } : {}),
    ...(raw.text ? { text: raw.text } : {}),
    ...(raw.nearbyText ? { nearbyText: raw.nearbyText } : {}),
    ...(raw.inputType ? { inputType: raw.inputType } : {}),
    ...(raw.autocomplete ? { autocomplete: raw.autocomplete } : {}),
  }
}

/** Prefer the cached catalog; generate it once if the recorder is the first consumer. */
async function defaultLoadCatalogSteps(): Promise<CatalogStep[]> {
  const service = getStepCatalogService()
  const cached = await service.getCached()
  if (cached) return cached.steps
  try {
    return (await service.generate()).steps
  } catch {
    return []
  }
}

let instance: RecorderService | null = null

export function getRecorderService(): RecorderService {
  if (!instance) instance = new RecorderService()
  return instance
}

export function setRecorderService(service: RecorderService): void {
  instance = service
}

export function resetRecorderService(): void {
  instance = null
}
