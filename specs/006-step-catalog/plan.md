# Implementation Plan: Native Step Catalog for SuiSui

**Branch**: `006-step-catalog` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-step-catalog/spec.md`

## Summary

Replace SuiSui's fragile text-based step export (spawn embedded Node → call `playwright-bdd` internals → flatten steps to `* Given <pattern>` text → re-parse in `StepService`) with a **native, structured step catalog**. A new workspace package `@suisui/step-catalog` discovers step definitions by **statically analyzing** TypeScript/JavaScript step files with the TypeScript Compiler API (no project code execution, no `playwright-bdd` internals), merges metadata from four sources by a fixed precedence, and emits a versioned, JSON-serializable `StepCatalogResult` carrying source locations, precise parameters (names/types/enums/table columns/fixtures), documentation, precision levels, and diagnostics. The serializable contract types live in `@suisui/shared` (SSoT); a `StepCatalogService` (singleton + DI) exposes the engine over four validated IPC channels; and the renderer's step picker renders richer controls. A `CatalogStep → StepDefinition` adapter preserves existing scenario-creation and Gherkin generation exactly. `@suisui/step-regex` gains an optional `defineStep()` API and fragment-level runtime metadata, staying dependency-free. Delivery follows the spec's P1→P5 story order; the legacy `bddgen-export.js` path is removed only in the final phase.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 21.x (repo/tests use 22)  
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x; **new (main-process/engine only)**: `typescript` (Compiler API, already a dev dep) as a runtime dep of `@suisui/step-catalog`; reuses `@suisui/step-regex` pattern parsers  
**Storage**: In-memory catalog in the service; on-disk JSON cache at `<workspace>/.app/cache/step-catalog.json` (git-ignored via a written `.app/.gitignore`); provider/settings unchanged  
**Testing**: Vitest 2.x (unit — analyzer runs on in-memory/fixture source strings, no CLI); Playwright 1.58+ E2E in `APP_TEST_MODE=1`  
**Target Platform**: Cross-platform desktop (Windows, macOS, Linux) — paths normalized workspace-relative  
**Project Type**: Desktop app (Electron main + Nuxt renderer) + shared/engine packages in a pnpm monorepo  
**Performance Goals**: Cold generation of a 500-step project < 5 s; unchanged-refresh from cache < 500 ms; step picker stays responsive at several hundred steps  
**Constraints**: No project code execution during static analysis; no undocumented `playwright-bdd` internals in the final architecture; no regex-only source scanning (use the TS AST); `@suisui/step-regex` free of heavy runtime deps; catalog schema JSON-serializable + versioned; renderer never imports Node/engine modules; a single bad step or file must not fail the catalog  
**Scale/Scope**: Up to ~500 step definitions across hundreds of files; four metadata sources; ~11 diagnostic codes; 5 delivery phases mapped to user stories P1–P5

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Gate                                                                                                                                                                                                                                                                                                      | Status                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| I. Process Isolation                 | Analyzer + `typescript` + engine run **only** in the main process; renderer touches the catalog exclusively via `window.api`. No Node/engine import in `app/`.                                                                                                                                            | ✅ Pass                                |
| II. Typed IPC Contracts              | 4 new channels added to all five touchpoints (`channels.ts`, `api.ts`, `handlers.ts`, `preload.ts`, shared rebuild). Input/output validated.                                                                                                                                                              | ✅ Pass (enforced in tasks)            |
| III. Test Isolation (NON-NEGOTIABLE) | The catalog path no longer spawns `bddgen`/`playwright`. Engine tests run on in-memory source fixtures via the TS Compiler API (a library call, not a CLI). Legacy `StepService` tests are untouched until Phase 5 removal. No real network/CLI.                                                          | ✅ Pass                                |
| IV. Service Pattern                  | `StepCatalogService` = singleton factory + constructor DI (inject engine, fs/clock, workspace + settings providers).                                                                                                                                                                                      | ✅ Pass                                |
| V. Shared Package SSoT               | The **serializable** catalog types (`CatalogStep`, `StepCatalogResult`, …) live in `@suisui/shared/src/types/step-catalog.ts`. `@suisui/step-catalog` imports them and adds only internal engine types. Dependency DAG stays acyclic: `step-regex ← shared ← step-catalog`. Rebuild after shared changes. | ✅ Pass (see Complexity Tracking note) |
| VI. Simplicity (YAGNI)               | MVP ships P1–P3 (structured catalog + params + transparency). Runtime registry (Phase 4) is **deferred/optional** behind the same `MetadataOrigin` seam. No speculative extensibility beyond the four named sources.                                                                                      | ✅ Pass (see Complexity Tracking)      |

**Additional stack rules honored**: `any` prohibited (use `unknown`); Composition API + `<script setup lang="ts">` for touched components; PascalCase service, `getStepCatalogService()` factory, `SCREAMING_SNAKE_CASE` channels; pre-commit lint/typecheck/test gates; shared rebuild rule; IPC 5-touchpoint checklist.

**Result**: PASS — no unjustified violations. Two decisions carry documented justification in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-step-catalog/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ipc-step-catalog.md
│   ├── catalog-schema.md
│   └── define-step-api.md
├── checklists/
│   └── requirements.md  # from /speckit.specify
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/step-catalog/                     # NEW engine package (main-process only)
├── package.json                           # deps: @suisui/shared, @suisui/step-regex, typescript
├── tsconfig.esm.json / tsconfig.cjs.json  # mirrors step-regex dual-build
└── src/
    ├── index.ts                           # public engine surface
    ├── catalog.ts                         # generate(): orchestrates discovery→analyze→merge→diagnose
    ├── discovery.ts                       # step-file discovery (globs + config-informed)
    ├── merge.ts                           # field-level, provenance-aware precedence merge
    ├── diagnostics.ts                     # diagnostic codes + factory helpers
    ├── ids.ts                             # deterministic SHA-256 stable IDs (step_<12hex>)
    ├── cache.ts                           # load/save/invalidate on-disk cache
    ├── adapters/
    │   ├── suisui-metadata.ts             # AST reader for defineStep({...}) + step`` fragments
    │   ├── typescript-analyzer.ts         # AST walk: Given/When/Then, aliases, fixtures, JSDoc, types, constants
    │   ├── pattern-analyzer.ts            # pattern → CatalogParameter[] (reuses step-regex parsers)
    │   └── runtime-registry.ts            # optional fallback (Phase 4, deferred — stub + seam only)
    ├── parsers/
    │   ├── cucumber-expression.ts         # cucumber-expression → params + kind
    │   └── regular-expression.ts          # regex source/flags → capture groups → params
    └── __tests__/                         # Vitest unit tests over source-string fixtures

packages/step-regex/src/                   # additive, stays dependency-free
├── define.ts                              # NEW defineStep() + StepMetadata types
├── step.ts                                # Frag gains {kind,name,enumValues,tableColumns,captures}; step`` retains fragments
├── typed.ts                               # bindSteps() overload accepts a defineStep() result
└── index.ts                               # export defineStep + metadata types

packages/shared/src/
├── types/step-catalog.ts                  # NEW serializable catalog contract (SSoT)
├── catalog/adapter.ts                     # NEW catalogStepToStepDefinition() (backward-compat)
├── ipc/channels.ts                        # + STEP_CATALOG_* (4 channels)
├── ipc/api.ts                             # + stepCatalog namespace
└── index.ts                               # export new types + adapter

apps/desktop/electron/
├── services/StepCatalogService.ts         # NEW singleton + DI; generate/getCached/clearCache/getStepById/findMatchingSteps
├── services/index.ts                      # export getStepCatalogService()
├── ipc/handlers.ts                        # + STEP_CATALOG_* handlers (validated I/O)
└── preload.ts                             # + window.api.stepCatalog bindings

apps/desktop/app/
├── stores/steps.ts                        # loads catalog; exposes CatalogStep[] + adapted StepDefinition[]
└── components/
    ├── StepSelector.vue                   # keyword/text/category/tag/type/precision filters, diagnostics badges
    ├── StepAddDialog.vue                  # per-parameter controls (enum select, number, table grid, text fallback)
    └── StepRow.vue                        # source location, precision, labels/descriptions/examples

apps/desktop/electron/scripts/
└── bddgen-export.js                       # REMOVED in Phase 5 (kept until native catalog proven)
```

**Structure Decision**: Extend the existing pnpm monorepo. The analysis engine is a **new leaf-ish package** `@suisui/step-catalog` (depends on `shared` + `step-regex` + `typescript`) so the heavy `typescript` dependency never touches `step-regex` (kept publishable/light) or the renderer. Cross-boundary **serializable** types live in `@suisui/shared` per Principle V; engine-internal types stay in `step-catalog`. The Electron `StepCatalogService` is the only bridge; the renderer consumes catalog data solely through typed IPC. Author-facing `defineStep()`/fragment metadata is additive in `@suisui/step-regex`.

## Complexity Tracking

| Decision                                                                                                                                      | Why Needed                                                                                                                                                                                          | Simpler Alternative Rejected Because                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Serializable catalog types in `@suisui/shared`, engine types in `@suisui/step-catalog` (brief suggested a single `step-catalog/src/types.ts`) | Principle V requires cross-process types in shared; renderer must not transitively import the `typescript`-heavy engine. Splitting keeps the dependency DAG acyclic and the renderer light.         | A single `types.ts` in `step-catalog` would force the renderer to import from a package that depends on `typescript`, risking bundle bloat and violating the SSoT principle.                                                                                 |
| Four-adapter engine (suisui-metadata / typescript / pattern / runtime) with a provenance-aware merge                                          | FR-006/FR-007/FR-009 mandate multi-source metadata merged by fixed precedence without downgrading precision, plus per-field origin/precision. A single monolithic parser cannot express provenance. | One combined parser cannot track which source produced each field, making FR-007 (never overwrite precise with imprecise) and FR-008 (conflict diagnostics) impossible. Adapters are the minimum structure that satisfies the requirement — not speculative. |
| Runtime registry (Phase 4) deferred to a stub + seam                                                                                          | YAGNI: static analysis + pattern inference already cover P1–P3 and most projects; runtime discovery needs isolated execution and is explicitly an optional fallback (spec Assumptions).             | Building runtime execution now adds sandboxing complexity for a fallback few projects need. The `MetadataOrigin='runtime'` seam keeps it addable later without rework.                                                                                       |

## Phase Mapping (delivery order = spec user stories)

| Phase | Spec story         | Scope                                                                                                                                                                                                                                                                                         |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | US1 (P1)           | `@suisui/step-catalog` skeleton, discovery, `typescript-analyzer` (keyword/pattern/kind/source loc), `pattern-analyzer`, diagnostics + per-file isolation, stable IDs, shared types, `StepCatalogService` + IPC, adapter, steps store sources catalog. Structured JSON replaces text parsing. |
| 2     | US2 (P2)           | Full `CatalogParameter` extraction (enum values, table columns, int/float, fixtures), callback param names/types via TypeChecker; `StepAddDialog` renders correct controls; adapter parity tests (SC-009).                                                                                    |
| 3     | US3 (P3)           | Precision/origin surfacing, inferred-name warnings, diagnostics badges, source display; `StepSelector` filters (keyword/text/category/tag/type/precision); duplicate + ambiguity diagnostics.                                                                                                 |
| 4     | US4 (P4)           | `defineStep()` + `Frag` metadata in `step-regex`; `suisui-metadata` adapter reads them (AST); merge precedence honors explicit metadata; conflict/invalid-metadata diagnostics.                                                                                                               |
| 5     | US5 (P5) + cleanup | Cache (write/read/invalidate + `.gitignore`), perf validation; then remove `bddgen-export.js` + legacy text parsing from `StepService`; docs.                                                                                                                                                 |

## Progress

- [x] Phase 0: research.md
- [x] Phase 1: data-model.md, contracts/, quickstart.md, agent context updated
- [x] Constitution re-check post-design (below)
- [ ] Phase 2: tasks.md (via `/speckit.tasks`)

### Post-Design Constitution Re-Check

Re-evaluated after data-model + contracts: no new violations. IPC contract keeps input/output validation explicit (II); adapter preserves Gherkin so no scenario-engine changes leak Node into the renderer (I); engine remains injectable (IV); all serializable types land in shared (V); runtime registry stays a deferred seam (VI). **PASS.**
