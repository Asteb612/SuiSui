/**
 * Global search across feature files and scenarios (feature 009).
 *
 * Search matches feature-file names, feature names, scenario names, and tags.
 * Step text is deliberately out of scope; `SearchResultType` is the extension
 * point if that changes.
 */

export type SearchResultType = 'feature' | 'scenario'

/** Why a result matched — drives whether the matching tag is shown. */
export type MatchedField = 'name' | 'tag'

/**
 * A highlighted span. Offsets index the ORIGINAL (non-normalized) display text,
 * which is why normalization must preserve length.
 */
export interface MatchRange {
  /** Inclusive start offset. */
  start: number
  /** Exclusive end offset. */
  end: number
}

export interface SearchResult {
  /** `${relativePath}` for features, `${relativePath}#${scenarioIndex}` for scenarios. */
  id: string
  type: SearchResultType
  /** Title to display: the feature name or the scenario name. */
  text: string
  /** Ranges within `text` that matched. Empty when `matchedField` is 'tag'. */
  ranges: MatchRange[]
  matchedField: MatchedField
  /** The tag that matched, without its leading '@'. Only when `matchedField` is 'tag'. */
  matchedTag?: string
  /** Feature path relative to the features directory — the navigation target. */
  relativePath: string
  /** Owning feature's declared name. */
  featureName: string
  /** Position of the scenario within its feature. Only for type 'scenario'. */
  scenarioIndex?: number
  /** Tags carried by this item, without leading '@'. */
  tags: string[]
  /** Relevance; higher sorts first. */
  score: number
}

export type SearchIndexState = 'idle' | 'building' | 'ready'

export interface SearchIndexStatus {
  state: SearchIndexState
  fileCount: number
  scenarioCount: number
  /**
   * Feature files that could not be parsed. They remain searchable by file name.
   */
  unparsedFiles: string[]
}

export interface SearchResponse {
  /** Echoes the request id so callers can discard stale responses. */
  requestId: number
  /** Ranked and truncated to at most `MAX_SEARCH_RESULTS`. */
  results: SearchResult[]
  /** Total matches before truncation. */
  totalMatches: number
  truncated: boolean
  status: SearchIndexStatus
}

export const MAX_SEARCH_RESULTS = 100

/** One scenario as seen by the outline parser — names and tags only, no steps. */
export interface ScenarioOutline {
  /** May be empty: a scenario with no title is tag-matchable but not name-matchable. */
  name: string
  /** Without leading '@'. */
  tags: string[]
  /** True for `Scenario Outline:`. Display-only; does not change search behaviour. */
  isOutline: boolean
  /**
   * 0-based line index of the `Scenario:` / `Scenario Outline:` line.
   * Added for feature 010 (tag editing splices lines); search ignores it.
   */
  line?: number
  /**
   * 0-based line index of the FIRST tag line in the block directly above.
   * Absent when the scenario has no tags — that is the case where a tag line
   * must be INSERTED rather than edited.
   */
  tagLine?: number
}

/** Result of scanning a .feature file for searchable names and tags. */
export interface FeatureOutline {
  /** From the `Feature:` line. Empty when absent. */
  name: string
  /** Without leading '@'. */
  tags: string[]
  scenarios: ScenarioOutline[]
  /** True when at least one line could not be interpreted. */
  hasParseErrors: boolean
  /** 0-based line index of the feature's own first tag line, when it has one. */
  featureTagLine?: number
}
