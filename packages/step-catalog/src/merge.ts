/**
 * Metadata merge (feature 006-step-catalog, research D6).
 *
 * US1 assembles a `CatalogStep` from one `RawStepCandidate` plus its derived
 * parameters, computing per-field origin/precision and the step-level roll-up.
 * The full provenance-aware, multi-source precedence (defineStep > callback
 * types > fragments > pattern > runtime) is completed across US2–US4; the seam
 * lives here so later sources only raise precision, never lower it (FR-007).
 */
import type {
  CatalogParameter,
  CatalogStep,
  CatalogStepKeyword,
  MetadataOrigin,
  MetadataPrecision,
} from '@suisui/shared'
import type { RawStepCandidate } from './internal-types'
import { deriveParameters } from './adapters/pattern-analyzer'
import { diagnostics } from './diagnostics'
import { stableStepId } from './ids'

const PRECISION_RANK: Record<MetadataPrecision, number> = {
  unknown: 0,
  partial: 1,
  inferred: 2,
  exact: 3,
}

const ORIGIN_RANK: Record<MetadataOrigin, number> = {
  runtime: 0,
  pattern: 1,
  typescript: 2,
  suisui: 3,
}

/** Least-precise identifying parameter drives the step-level precision. */
function rollUpPrecision(parameters: CatalogParameter[]): MetadataPrecision {
  if (parameters.length === 0) return 'exact'
  let worst: MetadataPrecision = 'exact'
  for (const p of parameters) {
    if (PRECISION_RANK[p.precision] < PRECISION_RANK[worst]) worst = p.precision
  }
  return worst
}

/** Highest-ranked origin among parameters (falls back to 'pattern'). */
function rollUpOrigin(parameters: CatalogParameter[]): MetadataOrigin {
  let best: MetadataOrigin = 'pattern'
  for (const p of parameters) {
    if (ORIGIN_RANK[p.origin] > ORIGIN_RANK[best]) best = p.origin
  }
  return best
}

/** Assemble a single CatalogStep from a candidate. */
export function assembleStep(candidate: RawStepCandidate): CatalogStep {
  const diags = [...candidate.diagnostics]

  // Unknown keyword: default to When (matching legacy behavior) + diagnostic.
  let keyword: CatalogStepKeyword
  if (candidate.keyword === 'Unknown') {
    keyword = 'When'
    diags.push(diagnostics.unresolvedKeyword(candidate.location))
  } else {
    keyword = candidate.keyword
  }

  const derived = deriveParameters(candidate.pattern, {
    fragments: candidate.fragments,
    callbackParamNames: candidate.callbackParamNames,
    callbackParamTypes: candidate.callbackParamTypes,
    hasCallback: candidate.hasCallback,
  })
  const parameters = derived.parameters
  diags.push(...derived.diagnostics)

  const id = stableStepId({
    relPath: candidate.sourceForId.relPath,
    keyword,
    canonicalPattern: candidate.sourceForId.canonicalPattern,
    line: candidate.sourceForId.line,
  })

  const precision: MetadataPrecision =
    candidate.pattern.kind === 'dynamic' ? 'partial' : rollUpPrecision(parameters)
  const origin = rollUpOrigin(parameters)

  // Warn when parameter names had to be inferred (auto-generated argN names),
  // unless an equivalent inferred-names note was already added (e.g. by the
  // regex parser).
  const hasInferredNames = parameters.some((p) => /^arg\d+$/.test(p.name))
  const alreadyNoted = diags.some((d) => d.message === 'Parameter names were inferred from the callback.')
  if (hasInferredNames && !alreadyNoted) {
    diags.push(diagnostics.inferredParameterNames(candidate.location))
  }

  const meta = candidate.defineStepMeta
  const step: CatalogStep = {
    id,
    keyword,
    pattern: {
      kind: candidate.pattern.kind,
      source: candidate.pattern.source,
    },
    tags: meta?.tags ?? [],
    parameters,
    fixtures: candidate.fixtures,
    source: candidate.location,
    // Explicit author metadata is the most authoritative source.
    origin: meta ? 'suisui' : origin,
    precision,
    diagnostics: diags,
  }
  if (candidate.pattern.kind === 'regexp') {
    step.pattern.flags = candidate.pattern.flags ?? ''
  }

  // Description falls back to JSDoc when no explicit description is provided.
  const description = meta?.description ?? candidate.jsDoc
  if (meta?.title) step.title = meta.title
  if (description) step.description = description
  if (meta?.category) step.category = meta.category

  // Apply per-parameter labels/descriptions/examples and validate keys.
  if (meta?.parameters) {
    for (const [key, pMeta] of Object.entries(meta.parameters)) {
      const param = parameters.find((p) => p.name === key)
      if (!param) {
        diags.push(
          diagnostics.invalidDefineStepMetadata(
            `defineStep parameter "${key}" does not match any step parameter.`,
            candidate.location,
          ),
        )
        continue
      }
      if (pMeta.label) param.label = pMeta.label
      if (pMeta.description) param.description = pMeta.description
      if (pMeta.example) param.example = pMeta.example
      if (pMeta.defaultValue) param.defaultValue = pMeta.defaultValue
      param.origin = 'suisui'
      param.precision = 'exact'
    }
  }

  return step
}
