import type {
  CatalogParameter,
  CatalogStep,
  RecordedAction,
  RecordedActionStatus,
  StepArg,
  StepMatch,
} from '@suisui/shared'
import {
  GENERIC_STEP_RECORDER_MAP,
  type RecorderArgRole,
  type RecorderStepMapping,
} from './genericStepRecorderMap'
import { locatorToPageSelector } from './locators'

export interface StepMatchResult {
  match?: StepMatch
  alternatives: StepMatch[]
  status: RecordedActionStatus
}

/**
 * Stage-1 deterministic matcher: a recorded action → an existing bundled
 * generic step from the workspace catalog, with arguments filled from the
 * action (no AI). Singleton-free (owned by RecorderService) + DI of the
 * catalog snapshot for testability (Constitution III/IV).
 */
export class StepMatcherService {
  private steps: CatalogStep[] = []

  constructor(deps: { steps?: CatalogStep[] } = {}) {
    if (deps.steps) this.steps = deps.steps
  }

  /** Refresh the catalog snapshot (called at session start). */
  setSteps(steps: CatalogStep[]): void {
    this.steps = steps
  }

  match(action: RecordedAction): StepMatchResult {
    const mapping = GENERIC_STEP_RECORDER_MAP[action.type]
    if (!mapping) return { alternatives: [], status: 'gap' }

    const catalogMatches = this.steps.filter(
      (s) => s.keyword === mapping.keyword && s.pattern.source === mapping.pattern
    )
    if (catalogMatches.length === 0) return { alternatives: [], status: 'gap' }

    const built = catalogMatches.map((step) => buildMatch(step, mapping, action))
    const [primary, ...rest] = built
    return {
      match: primary!.match,
      alternatives: rest.map((b) => b.match),
      status: primary!.complete ? 'matched' : 'needs-review',
    }
  }
}

function buildMatch(
  step: CatalogStep,
  mapping: RecorderStepMapping,
  action: RecordedAction
): { match: StepMatch; complete: boolean } {
  let complete = true
  let targetArgName: string | undefined
  let valueArgName: string | undefined
  const args: StepArg[] = step.parameters.map((param, i) => {
    const role = mapping.args[i]
    const value = role ? roleValue(role, action) : param.defaultValue ?? ''
    if (param.required && value === '') complete = false
    const name = param.name || `arg${i}`
    if (role === 'target') targetArgName = name
    if (role === 'value') valueArgName = name
    const arg: StepArg = { name, value, type: mapParamType(param.type) }
    if (param.enumValues) arg.enumValues = param.enumValues
    if (param.tableColumns) arg.tableColumns = param.tableColumns
    return arg
  })

  const match: StepMatch = {
    definitionId: step.id,
    keyword: step.keyword,
    pattern: step.pattern.source,
    args,
    confidence: complete ? 1 : 0.6,
    source: 'deterministic',
    ...(step.source ? { definitionLocation: step.source } : {}),
    ...(targetArgName ? { targetArgName } : {}),
    ...(valueArgName ? { valueArgName } : {}),
  }
  return { match, complete }
}

function roleValue(role: RecorderArgRole, action: RecordedAction): string {
  return role === 'target' ? targetText(action) : valueText(action)
}

/** Runnable, readable selector string for the target argument (SC-005). */
function targetText(action: RecordedAction): string {
  if (action.selectedLocator) return locatorToPageSelector(action.selectedLocator)
  return ''
}

function valueText(action: RecordedAction): string {
  if (action.secret) return action.secretRef ?? ''
  return action.value ?? ''
}

export function mapParamType(type: CatalogParameter['type']): StepArg['type'] {
  switch (type) {
    case 'int':
      return 'int'
    case 'float':
      return 'float'
    case 'word':
      return 'word'
    case 'enum':
      return 'enum'
    case 'table':
      return 'table'
    case 'any':
      return 'any'
    case 'string':
    case 'doc-string':
      return 'string'
    default:
      // boolean, custom, unknown → free-form
      return 'any'
  }
}
