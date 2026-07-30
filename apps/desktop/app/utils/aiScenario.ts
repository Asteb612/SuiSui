import type {
  StepDefinition,
  StepArg,
  ScenarioDraft,
  ScenarioGenerationOutcome,
  DraftStep,
  DroppedStep,
  CoverageGap,
} from '@suisui/shared'
import { matchStep, tokenize, matchText } from '@suisui/shared'

/**
 * How many steps may be sent in one prompt. A workspace with thousands of steps
 * would otherwise build an unbounded prompt and fail at the worst moment. When
 * the cap bites, generic steps are dropped before project steps, so truncation
 * reinforces the project-first preference rather than fighting it.
 */
export const STEP_PROMPT_BUDGET = 300

/**
 * Choose and order the steps sent to the model.
 *
 * Project steps come first (lowest indices), ranked by literal relevance to the
 * description, then generic steps. The prompt tells the model to prefer
 * lower-numbered steps, which is how FR-009 is expressed without ever naming the
 * tier — see `AIService.buildScenarioPrompt`.
 *
 * `truncated` is true when the budget dropped steps, so the tester can be told
 * (FR-022).
 */
export function selectStepsForPrompt(
  steps: StepDefinition[],
  description: string,
): { steps: StepDefinition[]; truncated: boolean } {
  const tokens = tokenize(description)

  const score = (s: StepDefinition): number =>
    tokens.length === 0 ? 0 : matchText(s.pattern, tokens) ? 1 : 0

  const rank = (group: StepDefinition[]): StepDefinition[] =>
    // Stable: equal-scoring steps keep catalog order, so prompts are reproducible.
    group
      .map((s, i) => ({ s, i, score: score(s) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((e) => e.s)

  const project = rank(steps.filter((s) => !s.isGeneric))
  const generic = rank(steps.filter((s) => s.isGeneric))

  const ordered = [...project, ...generic]
  if (ordered.length <= STEP_PROMPT_BUDGET) {
    return { steps: ordered, truncated: false }
  }

  return { steps: ordered.slice(0, STEP_PROMPT_BUDGET), truncated: true }
}

/**
 * Resolution of an AI scenario-generation response (feature 012).
 *
 * This module is the ENFORCEMENT POINT for "only available steps". The model is
 * asked to select steps by index into a list it was given; identity is then read
 * from the catalog entry that index resolves to. `keyword`, `pattern` and `tier`
 * are NEVER read from the response — if they were, FR-004 and SC-001 would rest
 * on prompt wording rather than on code.
 *
 * The model's response is untrusted input crossing a boundary. Nothing here
 * throws, and a response that cannot be resolved produces an explicit outcome
 * rather than a partial draft.
 */

/** One step as the model proposed it, before resolution. */
interface RawStep {
  i?: unknown
  text?: unknown
}

interface RawScenario {
  name?: unknown
  tags?: unknown
  steps?: unknown
}

/**
 * Strip a markdown code fence if the model wrapped its JSON in one, then take
 * the outermost JSON object. Models routinely add prose either side despite
 * being asked not to.
 */
function extractJson(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? trimmed).trim()

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  return body.slice(start, end + 1)
}

/** Resolve one proposed step, or explain why it could not be resolved. */
function resolveStep(
  raw: RawStep,
  steps: StepDefinition[],
): { step: DraftStep } | { dropped: DroppedStep } {
  const text = typeof raw.text === 'string' ? raw.text : ''

  if (typeof raw.i !== 'number' || !Number.isInteger(raw.i) || raw.i < 0 || raw.i >= steps.length) {
    return { dropped: { raw: text || String(raw.i ?? ''), reason: 'out-of-range' } }
  }

  // Identity comes from here and nowhere else.
  const def = steps[raw.i]!

  const matched = matchStep(text, def)

  let args: StepArg[]
  let unresolvedArgs: string[]

  if (matched) {
    args = matched.args
    // An argument the model left empty is one the tester still has to supply.
    unresolvedArgs = matched.args.filter((a) => a.value === '').map((a) => a.name)
  } else {
    // The text does not fit the step it chose. Keep the step — the index is the
    // authoritative part — but no argument value can be trusted (FR-006).
    args = def.args.map((a) => ({
      name: a.name,
      type: a.type,
      value: '',
      enumValues: a.enumValues,
      tableColumns: a.tableColumns,
    }))
    unresolvedArgs = def.args.map((a) => a.name)
  }

  return {
    step: {
      catalogStepId: def.id,
      keyword: def.keyword,
      pattern: def.pattern,
      tier: def.isGeneric ? 'generic' : 'project',
      args,
      unresolvedArgs,
    },
  }
}

function resolveScenario(
  raw: RawScenario,
  steps: StepDefinition[],
  gaps: CoverageGap[],
): ScenarioDraft | null {
  const proposed = Array.isArray(raw.steps) ? (raw.steps as RawStep[]) : []

  const resolved: DraftStep[] = []
  const dropped: DroppedStep[] = []

  for (const item of proposed) {
    if (typeof item !== 'object' || item === null) {
      dropped.push({ raw: String(item), reason: 'malformed' })
      continue
    }
    const result = resolveStep(item, steps)
    if ('step' in result) resolved.push(result.step)
    else dropped.push(result.dropped)
  }

  // A scenario with no real steps is not a draft (FR-005, SC-006).
  if (resolved.length === 0) return null

  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    steps: resolved,
    gaps,
    dropped,
    validation: null,
    requirementRef: null,
  }
}

/**
 * Parse and resolve a model response into an outcome.
 *
 * Always returns one of `drafted` / `empty` / `failed` — never throws, and never
 * returns a draft containing a step that is not in `steps`.
 *
 * @param raw   the accumulated response text
 * @param steps the step list sent to the model, in the SAME ORDER — indices in
 *              the response are positions in this array
 */
export function parseScenarioResponse(
  raw: string,
  steps: StepDefinition[],
): ScenarioGenerationOutcome {
  const json = extractJson(raw)
  if (json === null) {
    return { status: 'failed', message: 'The assistant did not return a usable response.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { status: 'failed', message: 'The assistant returned a response that could not be read.' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'failed', message: 'The assistant returned a response that could not be read.' }
  }

  const root = parsed as { scenarios?: unknown; gaps?: unknown }

  if (!Array.isArray(root.scenarios)) {
    return { status: 'failed', message: 'The assistant returned a response that could not be read.' }
  }

  const gaps: CoverageGap[] = Array.isArray(root.gaps)
    ? root.gaps.filter((g): g is string => typeof g === 'string').map((text) => ({ text }))
    : []

  const scenarios: ScenarioDraft[] = []
  for (const item of root.scenarios) {
    if (typeof item !== 'object' || item === null) continue
    const draft = resolveScenario(item as RawScenario, steps, gaps)
    if (draft) scenarios.push(draft)
  }

  if (scenarios.length === 0) {
    return {
      status: 'empty',
      reason:
        gaps.length > 0
          ? 'No scenario could be assembled from the available steps.'
          : 'The assistant could not assemble a scenario from the available steps.',
    }
  }

  return { status: 'drafted', scenarios, truncated: false }
}
