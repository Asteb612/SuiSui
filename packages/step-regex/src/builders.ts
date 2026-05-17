/**
 * Low-level, pure string helpers that turn structured input into a step
 * pattern fragment. These are the inverse of {@link patternToRegex}: instead
 * of parsing a pattern, they assemble one. The typed `step` tagged-template
 * and its interpolation helpers (str/int/oneOf/...) are built on top of these.
 */

export type CucumberType = 'string' | 'int' | 'float' | 'word' | 'any'

/** `('string')` → `{string}`; `('string', 'email')` → `{string:email}` */
export function cucumberArg(type: CucumberType, name?: string): string {
  return name ? `{${type}:${name}}` : `{${type}}`
}

/** `['admin','user','guest']` → `(admin|user|guest)` (an enum capture) */
export function enumPattern(values: string[]): string {
  if (values.length < 2) {
    throw new Error('enumPattern: need at least 2 values')
  }
  return `(${values.map((v) => v.trim()).join('|')})`
}

/** `['Field','Value']` → `(Field, Value):` (a trailing DataTable suffix) */
export function tableSuffix(columns: string[]): string {
  if (columns.length < 2) {
    throw new Error('tableSuffix: need at least 2 columns')
  }
  return `(${columns.map((c) => c.trim()).join(', ')}):`
}

/** `'s'` → `(s)` — optional literal text (parens without a pipe) */
export function optional(text: string): string {
  return `(${text})`
}

/** `['belly','stomach']` → `belly/stomach` — alternative words */
export function alternatives(words: string[]): string {
  return words.map((w) => w.trim()).join('/')
}

/** Join fragments into one whitespace-normalized pattern string */
export function buildStepPattern(...parts: string[]): string {
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
