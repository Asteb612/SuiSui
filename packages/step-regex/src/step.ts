import {
  cucumberArg,
  enumPattern,
  optional,
  alternatives,
  tableSuffix,
} from './builders'
import type {
  Frag,
  FragmentMeta,
  StepPattern,
  CaptureTypes,
  DataTableArg,
} from './typed'

export { bindSteps } from './typed'
export type {
  StepPattern,
  StepArgs,
  Frag,
  FragmentKind,
  FragmentMeta,
  DataTableArg,
  BoundStepFn,
  BoundSteps,
} from './typed'

const frag = <T>(text: string, meta: FragmentMeta): Frag<T> => ({ text, meta })

/** `{string}` — captures a `string`. Pass a name for `{string:name}`. */
export const str = (name?: string): Frag<string> =>
  frag(cucumberArg('string', name), { kind: 'string', name, captures: true })

/** `{int}` — captures a `number`. */
export const int = (name?: string): Frag<number> =>
  frag(cucumberArg('int', name), { kind: 'int', name, captures: true })

/** `{float}` — captures a `number`. */
export const float = (name?: string): Frag<number> =>
  frag(cucumberArg('float', name), { kind: 'float', name, captures: true })

/** `{word}` — captures a `string` (single token). */
export const word = (name?: string): Frag<string> =>
  frag(cucumberArg('word', name), { kind: 'word', name, captures: true })

/** `{any}` — captures a `string` (anything). */
export const any = (name?: string): Frag<string> =>
  frag(cucumberArg('any', name), { kind: 'any', name, captures: true })

/** `(a|b|c)` — captures the literal union of the given values. */
export const oneOf = <const V extends readonly string[]>(
  values: V,
): Frag<V[number]> =>
  frag(enumPattern(values as readonly string[] as string[]), {
    kind: 'enum',
    enumValues: [...values],
    captures: true,
  })

/** `(Col1, Col2):` — captures a typed DataTable keyed by the columns. */
export const cols = <const C extends readonly string[]>(
  columns: C,
): Frag<DataTableArg<C[number]>> =>
  frag(tableSuffix(columns as readonly string[] as string[]), {
    kind: 'table',
    tableColumns: [...columns],
    captures: true,
  })

/** `(text)` — optional literal text. Captures nothing. */
export const opt = (text: string): Frag<never> =>
  frag(optional(text), { kind: 'optional', captures: false })

/** `a/b` — alternative literal words. Captures nothing. */
export const alt = (words: string[]): Frag<never> =>
  frag(alternatives(words), { kind: 'alternative', captures: false })

/**
 * Side registry of the fragments that assembled each `step``` pattern, keyed by
 * the resulting pattern string. Keeps the pattern a plain string primitive for
 * playwright-bdd while making fragment metadata retrievable at runtime (feature
 * 006-step-catalog). Identical patterns map to identical fragments.
 */
const fragmentRegistry = new Map<string, FragmentMeta[]>()

/** Retrieve the fragment metadata that built a `step``` pattern, if recorded. */
export function getStepFragments(pattern: string): FragmentMeta[] | undefined {
  return fragmentRegistry.get(pattern)
}

/**
 * Tagged template that assembles a typed, whitespace-normalized step pattern
 * from literal text and interpolation fragments. The result is a branded
 * `string` carrying the tuple of captured argument types, so it drops directly
 * into playwright-bdd `Given/When/Then` (use {@link bindSteps} to get the
 * callback arguments typed). For a `RegExp`, wrap with `patternToRegex`.
 *
 * @example
 * Then(step`I wait for ${int()} second${opt('s')}`,
 *   async ({ page }, seconds) => { ... }) // seconds: number
 */
export function step<const V extends readonly Frag<unknown>[]>(
  strings: TemplateStringsArray,
  ...vals: V
): StepPattern<CaptureTypes<V>> {
  let out = ''
  for (let i = 0; i < strings.length; i++) {
    out += strings[i]
    if (i < vals.length) out += vals[i]!.text
  }
  const pattern = out.replace(/\s+/g, ' ').trim()
  const fragments = vals
    .map((v) => v.meta)
    .filter((m): m is FragmentMeta => m !== undefined)
  if (fragments.length > 0) fragmentRegistry.set(pattern, fragments)
  return pattern as StepPattern<CaptureTypes<V>>
}
