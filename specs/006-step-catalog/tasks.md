---
description: 'Task list for Native Step Catalog for SuiSui'
---

# Tasks: Native Step Catalog for SuiSui

**Input**: Design documents from `/specs/006-step-catalog/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the spec's "# Tests" section explicitly requests unit + integration coverage, and Constitution Principle III (Test Isolation) is NON-NEGOTIABLE. Engine tests run over in-memory source-string fixtures (no real `bddgen`/`playwright`/`git`).

**Organization**: Tasks are grouped by user story (P1→P5) so each is an independently testable increment. Delivery order mirrors `plan.md` Phase Mapping.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 for user-story phases only

## Path Conventions

- Engine package: `packages/step-catalog/`
- Shared contract: `packages/shared/`
- Author helpers: `packages/step-regex/`
- Electron main: `apps/desktop/electron/`
- Renderer: `apps/desktop/app/`
- **Golden rule**: after editing `packages/shared/` run `pnpm --filter @suisui/shared build`; after editing `packages/step-regex/` run `pnpm --filter @suisui/step-regex build`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new engine package and wire it into the monorepo.

- [x] T001 Create `packages/step-catalog/package.json` (name `@suisui/step-catalog`, private, dual ESM/CJS `main`/`module`/`types`/`exports` mirroring `packages/step-regex/package.json`; dependencies: `@suisui/shared` `workspace:*`, `@suisui/step-regex` `workspace:*`, `typescript` `^5.3.3`; devDependency `vitest`; scripts `build`/`build:esm`/`build:cjs`/`typecheck`/`test` copied from step-regex).
- [x] T002 [P] Create `packages/step-catalog/tsconfig.esm.json` and `packages/step-catalog/tsconfig.cjs.json` (copy from `packages/step-regex/`, adjust `outDir`/`rootDir`); copy `packages/step-regex/scripts/create-package-json.js` to `packages/step-catalog/scripts/create-package-json.js`.
- [x] T003 [P] Create `packages/step-catalog/src/index.ts` placeholder export and `packages/step-catalog/src/__tests__/` directory with a `.gitkeep`; add engine cache path note (`<workspace>/.app/cache/step-catalog.json`) is NOT committed.
- [x] T004 Run `pnpm install` to link the new workspace package, then `pnpm --filter @suisui/step-catalog build` to verify the skeleton compiles.

**Checkpoint**: `@suisui/step-catalog` builds and is resolvable from `apps/desktop/electron`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contract types, IPC plumbing, diagnostics, IDs, engine + service skeletons that ALL stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Shared serializable contract (SSoT)

- [x] T005 Create `packages/shared/src/types/step-catalog.ts` with all serializable types from `data-model.md` §1–§3: `CatalogStepKeyword`, `StepPatternKind`, `MetadataOrigin`, `MetadataPrecision`, `ParameterType`, `DiagnosticSeverity`, `DiagnosticCode` (closed union incl. `FILE_PARSE_ERROR`), `StepSourceLocation`, `CatalogDiagnostic`, `CatalogParameter`, `CatalogStep`, `StepCatalogResult`, `GenerateCatalogOptions`.
- [x] T006 Export the new catalog types from `packages/shared/src/index.ts`.

### IPC plumbing (Principle II — 5 touchpoints)

- [x] T007 Add `STEP_CATALOG_GENERATE`/`STEP_CATALOG_GET_CACHED`/`STEP_CATALOG_CLEAR_CACHE`/`STEP_CATALOG_GET_STEP` to `packages/shared/src/ipc/channels.ts` (values `stepCatalog:generate|getCached|clearCache|getStep`).
- [x] T008 Add the `stepCatalog` namespace signatures to `packages/shared/src/ipc/api.ts` per `contracts/ipc-step-catalog.md`.
- [x] T009 Rebuild shared: `pnpm --filter @suisui/shared build` (unblocks main + renderer type imports).

### Engine core primitives (no analysis logic yet)

- [x] T010 [P] Create `packages/step-catalog/src/diagnostics.ts`: the `DiagnosticCode` factory helpers (one per code) returning `CatalogDiagnostic`, importing the union from `@suisui/shared`.
- [x] T011 [P] Create `packages/step-catalog/src/ids.ts`: `stableStepId({ relPath, keyword, canonicalPattern, line })` → `step_<12hex>` via Node `crypto` SHA-256 (D5); include a `canonicalizePattern()` helper (whitespace-normalize; regex → `source` + sorted `flags`).
- [x] T012 [P] Create `packages/step-catalog/src/internal-types.ts`: engine-internal IR from `data-model.md` §4 (`RawStepCandidate`, `FieldProvenance<T>`, `CacheEnvelope`, discovery options) — NOT exported across IPC.
- [x] T013 Create `packages/step-catalog/src/catalog.ts` with the `generate(options)` orchestration signature returning an empty `StepCatalogResult` skeleton (`schemaVersion:1`, `steps:[]`, timing/counters), plus `index.ts` public surface exports (`generate`, types re-exports, and a test entrypoint stub `analyzeSource`).

### Electron service + wiring (calls into engine skeleton)

- [x] T014 Create `apps/desktop/electron/services/StepCatalogService.ts`: singleton class + `getStepCatalogService()` factory with constructor DI (inject engine `generate`, a cache reader/writer, workspace + settings providers, clock); implement method stubs `generate`/`getCached`/`clearCache`/`getStepById`/`findMatchingSteps` delegating to the engine skeleton (Principle IV).
- [x] T015 Export `getStepCatalogService` from `apps/desktop/electron/services/index.ts`.
- [x] T016 Add the four `STEP_CATALOG_*` handlers to `apps/desktop/electron/ipc/handlers.ts` with a `validateGenerateOptions(options)` guard (reject absolute/`..` globs, non-string entries; workspace root from `WorkspaceService`, never the renderer) and `getStep` id validation, per `contracts/ipc-step-catalog.md`.
- [x] T017 Add the `stepCatalog` bindings to `apps/desktop/electron/preload.ts` (`window.api.stepCatalog.{generate,getCached,clearCache,getStep}`).

**Checkpoint**: `pnpm typecheck` passes monorepo-wide; the IPC round-trips (returns an empty catalog). User stories can now begin.

---

## Phase 3: User Story 1 - Trustworthy structured step catalog (Priority: P1) 🎯 MVP

**Goal**: Generate a structured catalog by statically analyzing step files — every discoverable step carries keyword, pattern, pattern kind, and source file+line; one dynamic/unsupported step or one unparseable file never breaks the list; exact duplicates are flagged. Replaces the text round-trip as the picker's source.

**Independent Test**: Point the app at a fixture project mixing plain/cucumber/regex steps + one dynamic step + one unparseable file → all resolvable steps appear with `source.file:line`; the dynamic step carries `DYNAMIC_STEP_PATTERN`; the bad file yields `FILE_PARSE_ERROR` while other files remain; identical `(keyword,pattern)` pairs yield `DUPLICATE_STEP_PATTERN`.

### Tests for User Story 1 (write first, ensure they fail)

- [x] T018 [P] [US1] Unit tests in `packages/step-catalog/src/__tests__/typescript-analyzer.test.ts`: plain string, cucumber expression, regexp (source+flags), aliased `Given/When/Then` (destructured rename), source location (line/column), dynamic/template-literal pattern → `DYNAMIC_STEP_PATTERN`, `MISSING_CALLBACK`, `UNRESOLVED_STEP_KEYWORD` — driven via the `analyzeSource` in-memory entrypoint.
- [x] T019 [P] [US1] Unit tests in `packages/step-catalog/src/__tests__/ids.test.ts`: deterministic stable IDs, `step_<12hex>` shape, stability across re-run of unchanged source, new ID after file move.
- [x] T020 [P] [US1] Unit tests in `packages/step-catalog/src/__tests__/catalog.test.ts`: partial-failure isolation (one throwing file → `FILE_PARSE_ERROR` + other steps present), duplicate detection, JSON serializability round-trip, `analyzedFiles`/`durationMs` populated, empty-workspace → `steps:[]` + explanatory diagnostic.

### Implementation for User Story 1

- [x] T021 [P] [US1] Create `packages/step-catalog/src/discovery.ts` (D3): resolve step files via settings override → detected BDD steps dir → convention globs (`features/steps/**`, `tests/steps/**`, `**/*.steps.{ts,js}`), excluding `node_modules`/`.app`/`dist`/`.output`; return workspace-relative POSIX paths + count.
- [x] T022 [US1] Create `packages/step-catalog/src/adapters/typescript-analyzer.ts`: per-file `ts.createSourceFile` AST walk (D1/D2) extracting keyword (+aliases resolved locally), pattern node → `{kind,source,flags?,dynamic}`, source location, callback param names, destructured fixtures, JSDoc; emit `DYNAMIC_STEP_PATTERN`/`MISSING_CALLBACK`/`UNRESOLVED_STEP_KEYWORD`; return `RawStepCandidate[]`.
- [x] T023 [P] [US1] Create `packages/step-catalog/src/adapters/pattern-analyzer.ts` (US1 scope): classify pattern kind and produce minimal `CatalogParameter[]` (name/index/required, type left `unknown` where undeterminable) reusing `@suisui/step-regex` parsers; full typing lands in US2.
- [x] T024 [US1] Create `packages/step-catalog/src/merge.ts` (D6 core): assemble a `CatalogStep` from `RawStepCandidate` + pattern params with per-field `origin`/`precision`; compute `id` via `ids.ts`; attach step-level diagnostics.
- [x] T025 [US1] Implement duplicate detection in `packages/step-catalog/src/catalog.ts` (D11 first half): group by `(keyword, canonicalPattern)`, emit `DUPLICATE_STEP_PATTERN` on each member.
- [x] T026 [US1] Wire `generate()` in `packages/step-catalog/src/catalog.ts`: `discovery → per-file analyze (try/catch → FILE_PARSE_ERROR) → pattern params → merge → duplicate pass → StepCatalogResult`; implement the `analyzeSource(files)` test entrypoint over an in-memory file map.
- [x] T027 [US1] Implement `StepCatalogService.generate/getStepById/findMatchingSteps` in `apps/desktop/electron/services/StepCatalogService.ts` (in-memory result; workspace root + config from `WorkspaceService`/`findExistingPlaywrightConfig`; no cache yet — cache added in US5).
- [x] T028 [P] [US1] Create `packages/shared/src/catalog/adapter.ts`: `catalogStepToStepDefinition(step)` per `data-model.md` §7 (pattern/keyword/location/args mapping, ParameterType→StepArgDefinition type map); export from `packages/shared/src/index.ts`, then `pnpm --filter @suisui/shared build`.
- [x] T029 [US1] Update `apps/desktop/app/stores/steps.ts`: add a `loadCatalog()`/`generateCatalog()` path calling `window.api.stepCatalog.*`, store `CatalogStep[]`, and expose an adapted `StepDefinition[]` (via `catalogStepToStepDefinition`) so `scenario.ts` Gherkin flow is unchanged; keep legacy `exportSteps()` intact for now.
- [x] T030 [P] [US1] Integration test `apps/desktop/electron/__tests__/StepCatalogService.test.ts`: service generates from a fixture step-file set (no CLI), returns structured steps with locations, isolates a bad file, and `getStepById` resolves.

**Checkpoint**: MVP — the picker can be populated from a structured catalog with source locations and diagnostics; a single bad step/file never collapses the list.

---

## Phase 4: User Story 2 - Accurate parameters with the right input control (Priority: P2)

**Goal**: Full parameter extraction (enum values, table columns, int/float, fixtures, callback names/types) and correct renderer controls (select / number / table grid / text fallback), with byte-identical Gherkin preserved.

**Independent Test**: Build a scenario with a step taking an enum + a number + a data table → enum renders a limited dropdown, numbers render numeric inputs, table renders a grid with declared columns, unknown types fall back to text; generated Gherkin matches the pre-feature golden output.

### Tests for User Story 2 (write first, ensure they fail)

- [x] T031 [P] [US2] Unit tests in `packages/step-catalog/src/__tests__/pattern-analyzer.test.ts`: named/anonymous cucumber params, int, float, enum values, optional text (`required:false`), alternatives, data-table columns, doc-string.
- [x] T032 [P] [US2] Unit tests in `packages/step-catalog/src/__tests__/regular-expression.test.ts`: regex capture groups, flags, `UNSUPPORTED_REGEX_GROUP`, anonymous-group → `unknown`, `PARAMETER_COUNT_MISMATCH` (pattern vs callback).
- [x] T033 [P] [US2] Golden-parity test in `packages/shared/src/__tests__/adapter-parity.test.ts`: for a corpus of legacy patterns, `catalogStepToStepDefinition(...)` → `resolvePattern(...)` output equals the current `parseArgs`-derived output (SC-009).

### Implementation for User Story 2

- [x] T034 [P] [US2] Create `packages/step-catalog/src/parsers/cucumber-expression.ts`: cucumber-expression → typed params (`string/int/float/word/any`, named), reusing `@suisui/step-regex` handlers; set `precision:'inferred'`.
- [x] T035 [P] [US2] Create `packages/step-catalog/src/parsers/regular-expression.ts`: parse regex `source`/`flags` → capture groups → params (`precision:'partial'`; anonymous → `unknown`); enum-like alternations → `enum` with values.
- [x] T036 [US2] Expand `packages/step-catalog/src/adapters/pattern-analyzer.ts` to full `CatalogParameter[]` (enum values, table columns, int/float, optional→required:false) using the new parsers; emit `PARAMETER_COUNT_MISMATCH` when param count disagrees with callback arity.
- [x] T037 [US2] Add lazy `ts.Program` + `TypeChecker` support in `packages/step-catalog/src/adapters/typescript-analyzer.ts` (D2): resolve callback parameter TS types (`sourceType`) and cross-file/imported/local constant patterns; extract `fixtures` precisely.
- [x] T038 [US2] Extend `packages/step-catalog/src/merge.ts` so callback `typescript` types raise parameter precision above pattern inference without overwriting exact names (FR-007).
- [x] T039 [P] [US2] Update `apps/desktop/app/components/StepAddDialog.vue` to render per-parameter controls from `CatalogParameter.type`: enum→select(values), int/float→numeric, table→grid(columns), string/unknown→text fallback (Composition API, `<script setup lang="ts">`).
- [x] T040 [US2] Update `apps/desktop/app/stores/steps.ts` so the picker consumes catalog parameters for control selection while still emitting the adapted `StepDefinition[]` for Gherkin.

**Checkpoint**: Parameters are accurate and rendered with correct controls; Gherkin parity is proven by the golden test.

---

## Phase 5: User Story 3 - Source & precision transparency + search at scale (Priority: P3)

**Goal**: Surface source location + precision (exact/inferred/partial/unknown) with inferred-name warnings and diagnostics badges; add duplicate + ambiguity diagnostics; add keyword/text/category/tag/type/precision filters to the selector.

**Independent Test**: A catalog with a typed step (exact, named params, location) and a bare regex step (partial, inferred-name warning) → both render their precision + location; filters narrow correctly; ambiguous pairs show `AMBIGUOUS_STEP_PATTERN`.

### Tests for User Story 3 (write first, ensure they fail)

- [x] T041 [P] [US3] Unit tests in `packages/step-catalog/src/__tests__/diagnostics.test.ts`: ambiguity detection (`AMBIGUOUS_STEP_PATTERN` for general-vs-specific same keyword), and precision/origin assignment matrix from `research.md` D6.
- [x] T042 [P] [US3] Component test in `apps/desktop/app/__tests__/step-selector-filters.test.ts`: filtering by keyword/text/category/tag/type/precision narrows the list; diagnostics badge renders per severity.

### Implementation for User Story 3

- [x] T043 [US3] Implement ambiguity detection in `packages/step-catalog/src/catalog.ts` (D11 second half): compile parameterized patterns via `patternToRegex` and flag general-matches-specific pairs within a keyword (bounded).
- [x] T044 [US3] Finalize step-level `origin`/`precision` roll-up + inferred-name warning diagnostics in `packages/step-catalog/src/merge.ts` (least-precise identifying field drives step precision; add info diagnostic when names inferred).
- [x] T045 [P] [US3] Update `apps/desktop/app/components/StepRow.vue` to display source `file:line`, precision marker, tags/category, and parameter labels/descriptions/examples when present.
- [x] T046 [US3] Add filters to `apps/desktop/app/components/StepSelector.vue`: keyword, free-text search, category, tag, parameter type, precision; plus diagnostics badges (severity → color) mapping the closed `DiagnosticCode` union.
- [x] T047 [US3] Add selector-supporting getters to `apps/desktop/app/stores/steps.ts` (available categories, tags, precisions derived from `CatalogStep[]`).

**Checkpoint**: Users can judge trust (precision + location + diagnostics) and navigate hundreds of steps via filters.

---

## Phase 6: User Story 4 - Optional author-provided rich metadata (Priority: P4)

**Goal**: `defineStep()` + fragment metadata in `@suisui/step-regex` (dependency-free); the `suisui-metadata` adapter reads them statically as the most authoritative source; conflicts and invalid metadata produce diagnostics; steps still execute unchanged under `playwright-bdd`.

**Independent Test**: A step declared via `defineStep({title,description,category,tags,parameters})` shows those fields (exact) with param labels/examples and still runs; conflicting inferred metadata yields a conflict diagnostic (explicit wins); malformed metadata yields `INVALID_DEFINE_STEP_METADATA` without dropping the step.

### Tests for User Story 4 (write first, ensure they fail)

- [x] T048 [P] [US4] Unit tests in `packages/step-regex/src/__tests__/define-step.test.ts`: `defineStep` result is string-assignable (usable in `Given/When/Then`), carries `meta`, `bindSteps` types callback args; `Frag` metadata (`kind/name/enumValues/tableColumns/captures`) present for `str/int/oneOf/cols/opt/alt`; `typeof step\`...\` === 'string'` preserved.
- [x] T049 [P] [US4] Unit tests in `packages/step-catalog/src/__tests__/suisui-metadata.test.ts`: AST reading of `defineStep({...})` and `step\`...\``templates → exact title/description/category/tags/param labels;`INVALID_DEFINE_STEP_METADATA`for unknown param key;`PARAMETER_TYPE_CONFLICT` when explicit vs inferred disagree.

### Implementation for User Story 4

- [x] T050 [US4] Extend `Frag` + interpolation helpers in `packages/step-regex/src/step.ts` to attach `FragmentMeta` (`kind/name/enumValues/tableColumns/captures`) while keeping the assembled pattern a primitive string; expose whole-template fragments via a non-enumerable side accessor per `contracts/define-step-api.md`.
- [x] T051 [P] [US4] Create `packages/step-regex/src/define.ts`: `StepParameterMeta`, `StepMetadata`, `DefinedStep`, and `defineStep(meta)` (string-assignable, carries `meta`); export from `packages/step-regex/src/index.ts`.
- [x] T052 [US4] Add the `bindSteps` overload accepting a `DefinedStep<A>` in `packages/step-regex/src/typed.ts` (runtime identity; types only), then `pnpm --filter @suisui/step-regex build` and `pnpm --filter @suisui/shared build`.
- [x] T053 [US4] Create `packages/step-catalog/src/adapters/suisui-metadata.ts`: statically read `defineStep({...})` object literals and `step\`\``templates from the AST (no execution) → exact step/param metadata + fragments; emit`INVALID_DEFINE_STEP_METADATA`.
- [x] T054 [US4] Extend `packages/step-catalog/src/merge.ts` precedence so `suisui` metadata wins (FR-006/007) and value disagreements emit `PARAMETER_TYPE_CONFLICT` (FR-008) while keeping the higher-precedence value.
- [x] T055 [US4] Wire the `suisui-metadata` adapter into `generate()` in `packages/step-catalog/src/catalog.ts` as the top-priority source; confirm `StepRow.vue` (US3) already renders the now-populated labels/examples.

**Checkpoint**: Opt-in rich metadata flows through as exact; existing plain projects still work (adapter optional).

---

## Phase 7: User Story 5 - Fast, cached refresh + legacy removal (Priority: P5)

**Goal**: On-disk cache with correct invalidation (git-ignored), performance within budget, then remove the legacy text-export path once parity is proven.

**Independent Test**: Cold 500-step generation < 5 s; unchanged refresh returns from cache < 500 ms; editing a step file reflects on next generation; cache at `<workspace>/.app/cache/step-catalog.json` is git-ignored; after removal, no `bddgen-export.js` dependency remains and all previously-listed steps still appear.

### Tests for User Story 5 (write first, ensure they fail)

- [x] T056 [P] [US5] Unit tests in `packages/step-catalog/src/__tests__/cache.test.ts`: fingerprint build, hit on unchanged fingerprint, invalidation on file mtime+hash / Playwright config hash / package-config hash / schema version / engine version; Windows-path normalization round-trip.

### Implementation for User Story 5

- [x] T057 [US5] Create `packages/step-catalog/src/cache.ts` (D7): `CacheEnvelope` read/write at `<workspace>/.app/cache/step-catalog.json`, fingerprint (file mtime+content hash, Playwright config hash, package-config hash, engine version), and invalidation logic.
- [x] T058 [US5] Integrate cache into `generate()` (`packages/step-catalog/src/catalog.ts`): cache-first read, write after build, honor `options.force`; implement `getCached()`/`clearCache()` in `StepCatalogService` (delete file + drop in-memory).
- [x] T059 [US5] Ensure `<workspace>/.app/.gitignore` (containing `*`) is written on first cache write (FR-025) — implement in `packages/step-catalog/src/cache.ts` or reuse the existing `.app` writer in `apps/desktop/electron/services/WorkspaceMeta.ts`.
- [x] T060 [US5] Performance validation harness (script/test) generating ~500 synthetic steps; assert cold < 5 s and cached refresh < 500 ms (SC-007); record `durationMs`.
- [x] T061 [US5] Switch `apps/desktop/app/stores/steps.ts` fully to `stepCatalog:*` (remove reliance on `exportSteps()`); confirm SC-008 (all previously-listed steps still listed) against fixtures.
- [x] T062 [US5] Remove `apps/desktop/electron/scripts/bddgen-export.js` and the text `parseExportOutput`/subprocess code from `apps/desktop/electron/services/StepService.ts` (retire or slim the service to a catalog delegate); delete `STEPS_EXPORT`/`STEPS_GET_CACHED`/`STEPS_GET_DECORATORS` from the five IPC touchpoints once no renderer caller remains; rebuild shared.

**Checkpoint**: Catalog is responsive and cached; the legacy text exporter is gone with no loss of metadata (SC-010).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final validation, and cleanup across stories.

- [x] T063 [P] Update `doc/ARCHITECTURE.md` (catalog engine, static-analysis/no-exec security model), `doc/SERVICES.md` (`StepCatalogService`), `doc/IPC_TYPES.md` (`stepCatalog:*` channels), and `doc/FRONTEND.md` (catalog store + enriched picker).
- [x] T064 [P] Update `CLAUDE.md` "Do Not"/step-export description to reflect the native catalog replacing `bddgen-export.js`.
- [x] T065 Add a Windows-paths + partial-parsing regression test in `packages/step-catalog/src/__tests__/paths.test.ts` (workspace-relative POSIX normalization across OSes).
- [x] T066 E2E in `apps/desktop/e2e/`: open workspace → generate catalog → add a catalog step to a scenario → refresh after editing a source step file (spec integration scenarios), in `APP_TEST_MODE=1` against a production build.
- [x] T067 Run full gates: `pnpm --filter @suisui/step-regex build && pnpm --filter @suisui/shared build && pnpm --filter @suisui/step-catalog build && pnpm typecheck && pnpm lint:fix && pnpm test`, then `pnpm build && pnpm test:e2e`.
- [x] T068 Execute `specs/006-step-catalog/quickstart.md` validation checklist (per-story acceptance checks US1–US5).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–7)**: each depends on Foundational. Recommended sequential by priority (P1→P5) because later stories extend the same engine files; can be parallelized across developers where files differ.
- **Polish (Phase 8)**: depends on all targeted stories.

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP; establishes engine + adapter + store path.
- **US2 (P2)**: builds on US1 (extends `pattern-analyzer`, `typescript-analyzer`, `merge`, store, dialog). Independently testable via parser/parity tests.
- **US3 (P3)**: builds on US1/US2 data (adds ambiguity + precision roll-up + selector filters). Independently testable via filter/diagnostics tests.
- **US4 (P4)**: adds `step-regex` `defineStep`/fragments + `suisui-metadata` adapter as top-priority source. Independently testable; existing projects unaffected.
- **US5 (P5)**: adds cache + performs the legacy removal. Should come last (removal requires parity from US1–US4).

### Within Each User Story

- Tests first (must fail) → parsers/analyzers → merge → service/store → UI.
- Same-file tasks are sequential; different-file tasks marked **[P]**.

### Parallel Opportunities

- **Setup**: T002, T003 in parallel after T001.
- **Foundational**: T010/T011/T012 in parallel; T005→T006→T007→T008→T009 sequential (shared files + build); service/handlers/preload (T014→T016→T017) sequential-ish but independent of engine primitives.
- **US1**: T018/T019/T020 (tests) in parallel; T021 (discovery) and T023 (pattern-analyzer) and T028 (adapter) and T030 (integration test) parallel to the T022→T024→T025→T026→T027 engine chain where files differ.
- **US2**: T031/T032/T033 tests parallel; T034/T035 parsers parallel; T039 (dialog) parallel to engine tasks.
- **US4**: T048/T049 tests parallel; T051 parallel to T050 within step-regex only if different files (T050 edits `step.ts`, T051 creates `define.ts`).

---

## Parallel Example: User Story 1

```bash
# Tests (write first, ensure they fail):
Task: "Unit tests typescript-analyzer in packages/step-catalog/src/__tests__/typescript-analyzer.test.ts"
Task: "Unit tests ids in packages/step-catalog/src/__tests__/ids.test.ts"
Task: "Unit tests catalog in packages/step-catalog/src/__tests__/catalog.test.ts"

# Parallel implementation (different files):
Task: "Create discovery.ts in packages/step-catalog/src/discovery.ts"
Task: "Create pattern-analyzer.ts in packages/step-catalog/src/adapters/pattern-analyzer.ts"
Task: "Create adapter.ts in packages/shared/src/catalog/adapter.ts"
Task: "Integration test in apps/desktop/electron/__tests__/StepCatalogService.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1.
2. **STOP & VALIDATE**: catalog populates the picker with source locations + diagnostics; a bad step/file never collapses the list; duplicates flagged.
3. Demo the structured catalog replacing text parsing.

### Incremental Delivery

- US1 (MVP) → US2 (parameters + controls, Gherkin parity) → US3 (transparency + filters) → US4 (opt-in rich metadata) → US5 (cache + remove legacy). Each ships value without breaking prior stories; legacy text exporter is removed only after US1–US4 reach parity.

---

## Notes

- **Constitution gates** every checkpoint: `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`; rebuild `@suisui/shared`/`@suisui/step-regex` after edits; IPC changes touch all five touchpoints.
- **Test isolation (III)**: engine tests use the in-memory `analyzeSource` entrypoint and source-string fixtures — never real `bddgen`/`playwright`/`git`. The TS Compiler API is a library call, allowed.
- **No `any`** in production code (use `unknown`); Composition API + `<script setup lang="ts">` for touched components.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

---

## Completion

All 68 tasks complete. Verification status:

- Unit/integration: green across all packages (step-regex, shared, step-catalog,
  desktop) — 0 TypeScript errors, changed files lint-clean.
- **E2E (T066/T068)**: `pnpm build && pnpm test:e2e` passes against a production
  build. In `APP_TEST_MODE=1` the app now sources steps from the native catalog
  (reading the fixture workspace's real step files) instead of the removed
  `buildMockStepData` mock.
- **Legacy removal (T062)**: `bddgen-export.js`, `StepService`, and the
  `STEPS_*` IPC channels are gone. `ValidationService` and `WorkspaceService`
  were redirected to the catalog. No production code references any removed
  symbol.
