import type { MatchRange } from '../types/search'

/** A successful match: where it matched, and how well. */
export interface TextMatch {
  ranges: MatchRange[]
  score: number
}

const SCORE_EXACT = 100
const SCORE_PREFIX = 80
const SCORE_WORD = 60
const SCORE_SUBSTRING = 40

/** A tag match ranks below the equivalent name match. */
export const TAG_SCORE_PENALTY = 25

/**
 * Normalize a single character: strip diacritics and lowercase it.
 *
 * Returns the original character whenever the transform would change its
 * length. This 1:1 guarantee is what lets `MatchRange` offsets index the
 * original text — see `normalize`.
 */
function normalizeChar(char: string): string {
  const stripped = char.normalize('NFD').replace(/\p{M}/gu, '')
  const base = stripped.length > 0 ? stripped : char
  const lower = base.toLowerCase()
  return lower.length === char.length ? lower : char
}

/**
 * Lowercase and strip accents, PRESERVING LENGTH.
 *
 * Length preservation is load-bearing: match ranges are computed against the
 * normalized string but are used to highlight the original one. Any transform
 * that collapses or expands characters would silently corrupt highlighting for
 * non-ASCII text.
 */
export function normalize(text: string): string {
  let out = ''
  for (const char of text) {
    out += normalizeChar(char)
  }
  return out
}

/** Split a raw query into normalized tokens. Empty input yields no tokens. */
export function tokenize(query: string): string[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  return trimmed.split(/\s+/).map(normalize)
}

/** Is the character at `index` the start of a word? */
function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true
  const previous = text[index - 1]!
  return !/[\p{L}\p{N}]/u.test(previous)
}

/** All occurrences of `token` in `text`, as ranges. */
function findOccurrences(text: string, token: string): MatchRange[] {
  const ranges: MatchRange[] = []
  let from = 0
  for (;;) {
    const index = text.indexOf(token, from)
    if (index === -1) break
    ranges.push({ start: index, end: index + token.length })
    from = index + 1
  }
  return ranges
}

/** Sort and merge overlapping or touching ranges. */
function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: MatchRange[] = [sorted[0]!]
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1]!
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

/**
 * Match `text` against pre-tokenized query terms.
 *
 * Every token must be present, in any order. Matching is literal — tokens are
 * never compiled to a regular expression, both because FR-010 requires literal
 * semantics and because query text is user input.
 *
 * Returns `null` when the text does not match.
 */
export function matchText(text: string, tokens: string[]): TextMatch | null {
  if (tokens.length === 0 || text.length === 0) return null

  const normalized = normalize(text)
  const found: MatchRange[] = []

  for (const token of tokens) {
    const occurrences = findOccurrences(normalized, token)
    if (occurrences.length === 0) return null
    found.push(...occurrences)
  }

  const joined = tokens.join(' ')
  let score: number
  if (normalized === joined) {
    score = SCORE_EXACT
  } else if (normalized.startsWith(joined)) {
    score = SCORE_PREFIX
  } else if (tokens.every((token) => findOccurrences(normalized, token).some((r) => isWordStart(normalized, r.start)))) {
    score = SCORE_WORD
  } else {
    score = SCORE_SUBSTRING
  }

  return { ranges: mergeRanges(found), score }
}

/** Strip a single leading '@' so `@smoke` and `smoke` are interchangeable. */
function stripAt(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value
}

/**
 * Match a tag against query tokens, ignoring a leading '@' on either side.
 *
 * Scores `TAG_SCORE_PENALTY` below the equivalent name match so a name hit
 * always outranks a tag hit of the same quality.
 */
export function matchTag(tag: string, tokens: string[]): TextMatch | null {
  if (tokens.length === 0) return null
  const bare = stripAt(tag)
  const bareTokens = tokens.map(stripAt).filter((token) => token.length > 0)
  if (bareTokens.length === 0) return null

  const match = matchText(bare, bareTokens)
  if (!match) return null

  // Ranges index the bare tag, not the display text — callers highlight the tag
  // chip rather than the title, so they are dropped here.
  return { ranges: [], score: match.score - TAG_SCORE_PENALTY }
}
