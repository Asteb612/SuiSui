import { describe, expect, it, vi } from 'vitest'
import { RecorderService, type RecorderEmitters } from '../../services/recorder/RecorderService'
import {
  validateAiSuggestion,
  type IRecorderAiMatcher,
  type RecorderAiSuggestion,
} from '../../services/recorder/RecorderAiMatcher'
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
    source: { file: 'features/steps/custom.steps.ts', line: 7, column: 1 },
    origin: 'suisui',
    precision: 'exact',
    diagnostics: [],
  }
}

// 'I double-click …' is NOT in the generic recorder map, so a doubleClick action
// is a deterministic gap → AI enrichment is offered.
const CATALOG: CatalogStep[] = [step('custom-dbl', 'When', 'I double-click {string}', [param('element')])]

class FakeAiMatcher implements IRecorderAiMatcher {
  constructor(
    private readonly enabled: boolean,
    private readonly suggestion: RecorderAiSuggestion | null
  ) {}
  async isEnabled() {
    return this.enabled
  }
  async suggest() {
    return this.suggestion
  }
}

const doubleClick: FakeScriptEvent = {
  type: 'action',
  action: {
    seq: 0,
    pageGuid: 'p1',
    action: { name: 'click', selector: '.btn', clickCount: 2 },
    candidates: [{ kind: 'css', value: '.btn', matchedElements: 1 }],
  },
}

function spyEmitters(): RecorderEmitters {
  return { onAction: vi.fn(), onActionUpdated: vi.fn(), onPicked: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
}

async function run(matcher: IRecorderAiMatcher) {
  const service = new RecorderService({
    adapter: new FakeRecorderAdapter({ script: [doubleClick] }),
    aiMatcher: matcher,
    loadCatalogSteps: async () => CATALOG,
    loadLocatorSettings: async () => DEFAULT_RECORDER_LOCATOR_SETTINGS,
  })
  const emitters = spyEmitters()
  await service.start({}, emitters)
  await new Promise((r) => setTimeout(r, 0)) // let the async AI enrichment settle
  return emitters
}

function updates(emitters: RecorderEmitters): RecordedAction[] {
  return (emitters.onActionUpdated as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
}

describe('validateAiSuggestion', () => {
  it('accepts a valid, confident suggestion', () => {
    const m = validateAiSuggestion({ definitionId: 'custom-dbl', arguments: { element: '.btn' }, confidence: 0.95 }, CATALOG)
    expect(m).toMatchObject({ definitionId: 'custom-dbl', source: 'ai', confidence: 0.95 })
    expect(m?.args).toEqual([{ name: 'element', value: '.btn', type: 'string' }])
  })

  it('discards an unknown definition id', () => {
    expect(validateAiSuggestion({ definitionId: 'nope', arguments: {}, confidence: 0.95 }, CATALOG)).toBeNull()
  })

  it('discards a suggestion with an argument that is not on the step', () => {
    expect(validateAiSuggestion({ definitionId: 'custom-dbl', arguments: { bogus: 'x' }, confidence: 0.95 }, CATALOG)).toBeNull()
  })

  it('discards a low-confidence suggestion (< 0.65)', () => {
    expect(validateAiSuggestion({ definitionId: 'custom-dbl', arguments: {}, confidence: 0.5 }, CATALOG)).toBeNull()
  })
})

describe('RecorderService AI enrichment (gap → suggestion)', () => {
  it('preselects a high-confidence match (≥0.90 → matched)', async () => {
    const emitters = await run(new FakeAiMatcher(true, { definitionId: 'custom-dbl', arguments: {}, confidence: 0.95, reason: 'r' }))
    const updated = updates(emitters).at(-1)!
    expect(updated).toMatchObject({ status: 'matched', match: { definitionId: 'custom-dbl', source: 'ai' } })
  })

  it('offers a mid-confidence match as a recommendation (needs-review)', async () => {
    const emitters = await run(new FakeAiMatcher(true, { definitionId: 'custom-dbl', arguments: {}, confidence: 0.75 }))
    const updated = updates(emitters).at(-1)!
    expect(updated.status).toBe('needs-review')
    expect(updated.match?.source).toBe('ai')
  })

  it('does not apply an invalid suggestion (stays a gap)', async () => {
    const emitters = await run(new FakeAiMatcher(true, { definitionId: 'nope', arguments: {}, confidence: 0.95 }))
    expect(updates(emitters)).toHaveLength(0)
    const original = (emitters.onAction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RecordedAction
    expect(original.status).toBe('gap')
  })
})
