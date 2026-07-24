# Data Model: Native Step Catalog for SuiSui

**Feature**: 006-step-catalog | **Date**: 2026-07-24 | **Phase**: 1
**Source of truth**: serializable types live in `@suisui/shared/src/types/step-catalog.ts`; engine-internal types live in `@suisui/step-catalog`.

---

## 1. Enumerations (shared, serializable)

```ts
// Catalog keyword subset (note: shared StepKeyword additionally has And/But for scenarios;
// a catalog entry is always one of these three).
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
```

---

## 2. Core serializable entities (shared)

### StepSourceLocation

| Field    | Type     | Notes                                          |
| -------- | -------- | ---------------------------------------------- |
| `file`   | `string` | Workspace-relative, POSIX-normalized (FR-005). |
| `line`   | `number` | 1-based.                                       |
| `column` | `number` | 1-based.                                       |

### CatalogDiagnostic

| Field       | Type                 | Notes                                   |
| ----------- | -------------------- | --------------------------------------- |
| `code`      | `DiagnosticCode`     | Stable, from the closed union (FR-018). |
| `severity`  | `DiagnosticSeverity` | info / warning / error.                 |
| `message`   | `string`             | Human-readable.                         |
| `location?` | `StepSourceLocation` | Present when tied to a source position. |

### CatalogParameter

| Field           | Type                | Notes                                                      |
| --------------- | ------------------- | ---------------------------------------------------------- |
| `index`         | `number`            | 0-based position in the callback/args order.               |
| `name`          | `string`            | Exact if author-declared; else inferred (`arg0`, …).       |
| `type`          | `ParameterType`     | See enum. `unknown` when undeterminable (FR-015).          |
| `required`      | `boolean`           | Optional params (e.g., behind `opt`) → `false`.            |
| `enumValues?`   | `string[]`          | For `enum` (FR-013).                                       |
| `tableColumns?` | `string[]`          | For `table` (FR-013).                                      |
| `label?`        | `string`            | From `defineStep` (FR-027).                                |
| `description?`  | `string`            | From `defineStep`.                                         |
| `example?`      | `string`            | From `defineStep`.                                         |
| `defaultValue?` | `string`            | Optional.                                                  |
| `origin`        | `MetadataOrigin`    | Provenance of this parameter's winning data.               |
| `precision`     | `MetadataPrecision` | Confidence (FR-009).                                       |
| `sourceType?`   | `string`            | Raw TS type text when known (e.g., `"'admin' \| 'user'"`). |

**Per-field provenance**: `origin`/`precision` describe the parameter as merged; the merge step (below) guarantees a field is never downgraded (FR-007). Name and type may come from different origins — the parameter's top-level `origin`/`precision` reflect the least-precise **identifying** field (name+type) unless a diagnostic notes a conflict.

### CatalogStep

| Field          | Type                                                        | Notes                                                |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `id`           | `string`                                                    | Stable `step_<12hex>` (D5, FR-021/022).              |
| `keyword`      | `CatalogStepKeyword`                                        | Given/When/Then.                                     |
| `pattern`      | `{ kind: StepPatternKind; source: string; flags?: string }` | `flags` only for `regexp`.                           |
| `title?`       | `string`                                                    | From `defineStep`.                                   |
| `description?` | `string`                                                    | From `defineStep` or JSDoc.                          |
| `category?`    | `string`                                                    | From `defineStep`.                                   |
| `tags`         | `string[]`                                                  | From `defineStep`; `[]` otherwise.                   |
| `parameters`   | `CatalogParameter[]`                                        | Ordered (FR-011).                                    |
| `fixtures`     | `string[]`                                                  | Destructured from the callback's first arg (FR-014). |
| `source`       | `StepSourceLocation`                                        | Definition location (FR-002).                        |
| `origin`       | `MetadataOrigin`                                            | Overall winning origin for the step.                 |
| `precision`    | `MetadataPrecision`                                         | Overall confidence.                                  |
| `diagnostics`  | `CatalogDiagnostic[]`                                       | Step-scoped diagnostics; `[]` when clean.            |

**Validation rules**:

- `pattern.source` non-empty; `flags` present iff `kind === 'regexp'`.
- `enumValues.length ≥ 2` when `type === 'enum'`; `tableColumns.length ≥ 1` when `type === 'table'` (mirrors `step-regex` builders).
- `parameters[i].index === i`.
- A `dynamic` pattern MUST carry at least one `DYNAMIC_STEP_PATTERN` diagnostic and `precision` in {`partial`,`unknown`}.

### StepCatalogResult

| Field           | Type                  | Notes                                                |
| --------------- | --------------------- | ---------------------------------------------------- |
| `schemaVersion` | `1`                   | Literal; bump on breaking schema change (FR-003).    |
| `steps`         | `CatalogStep[]`       | All resolvable + partial steps.                      |
| `diagnostics`   | `CatalogDiagnostic[]` | Catalog-level (e.g., `FILE_PARSE_ERROR`, no-config). |
| `generatedAt`   | `string`              | ISO 8601.                                            |
| `workspacePath` | `string`              | Absolute workspace root (main-side only value).      |
| `configPath?`   | `string`              | Resolved Playwright config, when found.              |
| `analyzedFiles` | `number`              | Count of files analyzed (FR-004).                    |
| `durationMs`    | `number`              | Generation wall-clock (observability).               |

---

## 3. Options & service surface (mixed shared/engine)

```ts
// shared — safe to cross IPC
export interface GenerateCatalogOptions {
  force?: boolean // bypass cache
  include?: string[] // extra globs (validated, workspace-relative)
  exclude?: string[] // extra ignore globs
}
```

```ts
// engine (@suisui/step-catalog) — StepCatalogService public methods (D13)
generate(options?: GenerateCatalogOptions): Promise<StepCatalogResult>
getCached(): Promise<StepCatalogResult | null>
clearCache(): Promise<void>
getStepById(id: string): CatalogStep | undefined      // from in-memory result
findMatchingSteps(text: string, keyword?: CatalogStepKeyword): CatalogStep[]
```

---

## 4. Engine-internal types (`@suisui/step-catalog`, NOT serialized across IPC)

### RawStepCandidate (analyzer IR)

Per-source partial before merge.
| Field | Type | Notes |
| --- | --- | --- |
| `keyword` | `CatalogStepKeyword \| 'Unknown'` | `'Unknown'` → `UNRESOLVED_STEP_KEYWORD`. |
| `patternNode` | `{ kind: StepPatternKind; source: string; flags?: string; dynamic: boolean }` | From AST. |
| `location` | `StepSourceLocation` | From `getLineAndCharacterOfPosition`. |
| `callbackParamNames` | `string[]` | 2nd+ callback params. |
| `callbackParamTypes?` | `(string \| undefined)[]` | From TypeChecker (lazy). |
| `fixtures` | `string[]` | Destructured from 1st callback arg. |
| `jsDoc?` | `string` | Leading JSDoc text. |
| `defineStepMeta?` | `StepMetadata` | When wrapped in `defineStep`. |
| `fragments?` | `FragmentMeta[]` | When pattern is a `step`` template. |
| `diagnostics`|`CatalogDiagnostic[]`| Collected during analysis. |
|`sourceForId`|`{ relPath: string; canonicalPattern: string; line: number }` | ID inputs (D5). |

### FieldProvenance<T>

`{ value: T; origin: MetadataOrigin; precision: MetadataPrecision }` — the unit the merge reducer operates on.

### CacheEnvelope

See `research.md` D7 (`schemaVersion`, `fingerprint{ files, playwrightConfigHash, packageConfigHash, engineVersion }`, `result`).

---

## 5. `@suisui/step-regex` additions (author-facing, lightweight)

### FragmentMeta (attached to `Frag`)

| Field           | Type                                                                                  | Notes                                       |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `text`          | `string`                                                                              | Existing — the literal pattern piece.       |
| `kind`          | `'string'\|'int'\|'float'\|'word'\|'any'\|'enum'\|'table'\|'optional'\|'alternative'` | New.                                        |
| `name?`         | `string`                                                                              | Capture name where applicable.              |
| `enumValues?`   | `string[]`                                                                            | For `enum`.                                 |
| `tableColumns?` | `string[]`                                                                            | For `table`.                                |
| `captures`      | `boolean`                                                                             | Whether the fragment yields a callback arg. |

### StepMetadata (input to `defineStep`)

| Field          | Type                                                                | Notes                                       |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `pattern`      | `StepPattern` (string-assignable)                                   | Required — from `step\`\`` or a raw string. |
| `title?`       | `string`                                                            |                                             |
| `description?` | `string`                                                            |                                             |
| `category?`    | `string`                                                            |                                             |
| `tags?`        | `string[]`                                                          |                                             |
| `parameters?`  | `Record<string, { label?; description?; example?; defaultValue? }>` | Keyed by param name.                        |

`defineStep(meta)` returns a value assignable to a step pattern string (usable directly in `Given/When/Then`) while carrying `meta` for static/runtime reading (D9). Invalid `meta` (e.g., param key not present in the pattern) → `INVALID_DEFINE_STEP_METADATA` when analyzed.

---

## 6. Relationships

```text
StepCatalogResult 1─* CatalogStep 1─* CatalogParameter
StepCatalogResult 1─* CatalogDiagnostic            (catalog-level)
CatalogStep       1─* CatalogDiagnostic            (step-level)
CatalogStep        1─1 StepSourceLocation
CatalogParameter   0─1 (enumValues | tableColumns)
CacheEnvelope      1─1 StepCatalogResult (+ fingerprint)

RawStepCandidate ──merge(precedence)──▶ CatalogStep
CatalogStep ──catalogStepToStepDefinition()──▶ StepDefinition ──▶ existing Gherkin engine
```

---

## 7. Backward-compatibility mapping — `CatalogStep → StepDefinition`

`@suisui/shared/src/catalog/adapter.ts` (D8). Guarantees byte-identical Gherkin (SC-009).

| `StepDefinition` field | Source from `CatalogStep`                   | Rule                                            |
| ---------------------- | ------------------------------------------- | ----------------------------------------------- |
| `id`                   | `step.id`                                   | pass-through.                                   |
| `pattern`              | `step.pattern.source`                       | verbatim (drives `resolvePattern`/`matchStep`). |
| `keyword`              | `step.keyword`                              | Given/When/Then.                                |
| `location`             | `\`${source.file}:${source.line}\``         | display string.                                 |
| `args`                 | `step.parameters[]` → `StepArgDefinition[]` | see type map.                                   |
| `decorator?`           | (unused by catalog)                         | omitted.                                        |
| `isGeneric?`           | `false`                                     | catalog steps are real.                         |

**Parameter type map** (`ParameterType → StepArgDefinition.type`):
`string→string`, `int→int`, `float→float`, `word→word`, `any→any`, `enum→enum`, `table→table`, `boolean→any`, `doc-string→string`, `custom→any`, `unknown→any`. `enumValues`/`tableColumns`/`required` copied through.

**Invariant test**: for every legacy step pattern, `catalogStepToStepDefinition(fromCatalog).args` must produce the same `resolvePattern(...)` output as today's `parseArgs(pattern)`-derived args (golden fixtures).

---

## 8. State & lifecycle

- **Generation**: `discovery → per-file analyze (isolated) → per-source partials → merge → duplicate/ambiguity pass → assemble result → write cache`.
- **Cache states**: `absent` → generate; `valid` (fingerprint matches) → return cached; `stale` (any invalidation key differs) → regenerate; `clearCache()` → delete file + drop in-memory.
- **Precision transitions**: a parameter starts `unknown`, is raised only upward by higher-precedence sources during merge; never lowered (FR-007).
