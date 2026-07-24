/**
 * Pattern analyzer (feature 006-step-catalog, US1 + US2).
 *
 * Derives `CatalogParameter[]` for a step from the most reliable available
 * source, in precedence order (research D6):
 *   1. SuiSui `step``` fragments (exact names/types, origin `suisui`)
 *   2. callback parameter names/types (origin `typescript`)
 *   3. pattern inference — cucumber via shared `parseArgs`, regex via the
 *      capture-group scanner (origin `pattern`)
 * Lower-precedence sources never lower a field already set by a higher one
 * (FR-007). Reports a `PARAMETER_COUNT_MISMATCH` when the resolved parameter
 * count disagrees with the callback arity for a statically-resolved pattern.
 */
import type {
  CatalogDiagnostic,
  CatalogParameter,
  MetadataPrecision,
  ParameterType,
} from '@suisui/shared'
import type { RawFragmentMeta, RawPattern } from '../internal-types'
import { parseCucumberParameters } from '../parsers/cucumber-expression'
import { parseRegexParameters } from '../parsers/regular-expression'
import { diagnostics } from '../diagnostics'

const PRECISION_RANK: Record<MetadataPrecision, number> = {
  unknown: 0,
  partial: 1,
  inferred: 2,
  exact: 3,
}

/** Raise a precision only upward (never lower an already-set field). */
function raise(current: MetadataPrecision, next: MetadataPrecision): MetadataPrecision {
  return PRECISION_RANK[next] > PRECISION_RANK[current] ? next : current
}

/** The JS primitive a pattern parameter type implies, if any. */
function expectedPrimitive(type: ParameterType): 'number' | 'string' | null {
  if (type === 'int' || type === 'float') return 'number'
  if (type === 'string' || type === 'word' || type === 'any') return 'string'
  return null
}

/** A simple primitive keyword from a TS type annotation, if it is exactly one. */
function simplePrimitive(sourceType: string): 'number' | 'string' | 'boolean' | null {
  const t = sourceType.trim()
  if (t === 'number' || t === 'string' || t === 'boolean') return t
  return null
}

function fragmentKindToType(kind: string): ParameterType {
  switch (kind) {
    case 'string':
    case 'int':
    case 'float':
    case 'word':
    case 'any':
    case 'enum':
    case 'table':
      return kind
    default:
      return 'unknown'
  }
}

export interface DeriveParametersInput {
  fragments?: RawFragmentMeta[]
  callbackParamNames?: string[]
  callbackParamTypes?: (string | undefined)[]
  hasCallback?: boolean
}

export interface DeriveParametersResult {
  parameters: CatalogParameter[]
  diagnostics: CatalogDiagnostic[]
}

/** Derive parameters for a pattern, merging fragment/callback/pattern sources. */
export function deriveParameters(
  pattern: RawPattern,
  input: DeriveParametersInput = {},
): DeriveParametersResult {
  const diags: CatalogDiagnostic[] = []

  // 3) Pattern inference baseline.
  let parameters: CatalogParameter[]
  if (pattern.kind === 'regexp') {
    const parsed = parseRegexParameters(pattern.source)
    parameters = parsed.parameters
    diags.push(...parsed.diagnostics)
  } else {
    parameters = parseCucumberParameters(pattern.source)
  }

  // 2) Callback names/types (origin typescript) raise precision without
  // overwriting exact fragment data (applied next).
  const { callbackParamNames, callbackParamTypes } = input
  if (callbackParamNames) {
    for (let i = 0; i < parameters.length; i++) {
      const param = parameters[i]!
      const cbName = callbackParamNames[i]
      const cbType = callbackParamTypes?.[i]
      if (cbName && /^arg\d+$/.test(param.name)) {
        // A callback name improves the name, but does not certify the type:
        // precision is left to reflect the (still-inferred/partial) type.
        param.name = cbName
        if (param.origin === 'pattern') param.origin = 'typescript'
      }
      if (cbType) {
        // Conflict: pattern says numeric but the callback annotates a plain
        // string primitive, or vice-versa.
        const patternExpects = expectedPrimitive(param.type)
        const annotated = simplePrimitive(cbType)
        if (patternExpects && annotated && patternExpects !== annotated) {
          diags.push(
            diagnostics.parameterTypeConflict(
              `Parameter "${param.name}" is ${param.type} in the pattern but annotated as ${cbType}.`,
            ),
          )
        }
        param.sourceType = cbType
        if (param.origin === 'pattern') param.origin = 'typescript'
        param.precision = raise(param.precision, 'inferred')
      }
    }
  }

  // 1) SuiSui fragment overrides (exact, origin suisui) — highest precedence.
  if (input.fragments && input.fragments.length > 0) {
    const capturing = input.fragments.filter((f) => f.captures)
    for (let i = 0; i < capturing.length && i < parameters.length; i++) {
      const frag = capturing[i]!
      const param = parameters[i]!
      param.type = fragmentKindToType(frag.kind)
      if (frag.name) param.name = frag.name
      if (frag.enumValues) param.enumValues = frag.enumValues
      if (frag.tableColumns) param.tableColumns = frag.tableColumns
      param.origin = 'suisui'
      param.precision = 'exact'
    }
  }

  // Parameter/callback arity mismatch (only for statically-resolved patterns).
  if (
    input.hasCallback &&
    callbackParamNames &&
    pattern.kind !== 'dynamic' &&
    pattern.kind !== 'unknown' &&
    callbackParamNames.length !== parameters.length
  ) {
    diags.push(
      diagnostics.parameterCountMismatch(
        `Pattern declares ${parameters.length} parameter(s) but the callback takes ${callbackParamNames.length}.`,
      ),
    )
  }

  return { parameters, diagnostics: diags }
}
