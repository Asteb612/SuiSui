import type { AuthoredSteps } from './mergeLiveSteps'
import { stepTitleMatches } from './stepTitle'

const STEP_LINE = /^(Given|When|Then|And|But)\s+(.*)$/i
const BACKGROUND_LINE = /^Background\s*:/i
const SCENARIO_LINE = /^(?:Scenario Outline|Scenario Template|Scenario|Example)\s*:(.*)$/i
/** Blocks that end a step list without starting a new scenario. */
const OTHER_BLOCK = /^(Feature|Examples|Scenarios|Rule)\s*:/i

/** The authored step lists of one feature file, keyed by scenario name. */
export interface FeatureStepIndex {
  /** Step titles from the feature's `Background`, in order. */
  background: string[]
  /** Scenario name (as authored, placeholders intact) → its own step titles. */
  scenarios: Map<string, string[]>
}

/**
 * Extract authored step titles from `.feature` content.
 *
 * Needed because the reporter emits nothing for steps that have not run — the
 * authored list is the only source of the steps still to come, and of the tail
 * that a failure cut short.
 *
 * Like `parseFeatureOutline`, this is a line scanner rather than a Gherkin parser:
 * it reads step lines and the blocks that delimit them, and skips everything else
 * (doc strings, data tables, `Examples` rows, comments). It never throws — a
 * malformed file degrades to fewer known steps, which shows as `pending`, not to
 * a broken run view.
 */
export function parseFeatureSteps(content: string): FeatureStepIndex {
  const index: FeatureStepIndex = { background: [], scenarios: new Map() }

  /** Where step lines currently accumulate; null outside any step block. */
  let target: string[] | null = null
  /** Inside a ``` or """ doc string, where step-looking lines are just text. */
  let inDocString = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (line.startsWith('"""') || line.startsWith('```')) {
      inDocString = !inDocString
      continue
    }
    if (inDocString) continue

    if (line.length === 0 || line.startsWith('#') || line.startsWith('@')) continue
    // Data table rows can otherwise look like anything.
    if (line.startsWith('|')) continue

    if (BACKGROUND_LINE.test(line)) {
      index.background = []
      target = index.background
      continue
    }

    const scenario = line.match(SCENARIO_LINE)
    if (scenario) {
      const name = (scenario[1] ?? '').trim()
      const steps: string[] = []
      index.scenarios.set(name, steps)
      target = steps
      continue
    }

    if (OTHER_BLOCK.test(line)) {
      // `Examples:` ends the outline's steps; `Feature:`/`Rule:` open no step list.
      target = null
      continue
    }

    const step = line.match(STEP_LINE)
    if (step && target) {
      // Normalize the keyword's case so it matches what the reporter emits.
      const keyword = step[1]!
      const canonical = keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase()
      target.push(`${canonical} ${(step[2] ?? '').trim()}`)
    }
  }

  return index
}

/**
 * Authored steps for one scenario, background first — the order the reporter
 * numbers steps in.
 *
 * `reportedName` is the title as the reporter gave it, which for a `Scenario
 * Outline` row is the substituted form (`Buying 1 items`), so an exact lookup is
 * tried first and placeholder matching second.
 */
export function authoredStepsFor(
  index: FeatureStepIndex,
  reportedName: string,
): AuthoredSteps | null {
  let steps = index.scenarios.get(reportedName)

  if (!steps) {
    for (const [name, candidate] of index.scenarios) {
      if (stepTitleMatches(name, reportedName)) {
        steps = candidate
        break
      }
    }
  }

  if (!steps) return null

  return {
    titles: [...index.background, ...steps],
    backgroundCount: index.background.length,
  }
}
