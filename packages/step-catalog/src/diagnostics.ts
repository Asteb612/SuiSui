/**
 * Diagnostic codes and factory helpers (feature 006-step-catalog, research D10).
 *
 * The catalog must never collapse on one bad step or file: every unsupported,
 * dynamic, or malformed case becomes a structured diagnostic rather than a
 * thrown error. Codes are the closed `DiagnosticCode` union from `@suisui/shared`
 * so the renderer's badge mapping stays exhaustive.
 */
import type {
  CatalogDiagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  StepSourceLocation,
} from '@suisui/shared'

/** Default severity for each diagnostic code. */
const DEFAULT_SEVERITY: Record<DiagnosticCode, DiagnosticSeverity> = {
  DYNAMIC_STEP_PATTERN: 'warning',
  UNRESOLVED_IDENTIFIER: 'warning',
  UNSUPPORTED_PATTERN_EXPRESSION: 'warning',
  UNSUPPORTED_REGEX_GROUP: 'info',
  PARAMETER_COUNT_MISMATCH: 'warning',
  PARAMETER_TYPE_CONFLICT: 'warning',
  DUPLICATE_STEP_PATTERN: 'warning',
  AMBIGUOUS_STEP_PATTERN: 'info',
  MISSING_CALLBACK: 'warning',
  UNRESOLVED_STEP_KEYWORD: 'warning',
  INVALID_DEFINE_STEP_METADATA: 'error',
  FILE_PARSE_ERROR: 'error',
}

/**
 * Build a diagnostic. Severity defaults to the code's canonical severity but
 * can be overridden.
 */
export function createDiagnostic(
  code: DiagnosticCode,
  message: string,
  location?: StepSourceLocation,
  severity?: DiagnosticSeverity,
): CatalogDiagnostic {
  const diag: CatalogDiagnostic = {
    code,
    severity: severity ?? DEFAULT_SEVERITY[code],
    message,
  }
  if (location) diag.location = location
  return diag
}

export const diagnostics = {
  dynamicPattern: (source: string, location?: StepSourceLocation) =>
    createDiagnostic(
      'DYNAMIC_STEP_PATTERN',
      'The step pattern depends on a runtime value and cannot be fully resolved statically.',
      location,
    ),
  unresolvedIdentifier: (name: string, location?: StepSourceLocation) =>
    createDiagnostic(
      'UNRESOLVED_IDENTIFIER',
      `Could not statically resolve the pattern identifier "${name}".`,
      location,
    ),
  unsupportedPatternExpression: (message: string, location?: StepSourceLocation) =>
    createDiagnostic('UNSUPPORTED_PATTERN_EXPRESSION', message, location),
  unsupportedRegexGroup: (message: string, location?: StepSourceLocation) =>
    createDiagnostic('UNSUPPORTED_REGEX_GROUP', message, location),
  parameterCountMismatch: (message: string, location?: StepSourceLocation) =>
    createDiagnostic('PARAMETER_COUNT_MISMATCH', message, location),
  parameterTypeConflict: (message: string, location?: StepSourceLocation) =>
    createDiagnostic('PARAMETER_TYPE_CONFLICT', message, location),
  duplicatePattern: (pattern: string, location?: StepSourceLocation) =>
    createDiagnostic(
      'DUPLICATE_STEP_PATTERN',
      `Duplicate step definition for pattern "${pattern}".`,
      location,
    ),
  ambiguousPattern: (message: string, location?: StepSourceLocation) =>
    createDiagnostic('AMBIGUOUS_STEP_PATTERN', message, location),
  missingCallback: (location?: StepSourceLocation) =>
    createDiagnostic(
      'MISSING_CALLBACK',
      'Step definition has no implementation callback.',
      location,
    ),
  unresolvedKeyword: (location?: StepSourceLocation) =>
    createDiagnostic(
      'UNRESOLVED_STEP_KEYWORD',
      'Could not determine the step keyword (Given/When/Then).',
      location,
    ),
  invalidDefineStepMetadata: (message: string, location?: StepSourceLocation) =>
    createDiagnostic('INVALID_DEFINE_STEP_METADATA', message, location),
  fileParseError: (file: string, message: string) =>
    createDiagnostic('FILE_PARSE_ERROR', `Failed to analyze "${file}": ${message}`, {
      file,
      line: 1,
      column: 1,
    }),
  inferredParameterNames: (location?: StepSourceLocation) =>
    createDiagnostic(
      'UNSUPPORTED_REGEX_GROUP',
      'Parameter names were inferred from the callback.',
      location,
      'info',
    ),
}
