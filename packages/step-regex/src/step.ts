import {
  cucumberArg,
  enumPattern,
  optional,
  alternatives,
  tableSuffix,
} from './builders'
import type { Frag, StepPattern, CaptureTypes, DataTableArg } from './typed'

export { bindSteps } from './typed'
export type {
  StepPattern,
  StepArgs,
  Frag,
  DataTableArg,
  BoundStepFn,
  BoundSteps,
} from './typed'

const frag = <T>(text: string): Frag<T> => ({ text })

/** `{string}` — captures a `string`. Pass a name for `{string:name}`. */
export const str = (name?: string): Frag<string> =>
  frag(cucumberArg('string', name))

/** `{int}` — captures a `number`. */
export const int = (name?: string): Frag<number> =>
  frag(cucumberArg('int', name))

/** `{float}` — captures a `number`. */
export const float = (name?: string): Frag<number> =>
  frag(cucumberArg('float', name))

/** `{word}` — captures a `string` (single token). */
export const word = (name?: string): Frag<string> =>
  frag(cucumberArg('word', name))

/** `{any}` — captures a `string` (anything). */
export const any = (name?: string): Frag<string> =>
  frag(cucumberArg('any', name))

/** `(a|b|c)` — captures the literal union of the given values. */
export const oneOf = <const V extends readonly string[]>(
  values: V,
): Frag<V[number]> => frag(enumPattern(values as readonly string[] as string[]))

/** `(Col1, Col2):` — captures a typed DataTable keyed by the columns. */
export const cols = <const C extends readonly string[]>(
  columns: C,
): Frag<DataTableArg<C[number]>> =>
  frag(tableSuffix(columns as readonly string[] as string[]))

/** `(text)` — optional literal text. Captures nothing. */
export const opt = (text: string): Frag<never> => frag(optional(text))

/** `a/b` — alternative literal words. Captures nothing. */
export const alt = (words: string[]): Frag<never> => frag(alternatives(words))

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
  return out.replace(/\s+/g, ' ').trim() as StepPattern<CaptureTypes<V>>
}
