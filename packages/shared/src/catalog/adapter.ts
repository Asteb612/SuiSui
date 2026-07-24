/**
 * Backward-compatibility adapter: CatalogStep -> StepDefinition.
 *
 * The existing scenario engine (`scenario.ts` toGherkin/parseGherkin) operates
 * on `StepDefinition` (pattern + StepArgDefinition[]) via `resolvePattern` /
 * `matchStep` / `findBestMatch`. To preserve byte-identical Gherkin while the
 * richer catalog rides alongside, we map a CatalogStep down to the legacy
 * StepDefinition shape, keeping the pattern source verbatim and translating the
 * (wider) CatalogParameter type set to the (narrower) StepArgDefinition set.
 *
 * See specs/006-step-catalog/data-model.md §7.
 */
import type { CatalogParameter, CatalogStep, ParameterType } from '../types/step-catalog'
import type { StepArgDefinition, StepDefinition } from '../types/step'

/** Map the wider catalog parameter type onto the legacy arg-definition type. */
export function catalogParameterTypeToArgType(type: ParameterType): StepArgDefinition['type'] {
  switch (type) {
    case 'string':
    case 'int':
    case 'float':
    case 'word':
    case 'any':
    case 'enum':
    case 'table':
      return type
    case 'doc-string':
      return 'string'
    case 'boolean':
    case 'custom':
    case 'unknown':
    default:
      return 'any'
  }
}

/** Translate a single catalog parameter to a legacy step-arg definition. */
export function catalogParameterToArgDefinition(param: CatalogParameter): StepArgDefinition {
  const arg: StepArgDefinition = {
    name: param.name,
    type: catalogParameterTypeToArgType(param.type),
    required: param.required,
  }
  if (param.enumValues) arg.enumValues = param.enumValues
  if (param.tableColumns) arg.tableColumns = param.tableColumns
  return arg
}

/**
 * Convert a CatalogStep to the legacy StepDefinition consumed by the existing
 * scenario/Gherkin flow. The pattern source is passed through verbatim so
 * downstream regex/Gherkin behavior is unchanged.
 */
export function catalogStepToStepDefinition(step: CatalogStep): StepDefinition {
  return {
    id: step.id,
    pattern: step.pattern.source,
    keyword: step.keyword,
    location: `${step.source.file}:${step.source.line}`,
    args: step.parameters.map(catalogParameterToArgDefinition),
    isGeneric: false,
  }
}
