# Implementation Plan: Global Search Across Feature Files and Scenarios

**Branch**: `009-global-search` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-global-search/spec.md`

## Summary

Add a Ctrl/Cmd+K search input to the app header that finds **feature files and scenarios by name or
tag** across the whole workspace, with keyboard-navigable results that open the matched feature and
select the matched scenario.

Technical approach: a main-process `SearchIndexService` builds a flat in-memory index of
`{featureFile, featureName, scenarioNames, tags}` when a workspace opens, by scanning `.feature`
files with a small dedicated **outline parser** (names and tags only — no step parsing). The index is
kept fresh by a debounced recursive file watcher behind an injectable `IFileWatcher` seam. Queries are
answered in the main process over IPC. Matching logic lives in `@suisui/shared` so the renderer can
reuse it to overlay unsaved edits to the currently open feature on top of indexed results. At the
target scale (~2,200 indexed items) a plain linear scan over pre-normalized strings is well inside
the 300 ms budget — no inverted index, no persisted cache.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20.x (Electron 33 runtime); repo/tests on Node 22  
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x — **no new runtime dependency**. File watching uses Node's built-in `fs.watch` (recursive), not `chokidar`.  
**Storage**: None. The index is in-memory and session-scoped, rebuilt on workspace open. Nothing is written to `.app/` or to settings.  
**Testing**: Vitest 2.x (pure matcher + outline parser in `@suisui/shared`; `SearchIndexService` with `memfs` + a `FakeFileWatcher`); Playwright E2E against a production build with fixture `.feature` files.  
**Target Platform**: Electron desktop (Linux, macOS, Windows)  
**Project Type**: Desktop app — pnpm monorepo (`apps/desktop` + `packages/shared`)  
**Performance Goals**: results within 300 ms of last keystroke at 200 files / 2,000 scenarios (SC-002); index usable within 5 s of workspace open (SC-008); external file change reflected within 2 s (SC-009)  
**Constraints**: Renderer must not touch `node:fs` (Principle I); no real CLI or network in tests (Principle III); no new bundled dependency (Principle VI)  
**Scale/Scope**: ~200 feature files, ~2,000 scenarios, ~2,200 indexed items; 3 new IPC channels; 1 new main-process service; 1 new Pinia store; 1 new Vue component

No `NEEDS CLARIFICATION` items remain — the three open decisions (placement/shortcut, freshness model, step-search scope) were resolved in `/speckit.clarify` and are recorded in the spec's Clarifications section.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                   | Assessment                                                                                                                                                                                                                                                                                                                        | Status                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **I. Process Isolation**    | The index needs workspace-wide `fs` access, so it lives in `electron/services/`. The renderer reaches it only through `window.api.search.*`. No `node:*` import is added under `app/`. The renderer's unsaved-edit overlay reads Pinia state it already holds, not the filesystem.                                                | ✅ Pass                       |
| **II. Typed IPC Contracts** | 3 channels (`search:query`, `search:getStatus`, `search:indexStatus`) declared in `channels.ts`, signatures in `api.ts`, handlers in `handlers.ts`, bindings in `preload.ts`, then shared rebuild. The push channel follows the existing `onStateChanged`/`onStatus` unsubscribe-returning pattern.                               | ✅ Pass                       |
| **III. Test Isolation**     | No CLI or network involved. `SearchIndexService` tests use `memfs` for file reads and a `FakeFileWatcher` for change events, so no real watcher and no timing flake. The real `fs.watch` adapter gets one opt-in integration test outside the default run. E2E uses fixture `.feature` files (real fs, permitted).                | ✅ Pass                       |
| **IV. Service Pattern**     | `SearchIndexService` is a class taking optional `IFileWatcher` and a feature-reading dependency via constructor, exposed by `getSearchIndexService()`, exported from `electron/services/index.ts`.                                                                                                                                | ✅ Pass                       |
| **V. Shared Package SSoT**  | `SearchResult`, `SearchResponse`, `SearchIndexStatus`, and the result-type enum live in `packages/shared/src/types/search.ts`; the matcher and outline parser live in `packages/shared/src/search/`. Both processes import from `@suisui/shared`. `pnpm --filter @suisui/shared build` runs before dependent lint/typecheck/test. | ✅ Pass                       |
| **VI. Simplicity (YAGNI)**  | Linear scan over pre-normalized strings instead of an inverted/trigram index (justified by measured scale). No `chokidar`. No persisted cache. No manual-rebuild IPC channel. A names-and-tags outline parser (~60 lines) rather than reusing the step-aware `parseGherkin`. One deliberate seam — see Complexity Tracking.       | ⚠️ Pass with one tracked item |

**Gate result: PASS.** No unjustified violations. The single tracked complexity is recorded below.

### Post-Phase-1 re-check

Re-evaluated after `data-model.md` and `contracts/` were written: no principle moved. The design added
no further abstraction — the matcher stayed a pure function pair, the service kept one seam, and the
IPC surface stayed at 3 channels. Two simplifications were found during design and applied:
`search:rebuild` was dropped (workspace-open already triggers a rebuild internally, so an IPC channel
for it was speculative), and the result model carries `matchedField` instead of a separate
tag-result type, which keeps the result-type enum at two values.

## Project Structure

### Documentation (this feature)

```text
specs/009-global-search/
├── plan.md              # This file
├── spec.md              # Feature specification (clarified)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-search.md    # Phase 1 output — IPC contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   └── search.ts                     # NEW — SearchResult, SearchResponse, SearchIndexStatus, SearchResultType
├── search/
│   ├── matcher.ts                    # NEW — normalize(), tokenize(), matchText() → ranges + score
│   ├── featureOutline.ts             # NEW — parseFeatureOutline(): names + tags only, never throws
│   └── index.ts                      # NEW — barrel
├── ipc/
│   ├── channels.ts                   # EDIT — SEARCH_QUERY, SEARCH_GET_STATUS, SEARCH_INDEX_STATUS
│   └── api.ts                        # EDIT — search: { query, getStatus, onIndexStatus }
├── index.ts                          # EDIT — export types/search + search/
└── __tests__/
    ├── matcher.test.ts               # NEW
    └── featureOutline.test.ts        # NEW

apps/desktop/electron/
├── services/
│   ├── SearchIndexService.ts         # NEW — build, search, incremental update, status
│   ├── FileWatcher.ts                # NEW — IFileWatcher seam + NodeFileWatcher (fs.watch recursive)
│   └── index.ts                      # EDIT — export the new service
├── ipc/
│   └── handlers.ts                   # EDIT — 2 invoke handlers + wire rebuild on workspace change
├── preload.ts                        # EDIT — search bindings incl. onIndexStatus unsubscribe
└── __tests__/
    ├── SearchIndexService.test.ts    # NEW — memfs + FakeFileWatcher
    └── fakes/FakeFileWatcher.ts      # NEW

apps/desktop/app/
├── components/
│   └── GlobalSearch.vue              # NEW — header input + results panel + keyboard nav
├── stores/
│   └── search.ts                     # NEW — query, results, status, type filter, active index
└── pages/
    └── index.vue                     # EDIT — mount <GlobalSearch> in <header>, handle activation

apps/desktop/e2e/
└── global-search.spec.ts             # NEW — fixture workspace, keyboard-only flow
```

**Structure Decision**: Standard SuiSui monorepo split. Serializable contracts and pure logic go to
`packages/shared` (Principle V) so the renderer can re-run matching on unsaved content without
duplicating rules; everything touching the filesystem stays in `apps/desktop/electron/services`
(Principle I). No new package is introduced — this feature is far too small to warrant one, unlike
`@suisui/step-catalog` which needed an isolated `typescript` dependency.

## Complexity Tracking

| Violation                                                                                                    | Why Needed                                                                                                                                                                                        | Simpler Alternative Rejected Because                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IFileWatcher` seam (interface + real adapter + fake) rather than calling `fs.watch` directly in the service | Principle III forbids tests that depend on real filesystem watch events, which are OS-dependent and timing-flaky. The seam lets `SearchIndexService` tests drive change events deterministically. | Calling `fs.watch` inline would make every freshness test (FR-014, SC-009) either untestable or a sleep-based flake. This mirrors the already-accepted `IRecorderAdapter` and `ICommandRunner` seams, so it adds a familiar shape rather than a novel one. |

### Noted risk (not a violation)

Recursive `fs.watch` is reliable on macOS and Windows but only landed for Linux in Node 20.13 and is
known to miss events under heavy churn. Mitigation in `research.md`: debounce and coalesce events,
and treat any watch error as a trigger for a single full rescan rather than as a fatal error. If this
proves insufficient in practice, adding `chokidar` is a contained follow-up behind the same
`IFileWatcher` seam — the seam is what makes that swap cheap.

### Scope note carried forward from the spec

Issue #88's acceptance criteria include **step text**, which this feature deliberately excludes. The
index row model in `data-model.md` reserves room for a third result type so step search can be added
later without reshaping navigation or the IPC contract. Issue #88 should be amended or a follow-up
opened — this plan does not close it in full.
