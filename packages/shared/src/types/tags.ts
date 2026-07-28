/**
 * Tag management across the workspace (feature 010).
 *
 * Tags are stored WITHOUT their leading '@' and compared case-sensitively,
 * matching Gherkin semantics — `@Smoke` and `@smoke` are two different tags.
 */

/**
 * Why a scenario carries a tag.
 *
 * `inherited` tags come from the feature and apply to every scenario beneath
 * it, which is what makes them non-removable at scenario level.
 */
export type TagOrigin = 'direct' | 'inherited'

/** One scenario carrying one tag. */
export interface TagUsage {
  /** Stable identity: `${relativePath}#${scenarioIndex}`. */
  id: string
  /** Feature file, relative to the features directory. */
  relativePath: string
  /** Owning feature's declared name (falls back to the file's base name). */
  featureName: string
  /** Position of the scenario within its feature. */
  scenarioIndex: number
  /** Scenario name. May be empty — an untitled scenario still carries tags. */
  scenarioName: string
  origin: TagOrigin
}

export interface TagSummary {
  /** Tag name WITHOUT the leading '@'. Case-sensitive. */
  name: string
  /** Number of DISTINCT scenarios carrying it (direct + inherited, deduplicated). */
  scenarioCount: number
  /** True when at least one feature declares it at feature level. */
  usedAtFeatureLevel: boolean
  /** True when at least one scenario declares it directly. */
  usedAtScenarioLevel: boolean
  /**
   * True when the tag exists only on features containing no scenarios, so a
   * count of 0 is legitimate rather than a bug.
   */
  orphaned: boolean
}

export type TagIndexState = 'idle' | 'building' | 'ready'

export interface TagIndex {
  state: TagIndexState
  tags: TagSummary[]
  /** Usages keyed by tag name. Shipped with the index so counts and detail can never disagree. */
  usages: Record<string, TagUsage[]>
  /** Feature files that could not be parsed; their tags are missing from the index. */
  unparsedFiles: string[]
  fileCount: number
  scenarioCount: number
}

export type BulkTagOperation = 'add' | 'remove'

export interface BulkTagTarget {
  relativePath: string
  scenarioIndex: number
}

export interface BulkTagRequest {
  operation: BulkTagOperation
  /** Tag name, with or without a leading '@'. Validated at the IPC boundary. */
  tag: string
  targets: BulkTagTarget[]
}

export type TagWriteStatus =
  /** The scenario's tags were modified. */
  | 'changed'
  /** add: already carried it; remove: did not carry it. Nothing written. */
  | 'unchanged'
  /** remove: the tag is inherited from the feature and is not removable here. */
  | 'skipped'
  /** The write or its post-write verification failed. */
  | 'failed'

export interface TagWriteOutcome {
  relativePath: string
  scenarioIndex: number
  scenarioName: string
  status: TagWriteStatus
  /** Present when status is 'skipped' or 'failed'. */
  reason?: string
}

export interface BulkTagResult {
  operation: BulkTagOperation
  tag: string
  outcomes: TagWriteOutcome[]
  changedCount: number
  filesChanged: number
  failedCount: number
  /** The index AFTER the operation, so counts can never lag the change. */
  index: TagIndex
}
