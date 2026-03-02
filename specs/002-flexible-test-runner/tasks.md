# Tasks: Flexible Test Runner (UI Refactor)

**Input**: Design documents from `/specs/002-flexible-test-runner/`
**Prerequisites**: plan.md (refactored), spec.md (updated), research.md (updated), data-model.md (updated), quickstart.md (updated), contracts/ipc-contracts.md (unchanged)

**Tests**: Backend tests already pass (22 tests in RunnerService.test.ts). Frontend unit tests for store refactor included since filter logic is critical.

**Organization**: Tasks are grouped by user story. This is a UI refactoring — the backend (RunnerService, IPC, preload) is complete and unchanged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Shared types**: `packages/shared/src/types/`, `packages/shared/src/ipc/`
- **Frontend stores**: `apps/desktop/app/stores/`
- **Frontend components**: `apps/desktop/app/components/`
- **Frontend pages**: `apps/desktop/app/pages/`

## Phase 1: Setup (Shared Type Update)

**Purpose**: Add `activeFilterTab` to `RunConfiguration` so both processes can consume the new field.

- [x] T001 Add `activeFilterTab: 'features' | 'folders' | 'tags'` field to the `RunConfiguration` interface in `packages/shared/src/types/runner.ts`
- [x] T002 Update `DEFAULT_RUN_CONFIGURATION` in `packages/shared/src/types/settings.ts` to include `activeFilterTab: 'features'` as the default value
- [x] T003 Rebuild shared package with `pnpm --filter @suisui/shared build` and verify no type errors with `pnpm typecheck`

---

## Phase 2: Foundational (Store Refactor + Page Layout)

**Purpose**: Refactor the runner store for exclusive tab filtering and restructure the page layout to support a dedicated run view. MUST complete before any user story UI work.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Refactor `matchedTests` getter in `apps/desktop/app/stores/runner.ts` — replace the cumulative AND filter pipeline with exclusive tab model: only apply the filter for the active tab (features if `activeFilterTab === 'features'`, folders if `'folders'`, tags if `'tags'`), always apply `nameFilter` as AND with the active tab. Keep all three selection arrays populated but only use the active one.
- [x] T005 [P] Add `hasEnteredRunView: boolean` (session-scoped, not persisted, default `false`) and `showResults: boolean` (default `false`) state fields to `apps/desktop/app/stores/runner.ts` — `showResults` is set to `true` when `runBatch()` starts and `false` when user navigates back to filters
- [x] T006 [P] Add unit tests for the refactored `matchedTests` getter in `apps/desktop/app/__tests__/runner-store-filters.test.ts` — test exclusive tab filtering: features-tab-only, folders-tab-only, tags-tab-only, name-filter-AND-with-active-tab, tab-switch-does-not-combine-filters, empty-selection-means-all
- [x] T007 Refactor `apps/desktop/app/pages/index.vue` — add `activeView: 'editor' | 'runner'` ref (default `'editor'`), remove `'run'` from the view mode toggle (keep only `'read'` and `'edit'`), add a dedicated "Run" button in the sidebar area (below the feature tree) with a play icon, clicking the Run button sets `activeView = 'runner'` and calls `runnerStore.loadWorkspaceTests()`, clicking a feature in the tree or the back arrow sets `activeView = 'editor'`
- [x] T008 Update layout CSS in `apps/desktop/app/pages/index.vue` — when `activeView === 'runner'`: hide the sidebar feature tree panel, hide the mode toggle (read/edit), render RunConfigPanel + RunResultsPanel as the full main content area; when `activeView === 'editor'`: show existing read/edit behavior unchanged

**Checkpoint**: Run view is accessible via sidebar button. Store uses exclusive tab filter. Page layout switches between editor and runner views.

---

## Phase 3: User Story 1 — Run All Tests at Once (Priority: P1) MVP

**Goal**: Users can access the dedicated run view, see a top toolbar with run controls, execute all tests, and see results that replace the filter area.

**Independent Test**: Click the sidebar Run button, see the toolbar with Run Headless/Run UI buttons, click Run Headless, verify results display replaces the filter area with summary + expandable features.

### Implementation for User Story 1

- [x] T009 [US1] Rewrite the top section of `apps/desktop/app/components/RunConfigPanel.vue` as a fixed toolbar: base URL input, execution mode toggle (Sequential | Parallel), matched test count display (`X scenarios across Y features will run`), and Run Headless / Run UI / Stop buttons — all in a single horizontal bar above the filter tabs
- [x] T010 [P] [US1] Update `apps/desktop/app/components/RunResultsPanel.vue` — add a "Back to Filters" button that calls `runnerStore.showResults = false`, keep existing summary bar + expandable feature list + scenario details + logs section unchanged, ensure the panel fills full remaining height below the toolbar
- [x] T011 [US1] Wire the view toggle in `apps/desktop/app/components/RunConfigPanel.vue` — when `runnerStore.showResults` is true, hide the filter tabs area and render RunResultsPanel in its place; when false, show the filter tabs; set `runnerStore.showResults = true` when `runBatch()` is called from the toolbar buttons

**Checkpoint**: Users can enter run view, click run, and see results. MVP is functional.

---

## Phase 4: User Story 2 — Filter Tests by Feature File (Priority: P1)

**Goal**: Users can select specific feature files from a checkbox list in the Features tab.

**Independent Test**: In the Features tab, select 2 out of 5 features, verify matched count updates, run, confirm only those 2 execute.

### Implementation for User Story 2

- [x] T012 [US2] Implement the Features tab content in `apps/desktop/app/components/RunConfigPanel.vue` — checkbox list populated from `runnerStore.workspaceTests.features`, show feature name and scenario count per feature, select-all / deselect-all toggle button, bind selections to `runnerStore.config.selectedFeatures`
- [x] T013 [US2] Implement first-entry auto-select logic in `apps/desktop/app/pages/index.vue` — when entering the run view for the first time (`!runnerStore.hasEnteredRunView`): if `scenarioStore.currentFeaturePath` is set, set `runnerStore.config.selectedFeatures` to `[currentFeaturePath]`; otherwise leave empty (all selected). Set `hasEnteredRunView = true`. On subsequent entries, preserve existing selection.

**Checkpoint**: Users can select specific features to run. First entry auto-selects the viewed feature.

---

## Phase 5: User Story 7 — Choose Parallel or Sequential Execution (Priority: P2)

**Goal**: Users can toggle between parallel and sequential execution modes from the toolbar.

**Independent Test**: Toggle to parallel mode, run tests, verify `--workers` flag is omitted. Toggle to sequential, verify `--workers=1`.

### Implementation for User Story 7

- [x] T014 [US7] Ensure the execution mode toggle in the toolbar (from T009) binds to `runnerStore.config.executionMode` and updates reactively — verify the SelectButton component uses `'sequential'` and `'parallel'` values, and that `runBatch()` passes the correct executionMode to `BatchRunOptions`

**Checkpoint**: Execution mode toggle works in the toolbar. Sequential uses --workers=1, parallel uses default.

---

## Phase 6: User Story 3 — Filter Tests by Folder (Priority: P2)

**Goal**: Users can select folders from a hierarchical tree in the Folders tab, with parent cascade.

**Independent Test**: In Folders tab, select a parent folder, verify all child folders are checked. Uncheck one child, verify parent shows partial state. Run, confirm only features in selected folders execute.

### Implementation for User Story 3

- [x] T015 [US3] Create a `buildFolderTree` utility function in `apps/desktop/app/utils/folderTree.ts` — takes `WorkspaceTestInfo.folders` (flat string array like `['features', 'features/auth', 'features/auth/login', 'features/checkout']`) and returns a PrimeVue TreeNode array with hierarchical parent-child structure, each node keyed by its folder path
- [x] T016 [P] [US3] Add unit tests for `buildFolderTree` in `apps/desktop/app/__tests__/folderTree.test.ts` — test: single root folder, nested folders, multiple root folders, empty input, single deep path
- [x] T017 [US3] Implement the Folders tab content in `apps/desktop/app/components/RunConfigPanel.vue` — use PrimeVue `Tree` component with `selectionMode="checkbox"`, populate nodes from `buildFolderTree(runnerStore.workspaceTests.folders)`, bind selected keys to `runnerStore.config.selectedFolders`, handle cascade (parent selects all children) and partial state (unchecking a child updates parent)

**Checkpoint**: Users can filter by folder hierarchy with cascade selection. Parent selection includes all subfolders.

---

## Phase 7: User Story 4 — Filter Tests by Tags (Priority: P2)

**Goal**: Users can filter scenarios by Gherkin tags in the Tags tab.

**Independent Test**: In Tags tab, select `@smoke`, verify matched count shows only tagged scenarios. Select `@smoke` and `@auth`, verify OR logic.

### Implementation for User Story 4

- [x] T018 [US4] Implement the Tags tab content in `apps/desktop/app/components/RunConfigPanel.vue` — display tag toggle buttons (pill-style) populated from `runnerStore.workspaceTests.allTags`, each button toggles its tag in `runnerStore.config.selectedTags`, selected tags are highlighted (primary color), unselected are outlined/secondary

**Checkpoint**: Users can filter by tags with OR logic within the Tags tab.

---

## Phase 8: User Story 5 — Filter Tests by Scenario Name (Priority: P3)

**Goal**: Users can search scenarios by name using a persistent text input that applies across all tabs.

**Independent Test**: Type "login" in name filter, verify matched count updates across any active tab, clear filter, verify all scenarios return.

### Implementation for User Story 5

- [x] T019 [US5] Add the name filter input in `apps/desktop/app/components/RunConfigPanel.vue` — positioned below or beside the tab bar (always visible regardless of active tab), debounced at 300ms, bound to `runnerStore.config.nameFilter`, with a clear (X) button, placeholder text "Filter by scenario name..."

**Checkpoint**: Name filter narrows scenarios across whichever tab is active. AND logic with active tab filter.

---

## Phase 9: User Story 6 — Exclusive Filter Tabs with Name Search (Priority: P3)

**Goal**: The three structural filter tabs (Features, Folders, Tags) are exclusive — only the active tab's filter applies. Each tab remembers its selection independently.

**Independent Test**: Select 2 features in Features tab, switch to Tags tab, verify only tag filter applies (not features). Switch back to Features, verify 2 features still selected.

### Implementation for User Story 6

- [x] T020 [US6] Implement the tab bar UI in `apps/desktop/app/components/RunConfigPanel.vue` — three tab buttons (Features, Folders, Tags) bound to `runnerStore.config.activeFilterTab`, active tab is visually highlighted, switching tabs shows that tab's content without clearing other tabs' selections, use PrimeVue TabView or custom tab buttons
- [x] T021 [US6] Verify matched test count in toolbar updates correctly when switching tabs in `apps/desktop/app/components/RunConfigPanel.vue` — the count should reflect only the active tab's filter + name filter, not a combination of all tabs

**Checkpoint**: Tab switching works correctly. Each tab remembers its selections. Only the active tab's filter affects the matched count and run execution.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Persistence, edge cases, and validation across all user stories.

- [x] T022 Ensure `activeFilterTab` is included in the debounced config persistence watcher in `apps/desktop/app/components/RunConfigPanel.vue` — verify that switching tabs triggers a persist so the active tab is restored on next app launch
- [x] T023 [P] Handle edge cases in `apps/desktop/app/components/RunConfigPanel.vue` — empty workspace shows guidance message, zero-match filters show informational message with suggestion to adjust filters, loading state with spinner while workspace tests are being fetched
- [x] T024 [P] Handle edge cases in `apps/desktop/app/pages/index.vue` — when workspace has no features, the run sidebar button should still be accessible but show empty state; when returning from runner to editor view, preserve editor mode and selected feature
- [x] T025 Run `pnpm test` to verify all existing tests pass, run `pnpm typecheck` for type safety, run `pnpm lint:fix` for lint compliance
- [x] T026 Run quickstart.md validation — verify each implementation layer (shared types, store refactor, page layout, toolbar, exclusive tabs, folder tree, results toggle) against quickstart.md requirements

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — BLOCKS all user stories
- **User Stories (Phase 3–9)**: All depend on Foundational (Phase 2) completion
  - US1 (Phase 3) MUST complete first — creates toolbar and results toggle that all other stories depend on
  - US2 (Phase 4) depends on US1 — adds Features tab content and auto-select
  - US7 (Phase 5) depends on US1 — verifies execution mode toggle in toolbar
  - US3 (Phase 6), US4 (Phase 7), US5 (Phase 8) can proceed in parallel after US1
  - US6 (Phase 9) depends on US2, US3, US4, US5 — adds tab bar and verifies exclusive switching
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — creates toolbar and results toggle
- **US2 (P1)**: Depends on US1 — adds Features tab content, first-entry auto-select
- **US7 (P2)**: Depends on US1 — wires execution mode toggle in toolbar
- **US3 (P2)**: Depends on US1 — adds Folders tab with tree component
- **US4 (P2)**: Depends on US1 — adds Tags tab content
- **US5 (P3)**: Depends on US1 — adds name filter input
- **US6 (P3)**: Depends on US2 + US3 + US4 + US5 — implements tab bar and verifies exclusive switching

### Within Each User Story

- Store changes before component UI
- Utility functions before components that use them
- Tab content before tab switching behavior

### Parallel Opportunities

- Phase 1: T001, T002 can run in parallel (different files)
- Phase 2: T005, T006 can run in parallel (different files), T007 and T008 are sequential (same file)
- Phase 3: T009 and T010 can run in parallel (different components)
- After US1 completes: US7, US3, US4, US5 can all proceed in parallel (each adds different tab/control)

---

## Parallel Example: After US1 Completes

```bash
# These story phases can run in parallel (different tabs/controls):
Phase 5 (US7): "Verify execution mode toggle in toolbar"
Phase 6 (US3): "Folders tab with tree component"
Phase 7 (US4): "Tags tab with toggle buttons"
Phase 8 (US5): "Name filter input"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared type update, ~5 min)
2. Complete Phase 2: Foundational (store refactor + page layout)
3. Complete Phase 3: US1 — Toolbar + run + results
4. **STOP and VALIDATE**: Enter run view via sidebar, run all tests, verify results display
5. Feature is usable — users can run all tests from the dedicated view

### Incremental Delivery

1. Setup + Foundational → Dedicated run view accessible, store uses exclusive tabs
2. US1 → Toolbar + run + results → **MVP!**
3. US2 → Features tab with checkboxes + auto-select → Feature filtering
4. US7 → Execution mode toggle verified → Speed control
5. US3 + US4 + US5 (parallel) → Folders tree + Tags + Name filter → Full filtering
6. US6 → Tab switching verification → Complete exclusive tab UX
7. Polish → Persistence + edge cases → Production-ready

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Backend is UNCHANGED — all 22 RunnerService tests remain passing
- No new IPC channels needed — only `RunConfiguration` type gets `activeFilterTab`
- PrimeVue Tree component handles folder hierarchy and cascade checkboxes natively
- After shared package changes (Phase 1), rebuild with `pnpm --filter @suisui/shared build`
- Exclusive tab filtering simplifies the `matchedTests` getter (fewer branches than cumulative AND)
