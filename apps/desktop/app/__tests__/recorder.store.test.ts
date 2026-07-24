import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AssertionSuggestion, CatalogStep, RecordedAction, StepMatch } from '@suisui/shared'
import { useRecorderStore } from '../stores/recorder'
import { useScenarioStore } from '../stores/scenario'
import { useStepsStore } from '../stores/steps'

const LOGIN_STEP: CatalogStep = {
  id: 's-login',
  keyword: 'Given',
  pattern: { kind: 'cucumber', source: 'I am logged in as {string}' },
  tags: [],
  parameters: [{ index: 0, name: 'username', type: 'string', required: true, origin: 'pattern', precision: 'inferred' }],
  fixtures: [],
  source: { file: 'features/steps/generic.steps.ts', line: 2, column: 1 },
  origin: 'pattern',
  precision: 'inferred',
  diagnostics: [],
}

function match(definitionId: string, keyword: StepMatch['keyword'], pattern: string, args: StepMatch['args']): StepMatch {
  return { definitionId, keyword, pattern, args, confidence: 1, source: 'deterministic' }
}

function action(over: Partial<RecordedAction> & Pick<RecordedAction, 'id' | 'type' | 'status'>): RecordedAction {
  return { sessionId: 's', seq: 0, pageId: 'p', timestamp: 0, label: 'x', ...over }
}

const NAV = action({
  id: 'rec-0-s',
  seq: 0,
  type: 'navigate',
  status: 'matched',
  label: 'Open "/login"',
  match: match('s-nav', 'Given', 'I am on the {string} page', [{ name: 'pageName', value: '/login', type: 'string' }]),
})
const CLICK = action({
  id: 'rec-1-s',
  seq: 1,
  type: 'click',
  status: 'matched',
  label: 'Click "Sign in"',
  match: match('s-click', 'When', 'I click on {string}', [
    { name: 'element', value: '[data-testid="login-submit"]', type: 'string' },
  ]),
})
const GAP = action({ id: 'rec-2-s', seq: 2, type: 'press', status: 'gap', label: 'Press "Tab"' })

describe('recorder store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const scenario = useScenarioStore()
    scenario.scenarios = [{ name: 'Login', steps: [] }]
    scenario.activeScenarioIndex = 0
  })

  it('upserts actions by id (coalesced updates replace, not duplicate)', () => {
    const rec = useRecorderStore()
    rec.ingestAction(CLICK)
    rec.ingestAction({ ...CLICK, label: 'Click "Sign in" (updated)' })
    expect(rec.actions).toHaveLength(1)
    expect(rec.actions[0]!.label).toBe('Click "Sign in" (updated)')
  })

  it('reports gaps and inserts only matched, enabled actions in order', () => {
    const rec = useRecorderStore()
    rec.ingestAction(NAV)
    rec.ingestAction(CLICK)
    rec.ingestAction(GAP)

    expect(rec.actions).toHaveLength(3)
    expect(rec.gapCount).toBe(1)
    expect(rec.insertableActions.map((a) => a.id)).toEqual(['rec-0-s', 'rec-1-s'])

    const inserted = rec.insertAcceptedActionsIntoScenario()
    expect(inserted).toBe(2)

    const steps = useScenarioStore().scenarios[0]!.steps
    expect(steps.map((s) => ({ keyword: s.keyword, pattern: s.pattern, value: s.args[0]!.value }))).toEqual([
      { keyword: 'Given', pattern: 'I am on the {string} page', value: '/login' },
      { keyword: 'When', pattern: 'I click on {string}', value: '[data-testid="login-submit"]' },
    ])
    // Inserted actions are marked accepted; the gap is untouched.
    expect(rec.actions.find((a) => a.id === 'rec-1-s')!.status).toBe('accepted')
    expect(rec.actions.find((a) => a.id === 'rec-2-s')!.status).toBe('gap')
  })

  it('skips a disabled action on insert', () => {
    const rec = useRecorderStore()
    rec.ingestAction(NAV)
    rec.ingestAction(CLICK)
    rec.toggleDisabled('rec-1-s')
    expect(rec.insertAcceptedActionsIntoScenario()).toBe(1)
    expect(useScenarioStore().scenarios[0]!.steps).toHaveLength(1)
  })

  it('reorders and removes actions', () => {
    const rec = useRecorderStore()
    rec.ingestAction(NAV)
    rec.ingestAction(CLICK)
    rec.moveAction('rec-1-s', -1)
    expect(rec.actions.map((a) => a.id)).toEqual(['rec-1-s', 'rec-0-s'])
    rec.removeAction('rec-0-s')
    expect(rec.actions.map((a) => a.id)).toEqual(['rec-1-s'])
  })

  it('switches to an alternative step match (source becomes user)', () => {
    const rec = useRecorderStore()
    rec.ingestAction({
      ...CLICK,
      matchAlternatives: [match('s-click-2', 'When', 'I tap {string}', [{ name: 'element', value: 'x', type: 'string' }])],
    })
    rec.selectStepMatch('rec-1-s', 's-click-2')
    const a = rec.actions[0]!
    expect(a.match?.definitionId).toBe('s-click-2')
    expect(a.match?.source).toBe('user')
    expect(a.matchAlternatives?.map((m) => m.definitionId)).toEqual(['s-click'])
  })

  it('re-fills the target arg when a different locator candidate is chosen', () => {
    const rec = useRecorderStore()
    const m = match('s-click', 'When', 'I click on {string}', [
      { name: 'element', value: '[data-testid="login-submit"]', type: 'string' },
    ])
    m.targetArgName = 'element'
    rec.ingestAction({
      ...CLICK,
      selectedLocator: { type: 'testId', attribute: 'data-testid', value: 'login-submit' },
      locatorCandidates: [
        {
          locator: { type: 'testId', attribute: 'data-testid', value: 'login-submit' },
          score: 100,
          reliability: 'excellent',
          unique: true,
          matchedElements: 1,
          reasons: [],
          warnings: [],
        },
        {
          locator: { type: 'text', value: 'Sign in' },
          score: 50,
          reliability: 'fair',
          unique: true,
          matchedElements: 1,
          reasons: [],
          warnings: [],
        },
      ],
      match: m,
    })

    rec.selectLocator('rec-1-s', 1)
    const a = rec.actions[0]!
    expect(a.selectedLocator).toEqual({ type: 'text', value: 'Sign in' })
    expect(a.match?.args[0]?.value).toBe('text=Sign in')
  })

  it('renames a secret reference and propagates it to the value arg', () => {
    const rec = useRecorderStore()
    const m = match('s-fill', 'When', 'I fill {string} with {string}', [
      { name: 'field', value: 'internal:label="Password"i', type: 'string' },
      { name: 'value', value: '<PASSWORD>', type: 'string' },
    ])
    m.valueArgName = 'value'
    rec.ingestAction(
      action({ id: 'rec-3-s', seq: 3, type: 'fill', status: 'matched', secret: true, secretRef: '<PASSWORD>', match: m })
    )

    rec.renameSecretRef('rec-3-s', 'login pwd')
    const a = rec.actions[0]!
    expect(a.secretRef).toBe('<LOGIN_PWD>')
    expect(a.match?.args[1]?.value).toBe('<LOGIN_PWD>')
  })

  it('accepts a suggestion (creates the assertion) and rejects another', async () => {
    const addAssertion = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { api: { recorder: { addAssertion: typeof addAssertion } } }).api = {
      recorder: { addAssertion },
    }
    const rec = useRecorderStore()
    const suggestions: AssertionSuggestion[] = [
      { id: 'assertUrl:/dashboard', type: 'assertUrl', value: '/dashboard', label: 'Verify the URL contains "/dashboard"' },
      { id: 'assertTitle:Home', type: 'assertTitle', value: 'Home', label: 'Verify the page title contains "Home"' },
    ]
    rec.applySuggestions(suggestions)
    expect(rec.suggestions).toHaveLength(2)

    await rec.acceptSuggestion('assertUrl:/dashboard')
    expect(addAssertion).toHaveBeenCalledWith({ type: 'assertUrl', value: '/dashboard' })
    expect(rec.suggestions.map((s) => s.id)).toEqual(['assertTitle:Home'])

    rec.rejectSuggestion('assertTitle:Home')
    expect(rec.suggestions).toHaveLength(0)
  })

  it('collapses a detected login sequence into a single login step', () => {
    useStepsStore().catalog = [LOGIN_STEP]
    const rec = useRecorderStore()
    rec.ingestAction(action({ id: 'a1', type: 'fill', status: 'matched', value: 'arthur@example.com' }))
    rec.ingestAction(action({ id: 'a2', type: 'fill', status: 'matched', secret: true, secretRef: '<PASSWORD>' }))
    rec.ingestAction(action({ id: 'a3', type: 'click', status: 'matched' }))

    expect(rec.groupingProposal).not.toBeNull()
    rec.applyGrouping()

    expect(rec.actions).toHaveLength(1)
    expect(rec.actions[0]).toMatchObject({
      status: 'matched',
      match: { definitionId: 's-login', pattern: 'I am logged in as {string}', source: 'user' },
    })
    expect(rec.actions[0]!.match?.args[0]?.value).toBe('arthur@example.com')
    expect(rec.groupingProposal).toBeNull() // dismissed after applying
  })

  it('inserts the full quickstart login flow with no cleartext secret (SC-004/SC-005)', () => {
    const rec = useRecorderStore()
    rec.ingestAction(
      action({
        id: 'q0',
        seq: 0,
        type: 'navigate',
        status: 'matched',
        match: match('s-nav', 'Given', 'I am on the {string} page', [{ name: 'pageName', value: '/login', type: 'string' }]),
      })
    )
    rec.ingestAction(
      action({
        id: 'q1',
        seq: 1,
        type: 'fill',
        status: 'matched',
        match: match('s-fill', 'When', 'I fill {string} with {string}', [
          { name: 'field', value: 'internal:label="Email"i', type: 'string' },
          { name: 'value', value: 'arthur@example.com', type: 'string' },
        ]),
      })
    )
    rec.ingestAction(
      action({
        id: 'q2',
        seq: 2,
        type: 'fill',
        status: 'matched',
        secret: true,
        secretRef: '<PASSWORD>',
        match: match('s-fill', 'When', 'I fill {string} with {string}', [
          { name: 'field', value: 'internal:label="Password"i', type: 'string' },
          { name: 'value', value: '<PASSWORD>', type: 'string' },
        ]),
      })
    )
    rec.ingestAction(
      action({
        id: 'q3',
        seq: 3,
        type: 'click',
        status: 'matched',
        match: match('s-click', 'When', 'I click on {string}', [
          { name: 'element', value: '[data-testid="login-submit"]', type: 'string' },
        ]),
      })
    )

    expect(rec.insertAcceptedActionsIntoScenario()).toBe(4)
    const steps = useScenarioStore().scenarios[0]!.steps
    expect(steps.map((s) => `${s.keyword} ${s.pattern}`)).toEqual([
      'Given I am on the {string} page',
      'When I fill {string} with {string}',
      'When I fill {string} with {string}',
      'When I click on {string}',
    ])
    // The password step commits the reference, never the typed value.
    expect(steps[2]!.args[1]!.value).toBe('<PASSWORD>')
    expect(JSON.stringify(steps)).not.toContain('hunter')
  })

  it('produces a step stub for a gap action', () => {
    const rec = useRecorderStore()
    rec.ingestAction(action({ id: 'g1', type: 'doubleClick', status: 'gap', label: 'Double-click "Row"' }))
    const stub = rec.stubRequestFor('g1')
    expect(stub?.pattern).toBe('I double-click {string}')
    expect(stub?.snippet).toContain('async ({ page })')
    // non-gap actions produce nothing
    rec.ingestAction(NAV)
    expect(rec.stubRequestFor('rec-0-s')).toBeNull()
  })
})
