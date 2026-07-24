import { describe, it, expect } from 'vitest'
import { parseArgs, resolvePattern } from '../patterns/processor'
import { catalogStepToStepDefinition } from '../catalog/adapter'
import type { CatalogParameter, CatalogStep } from '../types/step-catalog'
import type { StepArgDefinition } from '../types/step'

/**
 * The catalog derives cucumber parameters from the very same `parseArgs` used by
 * the scenario/Gherkin engine (US2, SC-009). This test proves the round-trip
 * CatalogStep -> StepDefinition is lossless for the legacy arg types, so
 * inserting an equivalent step produces byte-identical Gherkin.
 */

// Mirror the engine's cucumber parameter construction from a pattern.
function catalogParamsFromPattern(pattern: string): CatalogParameter[] {
  return parseArgs(pattern).map((arg, index) => {
    const param: CatalogParameter = {
      index,
      name: arg.name,
      type: arg.type,
      required: arg.required,
      origin: 'pattern',
      precision: 'inferred',
    }
    if (arg.enumValues) param.enumValues = arg.enumValues
    if (arg.tableColumns) param.tableColumns = arg.tableColumns
    return param
  })
}

function catalogStepFor(pattern: string): CatalogStep {
  return {
    id: 'step_000000000000',
    keyword: 'When',
    pattern: { kind: 'cucumber', source: pattern },
    tags: [],
    parameters: catalogParamsFromPattern(pattern),
    fixtures: [],
    source: { file: 'a.steps.ts', line: 1, column: 1 },
    origin: 'pattern',
    precision: 'inferred',
    diagnostics: [],
  }
}

const PATTERNS = [
  'I am on the home page',
  'I enter {string}',
  'I fill {string:field} with {string:value}',
  'I wait for {int} seconds',
  'I set the ratio to {float}',
  'I log in as (admin|user|guest)',
]

describe('catalog adapter parity (US2)', () => {
  it('adapter args equal the legacy parseArgs output', () => {
    for (const pattern of PATTERNS) {
      const adapted = catalogStepToStepDefinition(catalogStepFor(pattern))
      const legacy: StepArgDefinition[] = parseArgs(pattern)
      // Compare the fields the Gherkin engine relies on.
      const strip = (a: StepArgDefinition) => ({
        name: a.name,
        type: a.type,
        enumValues: a.enumValues,
        tableColumns: a.tableColumns,
      })
      expect(adapted.args.map(strip)).toEqual(legacy.map(strip))
      expect(adapted.pattern).toBe(pattern)
    }
  })

  it('produces identical Gherkin from adapter-derived args', () => {
    const cases: Array<{ pattern: string; values: string[] }> = [
      { pattern: 'I enter {string}', values: ['hello'] },
      { pattern: 'I fill {string:field} with {string:value}', values: ['Email', 'a@b.com'] },
      { pattern: 'I wait for {int} seconds', values: ['5'] },
      { pattern: 'I log in as (admin|user|guest)', values: ['admin'] },
    ]
    for (const { pattern, values } of cases) {
      const legacyArgs = parseArgs(pattern).map((a, i) => ({
        type: a.type,
        value: values[i] ?? '',
        enumValues: a.enumValues,
      }))
      const adaptedArgs = catalogStepToStepDefinition(catalogStepFor(pattern)).args.map((a, i) => ({
        type: a.type,
        value: values[i] ?? '',
        enumValues: a.enumValues,
      }))
      expect(resolvePattern(pattern, adaptedArgs)).toBe(resolvePattern(pattern, legacyArgs))
    }
  })
})
