import type { ScenarioTestInfo } from '@suisui/shared'

export interface ParsedFeatureMetadata {
  name: string
  tags: string[]
  scenarios: ScenarioTestInfo[]
}

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

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('@')) {
      const tags = trimmed
        .split(/\s+/)
        .filter((t) => t.startsWith('@'))
        .map((t) => t.slice(1))
      pendingTags.push(...tags)
      continue
    }

    if (trimmed.startsWith('Feature:')) {
      featureName = trimmed.replace(/^Feature:\s*/, '')
      featureTags.push(...pendingTags)
      pendingTags = []
      continue
    }

    if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
      const name = trimmed.replace(/^Scenario(?:\s+Outline)?:\s*/, '')
      scenarios.push({
        name,
        tags: [...featureTags, ...pendingTags],
      })
      pendingTags = []
      continue
    }

    // Non-tag, non-keyword line: clear orphaned pending tags
    pendingTags = []
  }

  return { name: featureName, tags: featureTags, scenarios }
}
