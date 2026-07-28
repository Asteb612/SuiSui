---
description: 'Task list for 010-tag-management'
---

# Tasks: Tag Management and Tag-Based Browsing/Run View

**Input**: Design documents from `/specs/010-tag-management/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ipc-tags.md](./contracts/ipc-tags.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Constitution Principle III (NON-NEGOTIABLE) and the pre-commit gate require
`pnpm test` to pass, and `plan.md` prescribes the test files. For this feature tests carry extra
weight: US3 writes to the user's `.feature` files with **no undo**, so the splicer is tested
exhaustively before anything calls it.

**Organization**: Grouped by user story. US1 is the MVP and ships alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: [US1], [US2], [US3] — maps to the user stories in spec.md
- Every task states its exact file path

## Path Conventions

pnpm monorepo. Shared contracts and pure logic in `packages/shared/src/`; main process in
`apps/desktop/electron/`; renderer in `apps/desktop/app/`; E2E in `apps/desktop/e2e/`.

**⚠️ Standing rule**: after ANY change under `packages/shared/`, run
`pnpm --filter @suisui/shared build` before dependent lint/typecheck/test.

---

## Phase 1: Setup

**Purpose**: Confirm the sequencing dependency is satisfied, then establish the shared type surface.

- [X] T001 Verify feature 009 has landed: confirm `packages/shared/src/search/featureOutline.ts` and `apps/desktop/electron/services/FileWatcher.ts` exist on this branch (rebase onto `main` after PR #127 merges). If they do not, **stop** and take the documented fallback decision in plan.md — do not improvise a third parser
- [X] T002 Create `packages/shared/src/types/tags.ts` with `TagOrigin`, `TagUsage`, `TagSummary`, `TagIndexState`, `TagIndex`, `BulkTagOperation`, `BulkTagRequest`, `BulkTagTarget`, `TagWriteStatus`, `TagWriteOutcome`, and `BulkTagResult`, exactly as specified in data-model.md
- [X] T003 Add `export * from './types/tags'` to `packages/shared/src/index.ts`, then run `pnpm --filter @suisui/shared build` and `pnpm typecheck` to confirm the types resolve from both processes

**Checkpoint**: Shared types compile and are importable from main and renderer.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Parser positions, the index service, the IPC read surface, and the view shell.
Story-agnostic plumbing — no tag semantics or editing yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Parser extension (`@suisui/shared`)

- [X] T004 [P] Add failing tests to `packages/shared/src/__tests__/featureOutline.test.ts` for line positions: `line` on each scenario, `tagLine` present only when a tag line sits directly above, `tagLine` absent when the scenario has no tags, and `featureTagLine` for the feature's own tag line. Include a CRLF fixture
- [X] T005 Add optional `line`, `tagLine`, and `featureTagLine` to `parseFeatureOutline` in `packages/shared/src/search/featureOutline.ts` until T004 passes. **Additive only** — the parser must keep never throwing, and all existing assertions must still hold
- [X] T006 Run `pnpm --filter @suisui/shared build` then `pnpm test` and confirm feature 009's search tests (`matcher.test.ts`, `SearchIndexService.test.ts`) still pass unchanged — the parser extension must not disturb the search index

### Tag index service (main process)

- [X] T007 [P] Write failing tests in `apps/desktop/electron/__tests__/TagService.test.ts` using `memfs` + `FakeFileWatcher`, covering: index builds from a workspace scan, `state` moves `idle → building → ready`, no workspace open yields `state: 'idle'` with empty collections, nested directories are scanned, non-`.feature` files are ignored, and the watcher is established on the features directory
- [X] T008 Implement `TagService` in `apps/desktop/electron/services/TagService.ts` — constructor takes optional `IFileWatcher` and `IWorkspaceLocator` (Principle IV), with a `getTagService()` singleton factory. Scan `.feature` files via `WorkspaceService.getFeaturesDir()` and hold parsed outlines per file
- [X] T009 Add freshness to `TagService`: rebuild on workspace change, incremental per-file update on a debounced watcher event, and a single full rescan on watcher error **without re-establishing the watch** (a dir that can never be watched must not loop). Extend `TagService.test.ts` to drive these through `FakeFileWatcher`
- [X] T010 Export `TagService` and `getTagService` from `apps/desktop/electron/services/index.ts`

### IPC read surface (all five touchpoints)

- [X] T011 Add `TAGS_GET_INDEX: 'tags:getIndex'`, `TAGS_APPLY_BULK: 'tags:applyBulk'`, and `TAGS_INDEX_CHANGED: 'tags:indexChanged'` to `packages/shared/src/ipc/channels.ts`
- [X] T012 Add the `tags: { getIndex, applyBulk, onIndexChanged }` block to `packages/shared/src/ipc/api.ts`, matching contracts/ipc-tags.md
- [X] T013 Add the `TAGS_GET_INDEX` handler to `apps/desktop/electron/ipc/handlers.ts` and wire index lifecycle into `WORKSPACE_SET`, `WORKSPACE_SELECT`, `WORKSPACE_INIT`, **and `WORKSPACE_GET`**. The `WORKSPACE_GET` path is how a workspace restored from settings first materializes; omitting it yields an index that is silently empty for the whole session (this exact bug shipped in feature 009)
- [X] T014 Add the `tags` bindings to `apps/desktop/electron/preload.ts`, with `onIndexChanged` returning an unsubscribe fn, and push `TAGS_INDEX_CHANGED` from the main process on index change (mirror the `search:indexStatus` wiring in `main.ts`)
- [X] T015 Run `pnpm --filter @suisui/shared build`, then `pnpm typecheck` and `pnpm test`; confirm `packages/shared/src/__tests__/ipcContract.test.ts` passes with the three new channels

### Renderer shell

- [X] T016 Create `apps/desktop/app/stores/tags.ts` with state (`index`, `selectedTag`, `tagFilter`, `sortMode`, `selectedScenarioIds`) plus `init`/`dispose` that subscribe and **unsubscribe** from `onIndexChanged`, and a `reset` that clears state when the workspace changes
- [X] T017 Create `apps/desktop/app/components/TagBrowser.vue` (`<script setup lang="ts">`, PrimeVue) as a master/detail shell, extend `activeView` to `'editor' | 'runner' | 'tags'` in `apps/desktop/app/pages/index.vue`, and add a header entry point shown only when a workspace is open

**Checkpoint**: The index builds, stays fresh, and is readable over IPC; the Tags view opens. No tag
counts or semantics yet — that is US1.

---

## Phase 3: User Story 1 - Browse every tag with counts and drill into scenarios (Priority: P1) 🎯 MVP

**Goal**: See every tag in the workspace with an accurate per-scenario count, drill into the
scenarios carrying it (direct vs inherited), and jump to one in the editor.

**Independent Test**: Open a workspace with tagged features, confirm every tag appears once with a
correct count, select a tag, confirm exactly its scenarios are listed with their owning feature and
inheritance marked, and select one to open it.

### Tests for User Story 1

- [X] T018 [P] [US1] Write failing tests in `apps/desktop/electron/__tests__/TagService.test.ts` for tag aggregation: a feature-level tag counts for every scenario in that feature, a tag on both a feature and one of its own scenarios counts that scenario **once** (`origin: 'direct'` wins), a tag on a feature with zero scenarios yields `scenarioCount: 0` and `orphaned: true`, `@Smoke` and `@smoke` stay distinct, and `usedAtFeatureLevel`/`usedAtScenarioLevel` are set correctly
- [X] T019 [P] [US1] Write failing tests in `apps/desktop/electron/__tests__/TagService.test.ts` for resilience: an unparseable feature file is listed in `unparsedFiles` without preventing tags from other files appearing
- [X] T020 [P] [US1] Write failing tests in `apps/desktop/app/__tests__/tagsStore.test.ts` for the store: sort by count-descending vs alphabetical, the tag filter narrows the list, selecting a tag exposes its usages, and the unsaved-edit overlay replaces the open feature's usages from `scenarioStore` state

### Implementation for User Story 1

- [X] T021 [US1] Implement tag aggregation in `apps/desktop/electron/services/TagService.ts` — build `TagUsage[]` per tag with `origin`, deduplicate per scenario (direct wins over inherited), and derive `TagSummary` counts and flags until T018 passes
- [X] T022 [US1] Implement per-file parse-failure handling in `apps/desktop/electron/services/TagService.ts` so a bad file is recorded in `unparsedFiles` and skipped without aborting the scan, until T019 passes
- [X] T023 [US1] Implement sorting, filtering, and selection getters in `apps/desktop/app/stores/tags.ts` until T020's sort/filter/selection tests pass
- [X] T024 [US1] Implement the unsaved-edit overlay in `apps/desktop/app/stores/tags.ts`: when `scenarioStore.isDirty`, drop usages whose `relativePath` matches `scenarioStore.currentFeaturePath` and re-derive them from live Pinia state (excluding by path **before** re-adding), until T020's overlay test passes
- [X] T025 [US1] Render the tag list in `apps/desktop/app/components/TagBrowser.vue`: each tag with its scenario count, a sort toggle (count ↔ alphabetical), a filter input, and a visual marker for `orphaned` tags (FR-002, FR-004, FR-005)
- [X] T026 [US1] Render the scenario detail list in `apps/desktop/app/components/TagBrowser.vue`: scenario name, owning feature, file location, and a clear `direct` vs `inherited` indicator (FR-006, FR-007)
- [X] T027 [US1] Implement scenario activation in `apps/desktop/app/pages/index.vue`: open the feature and select the scenario, waiting for the feature load to complete before setting the scenario index so the editor does not reset it (FR-008)
- [X] T028 [US1] Implement empty and unavailable states in `apps/desktop/app/components/TagBrowser.vue`: explicit "no tags found" for an empty workspace, an indexing-in-progress state, a disabled entry point with explanation when no workspace is open, and a notice naming files that could not be searched (FR-009, FR-012)
- [X] T029 [P] [US1] Create the E2E fixture workspace under `apps/desktop/e2e/fixtures/workspaces/tags/` covering: feature-level inheritance, the same tag on a feature and its own scenario, a tag on a feature with zero scenarios, `@Smoke` vs `@smoke`, `@smoke` vs `@smoke-test`, scenarios with no tag line and with several tags on one line, a scenario with an empty name but tags, one malformed file, and at least one CRLF file
- [X] T030 [US1] Write `apps/desktop/e2e/tag-management.spec.ts` covering the browsing journey: open the Tags view, assert exact counts against the fixture, select a tag, assert its scenario list and inheritance markers, select a scenario and confirm the editor lands on it, and confirm the malformed file is reported without hiding other tags

**Checkpoint**: US1 is fully functional and shippable on its own — tags are visible workspace-wide
with correct counts and drill-down. No running by tag, no editing.

---

## Phase 4: User Story 2 - Run every scenario carrying a tag (Priority: P2)

**Goal**: Start a run for the selected tag from the tag browser, covering exactly its scenarios.

**Independent Test**: Tag a known subset of scenarios, run that tag from the browser, and confirm
the run covers exactly those scenarios.

**⚠️ Reuse, do not rebuild**: `RunnerService.runBatch` already accepts `tags` and the run view
already has a tag filter tab. This story is UI wiring; adding a second run path would duplicate a
working one (research.md Decision 5).

### Tests for User Story 2

- [X] T031 [P] [US2] Write failing tests in `apps/desktop/app/__tests__/tagsStore.test.ts` for the run handoff: running a tag sets `runnerStore.config.activeFilterTab = 'tags'` and `selectedTags = [tag]` and invokes the existing batch run, and a tag with `scenarioCount: 0` is refused without invoking it

### Implementation for User Story 2

- [X] T032 [US2] Implement the run handoff in `apps/desktop/app/stores/tags.ts`: set the runner config, switch `activeView` to `'runner'`, and call the existing `runnerStore.runBatch` — no new IPC channel (FR-013, FR-014, FR-015)
- [X] T033 [US2] Add a "Run this tag" action to `apps/desktop/app/components/TagBrowser.vue`, disabled with an explanation when the selected tag has zero scenarios (FR-016)
- [X] T034 [US2] Extend `apps/desktop/e2e/tag-management.spec.ts` with the run journey: start a run for a tag from the browser, confirm the runner view opens with that tag selected, and confirm a zero-count tag cannot be run

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Bulk add or remove a tag across many scenarios (Priority: P3)

**Goal**: Select multiple scenarios and add or remove a tag across all of them in one previewed,
confirmed operation.

**Independent Test**: Select several scenarios across two feature files, add a tag, confirm it
appears on exactly those scenarios on disk and nowhere else; remove it and confirm the files return
to their prior state.

**⚠️ This is the only story that writes to the user's files, and there is no undo.** Write the
splicer tests before the splicer, and never skip the post-write re-parse.

### Tests for User Story 3

- [X] T035 [P] [US3] Write failing tests in `packages/shared/src/__tests__/tagName.test.ts`: a leading `@` is optional on input and stripped in storage, valid names accept letters/digits/`_`/`-`/`.`/`:` including non-ASCII, and names containing whitespace, `#`, or an empty string are rejected
- [X] T036 [P] [US3] Write failing tests in `packages/shared/src/__tests__/tagSplice.test.ts` covering the full checklist in quickstart.md: add with no existing tag line (line inserted, indentation matches the scenario keyword, `lineDelta: +1`), add to an existing tag line (appended, existing tags untouched), add an already-present tag (`changed: false`), remove the only tag (line deleted, `lineDelta: -1`), remove one of several (order preserved), remove an absent tag (no change), **prefix safety — removing `@smoke` leaves `@smoke-test` intact**, CRLF preserved, tabs vs spaces preserved, a trailing `#` comment not swallowed, and every non-tag line byte-identical afterwards
- [X] T037 [P] [US3] Write failing tests in `apps/desktop/electron/__tests__/TagServiceBulk.test.ts` using `memfs`: add across scenarios in multiple files, remove across files, an inherited tag reports `skipped` with a reason, an already-satisfied target reports `unchanged` and the file is not rewritten, **multiple targets in one file apply correctly (bottom-up ordering)**, a file that fails to write reports `failed` while other files still apply, and the returned `index` already reflects the change
- [X] T038 [P] [US3] Write a failing test in `apps/desktop/electron/__tests__/TagServiceBulk.test.ts` asserting the corruption guarantee: after every bulk operation, each modified file is re-read and re-parsed successfully, and a deliberately broken splice result is reported as `failed` rather than silently written
- [X] T039 [P] [US3] Write failing tests in `apps/desktop/app/__tests__/tagsStore.test.ts` for the bulk flow: the preview counts `willChange`/`filesAffected`/`alreadySatisfied`/`blocked` from the held index, and an operation targeting a feature with unsaved editor changes requires explicit confirmation before dispatch

### Implementation for User Story 3

- [X] T040 [US3] Implement `normalizeTagName` and `isValidTagName` in `packages/shared/src/tags/tagName.ts` until T035 passes; create the barrel `packages/shared/src/tags/index.ts` and export from `packages/shared/src/index.ts`. Rebuild shared
- [X] T041 [US3] Implement the pure `spliceTag(request: SpliceRequest): SpliceResult` in `packages/shared/src/tags/tagSplice.ts` until T036 passes. **No filesystem access.** Token-level matching only — never substring — and preserve the original line ending
- [X] T042 [US3] Implement `TagService.applyBulk` in `apps/desktop/electron/services/TagService.ts`: group targets by file, classify each (`unchanged` / `skipped` for inherited), apply splices **sorted by `scenarioIndex` descending within each file** so shifting lines cannot invalidate later positions, and write each file once
- [X] T043 [US3] Add post-write verification to `TagService.applyBulk`: re-read and re-parse every modified file, and mark that file's targets `failed` if it no longer parses or the expected change is absent, until T038 passes (SC-009)
- [X] T044 [US3] Assemble `BulkTagResult` in `TagService.applyBulk` — per-target outcomes, derived counts, and the rebuilt index — updating the index directly from the service's own writes rather than waiting for a watcher event, until T037 passes (FR-024, FR-026)
- [X] T045 [US3] Add the `TAGS_APPLY_BULK` handler plus a `validateBulkTagRequest` boundary validator to `apps/desktop/electron/ipc/handlers.ts`: enforce the operation enum, the shared tag-name rule (rejecting **before** any write), a non-empty target array, and that each `relativePath` is relative, ends in `.feature`, and matches an indexed usage (FR-022, traversal safety)
- [X] T046 [US3] Add the `applyBulk` binding to `apps/desktop/electron/preload.ts`, then run `pnpm --filter @suisui/shared build` and `pnpm typecheck`
- [X] T047 [US3] Implement the bulk flow in `apps/desktop/app/stores/tags.ts`: multi-select of scenarios, `BulkTagPreview` computed from the held index, dispatch, and outcome handling until T039's preview test passes
- [X] T048 [US3] Implement the unsaved-changes guard in `apps/desktop/app/stores/tags.ts`: if any target file matches `scenarioStore.currentFeaturePath` while `isDirty`, require explicit confirmation before dispatching, until T039's guard test passes (FR-025)
- [X] T049 [US3] Add scenario multi-select to `apps/desktop/app/components/TagBrowser.vue` (per-row selection plus select-all for the current tag), feeding `selectedScenarioIds` in the store
- [X] T050 [US3] Create `apps/desktop/app/components/BulkTagDialog.vue`: tag-name input with live validation using the shared rule, add/remove choice, the preview counts, an explicit confirm step, and a post-operation summary listing changed/skipped/failed with reasons (FR-019, FR-022, FR-024)
- [X] T051 [US3] Extend `apps/desktop/e2e/tag-management.spec.ts` with the bulk journey: select scenarios across two files, add a tag, confirm the preview counts, confirm the tag appears on exactly those scenarios and counts update with no manual refresh, then remove it and confirm the files return to their prior content

**Checkpoint**: All three user stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T052 [P] Run the SC-002 performance check with a generated 200-file / 2,000-scenario / 100-tag workspace; confirm the tag list appears within 2 seconds of opening the view and the UI stays responsive
- [X] T053 [P] Verify the SC-006 guarantee by hand: run a bulk add across 20+ scenarios in 3+ files in a git workspace, then `git diff` and confirm **only tag lines changed** — no reformatting, no comment loss, no step rewrites
- [X] T054 [P] Document the feature in `doc/SERVICES.md` (`TagService`, the splice-and-verify write path), `doc/IPC_TYPES.md` (`tags:*`), and `doc/FRONTEND.md` (`useTagsStore`, `TagBrowser.vue`, `BulkTagDialog.vue`)
- [X] T055 [P] Add a Tag Management section to `CLAUDE.md` noting the scenario-level-only bulk-edit scope, case-sensitivity, bottom-up splice ordering, and the no-undo/git-recovery stance
- [ ] T056 Verify accessibility of `apps/desktop/app/components/TagBrowser.vue` and `BulkTagDialog.vue`: the tag list and scenario list are navigable and labelled, selection state is conveyed to assistive tech, and the destructive-confirm step is announced
- [X] T057 Walk the full manual verification table in quickstart.md, then run `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`, and `pnpm build && pnpm test:e2e`
- [ ] T058 Update GitHub issue #87 with what shipped and what was deliberately excluded (rename/merge/delete-everywhere, feature-level bulk editing, tag expressions), referencing the extension points in data-model.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 gates everything — the sequencing dependency on PR #127
- **Foundational (Phase 2)**: Depends on Setup — **blocks all three user stories**
- **US1 (Phase 3)**: Depends on Foundational only
- **US2 (Phase 4)**: Depends on Foundational; in practice needs US1's tag selection UI to have something to run
- **US3 (Phase 5)**: Depends on Foundational; needs US1's scenario list to select from
- **Polish (Phase 6)**: Depends on the desired stories being complete

### Critical path within Foundational

```text
T001 → T002 → T003 ─┬─> T004 → T005 → T006   (parser positions)
                    ├─> T007 → T008 → T009 → T010   (index service)
                    └─> T011 → T012 (channels + api)
                                  │
                    T008, T012 ───┴──> T013 → T014 → T015   (handlers, preload, push)
                                                      │
                                              T016 → T017   (store + view shell)
```

### Within each user story

- Tests first, failing, before the implementation they gate
- Service semantics → store → component → page wiring → E2E
- **US3 specifically**: T035/T036 (tagName + splicer tests) MUST pass before T042 calls the splicer
  against real files. T043's verification is not optional — there is no undo.

### Parallel Opportunities

- **Phase 2**: T004 and T007 (different test files); T011/T012 can start alongside the service work
- **US1**: T018, T019, T020 in parallel; T029 (fixtures) alongside any implementation task
- **US3**: T035–T039 all in parallel (five different test files)
- **Polish**: T052, T053, T054, T055 in parallel

---

## Parallel Example: User Story 3

```bash
# Write all five failing test suites together:
Task: "tagName rules in packages/shared/src/__tests__/tagName.test.ts"
Task: "splicer edge cases in packages/shared/src/__tests__/tagSplice.test.ts"
Task: "bulk apply in apps/desktop/electron/__tests__/TagServiceBulk.test.ts"
Task: "corruption guarantee in apps/desktop/electron/__tests__/TagServiceBulk.test.ts"
Task: "bulk flow + dirty guard in apps/desktop/app/__tests__/tagsStore.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001–T003) — **do not skip T001**
2. Phase 2: Foundational (T004–T017) — blocks everything
3. Phase 3: User Story 1 (T018–T030)
4. **STOP and VALIDATE**: run the US1 independent test and the US1 rows of the quickstart table
5. Shippable: workspace-wide tag visibility with correct counts and drill-down

### Incremental Delivery

1. Setup + Foundational → index builds, stays fresh, readable over IPC
2. - US1 → **MVP**: browse tags with counts, drill down, navigate
3. - US2 → run a tag (cheap: UI wiring over the existing batch run)
4. - US3 → bulk add/remove (the only write path; land it last)
5. - Polish → performance, docs, accessibility, issue #87 update

### Parallel Team Strategy

Foundational is 14 of 58 tasks and gates all three stories. With two developers, split it along the
process boundary: one takes the parser extension and index service (T004–T010), the other takes IPC
and the renderer shell (T011–T017), synchronizing at T015.

After that, **US1 and US3 conflict** — both edit `TagService.ts`, `stores/tags.ts`, and
`TagBrowser.vue`, and US3's selection UI hangs off US1's scenario list. US2 is genuinely independent
once US1's tag selection exists and can be handed to a second developer.

---

## Notes

- **Rebuild `@suisui/shared`** after T002, T003, T005, T011, T012, T040, T041
- **Apply splices bottom-up within each file** — top-down invalidates every position below the first
  insertion and silently tags the wrong scenarios. This is the most likely way to ship a corrupting bug
- **Never reuse `scenarioStore.toGherkin()`** for tag writes: it regenerates whole files, dropping
  comments and reformatting steps (violates FR-023)
- **Tags are case-sensitive** — do not lowercase for keying, sorting, or matching
- **Wire `WORKSPACE_GET`, not just `WORKSPACE_SET`** (T013) — feature 009 shipped that bug
- Commit after each task or logical group; every commit must pass `pnpm lint:fix`, `pnpm typecheck`,
  `pnpm test`
