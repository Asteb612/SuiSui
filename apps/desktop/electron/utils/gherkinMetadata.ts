import type { ScenarioTestInfo } from '@suisui/shared'

export interface ParsedFeatureMetadata {
  name: string
  tags: string[]
  scenarios: ScenarioTestInfo[]
}

/** `Examples:` / `Scenarios:` opens the example table of a `Scenario Outline`. */
const EXAMPLES_LINE = /^(Examples|Scenarios)\s*:/i
/** Any block keyword that ends the example table it follows. */
const BLOCK_LINE = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example)\s*:/i

/**
 * Lightweight Gherkin parser that extracts feature metadata (name, tags,
 * scenarios) without needing a full Cucumber parser dependency.
 */
export function parseFeatureMetadata(content: string): ParsedFeatureMetadata {
  const lines = content.split('\n')
  let featureName = ''
  const featureTags: string[] = []
  const scenarios: ScenarioTestInfo[] = []
  let pendingTags: string[] = []

  /**
   * The outline currently collecting example rows, and whether the next table
   * row is its header (which names the columns and is not a test).
   */
  let outline: ScenarioTestInfo | null = null
  let awaitingHeaderRow = false
  let inDocString = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Inside a doc string anything goes, including lines that look like tables.
    if (trimmed.startsWith('"""') || trimmed.startsWith('```')) {
      inDocString = !inDocString
      continue
    }
    if (inDocString) continue

    if (!trimmed || trimmed.startsWith('#')) continue

    // Example rows: the first is the column header, the rest are each one test.
    if (trimmed.startsWith('|')) {
      if (outline) {
        if (awaitingHeaderRow) awaitingHeaderRow = false
        else outline.testCount += 1
      }
      continue
    }

    if (trimmed.startsWith('@')) {
      const tags = trimmed
        .split(/\s+/)
        .filter((t) => t.startsWith('@'))
        .map((t) => t.slice(1))
      pendingTags.push(...tags)
      continue
    }

    if (EXAMPLES_LINE.test(trimmed)) {
      // A second `Examples:` block adds more rows to the SAME outline, so the
      // outline stays current — only the header expectation resets.
      awaitingHeaderRow = true
      continue
    }

    if (trimmed.startsWith('Feature:')) {
      featureName = trimmed.replace(/^Feature:\s*/, '')
      featureTags.push(...pendingTags)
      pendingTags = []
      outline = null
      continue
    }

    if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
      const isOutline = trimmed.startsWith('Scenario Outline:')
      const name = trimmed.replace(/^Scenario(?:\s+Outline)?:\s*/, '')
      const scenario: ScenarioTestInfo = {
        name,
        tags: [...featureTags, ...pendingTags],
        // An outline counts its example rows as it meets them; a plain scenario
        // is exactly one test.
        testCount: isOutline ? 0 : 1,
      }
      scenarios.push(scenario)
      outline = isOutline ? scenario : null
      awaitingHeaderRow = false
      pendingTags = []
      continue
    }

    // Steps belong to the scenario above; any other block ends the outline's
    // example table.
    if (BLOCK_LINE.test(trimmed)) {
      outline = null
      awaitingHeaderRow = false
    }

    // Non-tag, non-keyword line: clear orphaned pending tags
    pendingTags = []
  }

  // An outline whose `Examples:` table is missing or empty still authors a test
  // in the picker; reporting 0 would make it vanish from the count entirely.
  for (const scenario of scenarios) {
    if (scenario.testCount === 0) scenario.testCount = 1
  }

  return { name: featureName, tags: featureTags, scenarios }
}
