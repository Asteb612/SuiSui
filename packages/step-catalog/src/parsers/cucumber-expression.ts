/**
 * Cucumber-expression parameter parser (feature 006-step-catalog, US2).
 *
 * Delegates to the shared `parseArgs` so catalog parameters for cucumber /
 * plain-string / enum / table patterns match exactly what the scenario+Gherkin
 * engine already derives (backward-compat parity, SC-009). Adds catalog
 * provenance (origin/precision) on top.
 */
import type { CatalogParameter, ParameterType } from '@suisui/shared'
import { parseArgs } from '@suisui/shared'

function cucumberPrecision(type: ParameterType, name: string) {
  if (type === 'enum') return 'partial' as const
  if (type === 'any' && /^arg\d+$/.test(name)) return 'unknown' as const
  return 'inferred' as const
}

/** Parse a cucumber/plain/enum/table pattern into catalog parameters. */
export function parseCucumberParameters(source: string): CatalogParameter[] {
  return parseArgs(source).map((arg, index) => {
    const type = arg.type as ParameterType
    const param: CatalogParameter = {
      index,
      name: arg.name,
      type,
      required: arg.required,
      origin: 'pattern',
      precision: cucumberPrecision(type, arg.name),
    }
    if (arg.enumValues) param.enumValues = arg.enumValues
    if (arg.tableColumns) param.tableColumns = arg.tableColumns
    return param
  })
}
