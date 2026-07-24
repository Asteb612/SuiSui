import { describe, expect, it } from 'vitest'
import { StepMatcherService } from '../../services/recorder/StepMatcherService'
import type { CatalogParameter, CatalogStep, CatalogStepKeyword, RecordedAction } from '@suisui/shared'

function param(name: string, required = true): CatalogParameter {
  return { index: 0, name, type: 'string', required, origin: 'pattern', precision: 'inferred' }
}

function step(id: string, keyword: CatalogStepKeyword, source: string, params: CatalogParameter[]): CatalogStep {
  return {
    id,
    keyword,
    pattern: { kind: 'cucumber', source },
    tags: [],
    parameters: params,
    fixtures: [],
    source: { file: 'features/steps/generic.steps.ts', line: 10, column: 1 },
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

function action(over: Partial<RecordedAction> & Pick<RecordedAction, 'type'>): RecordedAction {
  return {
    id: 'a',
    sessionId: 's',
    seq: 0,
    pageId: 'p',
    timestamp: 0,
    label: 'x',
    status: 'draft',
    ...over,
  }
}

describe('StepMatcherService (stage-1 deterministic)', () => {
  const matcher = new StepMatcherService({ steps: CATALOG })

  it('matches a click to the generic step with the target selector as its arg', () => {
    const result = matcher.match(
      action({ type: 'click', selectedLocator: { type: 'testId', attribute: 'data-testid', value: 'login-submit' } })
    )
    expect(result.status).toBe('matched')
    expect(result.match).toMatchObject({
      definitionId: 's-click',
      pattern: 'I click on {string}',
      keyword: 'When',
      source: 'deterministic',
      confidence: 1,
    })
    expect(result.match?.args).toEqual([{ name: 'element', value: '[data-testid="login-submit"]', type: 'string' }])
    expect(result.match?.definitionLocation).toEqual({ file: 'features/steps/generic.steps.ts', line: 10, column: 1 })
  })

  it('fills both args for a fill action (field selector + value)', () => {
    const result = matcher.match(
      action({
        type: 'fill',
        value: 'a@b.com',
        selectedLocator: { type: 'label', value: 'Email' },
      })
    )
    expect(result.status).toBe('matched')
    expect(result.match?.args).toEqual([
      { name: 'field', value: 'internal:label="Email"i', type: 'string' },
      { name: 'value', value: 'a@b.com', type: 'string' },
    ])
  })

  it('uses the secret reference (not the value) for a secret fill', () => {
    const result = matcher.match(
      action({ type: 'fill', secret: true, secretRef: '<LOGIN_PASSWORD>', selectedLocator: { type: 'label', value: 'Password' } })
    )
    expect(result.match?.args[1]).toEqual({ name: 'value', value: '<LOGIN_PASSWORD>', type: 'string' })
  })

  it('flags a gap when no catalog step exists for the action', () => {
    // 'press' has a mapping but this catalog has no "I press {string}" step.
    const result = matcher.match(action({ type: 'press', value: 'Enter' }))
    expect(result.status).toBe('gap')
    expect(result.match).toBeUndefined()
  })

  it('flags needs-review when a required arg cannot be filled', () => {
    const result = matcher.match(action({ type: 'click' })) // no selectedLocator → empty target
    expect(result.status).toBe('needs-review')
    expect(result.match?.confidence).toBe(0.6)
  })

  it('returns duplicates as alternatives', () => {
    const dup = new StepMatcherService({
      steps: [...CATALOG, step('s-click-2', 'When', 'I click on {string}', [param('element')])],
    })
    const result = dup.match(
      action({ type: 'click', selectedLocator: { type: 'css', value: '.btn' } })
    )
    expect(result.match?.definitionId).toBe('s-click')
    expect(result.alternatives.map((m) => m.definitionId)).toEqual(['s-click-2'])
  })
})
