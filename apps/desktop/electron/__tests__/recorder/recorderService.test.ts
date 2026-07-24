import { describe, expect, it, vi } from 'vitest'
import { RecorderService, type RecorderEmitters } from '../../services/recorder/RecorderService'
import { FakeRecorderAdapter, type FakeScriptEvent } from '../../services/recorder/FakeRecorderAdapter'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import type { CatalogParameter, CatalogStep, CatalogStepKeyword, RecordedAction } from '@suisui/shared'

function param(name: string): CatalogParameter {
  return { index: 0, name, type: 'string', required: true, origin: 'pattern', precision: 'inferred' }
}
function step(id: string, keyword: CatalogStepKeyword, source: string, params: CatalogParameter[]): CatalogStep {
  return {
    id,
    keyword,
    pattern: { kind: 'cucumber', source },
    tags: [],
    parameters: params,
    fixtures: [],
    source: { file: 'features/steps/generic.steps.ts', line: 3, column: 1 },
    origin: 'pattern',
    precision: 'inferred',
    diagnostics: [],
  }
}

const CATALOG: CatalogStep[] = [
  step('s-nav', 'Given', 'I am on the {string} page', [param('pageName')]),
  step('s-click', 'When', 'I click on {string}', [param('element')]),
  step('s-fill', 'When', 'I fill {string} with {string}', [param('field'), param('value')]),
]

function spyEmitters(): RecorderEmitters {
  return { onAction: vi.fn(), onActionUpdated: vi.fn(), onPicked: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
}

function serviceWith(script: FakeScriptEvent[]): { service: RecorderService; emitters: RecorderEmitters } {
  const service = new RecorderService({
    adapter: new FakeRecorderAdapter({ script }),
    loadCatalogSteps: async () => CATALOG,
    loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS,
  })
  return { service, emitters: spyEmitters() }
}

const clickAt = (seq: number): FakeScriptEvent => ({
  type: 'action',
  action: {
    seq,
    pageGuid: 'p1',
    action: { name: 'click', selector: 'internal:role=button' },
    fingerprint: { tagName: 'button', accessibleName: 'Go', testAttributes: { 'data-testid': `btn-${seq}` } },
    candidates: [{ kind: 'testId', attribute: 'data-testid', value: `btn-${seq}`, matchedElements: 1 }],
  },
})

describe('RecorderService (with deterministic matching)', () => {
  it('normalizes and matches a nav → fill → click flow', async () => {
    const { service, emitters } = serviceWith([
      { type: 'action', action: { seq: 0, pageGuid: 'p1', action: { name: 'navigate', url: '/login' } } },
      {
        type: 'action',
        action: {
          seq: 1,
          pageGuid: 'p1',
          action: { name: 'fill', text: 'a@b.com' },
          fingerprint: { tagName: 'input', label: 'Email' },
          candidates: [{ kind: 'label', value: 'Email', matchedElements: 1 }],
        },
      },
      clickAt(2),
    ])

    await service.start({}, emitters)
    const calls = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as RecordedAction)

    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ type: 'navigate', status: 'matched', match: { definitionId: 's-nav' } })
    expect(calls[1]).toMatchObject({ type: 'fill', status: 'matched', match: { definitionId: 's-fill' } })
    expect(calls[1].match?.args).toEqual([
      { name: 'field', value: 'internal:label="Email"i', type: 'string' },
      { name: 'value', value: 'a@b.com', type: 'string' },
    ])
    expect(calls[2]).toMatchObject({ type: 'click', status: 'matched', match: { definitionId: 's-click' } })
  })

  it('preserves order and loses no actions for a 120-action session (SC-010)', async () => {
    const script = Array.from({ length: 120 }, (_, i) => clickAt(i))
    const { service, emitters } = serviceWith(script)

    await service.start({}, emitters)
    const seqs = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as RecordedAction).seq)

    expect(seqs).toHaveLength(120)
    expect(seqs).toEqual(Array.from({ length: 120 }, (_, i) => i))
  })

  it('forwards adapter errors with the session id', async () => {
    const { service, emitters } = serviceWith([
      { type: 'error', error: { code: 'TARGET_PAGE_CLOSED', message: 'The page was closed.', fatal: true } },
    ])
    const session = await service.start({}, emitters)

    expect(emitters.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TARGET_PAGE_CLOSED', fatal: true, sessionId: session.sessionId })
    )
  })
})
