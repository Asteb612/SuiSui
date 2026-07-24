/**
 * Regular-expression capture-group parser (feature 006-step-catalog, US2).
 *
 * Scans a regex `source` for top-level capturing groups (skipping non-capturing
 * `(?:...)`, lookarounds, and character classes), recovering named groups and
 * literal alternations (`(a|b|c)` -> enum). Regex captures are strings, so an
 * anonymous group with no callback type is reported as a `string` parameter at
 * `partial` precision with an `UNSUPPORTED_REGEX_GROUP` note (names inferred).
 */
import type { CatalogDiagnostic, CatalogParameter } from '@suisui/shared'
import { diagnostics } from '../diagnostics'

interface CaptureGroup {
  order: number
  name?: string
  content: string
}

/** Extract capturing groups (named + anonymous) in declaration order. */
export function extractCaptureGroups(source: string): CaptureGroup[] {
  const result: CaptureGroup[] = []
  const stack: Array<{ capturing: boolean; name?: string; order: number; contentStart: number }> = []
  let inClass = false
  let order = 0
  let i = 0

  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      i++
      continue
    }
    if (c === '[') {
      inClass = true
      i++
      continue
    }
    if (c === '(') {
      let capturing = true
      let name: string | undefined
      let contentStart = i + 1
      if (source[i + 1] === '?') {
        const named = source.slice(i + 2).match(/^<([A-Za-z_]\w*)>/)
        if (named) {
          name = named[1]
          contentStart = i + 2 + named[0].length
        } else {
          capturing = false // (?:  (?=  (?!  (?<=  (?<!
        }
      }
      stack.push({ capturing, name, order: capturing ? order++ : -1, contentStart })
      i++
      continue
    }
    if (c === ')') {
      const entry = stack.pop()
      if (entry && entry.capturing) {
        result.push({ order: entry.order, name: entry.name, content: source.slice(entry.contentStart, i) })
      }
      i++
      continue
    }
    i++
  }

  return result.sort((a, b) => a.order - b.order)
}

/** True when a group's content is a pure literal alternation like `a|b|c`. */
function isLiteralAlternation(content: string): boolean {
  return /^[^()\\|]+(\|[^()\\|]+)+$/.test(content)
}

export interface RegexParseResult {
  parameters: CatalogParameter[]
  diagnostics: CatalogDiagnostic[]
}

/** Parse a regex source (+flags) into catalog parameters. */
export function parseRegexParameters(source: string): RegexParseResult {
  const groups = extractCaptureGroups(source)
  const parameters: CatalogParameter[] = []
  const diags: CatalogDiagnostic[] = []
  let hasAnonymous = false

  groups.forEach((group, index) => {
    const name = group.name ?? `arg${index}`
    if (!group.name) hasAnonymous = true

    if (isLiteralAlternation(group.content)) {
      parameters.push({
        index,
        name,
        type: 'enum',
        required: true,
        enumValues: group.content.split('|').map((v) => v.trim()),
        origin: 'pattern',
        precision: 'partial',
      })
    } else {
      parameters.push({
        index,
        name,
        type: 'string',
        required: true,
        origin: 'pattern',
        precision: 'partial',
      })
    }
  })

  if (hasAnonymous) diags.push(diagnostics.inferredParameterNames())
  return { parameters, diagnostics: diags }
}
