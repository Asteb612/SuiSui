/**
 * `defineStep()` — optional rich step metadata (feature 006-step-catalog, US4).
 *
 * A step author can attach a title, description, category, tags, and
 * per-parameter labels/examples to a step. `defineStep` returns the branded
 * pattern string itself, so it drops straight into playwright-bdd
 * `Given/When/Then` (and, being a `StepPattern<A>`, {@link bindSteps} types the
 * callback exactly as with a bare `step``` template). The metadata is kept in a
 * side registry, never by boxing the string.
 *
 * The SuiSui step catalog primarily reads this metadata statically from the AST;
 * the runtime registry is a convenience for tooling and the optional runtime
 * registry.
 */
import type { StepArgs, StepPattern } from './typed'

export interface StepParameterMeta {
  label?: string
  description?: string
  example?: string
  defaultValue?: string
}

export interface StepMetadata<A extends StepArgs = StepArgs> {
  /** The pattern — from a `step``` template or a raw string. */
  pattern: StepPattern<A>
  title?: string
  description?: string
  category?: string
  tags?: string[]
  /** Per-parameter descriptive metadata, keyed by capture name. */
  parameters?: Record<string, StepParameterMeta>
}

const metadataRegistry = new Map<string, StepMetadata>()

/**
 * Declare rich metadata for a step. Returns the branded pattern string so the
 * result is usable anywhere a pattern is expected.
 *
 * @example
 * const fillFieldStep = defineStep({
 *   pattern: step`I fill ${str('field')} with ${str('value')}`,
 *   title: 'Fill a form field',
 *   category: 'Form',
 *   parameters: { field: { label: 'Field', example: 'Email' } },
 * })
 * When(fillFieldStep, async ({ page }, field, value) => { ... })
 */
export function defineStep<A extends StepArgs>(meta: StepMetadata<A>): StepPattern<A> {
  metadataRegistry.set(meta.pattern, meta as StepMetadata)
  return meta.pattern
}

/** Retrieve the metadata registered for a pattern via {@link defineStep}. */
export function getStepMetadata(pattern: string): StepMetadata | undefined {
  return metadataRegistry.get(pattern)
}
