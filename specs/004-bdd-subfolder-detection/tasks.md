# Tasks: BDD Subfolder Detection

**Input**: Design documents from `/specs/004-bdd-subfolder-detection/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Test tasks included only for the new detection logic (core business logic).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Update shared types, add IPC channel, rebuild shared package

- [x] T001 Add `gitRoot?: string` field to `WorkspaceInfo` interface and add `BddDetectionResult` interface in `packages/shared/src/types/workspace.ts`
- [x] T002 [P] Add `WORKSPACE_DETECT_BDD: 'workspace:detectBdd'` channel constant in `packages/shared/src/ipc/channels.ts`
- [x] T003 [P] Add `detectBdd: (clonePath: string) => Promise<BddDetectionResult>` to workspace API in `packages/shared/src/ipc/api.ts`
- [x] T004 Rebuild shared package: `pnpm --filter @suisui/shared build`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend detection logic and IPC wiring — MUST be complete before UI work

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement `detectBddWorkspace(clonePath: string): Promise<BddDetectionResult>` method in `apps/desktop/electron/services/WorkspaceService.ts` — scan first-level subdirectories for `features/` dir or `cucumber.json` file, skip hidden dirs and known non-project dirs (`node_modules`, `.git`, `dist`, `build`, `.app`, `coverage`, `out`, `tmp`, `temp`)
- [x] T006 Add unit tests for `detectBddWorkspace()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts` — test cases: BDD at root (empty result), BDD in single subfolder, BDD in multiple subfolders, no BDD anywhere, hidden dirs skipped, node_modules skipped
- [x] T007 [P] Add IPC handler for `WORKSPACE_DETECT_BDD` in `apps/desktop/electron/ipc/handlers.ts` — delegates to `workspaceService.detectBddWorkspace(clonePath)`
- [x] T008 [P] Expose `detectBdd` in preload bridge in `apps/desktop/electron/preload.ts`
- [x] T009 Rebuild shared package and verify typecheck: `pnpm --filter @suisui/shared build && pnpm typecheck`

**Checkpoint**: Backend detection works. IPC wired. Ready for UI integration.

---

## Phase 3: User Story 1 — Auto-detect BDD subfolder after clone (Priority: P1) MVP

**Goal**: After cloning, auto-detect BDD subfolder and set workspace to it. Single candidate is auto-selected.

**Independent Test**: Clone a repo where `features/` exists in `e2e/`. Verify workspace is set to `<clone-path>/e2e`.

### Implementation for User Story 1

- [x] T010 [US1] Update `handleGitCloned(localPath)` in `apps/desktop/app/pages/index.vue` — after clone, call `window.api.workspace.detectBdd(localPath)`. If one candidate found, call `setWorkspacePath(candidate)` with `gitRoot` set to `localPath`. If zero candidates, use `localPath` as workspace (current behavior).
- [x] T011 [US1] Add `setWorkspaceWithGitRoot(workspacePath: string, gitRoot: string)` action to workspace store in `apps/desktop/app/stores/workspace.ts` — sets workspace path and stores gitRoot on the workspace info
- [x] T012 [US1] Update `WorkspaceService.set()` to accept optional `gitRoot` parameter and include it in the returned `WorkspaceInfo` in `apps/desktop/electron/services/WorkspaceService.ts`
- [x] T013 [US1] Add `WORKSPACE_SET` IPC handler support for optional `gitRoot` second parameter in `apps/desktop/electron/ipc/handlers.ts`
- [x] T014 [US1] Update preload `workspace.set` to accept optional `gitRoot` parameter in `apps/desktop/electron/preload.ts`
- [x] T015 [US1] Update `workspace.set` signature in shared API to accept optional `gitRoot` in `packages/shared/src/ipc/api.ts`
- [x] T016 [US1] Rebuild shared package: `pnpm --filter @suisui/shared build`

**Checkpoint**: Cloning a repo with BDD in a subfolder auto-detects and sets workspace correctly. Single candidate path.

---

## Phase 4: User Story 2 — Store BDD workspace path separately from git root (Priority: P1)

**Goal**: Git operations use repo root, BDD operations use detected subfolder.

**Independent Test**: Clone repo with BDD in `e2e/`. Pull uses repo root. Feature listing uses `e2e/`.

### Implementation for User Story 2

- [x] T017 [US2] Add `gitRootPath` computed getter to workspace store in `apps/desktop/app/stores/workspace.ts` — returns `workspace.gitRoot ?? workspace.path`
- [x] T018 [US2] Update `GitPanel.vue` to use `gitRootPath` for all git operations (pull, commitAndPush, refreshStatus) in `apps/desktop/app/components/GitPanel.vue`
- [x] T019 [US2] Update `handleGitCloned` and any other git operation callers in `apps/desktop/app/pages/index.vue` to use `gitRootPath` for `refreshStatus` calls
- [x] T020 [US2] Persist `gitRoot` in SettingsService alongside `workspacePath` so it survives app restart — update `apps/desktop/electron/services/WorkspaceService.ts` set() to save gitRoot, and get() to restore it

**Checkpoint**: Git pull/push uses repo root. Features load from subfolder. App restart preserves both paths.

---

## Phase 5: User Story 3 — Multiple BDD subfolders found (Priority: P2)

**Goal**: When multiple BDD subfolders are found, show a selection dialog.

**Independent Test**: Clone repo with `e2e/features/` and `tests/features/`. Verify selection dialog appears.

### Implementation for User Story 3

- [x] T021 [US3] Create `BddFolderSelect.vue` component in `apps/desktop/app/components/BddFolderSelect.vue` — PrimeVue Dialog with list of candidate paths, user selects one
- [x] T022 [US3] Update `handleGitCloned` in `apps/desktop/app/pages/index.vue` to show `BddFolderSelect` dialog when `candidates.length > 1`, pass selected path to `setWorkspaceWithGitRoot`

**Checkpoint**: Multiple BDD folders trigger selection dialog. User picks one, workspace is set correctly.

---

## Phase 6: User Story 4 — No BDD structure found anywhere (Priority: P3)

**Goal**: Fallback to repo root when no BDD structure found (current behavior preserved).

**Independent Test**: Clone repo with no `features/` or `cucumber.json` anywhere. Verify workspace defaults to repo root.

### Implementation for User Story 4

- [x] T023 [US4] Verify fallback behavior in `handleGitCloned` — when `candidates.length === 0`, set workspace to clone root without `gitRoot` (no code changes expected — verify existing logic from T010 handles this)

**Checkpoint**: No BDD structure → repo root as workspace, normal initialization flow.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T024 Run full test suite: `pnpm test`
- [x] T025 Run typecheck: `pnpm typecheck`
- [x] T026 Run linter: `pnpm lint:fix`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on US1 (needs gitRoot to be stored)
- **US3 (Phase 5)**: Depends on US1 (extends the detection flow)
- **US4 (Phase 6)**: Independent verification — can run after Phase 2
- **Polish (Phase 7)**: Depends on all user stories

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel
- **Phase 2**: T007 and T008 can run in parallel (after T005)
- **Phase 5**: T021 (new component) can start while T022 depends on it

---

## Parallel Example: Phase 2

```bash
# After T005 completes, launch in parallel:
Task: T007 "Add IPC handler in apps/desktop/electron/ipc/handlers.ts"
Task: T008 "Expose detectBdd in apps/desktop/electron/preload.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared types)
2. Complete Phase 2: Foundational (detection + IPC)
3. Complete Phase 3: User Story 1 (auto-detect single subfolder)
4. **STOP and VALIDATE**: Clone repo with BDD in subfolder, verify auto-detection
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Detection backend ready
2. Add US1 → Single subfolder auto-detected → MVP
3. Add US2 → Git/BDD path separation → Full path isolation
4. Add US3 → Multiple candidates dialog → Complete feature
5. Add US4 → Verify fallback → Regression safety
6. Polish → Clean, tested, ready to merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- US1 and US2 are both P1 priority but US2 depends on US1's gitRoot storage
- US3 and US4 are independent from each other
- Commit after each phase completion
