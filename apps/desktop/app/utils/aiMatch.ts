import { matchStep } from '@suisui/shared'
import type { StepDefinition } from '@suisui/shared'

const KEYWORD_PREFIX = /^(Given|When|Then|And|But)\s+/i
const SURROUNDING_QUOTES = /^["'`]+|["'`]+$/g

/**
 * Reconcile a model's step-match reply to a concrete EXISTING step definition (spec FR-010).
 *
 * The model is instructed to reply with the verbatim text of the best-matching step, or
 * exactly `NONE`. We resolve that reply against the real workspace steps rather than
 * trusting the model's output directly:
 *  1. exact pattern match (verbatim copy, with or without a keyword prefix), then
 *  2. a concrete phrase whose text matches an existing pattern's regex (via `matchStep`).
 *
 * Returns `null` when the model says `NONE` or nothing reconciles — deliberately NOT
 * using `findBestMatch`, which always synthesizes a fallback pattern and so can never
 * express "no good match".
 */
export function reconcileSuggestedStep(
  reply: string,
  steps: StepDefinition[]
): StepDefinition | null {
  const withKeyword = reply.trim().replace(SURROUNDING_QUOTES, '').trim()
  if (!withKeyword || /^none$/i.test(withKeyword)) return null

  const stripped = withKeyword.replace(KEYWORD_PREFIX, '').trim()

  // 1) Verbatim pattern copy (the instructed happy path).
  const exact = steps.find(
    (s) => s.pattern === stripped || `${s.keyword} ${s.pattern}` === withKeyword
  )
  if (exact) return exact

  // 2) A concrete phrase that satisfies an existing pattern's regex.
  const matched = steps.find((s) => matchStep(stripped, s) !== null)
  return matched ?? null
}
