/**
 * Serializable contract for the native step catalog (feature 006-step-catalog).
 *
 * These types are the single source of truth for the catalog data that crosses
 * the IPC boundary from the main-process engine (`@suisui/step-catalog`) to the
 * renderer. They MUST stay JSON-serializable and versioned. Engine-internal
 * types (analyzer IR, cache envelope) live in `@suisui/step-catalog` and never
 * cross IPC.
 */

/** Catalog keyword subset. Scenario-level `StepKeyword` additionally has And/But. */
export type CatalogStepKeyword = 'Given' | 'When' | 'Then'

export type StepPatternKind =
  | 'cucumber' // {string}, {int}, {string:name}, ...
  | 'regexp' // /^.../flags
  | 'plain-string' // no captures
  | 'suisui-template' // built from step`` / defineStep
  | 'dynamic' // depends on a runtime value
  | 'unknown'

export type MetadataOrigin =
  | 'suisui' // explicit defineStep metadata (most authoritative)
  | 'typescript' // callback types / TypeChecker
  | 'pattern' // inferred from the pattern string
  | 'runtime' // runtime registry fallback (deferred)

export type MetadataPrecision = 'exact' | 'inferred' | 'partial' | 'unknown'

/**
 * Who authored a step (feature 012, FR-008).
 *
 * `generic` = the starter step-definition file the app provisions when a
 * workspace is initialised; `project` = written by the team. Distinct from
 * `MetadataOrigin`, which is about how a step's metadata was extracted, not
 * who wrote the step.
 *
 * DERIVED at load time from the step's source file — never authored, and
 * deliberately not part of the catalog cache key, so a workspace whose
 * features directory changed cannot serve a stale tier.
 */
export type StepTier = 'project' | 'generic'

export type ParameterType =
  | 'string'
  | 'int'
  | 'float'
  | 'word'
  | 'any'
  | 'boolean'
  | 'enum'
  | 'table'
  | 'doc-string'
  | 'custom'
  | 'unknown'

export type DiagnosticSeverity = 'info' | 'warning' | 'error'

export type DiagnosticCode =
  | 'DYNAMIC_STEP_PATTERN'
  | 'UNRESOLVED_IDENTIFIER'
  | 'UNSUPPORTED_PATTERN_EXPRESSION'
  | 'UNSUPPORTED_REGEX_GROUP'
  | 'PARAMETER_COUNT_MISMATCH'
  | 'PARAMETER_TYPE_CONFLICT'
  | 'DUPLICATE_STEP_PATTERN'
  | 'AMBIGUOUS_STEP_PATTERN'
  | 'MISSING_CALLBACK'
  | 'UNRESOLVED_STEP_KEYWORD'
  | 'INVALID_DEFINE_STEP_METADATA'
  | 'FILE_PARSE_ERROR'

/** Workspace-relative (POSIX), 1-based line/column. */
export interface StepSourceLocation {
  file: string
  line: number
  column: number
}

export interface CatalogDiagnostic {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  message: string
  location?: StepSourceLocation
}

export interface CatalogParameter {
  index: number
  name: string
  type: ParameterType
  required: boolean
  enumValues?: string[]
  tableColumns?: string[]
  label?: string
  description?: string
  example?: string
  defaultValue?: string
  origin: MetadataOrigin
  precision: MetadataPrecision
  /** Raw TS type text when known, e.g. "'admin' | 'user'". */
  sourceType?: string
}

export interface CatalogStepPattern {
  kind: StepPatternKind
  source: string
  /** Present iff kind === 'regexp'. */
  flags?: string
}

export interface CatalogStep {
  id: string
  keyword: CatalogStepKeyword
  pattern: CatalogStepPattern
  title?: string
  description?: string
  category?: string
  tags: string[]
  parameters: CatalogParameter[]
  fixtures: string[]
  source: StepSourceLocation
  origin: MetadataOrigin
  precision: MetadataPrecision
  diagnostics: CatalogDiagnostic[]
  /**
   * Authorship tier (feature 012, FR-008). Optional because the catalog ENGINE
   * does not set it — it is stamped by `StepCatalogService`, which is the layer
   * that knows the workspace's features directory. Absent is treated as
   * `project`, the safe default: a step is only generic if we can prove it came
   * from the file the app provisioned.
   */
  tier?: StepTier
}

export interface StepCatalogResult {
  schemaVersion: 1
  steps: CatalogStep[]
  diagnostics: CatalogDiagnostic[]
  generatedAt: string
  workspacePath: string
  configPath?: string
  analyzedFiles: number
  durationMs: number
}

/** Options accepted by the generate IPC channel. Validated in the handler. */
export interface GenerateCatalogOptions {
  /** Bypass the on-disk cache and force a full re-analysis. */
  force?: boolean
  /** Extra workspace-relative globs to include (validated). */
  include?: string[]
  /** Extra workspace-relative ignore globs (validated). */
  exclude?: string[]
}

/** Current catalog schema version. Bump on breaking changes; invalidates caches. */
export const STEP_CATALOG_SCHEMA_VERSION = 1 as const
