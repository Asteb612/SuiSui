import { describe, it, expect } from 'vitest'
import { filterCatalogSteps, stepMaxSeverity, stepSourceLabel } from '../utils/catalogFilters'
import type { CatalogStep } from '@suisui/shared'

function step(overrides: Partial<CatalogStep>): CatalogStep {
  return {
    id: 'step_x',
    keyword: 'Given',
    pattern: { kind: 'plain-string', source: 'I do a thing' },
    tags: [],
    parameters: [],
    fixtures: [],
    source: { file: 'a.steps.ts', line: 1, column: 1 },
    origin: 'pattern',
    precision: 'inferred',
    diagnostics: [],
    ...overrides,
  }
}

const CATALOG: CatalogStep[] = [
  step({ id: '1', keyword: 'Given', pattern: { kind: 'plain-string', source: 'I am logged in' }, category: 'Auth', tags: ['auth'], precision: 'exact' }),
  step({ id: '2', keyword: 'When', pattern: { kind: 'cucumber', source: 'I fill {string}' }, category: 'Form', tags: ['form', 'input'], precision: 'inferred', parameters: [{ index: 0, name: 'v', type: 'string', required: true, origin: 'pattern', precision: 'inferred' }] }),
  step({ id: '3', keyword: 'Then', pattern: { kind: 'regexp', source: '^I see "([^"]+)"$', flags: '' }, precision: 'partial', parameters: [{ index: 0, name: 'arg0', type: 'string', required: true, origin: 'pattern', precision: 'partial' }] }),
]

describe('filterCatalogSteps (US3)', () => {
  it('filters by keyword', () => {
    expect(filterCatalogSteps(CATALOG, { keyword: 'When' }).map((s) => s.id)).toEqual(['2'])
  })

  it('filters by free text on the pattern', () => {
    expect(filterCatalogSteps(CATALOG, { text: 'logged' }).map((s) => s.id)).toEqual(['1'])
  })

  it('filters by category', () => {
    expect(filterCatalogSteps(CATALOG, { category: 'Form' }).map((s) => s.id)).toEqual(['2'])
  })

  it('filters by tag', () => {
    expect(filterCatalogSteps(CATALOG, { tag: 'input' }).map((s) => s.id)).toEqual(['2'])
  })

  it('filters by parameter type', () => {
    expect(filterCatalogSteps(CATALOG, { parameterType: 'string' }).map((s) => s.id).sort()).toEqual(['2', '3'])
  })

  it('filters by precision', () => {
    expect(filterCatalogSteps(CATALOG, { precision: 'exact' }).map((s) => s.id)).toEqual(['1'])
  })

  it('combines filters', () => {
    expect(filterCatalogSteps(CATALOG, { keyword: 'When', category: 'Form', precision: 'inferred' }).map((s) => s.id)).toEqual(['2'])
  })
})

describe('stepMaxSeverity (US3)', () => {
  it('returns null when there are no diagnostics', () => {
    expect(stepMaxSeverity(step({}))).toBeNull()
  })

  it('returns the highest severity present', () => {
    const s = step({
      diagnostics: [
        { code: 'AMBIGUOUS_STEP_PATTERN', severity: 'info', message: 'x' },
        { code: 'DUPLICATE_STEP_PATTERN', severity: 'warning', message: 'y' },
      ],
    })
    expect(stepMaxSeverity(s)).toBe('warning')
  })

  it('formats a source label', () => {
    expect(stepSourceLabel(step({ source: { file: 'tests/steps/a.steps.ts', line: 42, column: 1 } }))).toBe('tests/steps/a.steps.ts:42')
  })
})
