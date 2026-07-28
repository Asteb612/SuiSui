---
description: 'Task list for 009-global-search'
---

# Tasks: Global Search Across Feature Files and Scenarios

**Input**: Design documents from `/specs/009-global-search/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ipc-search.md](./contracts/ipc-search.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Not because the spec asked for TDD, but because Constitution Principle III
(NON-NEGOTIABLE) and the pre-commit quality gate require `pnpm test` to pass, and `plan.md`
prescribes the specific test files. Test tasks are written to fail first.

**Organization**: Grouped by user story. US1 is the MVP and ships alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: [US1] or [US2] — maps to the user stories in spec.md
- Every task states its exact file path

## Path Conventions

pnpm monorepo. Shared contracts and pure logic in `packages/shared/src/`; main process in
`apps/desktop/electron/`; renderer in `apps/desktop/app/`; E2E in `apps/desktop/e2e/`.

**⚠️ Standing rule for every task touching `packages/shared/`**: run
`pnpm --filter @suisui/shared build` before any dependent lint/typecheck/test. Half of the
"impossible" type errors in this feature will be a stale `dist/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the shared type surface everything else compiles against.

- [x] T001 Create `packages/shared/src/types/search.ts` with `SearchResultType`, `MatchedField`, `MatchRange`, `SearchResult`, `SearchResponse`, `SearchIndexState`, `SearchIndexStatus`, `FeatureOutline`, `ScenarioOutline`, and `MAX_SEARCH_RESULTS = 100`, exactly as specified in data-model.md
- [x] T002 Create the barrel `packages/shared/src/search/index.ts` and add `export * from './types/search'` plus `export * from './search'` to `packages/shared/src/index.ts`
- [x] T003 Run `pnpm --filter @suisui/shared build` and `pnpm typecheck` to confirm the new types resolve from both `apps/desktop/electron` and `apps/desktop/app`

**Checkpoint**: Shared types compile and are importable from both processes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The index pipeline and IPC surface. Everything here is story-agnostic — it indexes
names _and_ tags because one parse pass produces both, but no matching semantics are decided yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Pure logic in `@suisui/shared`

- [x] T004 [P] Write failing unit tests for text normalization in `packages/shared/src/__tests__/matcher.test.ts`: lowercasing, NFD accent-stripping (`Connexion` ≡ `connexion`), **length preservation** (assert `normalize(s).length === s.length` over an accented fixture — `MatchRange` offsets depend on it), and whitespace tokenization
- [x] T005 Implement `normalize(text: string): string` and `tokenize(query: string): string[]` in `packages/shared/src/search/matcher.ts` until T004 passes. Use NFD decomposition + combining-mark strip + `toLowerCase()`; never use a transform that changes length
- [x] T006 [P] Write failing unit tests for the outline parser in `packages/shared/src/__tests__/featureOutline.test.ts`, covering: `Feature:` name, feature-level tags, `Scenario:` and `Scenario Outline:` names, scenario-level tags, `Background:` skipped, multiple tags on one line, a scenario with an empty name, and a **malformed file that must not throw** and must set `hasParseErrors: true`
- [x] T007 Implement `parseFeatureOutline(content: string): FeatureOutline` in `packages/shared/src/search/featureOutline.ts` until T006 passes. Line-scanner only — no step parsing, no `Examples` parsing, no dependencies. It must never throw; unrecognized lines are skipped
- [x] T008 Run `pnpm --filter @suisui/shared build`, then `pnpm test` to confirm the shared suite is green

### File-watcher seam (main process)

- [x] T009 [P] Define `IFileWatcher` (`watch(dir, onChange, onError): void`, `close(): void`) and implement `NodeFileWatcher` using `fs.watch(dir, { recursive: true })` with 250 ms debounce/coalescing in `apps/desktop/electron/services/FileWatcher.ts`. Treat any watcher error as "signal a full rescan", never as fatal
- [x] T010 [P] Create `FakeFileWatcher` in `apps/desktop/electron/__tests__/fakes/FakeFileWatcher.ts` exposing synchronous `emitChange(path)` and `emitError(err)` so freshness tests never depend on real OS events or sleeps

### Index service (main process)

- [x] T011 Write failing unit tests in `apps/desktop/electron/__tests__/SearchIndexService.test.ts` using `memfs` + `FakeFileWatcher`, covering: index builds from a workspace scan, `getStatus()` reports `fileCount`/`scenarioCount`, an unparseable file lands in `unparsedFiles` **and still contributes a name-matchable feature row**, `state` moves `idle → building → ready`, and no workspace open yields an empty result with `state: 'idle'`
- [x] T012 Implement `SearchIndexService` in `apps/desktop/electron/services/SearchIndexService.ts` — constructor takes optional `IFileWatcher` (falling back to `NodeFileWatcher`) per Principle IV, with `getSearchIndexService()` singleton factory. Build `SearchIndexRow[]` + `byFile: Map` via `WorkspaceService.getFeaturesDir()` and a recursive scan, precomputing `normalizedText`/`normalizedTags` **at index time**
- [x] T013 Add incremental update to `SearchIndexService`: on a debounced watcher change, re-parse only the affected file and replace its rows via `byFile`; on watcher error or a missing directory, do one full rescan and re-establish the watch. Extend `SearchIndexService.test.ts` to drive these through `FakeFileWatcher`
- [x] T014 Export `SearchIndexService` and `getSearchIndexService` from `apps/desktop/electron/services/index.ts`

### IPC surface (all five touchpoints — omitting any is a blocking defect)

- [x] T015 Add `SEARCH_QUERY: 'search:query'`, `SEARCH_GET_STATUS: 'search:getStatus'`, `SEARCH_INDEX_STATUS: 'search:indexStatus'` to `packages/shared/src/ipc/channels.ts`
- [x] T016 Add the `search: { query, getStatus, onIndexStatus }` block to `packages/shared/src/ipc/api.ts`, matching the signatures in contracts/ipc-search.md
- [x] T017 Add `SEARCH_QUERY` and `SEARCH_GET_STATUS` handlers to `apps/desktop/electron/ipc/handlers.ts`, validating that `requestId` is a number and `text` is a string at the boundary
- [x] T018 Add the `search` bindings to `apps/desktop/electron/preload.ts`, with `onIndexStatus` returning an unsubscribe fn (mirror the existing `update.onStateChanged` shape)
- [x] T019 Wire index rebuild into the existing `WORKSPACE_SET` / `WORKSPACE_SELECT` / `WORKSPACE_INIT` handlers in `apps/desktop/electron/ipc/handlers.ts`, and push `SEARCH_INDEX_STATUS` to the window as state advances. No `search:rebuild` channel — the renderer never asks
- [x] T020 Run `pnpm --filter @suisui/shared build`, then `pnpm typecheck` and `pnpm test`. Confirm `packages/shared/src/__tests__/ipcContract.test.ts` still passes with the three new channels

### Renderer shell

- [x] T021 Create `apps/desktop/app/stores/search.ts` with state (`query`, `results`, `totalMatches`, `truncated`, `status`, `activeIndex`, `typeFilter`), a 120 ms debounced `runQuery` action, a monotonic `requestId` counter, and **discard-if-stale** response handling (FR-029). Guard empty/whitespace queries before dispatching
- [x] T022 Create `apps/desktop/app/components/GlobalSearch.vue` (`<script setup lang="ts">`, PrimeVue) as a header input with a results panel container, subscribing to `onIndexStatus` on mount and **unsubscribing in `onUnmounted`**
- [x] T023 Implement the Ctrl/Cmd+K `window` keydown listener inside `GlobalSearch.vue`: focus the input, and bail out when the event target is an `input`/`textarea`/`contenteditable` or a modal dialog is open (FR-002). Escape closes the panel and restores prior focus (FR-003)
- [x] T024 Mount `<GlobalSearch />` in the `<header class="header titlebar">` of `apps/desktop/app/pages/index.vue`, rendered only when `workspaceStore.hasWorkspace`, with a disabled state explaining why when no workspace is open (FR-031)

**Checkpoint**: The index builds, stays fresh, and is queryable over IPC; the header input exists and
takes focus on Ctrl+K. No results render yet — that is US1.

---

## Phase 3: User Story 1 - Find a feature file or scenario by name (Priority: P1) 🎯 MVP

**Goal**: Type part of a feature or scenario name, see ranked results with context and highlighting,
and activate one to land on that scenario — entirely by keyboard.

**Independent Test**: Open a workspace with several feature files, type part of a known scenario
name, confirm it appears with its parent feature and file location, press Enter, confirm the app
opens that feature and selects that scenario.

### Tests for User Story 1

- [x] T025 [P] [US1] Extend `packages/shared/src/__tests__/matcher.test.ts` with failing tests for `matchText()`: all tokens must be present in any order, order-independence (`"expired checkout"` matches `"Checkout with an expired card"`), regex metacharacters treated literally (FR-010), returned `MatchRange` offsets index the **original** text, and the score ladder ordering (exact 100 > prefix 80 > word-boundary 60 > substring 40)
- [x] T026 [P] [US1] Extend `apps/desktop/electron/__tests__/SearchIndexService.test.ts` with failing tests for `search()`: name matches across multiple files, results sorted by score with deterministic tie-breaking (shorter text, then `relativePath`, then `scenarioIndex`), `feature` rows weighted +5 over equally-scoring `scenario` rows, truncation at 100 with `totalMatches` reporting the true count and `truncated: true`, duplicate scenario names in different files returned as separate results, a `Scenario Outline` returned as exactly one result, and `requestId` echoed back
- [x] T027 [P] [US1] Write failing tests in `apps/desktop/app/stores/__tests__/search.test.ts` for the store: a stale response (lower `requestId`) does not overwrite a newer one, an empty/whitespace query clears results without dispatching, and the unsaved-edit overlay excludes indexed rows for `scenarioStore.currentFeaturePath` before merging live rows

### Implementation for User Story 1

- [x] T028 [US1] Implement `matchText(text: string, tokens: string[]): { ranges: MatchRange[]; score: number } | null` in `packages/shared/src/search/matcher.ts` until T025 passes. Literal `includes()` on normalized strings only — never build a RegExp from user input
- [x] T029 [US1] Implement `SearchIndexService.search(requestId, text)` in `apps/desktop/electron/services/SearchIndexService.ts` until T026 passes: linear scan over `rows`, name matching via `matchText`, `+5` type weight for features, sort, count `totalMatches` **before** truncating to `MAX_SEARCH_RESULTS`, return a `SearchResponse` carrying current `status`
- [x] T030 [US1] Enforce the one-result-per-row rule in `search()`: a row that matches produces exactly one `SearchResult` with `matchedField: 'name'`, so per-type counts equal distinct matched items
- [x] T031 [US1] Wire `runQuery` in `apps/desktop/app/stores/search.ts` to `window.api.search.query`, applying the `requestId` discard from T021 until T027's stale-response test passes
- [x] T032 [US1] Implement the unsaved-edit overlay in `apps/desktop/app/stores/search.ts`: when `scenarioStore.isDirty`, drop indexed results whose `relativePath === scenarioStore.currentFeaturePath`, then re-derive that feature's rows from live Pinia state and match them with the shared `matchText`. **Exclude by path before re-adding** so a renamed scenario never appears under both names
- [x] T033 [US1] Render the results panel in `apps/desktop/app/components/GlobalSearch.vue`: grouped by type with a per-type label, each row showing display text, owning feature name, and file location (FR-016)
- [x] T034 [US1] Implement match highlighting in `apps/desktop/app/components/GlobalSearch.vue` by slicing display text on `MatchRange` offsets (FR-017). Do not re-run matching in the component
- [x] T035 [US1] Implement the truncation indicator ("showing first N of M") and the explicit no-results empty state in `apps/desktop/app/components/GlobalSearch.vue` (FR-020, FR-021)
- [x] T036 [US1] Implement the indexing-in-progress state in `apps/desktop/app/components/GlobalSearch.vue`, driven by `status.state === 'building'`, so an early query never shows a premature "no results" (FR-015)
- [x] T037 [US1] Implement keyboard navigation in `apps/desktop/app/components/GlobalSearch.vue`: Arrow Down/Up move `activeIndex` with wrap-around, Enter activates, and the active row scrolls into view (FR-004)
- [x] T038 [US1] Implement result activation in `apps/desktop/app/pages/index.vue`: a `feature` result opens that feature file; a `scenario` result opens its feature then selects `scenarioIndex`. Close the panel and move focus to the destination content (FR-024, FR-025, FR-026)
- [x] T039 [US1] Handle a vanished target on activation in `apps/desktop/app/pages/index.vue`: show a clear non-fatal message and leave current work untouched (FR-027)
- [x] T040 [US1] Clear results and reset state when the workspace changes or closes, in `apps/desktop/app/stores/search.ts`, so results from a previous workspace are never selectable
- [x] T041 [P] [US1] Create the E2E fixture workspace under `apps/desktop/e2e/fixtures/workspaces/search/` containing: a plain `Scenario:`, a `Scenario Outline:` with `Examples`, **the same scenario name in two different feature files**, feature-level and scenario-level tags (at least one shared across files), a scenario with an empty name, accented text (`Connexion`), and one intentionally malformed `.feature` file
- [x] T042 [US1] Write `apps/desktop/e2e/global-search.spec.ts` covering the keyboard-only journey: Ctrl+K focuses the input, typing shows ranked results, Arrow Down + Enter navigates to the correct scenario, Escape closes the panel, gibberish shows the empty state, and the malformed fixture does not prevent results from the other files (SC-005, SC-006)

**Checkpoint**: US1 is fully functional and shippable on its own. Name search + navigation works;
tags are indexed but not yet matchable, and there is no type filter.

---

## Phase 4: User Story 2 - Narrow results by tag and result type (Priority: P2)

**Goal**: Find everything carrying a tag by typing the tag text (with or without `@`), and restrict
the result list to a single result type.

**Independent Test**: Tag several scenarios, search the tag text, confirm only tagged items return
and the matching tag is shown on each result; then toggle the type filter and confirm the list
narrows and per-type counts stay visible.

### Tests for User Story 2

- [x] T043 [P] [US2] Extend `packages/shared/src/__tests__/matcher.test.ts` with failing tests for tag matching: a query with and without a leading `@` returns the same match (FR-009), and a tag match scores 25 below the equivalent name match
- [x] T044 [P] [US2] Extend `apps/desktop/electron/__tests__/SearchIndexService.test.ts` with failing tests: tag-only matches return `matchedField: 'tag'` with `matchedTag` populated, a row matching by both name and tag returns a **single** result with `matchedField: 'name'` (name wins), and a scenario with an empty name is still tag-matchable
- [x] T045 [P] [US2] Write failing tests in `apps/desktop/app/stores/__tests__/search.test.ts` for the type filter: filtering narrows `results` while per-type counts still reflect the unfiltered totals, and the filter resets when the query is cleared (FR-023)

### Implementation for User Story 2

- [x] T046 [US2] Extend `matchText` usage in `packages/shared/src/search/matcher.ts` with `matchTag(tag, tokens)`, stripping a leading `@` from both the indexed tag and the query token before comparing, and applying the −25 score offset, until T043 passes
- [x] T047 [US2] Extend `SearchIndexService.search()` in `apps/desktop/electron/services/SearchIndexService.ts` to fall back to tag matching when the name does not match, populating `matchedField` and `matchedTag`, preserving the one-result-per-row rule from T030, until T044 passes
- [x] T048 [US2] Add the `typeFilter` action and per-type counts to `apps/desktop/app/stores/search.ts`, resetting the filter when the query is cleared, until T045 passes
- [x] T049 [US2] Render the matched tag on tag-matched results in `apps/desktop/app/components/GlobalSearch.vue` so the reason for the match is evident (FR-018)
- [x] T050 [US2] Add the result-type filter control and per-type match counts to `apps/desktop/app/components/GlobalSearch.vue` (FR-022, FR-023)
- [x] T051 [US2] Extend `apps/desktop/e2e/global-search.spec.ts` with the tag journey: search a tag with and without `@` returns the same results, the matching tag is displayed, and the type filter narrows the list

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T052 [P] Verify the freshness path end to end against SC-009: edit a `.feature` file with an external editor and confirm the change appears in results within ~2 s, per the quickstart.md verification table
- [x] T053 [P] Run the SC-002 performance check with a generated 200-file / 2,000-scenario workspace; confirm results render within 300 ms of the last keystroke and that normalization is not being re-run per query
- [x] T054 [P] Document the feature in `doc/SERVICES.md` (`SearchIndexService`), `doc/IPC_TYPES.md` (`search:*`), and `doc/FRONTEND.md` (`useSearchStore` + `GlobalSearch.vue`)
- [x] T055 [P] Add a Global Search section to `CLAUDE.md` alongside the existing feature sections, noting the names-and-tags-only scope and the `IFileWatcher` seam
- [x] T056 Verify accessibility of the results panel in `apps/desktop/app/components/GlobalSearch.vue`: the input is labelled, the active result is conveyed to assistive tech, and result counts are announced
- [x] T057 Walk the full manual verification table in quickstart.md, then run `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`, and `pnpm build && pnpm test:e2e`
- [ ] T058 Amend GitHub issue #88's acceptance criteria to reflect the excluded step-text search, or open a follow-up issue for it, referencing the reserved extension points in data-model.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks both user stories**
- **US1 (Phase 3)**: Depends on Foundational only
- **US2 (Phase 4)**: Depends on Foundational. Touches the same three files as US1 (`matcher.ts`, `SearchIndexService.ts`, `GlobalSearch.vue`), so running it concurrently with US1 will conflict — see Parallel Team Strategy
- **Polish (Phase 5)**: Depends on the desired stories being complete

### Critical path within Foundational

```text
T001 → T002 → T003 ─┬─> T004→T005 (matcher primitives)
                    ├─> T006→T007→T008 (outline parser)
                    ├─> T009, T010 (watcher seam)
                    └─> T015→T016 (channels + api)
                              │
        T005,T007,T009,T010 ──┴──> T011→T012→T013→T014 (service)
                                        │
                              T017→T018→T019→T020 (handlers, preload, wiring)
                                        │
                                   T021→T022→T023→T024 (renderer shell)
```

### Within each user story

- Tests (T025–T027, T043–T045) are written first and must fail before the matching implementation
- Shared matcher → service → store → component → page wiring → E2E
- T028 blocks T029 (the service calls the matcher); T029 blocks T031; T033 blocks T034/T035/T036/T037

### Parallel Opportunities

- **Phase 2**: T004/T006 (different test files), T009/T010 (different files), and T015/T016 can each start in parallel once T003 lands
- **US1**: T025, T026, T027 in parallel (three different test files); T041 (fixtures) in parallel with any implementation task
- **US2**: T043, T044, T045 in parallel
- **Polish**: T052, T053, T054, T055 all in parallel

---

## Parallel Example: User Story 1

```bash
# Write all three failing test suites together:
Task: "Extend matcher tests for matchText in packages/shared/src/__tests__/matcher.test.ts"
Task: "Extend SearchIndexService tests for search() in apps/desktop/electron/__tests__/SearchIndexService.test.ts"
Task: "Write search store tests in apps/desktop/app/stores/__tests__/search.test.ts"

# Build E2E fixtures alongside implementation (no shared files):
Task: "Create E2E fixture workspace in apps/desktop/e2e/fixtures/workspaces/search/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001–T003)
2. Phase 2: Foundational (T004–T024) — **critical, blocks everything**
3. Phase 3: User Story 1 (T025–T042)
4. **STOP and VALIDATE**: run the US1 independent test and the US1 rows of the quickstart.md table
5. Shippable: name search + keyboard navigation across the whole workspace

### Incremental Delivery

1. Setup + Foundational → index builds, stays fresh, queryable over IPC
2. - US1 → **MVP**: find and navigate by name
3. - US2 → tag search and type filtering
4. - Polish → docs, performance verification, accessibility, issue #88 reconciliation

### Parallel Team Strategy

Foundational is a genuine bottleneck here — it is 21 of 58 tasks and both stories sit on top of it.
With two developers, split Phase 2 along the process boundary: one takes the shared logic and index
service (T004–T014), the other takes IPC and the renderer shell (T015–T024), synchronizing at T020.

Do **not** run US1 and US2 concurrently. They edit the same three files (`matcher.ts`,
`SearchIndexService.ts`, `GlobalSearch.vue`), and US2's tag matching is defined as a fallback from
US1's name matching — the merge cost exceeds the parallelism gain. Ship US1, then start US2.

---

## Notes

- **Rebuild `@suisui/shared`** after T001, T002, T005, T007, T015, T016, T028, T046 — anything under `packages/shared/`
- `MatchRange` offsets index the **original** text, so `normalize()` must preserve length. Any transform that collapses characters (`ß` → `ss`) produces highlight bugs visible only with non-ASCII input
- Never import `node:fs` under `app/` — the renderer's freshness overlay reads Pinia state only
- Never construct a `RegExp` from query text — FR-010 requires literal matching, and it is an injection surface
- Commit after each task or logical group; every commit must pass `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`
