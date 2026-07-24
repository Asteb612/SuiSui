/**
 * Engine-internal types (feature 006-step-catalog, data-model §4).
 *
 * These are NOT serialized across IPC and NOT part of the public contract in
 * `@suisui/shared`. They describe the analyzer intermediate representation, the
 * per-field provenance unit used by the merge, and the on-disk cache envelope.
 */
import type {
  CatalogDiagnostic,
  CatalogParameter,
  CatalogStepKeyword,
  MetadataOrigin,
  MetadataPrecision,
  StepCatalogResult,
  StepPatternKind,
  StepSourceLocation,
} from '@suisui/shared'

/** Pattern extracted from an AST node before classification into a CatalogStep. */
export interface RawPattern {
  kind: StepPatternKind
  source: string
  flags?: string
  /** True when the pattern depends on a runtime value (template with expressions). */
  dynamic: boolean
}

/** Author metadata read statically from a `defineStep({...})` literal. */
export interface RawDefineStepMeta {
  title?: string
  description?: string
  category?: string
  tags?: string[]
  parameters?: Record<
    string,
    { label?: string; description?: string; example?: string; defaultValue?: string }
  >
}

/** A `step``` fragment recovered from the AST. */
export interface RawFragmentMeta {
  kind: string
  name?: string
  enumValues?: string[]
  tableColumns?: string[]
  captures: boolean
}

/** One step candidate produced by an analyzer, before merge. */
export interface RawStepCandidate {
  keyword: CatalogStepKeyword | 'Unknown'
  pattern: RawPattern
  location: StepSourceLocation
  /** 2nd+ callback parameter names (after the fixtures object). */
  callbackParamNames: string[]
  /** Declared TS types of the callback params, aligned by index (lazy checker). */
  callbackParamTypes?: (string | undefined)[]
  /** Fixtures destructured from the first callback argument. */
  fixtures: string[]
  /** Whether a callback was present at all. */
  hasCallback: boolean
  /** Leading JSDoc comment text. */
  jsDoc?: string
  /** Present when the pattern was wrapped in `defineStep`. */
  defineStepMeta?: RawDefineStepMeta
  /** Present when the pattern was a `step``` template. */
  fragments?: RawFragmentMeta[]
  diagnostics: CatalogDiagnostic[]
  /** Inputs for the stable ID. */
  sourceForId: { relPath: string; canonicalPattern: string; line: number }
}

/** The merge operates on per-field provenance units. */
export interface FieldProvenance<T> {
  value: T
  origin: MetadataOrigin
  precision: MetadataPrecision
}

/** In-memory map of parameters keyed by index during merge. */
export type MergedParameters = CatalogParameter[]

/** Options controlling a single generation run inside the engine. */
export interface EngineGenerateOptions {
  workspacePath: string
  configPath?: string
  force?: boolean
  include?: string[]
  exclude?: string[]
  /** Extra step-file globs from settings. */
  settingsGlobs?: string[]
}

/** Fingerprint used to validate the on-disk cache (research D7). */
export interface CacheFingerprint {
  files: Record<string, { mtimeMs: number; hash: string }>
  playwrightConfigHash: string
  packageConfigHash: string
  engineVersion: string
}

/** On-disk cache envelope. */
export interface CacheEnvelope {
  schemaVersion: number
  fingerprint: CacheFingerprint
  result: StepCatalogResult
}
