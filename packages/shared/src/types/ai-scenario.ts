import type { StepKeyword } from './step'
import type { StepArg } from './feature'
import type { StepTier } from './step-catalog'
import type { ValidationResult } from './validation'

/**
 * Types for AI scenario generation (feature 012).
 *
 * The governing rule: a draft is assembled ONLY from steps that already exist
 * in the workspace. The model selects steps by index into a list it was given;
 * step identity is then read from the catalog entry that index resolves to,
 * never from the model's own text. `DraftStep` is therefore unconstructable
 * from an unresolvable response — that path yields a `DroppedStep` instead,
 * which is what makes "zero invented steps" structural rather than aspirational.
 */

/** One proposed step, already resolved to a real workspace step. */
export interface DraftStep {
  /** The real catalog step this resolved to. The FR-004 guarantee. */
  catalogStepId: string
  /** From the catalog step — NOT from the model response. */
  keyword: StepKeyword
  /** From the catalog step — NOT from the model response. */
  pattern: string
  /** Rendered as a project/generic badge in review (FR-011). */
  tier: StepTier
  /** Values extracted by matching the model's text against `pattern`. */
  args: StepArg[]
  /**
   * Names of arguments that could not be derived from the tester's input and
   * need their attention (FR-006). Never silently invented.
   */
  unresolvedArgs: string[]
}

/** A part of the request no available step could express (FR-007). */
export interface CoverageGap {
  /** The uncovered intent, in the tester's own words. Model-authored prose. */
  text: string
}

/** Why a step the model proposed did not become a `DraftStep` (FR-005). */
export type DroppedStepReason = 'out-of-range' | 'unknown-index' | 'malformed'

/** A proposal that was rejected — surfaced, never silently discarded. */
export interface DroppedStep {
  /** What the model proposed, for the tester to see. */
  raw: string
  reason: DroppedStepReason
}

/** One proposed, not-yet-accepted scenario. */
export interface ScenarioDraft {
  name: string
  /** Without the leading `@`. */
  tags: string[]
  steps: DraftStep[]
  gaps: CoverageGap[]
  dropped: DroppedStep[]
  /** Filled by the pre-accept check (FR-015); null until then. */
  validation: ValidationResult | null
  /** Recorded as a comment on acceptance (FR-029). */
  requirementRef: string | null
}

/**
 * What one generation attempt produced. Exactly three shapes, so "an attempt
 * that ended with no feedback" is unrepresentable (SC-006).
 */
export type ScenarioGenerationOutcome =
  | {
      status: 'drafted'
      scenarios: ScenarioDraft[]
      /** True when the step budget dropped steps from the prompt (FR-022). */
      truncated: boolean
    }
  | { status: 'empty'; reason: string }
  | { status: 'failed'; message: string }

/**
 * How an accepted draft is applied to an existing scenario (FR-024).
 * Chosen per generation and never persisted as a preference; `extend` is
 * always the starting point, so the non-destructive outcome is the default.
 */
export type DraftApplyMode = 'extend' | 'redraft'
