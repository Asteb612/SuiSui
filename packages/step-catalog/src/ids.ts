/**
 * Deterministic, stable step IDs (feature 006-step-catalog, research D5).
 *
 * `id = "step_" + sha256(normalized).slice(0, 12)` where `normalized` combines
 * the workspace-relative path, keyword, canonical pattern, and source line. This
 * is deterministic and collision-resistant (never JS string hashing, FR-021/022).
 * An unchanged, un-moved step keeps its ID across refreshes; moving a step to
 * another file changes the relative path -> new ID (acceptable).
 */
import { createHash } from 'node:crypto'

export interface StableStepIdInput {
  /** Workspace-relative POSIX path of the definition file. */
  relPath: string
  keyword: string
  /** Whitespace-normalized pattern (see canonicalizePattern). */
  canonicalPattern: string
  /** 1-based source line. */
  line: number
}

/**
 * Normalize a pattern for hashing/duplicate-grouping. Collapses whitespace and
 * trims. For regex patterns, the caller should pass `source` combined with
 * sorted `flags` (see canonicalizeRegex) so flag order does not affect the ID.
 */
export function canonicalizePattern(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

/** Canonical form of a regex pattern: source + sorted flags. */
export function canonicalizeRegex(source: string, flags: string): string {
  const sortedFlags = flags.split('').sort().join('')
  return `${source}/${sortedFlags}`
}

/** Compute a stable `step_<12hex>` identifier from normalized metadata. */
export function stableStepId(input: StableStepIdInput): string {
  const normalized = [input.relPath, input.keyword, input.canonicalPattern, String(input.line)].join(
    ' ',
  )
  const hash = createHash('sha256').update(normalized).digest('hex')
  return `step_${hash.slice(0, 12)}`
}
