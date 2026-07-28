import type { BulkTagOperation } from '../types/tags'

export interface SpliceRequest {
  /**
   * File content split on /\n/ — NOT /\r?\n/.
   *
   * Splitting on /\r?\n/ consumes the `\r`, so rejoining would rewrite every
   * line of a CRLF file to LF. Splitting on /\n/ leaves the `\r` at the end of
   * each line, and `lines.join('\n')` round-trips the file exactly. Line
   * indices are identical either way, so parser positions still line up.
   */
  lines: string[]
  /** 0-based line of the `Scenario:` keyword — where a tag line is inserted. */
  scenarioLine: number
  /** 0-based line of the existing tag block, when the scenario already has tags. */
  tagLine?: number
  /** Tag name WITHOUT a leading '@'. */
  tag: string
  operation: BulkTagOperation
}

export interface SpliceResult {
  lines: string[]
  changed: boolean
  /** +1 when a tag line was inserted, -1 when an emptied one was removed. */
  lineDelta: number
}

/** Windows files keep their `\r`; splitting on /\r?\n/ leaves it on the line. */
function splitLineEnding(line: string): { body: string; ending: string } {
  return line.endsWith('\r') ? { body: line.slice(0, -1), ending: '\r' } : { body: line, ending: '' }
}

/** Leading whitespace of a line, preserved verbatim (tabs stay tabs). */
function indentOf(line: string): string {
  return splitLineEnding(line).body.match(/^\s*/)?.[0] ?? ''
}

/**
 * Add or remove one tag on one scenario, touching only its tag line.
 *
 * Deliberately NOT a parse-and-regenerate: everything else in the file — steps,
 * comments, blank lines, indentation, line endings — is copied through
 * untouched. Regenerating would silently reformat the user's suite.
 *
 * Matching is token-level, never substring, so removing `@smoke` cannot damage
 * `@smoke-test`.
 */
export function spliceTag(request: SpliceRequest): SpliceResult {
  const { lines, scenarioLine, tagLine, tag, operation } = request
  const unchanged: SpliceResult = { lines, changed: false, lineDelta: 0 }

  if (tag.length === 0) return unchanged

  return operation === 'add'
    ? addTag(lines, scenarioLine, tagLine, tag)
    : removeTag(lines, tagLine, tag)
}

function addTag(
  lines: string[],
  scenarioLine: number,
  tagLine: number | undefined,
  tag: string
): SpliceResult {
  const token = `@${tag}`

  if (tagLine === undefined) {
    const anchor = lines[scenarioLine]
    if (anchor === undefined) return { lines, changed: false, lineDelta: 0 }

    const { ending } = splitLineEnding(anchor)
    const next = [...lines]
    // Match the scenario's own indentation, and its line ending, so the inserted
    // line is indistinguishable from one the user wrote.
    next.splice(scenarioLine, 0, `${indentOf(anchor)}${token}${ending}`)
    return { lines: next, changed: true, lineDelta: 1 }
  }

  const existing = lines[tagLine]
  if (existing === undefined) return { lines, changed: false, lineDelta: 0 }

  const { body, ending } = splitLineEnding(existing)
  if (tokensOf(body).includes(token)) {
    // Already carried — adding again must not produce a duplicate.
    return { lines, changed: false, lineDelta: 0 }
  }

  const next = [...lines]
  next[tagLine] = `${body.replace(/\s+$/, '')} ${token}${ending}`
  return { lines: next, changed: true, lineDelta: 0 }
}

function removeTag(lines: string[], tagLine: number | undefined, tag: string): SpliceResult {
  if (tagLine === undefined) return { lines, changed: false, lineDelta: 0 }

  const existing = lines[tagLine]
  if (existing === undefined) return { lines, changed: false, lineDelta: 0 }

  const token = `@${tag}`
  const { body, ending } = splitLineEnding(existing)
  const indent = indentOf(existing)

  const { tokens, trailing } = splitTagLine(body)
  if (!tokens.includes(token)) return { lines, changed: false, lineDelta: 0 }

  const kept = tokens.filter((candidate) => candidate !== token)
  const next = [...lines]

  if (kept.length === 0 && trailing.length === 0) {
    // The line existed only for this tag.
    next.splice(tagLine, 1)
    return { lines: next, changed: true, lineDelta: -1 }
  }

  const rebuilt = `${indent}${kept.join(' ')}${trailing ? `${kept.length ? ' ' : ''}${trailing}` : ''}`
  next[tagLine] = `${rebuilt}${ending}`
  return { lines: next, changed: true, lineDelta: 0 }
}

/** Tag tokens on a line, ignoring anything from a trailing comment onward. */
function tokensOf(body: string): string[] {
  return splitTagLine(body).tokens
}

/**
 * Split a tag line into its tag tokens and whatever trails them (a comment).
 * A trailing comment must survive the edit, so it is carried separately.
 */
function splitTagLine(body: string): { tokens: string[]; trailing: string } {
  const commentAt = body.indexOf('#')
  const tagPart = commentAt === -1 ? body : body.slice(0, commentAt)
  const trailing = commentAt === -1 ? '' : body.slice(commentAt).trim()

  const tokens = tagPart
    .trim()
    .split(/\s+/)
    .filter((piece) => piece.startsWith('@'))

  return { tokens, trailing }
}
