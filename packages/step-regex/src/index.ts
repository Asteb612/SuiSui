// Headline: typed structured-input → step pattern
export {
  step,
  str,
  int,
  float,
  word,
  any,
  oneOf,
  opt,
  alt,
  cols,
  bindSteps,
  getStepFragments,
} from './step'
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

// Rich step metadata (defineStep)
export { defineStep, getStepMetadata } from './define'
export type { StepMetadata, StepParameterMeta } from './define'

// Low-level fragment builders
export {
  cucumberArg,
  enumPattern,
  tableSuffix,
  optional,
  alternatives,
  buildStepPattern,
  type CucumberType,
} from './builders'

// Pattern → regex
export { stripAnchors, patternToRegex } from './regex'

// Pattern type handlers
export { cucumberHandler } from './handlers/cucumber'
export { enumHandler } from './handlers/enum'
export { tableHandler } from './handlers/table'

// Types
export type {
  PatternType,
  ArgDescription,
  PatternSegment,
  FormattedPattern,
} from './patterns-types'
export type { StepArgDefinition } from './step-types'

// Scenario context utility
export { createScenarioContext, type ScenarioContext } from './context'
