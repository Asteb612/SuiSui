/**
 * Type machinery for the typed `step` tagged-template. Zero runtime cost
 * except {@link bindSteps}, whose implementation is the identity function —
 * it only re-types an existing playwright-bdd-shaped trio.
 */

/** Tuple of argument types captured by a step pattern. */
export type StepArgs = readonly unknown[]

/**
 * A step pattern string branded with the tuple of arguments it captures.
 * The brand is optional, so a `StepPattern<A>` is still assignable to a plain
 * `string` (works as the first arg of playwright-bdd `Given/When/Then` even
 * without {@link bindSteps}).
 */
export type StepPattern<A extends StepArgs = StepArgs> = string & {
  readonly __args?: A
}

/**
 * A pattern fragment produced by an interpolation helper. `text` is the
 * literal pattern piece; `__t` is a phantom carrying the captured arg type
 * (`never` for non-capturing fragments such as `opt`/`alt`).
 */
export interface Frag<T = never> {
  readonly text: string
  readonly __t?: T
}

/**
 * Structural approximation of playwright-bdd's DataTable, parameterized by
 * the column names declared via `cols([...] as const)`.
 */
export interface DataTableArg<Cols extends string = string> {
  rows(): Array<Record<Cols, string>>
  hashes(): Array<Record<Cols, string>>
  raw(): string[][]
}

/**
 * Walk an interpolated `Frag<...>[]` tuple and collect, in order, the capture
 * type of every capturing fragment — dropping `Frag<never>` (opt/alt/text).
 */
export type CaptureTypes<V extends readonly unknown[]> = V extends readonly [
  infer H,
  ...infer R,
]
  ? H extends Frag<infer T>
    ? [T] extends [never]
      ? CaptureTypes<R>
      : [T, ...CaptureTypes<R>]
    : CaptureTypes<R>
  : []

/** Loosest shape every playwright-bdd step function conforms to. */
export type AnyStepFn = (
  pattern: never,
  cb: (...args: never[]) => unknown,
  ...rest: never[]
) => unknown

/**
 * Re-type a single BDD step function so that, when called with a
 * `StepPattern<A>`, the callback's parameters after the fixtures object are
 * inferred as `A`.
 */
export type BoundStepFn<F> = F extends (
  pattern: infer _P,
  cb: (fixtures: infer X, ...cbArgs: infer _CA) => infer CR,
  ...rest: infer Rs
) => infer Ret
  ? <A extends StepArgs>(
      pattern: StepPattern<A>,
      cb: (fixtures: X, ...args: A) => CR,
      ...rest: Rs
    ) => Ret
  : F

export type BoundSteps<T> = {
  [K in keyof T]: BoundStepFn<T[K]>
}

/**
 * Re-type a playwright-bdd `{ Given, When, Then }` record (or any subset, or a
 * single step function) so callbacks get typed arguments inferred from the
 * `step` pattern. Runtime is the identity — only the types change.
 *
 * @example
 * const { Given, When, Then } = bindSteps(createBdd())
 */
export function bindSteps<F extends AnyStepFn>(fn: F): BoundStepFn<F>
export function bindSteps<T extends Record<string, AnyStepFn>>(
  trio: T,
): BoundSteps<T>
export function bindSteps(value: unknown): unknown {
  return value
}
