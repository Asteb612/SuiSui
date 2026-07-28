import type { FeatureOutline, ScenarioOutline } from '../types/search'

/**
 * Keywords that introduce a block but are NOT a searchable scenario.
 * `Examples` matters most here: its rows must never become search results.
 */
const NON_SCENARIO_BLOCK = /^(Background|Examples|Scenarios|Rule)\s*:/i

const FEATURE_LINE = /^Feature\s*:(.*)$/i
const SCENARIO_OUTLINE_LINE = /^(?:Scenario Outline|Scenario Template)\s*:(.*)$/i
const SCENARIO_LINE = /^Scenario\s*:(.*)$/i

/** A structural keyword used without its colon — a real malformation signal. */
const KEYWORD_WITHOUT_COLON =
  /^(Feature|Scenario Outline|Scenario Template|Scenario|Background|Examples|Rule)\s*(?!:)(\s|$)/i

const VALID_TAG = /^@[\p{L}\p{N}_\-.:]+$/u

/**
 * Extract searchable names and tags from `.feature` content.
 *
 * Deliberately NOT a Gherkin parser: it reads only what search indexes — the
 * feature name, scenario names, and tags. Steps, doc strings, data tables, and
 * `Examples` rows are skipped by design (step text is out of scope).
 *
 * Never throws. An unrecognized line is skipped rather than fatal, which is how
 * a malformed file stays partially searchable instead of taking down the whole
 * index.
 */
export function parseFeatureOutline(content: string): FeatureOutline {
  const outline: FeatureOutline = {
    name: '',
    tags: [],
    scenarios: [],
    hasParseErrors: false,
  }

  let pendingTags: string[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('#')) continue

    if (line.startsWith('@')) {
      for (const piece of line.split(/\s+/)) {
        if (VALID_TAG.test(piece)) {
          pendingTags.push(piece.slice(1))
        } else {
          outline.hasParseErrors = true
        }
      }
      continue
    }

    const outlineMatch = SCENARIO_OUTLINE_LINE.exec(line)
    if (outlineMatch) {
      outline.scenarios.push(makeScenario(outlineMatch[1], pendingTags, true))
      pendingTags = []
      continue
    }

    const scenarioMatch = SCENARIO_LINE.exec(line)
    if (scenarioMatch) {
      outline.scenarios.push(makeScenario(scenarioMatch[1], pendingTags, false))
      pendingTags = []
      continue
    }

    const featureMatch = FEATURE_LINE.exec(line)
    if (featureMatch) {
      outline.name = (featureMatch[1] ?? '').trim()
      outline.tags = pendingTags
      pendingTags = []
      continue
    }

    if (NON_SCENARIO_BLOCK.test(line)) {
      pendingTags = []
      continue
    }

    if (KEYWORD_WITHOUT_COLON.test(line)) {
      outline.hasParseErrors = true
      continue
    }

    // Anything else — steps, descriptions, table rows, doc strings — is not
    // indexed and is not an error.
  }

  return outline
}

function makeScenario(rawName: string | undefined, tags: string[], isOutline: boolean): ScenarioOutline {
  return {
    name: (rawName ?? '').trim(),
    tags,
    isOutline,
  }
}
