/**
 * Re-exports step pattern formatting from the shared package.
 *
 * The formatting logic (enum patterns, cucumber expressions, table columns,
 * anchor stripping, HTML escaping) is now consolidated in @suisui/shared.
 */
export { formatPattern as formatStepPattern } from '@suisui/shared'
export type { FormattedPattern as FormattedStepPattern, ArgDescription } from '@suisui/shared'
