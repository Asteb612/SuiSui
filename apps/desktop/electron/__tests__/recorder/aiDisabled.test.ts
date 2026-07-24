import { describe, expect, it, vi } from 'vitest'
import { RecorderService, type RecorderEmitters } from '../../services/recorder/RecorderService'
import type { IRecorderAiMatcher } from '../../services/recorder/RecorderAiMatcher'
import { FakeRecorderAdapter, type FakeScriptEvent } from '../../services/recorder/FakeRecorderAdapter'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import type { CatalogParameter, CatalogStep, CatalogStepKeyword } from '@suisui/shared'

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
    source: { file: 'f', line: 1, column: 1 },
    origin: 'pattern',
    precision: 'inferred',
    diagnostics: [],
  }
}

function spyEmitters(): RecorderEmitters {
  return { onAction: vi.fn(), onActionUpdated: vi.fn(), onPicked: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
}

const gapAction: FakeScriptEvent = {
  type: 'action',
  action: { seq: 0, pageGuid: 'p1', action: { name: 'click', selector: '.btn', clickCount: 2 } }, // doubleClick → gap
}
const matchedClick: FakeScriptEvent = {
  type: 'action',
  action: {
    seq: 0,
    pageGuid: 'p1',
    action: { name: 'click', selector: 'internal:testid=[data-testid="go"]' },
    // A unique test-id scores "excellent", so the action is confidently matched.
    candidates: [{ kind: 'testId', attribute: 'data-testid', value: 'go', matchedElements: 1 }],
  },
}

async function run(script: FakeScriptEvent[], matcher: IRecorderAiMatcher, catalog: CatalogStep[]) {
  const service = new RecorderService({
    adapter: new FakeRecorderAdapter({ script }),
    aiMatcher: matcher,
    loadCatalogSteps: async () => catalog,
    loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS,
  })
  const emitters = spyEmitters()
  await service.start({}, emitters)
  await new Promise((r) => setTimeout(r, 0))
  return emitters
}

describe('recorder with AI disabled / not required', () => {
  it('leaves a gap action unchanged when AI is disabled', async () => {
    const disabled: IRecorderAiMatcher = { isEnabled: async () => false, suggest: vi.fn() }
    const emitters = await run([gapAction], disabled, [])
    expect(emitters.onActionUpdated).not.toHaveBeenCalled()
    expect(disabled.suggest).not.toHaveBeenCalled()
    const emitted = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(emitted.status).toBe('gap')
  })

  it('never invokes AI for a deterministically matched action', async () => {
    const suggest = vi.fn()
    const enabledMatcher: IRecorderAiMatcher = { isEnabled: async () => true, suggest }
    const catalog = [step('s-click', 'When', 'I click on {string}', [param('element')])]
    const emitters = await run([matchedClick], enabledMatcher, catalog)
    const emitted = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(emitted.status).toBe('matched')
    expect(suggest).not.toHaveBeenCalled() // matched → no AI stage
  })
})
