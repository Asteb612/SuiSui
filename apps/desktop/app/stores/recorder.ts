import { defineStore } from 'pinia'
import type {
  RecordedAction,
  RecordedActionType,
  RecorderStatus,
  RecorderStatusPhase,
  RecorderError,
  PickedElement,
  StepMatch,
  RecorderStartOptions,
  LocatorReference,
  AssertionSuggestion,
} from '@suisui/shared'
import { locatorToPageSelector } from '@suisui/shared'
import { useScenarioStore } from './scenario'
import { useStepsStore } from './steps'
import { proposeLoginGrouping, stepStubFor, type GroupingProposal, type StepStubRequest } from '~/utils/recorderGrouping'

/** Re-fill an action's matched target argument after its locator changes. */
function refillTargetArg(action: RecordedAction): void {
  const name = action.match?.targetArgName
  if (!name || !action.selectedLocator) return
  const arg = action.match!.args.find((a) => a.name === name)
  if (arg) arg.value = locatorToPageSelector(action.selectedLocator)
}

/** Strip Vue reactivity so a value is structured-cloneable across IPC. */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Normalize free-form user input into a committable secret reference. */
function toSecretRef(input: string): string {
  const inner = input
    .replace(/[<>]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return `<${inner || 'SECRET'}>`
}

/** Unsubscribe handles for the active session's event listeners (one session at a time). */
let subscriptions: Array<() => void> = []

function teardownSubscriptions(): void {
  for (const off of subscriptions) off()
  subscriptions = []
}

interface RecorderState {
  sessionId: string | null
  status: RecorderStatusPhase
  actions: RecordedAction[]
  selectedActionId: string | null
  browserUrl: string | null
  error: string | null
  playwrightVersion: string | null
  browser: string | null
  /** Element picked while in assertion mode, awaiting an assertion-type choice. */
  pendingAssertion: PickedElement | null
  /** Non-binding assertion suggestions from a page-state change. */
  suggestions: AssertionSuggestion[]
  /** True once the user dismissed the current grouping proposal. */
  dismissedGrouping: boolean
}

export const useRecorderStore = defineStore('recorder', {
  state: (): RecorderState => ({
    sessionId: null,
    status: 'idle',
    actions: [],
    selectedActionId: null,
    browserUrl: null,
    error: null,
    playwrightVersion: null,
    browser: null,
    pendingAssertion: null,
    suggestions: [],
    dismissedGrouping: false,
  }),

  getters: {
    selectedAction: (state): RecordedAction | null =>
      state.actions.find((a) => a.id === state.selectedActionId) ?? null,
    /** Enabled actions that carry a usable step match (insertable into a scenario). */
    insertableActions: (state): RecordedAction[] =>
      state.actions.filter((a) => !a.disabled && a.status !== 'gap' && a.match),
    gapCount: (state): number => state.actions.filter((a) => a.status === 'gap').length,
    isRecording: (state): boolean => state.status === 'recording',
    /** A deterministic login-sequence grouping proposal, unless dismissed. */
    groupingProposal(state): GroupingProposal | null {
      return state.dismissedGrouping ? null : proposeLoginGrouping(state.actions)
    },
  },

  actions: {
    // --- session lifecycle ------------------------------------------------

    async startRecording(options: RecorderStartOptions = {}) {
      if (this.sessionId) await this.stopRecording()
      this.reset()
      this.status = 'starting'

      const api = window.api.recorder
      subscriptions = [
        api.onAction((a) => this.ingestAction(a)),
        api.onActionUpdated((a) => this.ingestAction(a)),
        api.onPicked((p) => this.applyPicked(p)),
        api.onStatus((s) => this.applyStatus(s)),
        api.onError((e) => this.applyError(e)),
      ]

      try {
        const { session } = await api.start(options)
        this.sessionId = session.sessionId
        this.playwrightVersion = session.playwrightVersion
        this.browser = session.browser
      } catch (err) {
        this.applyError({
          code: 'ADAPTER_CRASHED',
          message: err instanceof Error ? err.message : String(err),
          fatal: true,
        })
        teardownSubscriptions()
        this.status = 'error'
      }
    },

    async stopRecording() {
      try {
        await window.api.recorder.stop()
      } finally {
        teardownSubscriptions()
        this.sessionId = null
        this.status = 'idle'
      }
    },

    async pauseRecording() {
      await window.api.recorder.pause()
    },

    async resumeRecording() {
      await window.api.recorder.resume()
    },

    // --- event ingestion (also called directly in unit tests) -------------

    ingestAction(action: RecordedAction) {
      const index = this.actions.findIndex((a) => a.id === action.id)
      if (index === -1) this.actions.push(action)
      else this.actions[index] = action
    },

    applyStatus(status: RecorderStatus) {
      this.status = status.phase
      this.browserUrl = status.browserUrl ?? this.browserUrl
    },

    applyError(error: RecorderError) {
      this.error = error.message
      if (error.fatal) this.status = 'error'
    },

    applyPicked(picked: PickedElement) {
      if (picked.cancelled) return
      if (picked.purpose === 'assert') {
        // Hold the picked element until the user chooses an assertion type.
        this.pendingAssertion = picked
        return
      }
      if (picked.purpose !== 'retarget' || !picked.actionId) return
      const action = this.actions.find((a) => a.id === picked.actionId)
      if (!action) return
      action.locatorCandidates = picked.locatorCandidates
      action.selectedLocator = picked.locatorCandidates[0]?.locator ?? action.selectedLocator
      refillTargetArg(action)
    },

    // --- action editing ---------------------------------------------------

    selectAction(id: string | null) {
      this.selectedActionId = id
    },

    removeAction(id: string) {
      this.actions = this.actions.filter((a) => a.id !== id)
      if (this.selectedActionId === id) this.selectedActionId = null
    },

    toggleDisabled(id: string) {
      const action = this.actions.find((a) => a.id === id)
      if (action) action.disabled = !action.disabled
    },

    moveAction(id: string, direction: -1 | 1) {
      const index = this.actions.findIndex((a) => a.id === id)
      const target = index + direction
      if (index === -1 || target < 0 || target >= this.actions.length) return
      const [moved] = this.actions.splice(index, 1)
      this.actions.splice(target, 0, moved!)
    },

    /** Switch an action's matched step to one of its alternatives (source becomes 'user'). */
    selectStepMatch(actionId: string, definitionId: string) {
      const action = this.actions.find((a) => a.id === actionId)
      if (!action) return
      const chosen = [action.match, ...(action.matchAlternatives ?? [])].find(
        (m): m is StepMatch => !!m && m.definitionId === definitionId
      )
      if (!chosen) return
      const previous = action.match
      action.match = { ...chosen, source: 'user' }
      action.status = 'matched'
      action.matchAlternatives = [previous, ...(action.matchAlternatives ?? [])].filter(
        (m): m is StepMatch => !!m && m.definitionId !== definitionId
      )
    },

    // --- locator selection & picking --------------------------------------

    /** Choose a different candidate locator for an action; re-fills the target arg. */
    selectLocator(actionId: string, index: number) {
      const action = this.actions.find((a) => a.id === actionId)
      const candidate = action?.locatorCandidates?.[index]
      if (!action || !candidate) return
      action.selectedLocator = candidate.locator
      refillTargetArg(action)
    },

    /** Arm SuiSui's own picker to retarget an action by clicking a new element. */
    async pickForRetarget(actionId: string) {
      await window.api.recorder.pick({ purpose: 'retarget', actionId })
    },

    async highlightLocator(locator: LocatorReference) {
      await window.api.recorder.highlight(toPlain(locator))
    },

    async cancelPick() {
      await window.api.recorder.cancelPick()
    },

    /** Rename a captured secret's committable reference; propagates to the step arg. */
    renameSecretRef(actionId: string, name: string) {
      const action = this.actions.find((a) => a.id === actionId)
      if (!action || !action.secret) return
      const ref = toSecretRef(name)
      action.secretRef = ref
      const argName = action.match?.valueArgName
      const arg = argName ? action.match?.args.find((a) => a.name === argName) : undefined
      if (arg) arg.value = ref
    },

    // --- assertions -------------------------------------------------------

    /** Arm the picker to choose an element to assert on. */
    async enterAssertMode() {
      await window.api.recorder.pick({ purpose: 'assert' })
    },

    cancelAssertion() {
      this.pendingAssertion = null
    },

    /** Create an assertion (main builds + matches it; it returns via onAction). */
    async addAssertion(type: RecordedActionType, value?: string, target?: LocatorReference) {
      const finalTarget = target ?? this.pendingAssertion?.locatorCandidates[0]?.locator
      await window.api.recorder.addAssertion(
        toPlain({
          type,
          ...(finalTarget ? { target: finalTarget } : {}),
          ...(value !== undefined ? { value } : {}),
        })
      )
      this.pendingAssertion = null
    },

    applySuggestions(suggestions: AssertionSuggestion[]) {
      this.suggestions = suggestions
    },

    async acceptSuggestion(id: string) {
      const suggestion = this.suggestions.find((s) => s.id === id)
      if (!suggestion) return
      await this.addAssertion(suggestion.type, suggestion.value, suggestion.target)
      this.suggestions = this.suggestions.filter((s) => s.id !== id)
    },

    rejectSuggestion(id: string) {
      this.suggestions = this.suggestions.filter((s) => s.id !== id)
    },

    // --- grouping & gap handoff -------------------------------------------

    dismissGrouping() {
      this.dismissedGrouping = true
    },

    /** Collapse a detected login sequence into a single profile-style login step. */
    applyGrouping() {
      const proposal = proposeLoginGrouping(this.actions)
      if (!proposal) return
      const loginStep = useStepsStore().catalog.find(
        (s) => s.keyword === proposal.keyword && s.pattern.source === proposal.pattern
      )
      if (!loginStep) return // workspace lacks the login step — cannot collapse
      const firstIndex = this.actions.findIndex((a) => a.id === proposal.actionIds[0])
      const first = this.actions[firstIndex]
      if (firstIndex === -1 || !first) return

      const grouped: RecordedAction = {
        id: `group-${first.id}`,
        sessionId: first.sessionId,
        seq: first.seq,
        type: 'navigate',
        pageId: first.pageId,
        timestamp: first.timestamp,
        label: proposal.label,
        status: 'matched',
        match: {
          definitionId: loginStep.id,
          keyword: proposal.keyword,
          pattern: proposal.pattern,
          args: proposal.args,
          confidence: 1,
          source: 'user',
          ...(loginStep.source ? { definitionLocation: loginStep.source } : {}),
        },
        matchAlternatives: [],
      }
      this.actions = this.actions.filter((a) => !proposal.actionIds.includes(a.id))
      this.actions.splice(firstIndex, 0, grouped)
      this.dismissedGrouping = true
    },

    /** A step-definition stub for a gap action (handoff to missing-step generation, #100). */
    stubRequestFor(actionId: string): StepStubRequest | null {
      const action = this.actions.find((a) => a.id === actionId)
      if (!action || action.status !== 'gap') return null
      return stepStubFor(action)
    },

    // --- insertion into the scenario --------------------------------------

    /** Insert every enabled, matched action (in order) into the active scenario. */
    insertAcceptedActionsIntoScenario(): number {
      const scenario = useScenarioStore()
      let inserted = 0
      for (const action of this.insertableActions) {
        const match = action.match
        if (!match) continue
        scenario.addRecordedStep(match.keyword, match.pattern, match.args)
        action.status = 'accepted'
        inserted++
      }
      return inserted
    },

    reset() {
      this.actions = []
      this.selectedActionId = null
      this.browserUrl = null
      this.error = null
      this.pendingAssertion = null
      this.suggestions = []
      this.dismissedGrouping = false
    },
  },
})
