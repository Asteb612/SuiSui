// Public surface of the @suisui/step-catalog engine (main-process only).
//
// Consumers import the serializable catalog *types* from `@suisui/shared`; this
// package exposes the engine functions that produce them.

export { generateCatalog, analyzeSource } from './catalog'
export type { AnalyzeSourceResult, EngineDeps } from './catalog'
export type {
  EngineGenerateOptions,
  RawStepCandidate,
  RawPattern,
  RawFragmentMeta,
  RawDefineStepMeta,
  CacheEnvelope,
  CacheFingerprint,
} from './internal-types'
export { createDiagnostic, diagnostics } from './diagnostics'
export { stableStepId, canonicalizePattern, canonicalizeRegex } from './ids'
export {
  cachePath,
  readCache,
  clearCache,
  writeCache,
  buildFingerprint,
  isCacheValid,
  fingerprintsMatch,
  hashContent,
  ENGINE_VERSION,
} from './cache'
