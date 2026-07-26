import { describe, expect, it, vi } from 'vitest'
import { RecorderService, type RecorderEmitters } from '../../services/recorder/RecorderService'
import { AssertionSuggestionService } from '../../services/recorder/AssertionSuggestionService'
import { FakeRecorderAdapter } from '../../services/recorder/FakeRecorderAdapter'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import type { CatalogParameter, CatalogStep, CatalogStepKeyword, RecordedAction, ParameterType } from '@suisui/shared'

function param(name: string, type: ParameterType = 'string'): CatalogParameter {
  return { index: 0, name, type, required: true, origin: 'pattern', precision: 'inferred' }
}
function step(id: string, keyword: CatalogStepKeyword, source: string, params: CatalogParameter[]): CatalogStep {
  return {
    id,
    keyword,
    pattern: { kind: 'cucumber', source },
    tags: [],
    parameters: params,
    fixtures: [],
    source: { file: 'features/steps/generic.steps.ts', line: 1, column: 1 },
    origin: 'pattern',
    precision: 'inferred',
    diagnostics: [],
  }
}

const CATALOG: CatalogStep[] = [
  step('a-visible', 'Then', 'the element {string} should be visible', [param('selector')]),
  step('a-text', 'Then', 'the element {string} should contain the text {string}', [param('selector'), param('text')]),
  step('a-count', 'Then', 'there should be {int} {string} elements', [param('count', 'int'), param('selector')]),
  step('a-url', 'Then', 'the URL should contain {string}', [param('fragment')]),
]

function spyEmitters(): RecorderEmitters {
  return { onAction: vi.fn(), onActionUpdated: vi.fn(), onPicked: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
}

async function activeService() {
  const service = new RecorderService({
    adapter: new FakeRecorderAdapter(),
    loadCatalogSteps: async () => CATALOG,
    loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS,
  })
  const emitters = spyEmitters()
  await service.start({}, emitters)
  return { service, emitters }
}

function lastAction(emitters: RecorderEmitters): RecordedAction {
  const calls = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls
  return calls[calls.length - 1]![0]
}

describe('RecorderService.addAssertion (full set → generic steps)', () => {
  it('assertVisible → element-visible step with the target selector', async () => {
    const { service, emitters } = await activeService()
    service.addAssertion({ type: 'assertVisible', target: { type: 'testId', attribute: 'data-testid', value: 'login-submit' } })
    const a = lastAction(emitters)
    expect(a.type).toBe('assertVisible')
    expect(a.status).toBe('matched')
    expect(a.match?.pattern).toBe('the element {string} should be visible')
    expect(a.match?.args).toEqual([{ name: 'selector', value: '[data-testid="login-submit"]', type: 'string' }])
    expect(a.label).toBe('Verify that "login-submit" is visible')
  })

  it('assertText → element + expected text', async () => {
    const { service, emitters } = await activeService()
    service.addAssertion({ type: 'assertText', target: { type: 'css', value: '.banner' }, value: 'Welcome' })
    const a = lastAction(emitters)
    expect(a.match?.pattern).toBe('the element {string} should contain the text {string}')
    expect(a.match?.args).toEqual([
      { name: 'selector', value: '.banner', type: 'string' },
      { name: 'text', value: 'Welcome', type: 'string' },
    ])
  })

  it('assertCount → count (int) + element', async () => {
    const { service, emitters } = await activeService()
    service.addAssertion({ type: 'assertCount', target: { type: 'css', value: '.item' }, value: '3' })
    const a = lastAction(emitters)
    expect(a.match?.args).toEqual([
      { name: 'count', value: '3', type: 'int' },
      { name: 'selector', value: '.item', type: 'string' },
    ])
  })

  it('assertUrl → page-level check, no target', async () => {
    const { service, emitters } = await activeService()
    service.addAssertion({ type: 'assertUrl', value: '/dashboard' })
    const a = lastAction(emitters)
    expect(a.type).toBe('assertUrl')
    expect(a.match?.pattern).toBe('the URL should contain {string}')
    expect(a.match?.args).toEqual([{ name: 'fragment', value: '/dashboard', type: 'string' }])
    expect(a.label).toBe('Verify the URL contains "/dashboard"')
  })
})

describe('RecorderService in-browser assertions (overlay → onAssert)', () => {
  async function assertService() {
    const adapter = new FakeRecorderAdapter()
    const service = new RecorderService({
      adapter,
      loadCatalogSteps: async () => CATALOG,
      loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS,
    })
    const emitters = spyEmitters()
    await service.start({}, emitters)
    return { adapter, emitters }
  }

  it('scores the picked candidates and emits a matched assertion via onAction', async () => {
    const { adapter, emitters } = await assertService()
    adapter.emitAssert({
      assertType: 'assertText',
      value: 'Welcome back',
      fingerprint: { tagName: 'h1', testAttributes: { 'data-testid': 'welcome' }, text: 'Welcome back' },
      candidates: [{ kind: 'testId', attribute: 'data-testid', value: 'welcome', matchedElements: 1 }],
    })
    const a = lastAction(emitters)
    expect(a.type).toBe('assertText')
    expect(a.status).toBe('matched')
    expect(a.selectedLocator).toEqual({ type: 'testId', attribute: 'data-testid', value: 'welcome' })
    expect(a.locatorCandidates?.length).toBeGreaterThan(0)
    expect(a.match?.args).toEqual([
      { name: 'selector', value: '[data-testid="welcome"]', type: 'string' },
      { name: 'text', value: 'Welcome back', type: 'string' },
    ])
  })

  it('assertVisible from the overlay (no value) matches the element-visible step', async () => {
    const { adapter, emitters } = await assertService()
    adapter.emitAssert({
      assertType: 'assertVisible',
      fingerprint: { tagName: 'button' },
      candidates: [{ kind: 'testId', attribute: 'data-testid', value: 'go', matchedElements: 1 }],
    })
    const a = lastAction(emitters)
    expect(a.type).toBe('assertVisible')
    expect(a.match?.pattern).toBe('the element {string} should be visible')
    expect(a.selectedLocator).toEqual({ type: 'testId', attribute: 'data-testid', value: 'go' })
  })
})

describe('AssertionSuggestionService', () => {
  const svc = new AssertionSuggestionService()

  it('suggests URL + title checks when both change', () => {
    const s = svc.suggest({ url: 'https://app/login', title: 'Login' }, { url: 'https://app/dashboard', title: 'Dashboard' })
    expect(s.map((x) => x.type)).toEqual(['assertUrl', 'assertTitle'])
    expect(s[0]).toMatchObject({ type: 'assertUrl', value: '/dashboard' })
    expect(s[1]).toMatchObject({ type: 'assertTitle', value: 'Dashboard' })
  })

  it('suggests nothing when the page is unchanged', () => {
    expect(svc.suggest({ url: '/a', title: 'A' }, { url: '/a', title: 'A' })).toEqual([])
  })
})
