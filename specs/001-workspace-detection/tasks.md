# Tasks: Improve Workspace Detection & File Safety

**Input**: Design documents from `/specs/001-workspace-detection/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are the primary deliverable for this feature (user explicitly requested test improvements). All user story phases consist of test tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Foundational (Code Fix)

**Purpose**: Fix the script merge logic that blocks US1 acceptance — this is the only production code change in the entire feature.

- [x] T001 Fix `ensurePackageJsonScripts` to only add scripts whose names don't already exist in `apps/desktop/electron/services/WorkspaceService.ts`. Replace the spread-based merge `{ ...packageJson.scripts, ...expectedScripts }` with an explicit loop that skips keys already present in `packageJson.scripts` (see plan.md Design Decision D1). Update the `needsUpdate` check to only flag when a required script name is missing entirely.

**Checkpoint**: Code fix complete. Existing tests must still pass (`pnpm test -- WorkspaceService`).

---

## Phase 2: User Story 1 — Safe Workspace Activation (Priority: P1) 🎯 MVP

**Goal**: Verify that SuiSui never overwrites existing user files when activating or initializing a workspace.

**Independent Test**: Run `pnpm test -- WorkspaceService` — all new file preservation tests pass alongside existing tests.

### Tests for User Story 1

- [x] T002 [US1] Add test `should not overwrite existing scripts with same names during set()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with `package.json` containing `{ "test": "jest", "lint": "eslint ." }`. After `set()`, verify `test` script is still `"jest"` and SuiSui-only scripts like `bddgen` are added.

- [x] T003 [US1] Add test `should not overwrite existing scripts with same names during init()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with existing `package.json` that has `{ "test": "jest" }`. After `init()`, verify `test` script unchanged and missing scripts added.

- [x] T004 [US1] Add test `should not overwrite existing cucumber.json during init()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with existing `cucumber.json` containing custom config. After `init()`, verify `cucumber.json` content is byte-identical to the original.

- [x] T005 [US1] Add test `should not overwrite existing .gitignore during git initialization` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with existing `.gitignore` containing custom entries. After `set()`, verify `.gitignore` content is unchanged.

- [x] T006 [US1] Add test `should skip git init when .git exists as a file (submodule)` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with `.git` as a file (e.g., `gitdir: ../.git/modules/sub`). After `set()`, verify `.git` file is still a file (not replaced with a directory) and content is unchanged.

**Checkpoint**: All file safety guarantees verified for both `set()` and `init()` flows. US1 acceptance scenarios 1-5 covered.

---

## Phase 3: User Story 2 — Flexible Workspace Detection (Priority: P2)

**Goal**: Verify that workspace detection handles all edge cases gracefully — malformed configs, unusual paths, depth limits.

**Independent Test**: Run `pnpm test -- WorkspaceService` — all new detection edge case tests pass.

### Tests for User Story 2

- [x] T007 [US2] Add test `should handle empty playwright.config.ts gracefully during set()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with empty `playwright.config.ts` file. Verify `set()` succeeds and treats the empty config as custom (does not overwrite). Also add test for `playwright.config.ts` with syntax-error content (e.g., `export defaul {}`).

- [x] T008 [US2] Add test `should handle invalid JSON in cucumber.json during init()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with `cucumber.json` containing `"not valid json"`. Verify `init()` does not crash and falls back to default features directory.

- [x] T009 [US2] Add test `should handle config path pointing to non-existent directory` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: `cucumber.json` with `paths: ['nonexistent/**/*.feature']`. Verify `validate()` returns error for missing directory but does not crash.

- [x] T010 [US2] Add test `should not discover step files beyond depth 4` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: step files at depths 1-5 (e.g., `a/b/c/d/e/deep.steps.ts`). Verify `detectStepPaths()` includes files at depth 4 but excludes depth 5.

- [x] T011 [US2] Add tests `should handle workspace paths with spaces in set() and init()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace at path `/test/my workspace/project`. Verify both `set()` and `init()` succeed, and generated config files contain correct paths.

- [x] T012 [US2] Add test `should handle multiple config files during init()` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with both `playwright.config.js` and `cucumber.json`. Verify `init()` does not create `playwright.config.ts` and respects the existing `.js` config.

**Checkpoint**: All detection edge cases from spec covered. US2 acceptance scenarios and all 7 spec edge cases verified.

---

## Phase 4: User Story 3 — Git Service Test Coverage (Priority: P2)

**Goal**: Expand GitWorkspaceService test suite to cover all operations — clone, pull, status, commit — with proper mocks.

**Independent Test**: Run `pnpm test -- GitWorkspaceService` — all new git operation tests pass with mocked isomorphic-git.

**Note**: Phase 3 and Phase 4 can run **in parallel** — they modify different files (`WorkspaceService.test.ts` vs `GitWorkspaceService.test.ts`).

### Tests for User Story 3

- [x] T013 [US3] Add `describe('cloneOrOpen')` tests in `apps/desktop/electron/__tests__/GitWorkspaceService.test.ts`: (a) clone new repo — mock `fsPromises.access` to reject (no .git), `git.clone` to resolve, `git.resolveRef` to return OID; verify `clone` called with correct params and metadata written. (b) open existing repo — mock `.git` access to succeed, `git.listRemotes` to return origin; verify no `clone` call, `checkout` called. (c) update remote URL — mock `listRemotes` with different URL; verify `deleteRemote` + `addRemote` called.

- [x] T014 [US3] Add `describe('cloneOrOpen — error handling')` tests in `apps/desktop/electron/__tests__/GitWorkspaceService.test.ts`: (a) auth error (401/403) — mock `git.clone` to reject with "401"; verify `GitAuthError` thrown. (b) SSH URL error — mock `git.clone` to reject with 'transport protocol' + 'ssh'; verify `GitAuthError` with SSH message. (c) 404 error — mock `git.clone` to reject with "404"; verify `WorkspaceNotFoundError` thrown.

- [x] T015 [US3] Add `describe('pull')` tests in `apps/desktop/electron/__tests__/GitWorkspaceService.test.ts`: (a) fast-forward — mock `fetch`, `resolveRef` with different before/remote OIDs, `isDescendent` true; verify `writeRef` + `checkout` called, `updatedFiles` populated via `walk` mock. (b) no-op same OID — mock before and remote OIDs equal; verify no `writeRef` call, empty `updatedFiles`. (c) no remote — mock `listRemotes` empty; verify returns early with empty result. (d) diverged — mock `isDescendent` false; verify `MergeConflictError` thrown.

- [x] T016 [US3] Add `describe('getStatus — all status types')` tests in `apps/desktop/electron/__tests__/GitWorkspaceService.test.ts`: Mock `statusMatrix` with entries for all status codes: `[0,2,0]` untracked, `[1,2,1]` modified, `[1,0,0]` deleted, `[0,2,2]` added, `[1,2,2]` modified (staged), `[1,2,3]` modified (both), `[0,2,3]` added (both). Verify correct `status` mapping for each. Also verify `filteredStatus` only includes files matching `DEFAULT_FILTER_GLOBS` (features/, steps/, playwright/) and `counts` are correct.

- [x] T017 [US3] Add `describe('commitAndPush — extended')` tests in `apps/desktop/electron/__tests__/GitWorkspaceService.test.ts`: (a) with push — mock `listRemotes` with origin, `git.push` resolves; verify `pushed: true`. (b) specific paths — pass `paths: ['features/login.feature']`; verify `git.add` called with specific filepath (not `.`). (c) custom author/message — pass custom values; verify `git.commit` called with matching `author` and `message`. (d) push auth error — mock `git.push` to reject with "403"; verify `GitAuthError` thrown.

**Checkpoint**: GitWorkspaceService test suite covers all public methods with multiple scenarios each. US3 acceptance scenarios 1-4 met.

---

## Phase 5: User Story 4 — Graceful Partial Setup (Priority: P3)

**Goal**: Verify that init() fills in only missing files and handles failure gracefully.

**Independent Test**: Run `pnpm test -- WorkspaceService` — partial setup tests pass.

### Tests for User Story 4

- [x] T018 [US4] Add test `should create only missing files during init (package.json exists, cucumber.json missing)` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Setup: workspace with `package.json` and `features/` but no `cucumber.json`. After `init()`, verify: `cucumber.json` created, `package.json` unchanged (no new scripts overwritten), `features/` untouched.

- [x] T019 [US4] Add test `should not persist workspace to settings when init encounters an error` in `apps/desktop/electron/__tests__/WorkspaceService.test.ts`. Mock `fs.writeFile` to throw for a specific file during init. Verify `mockSave` and `mockAddRecentWorkspace` are NOT called when the error propagates.

**Checkpoint**: Partial setup behavior verified. US4 acceptance scenarios 1-4 covered (scenarios 1-3 partially by existing tests, gaps filled).

---

## Phase 6: Polish & Validation

**Purpose**: Final verification that all changes work together.

- [x] T020 Run full test suite with `pnpm test` and verify all tests pass (both new and existing) in `apps/desktop/` — 893 tests pass; 2 pre-existing failures in GitCredentialsService/workspaceHandlers (unrelated GithubAuthService missing module)
- [x] T021 Run `pnpm typecheck` and `pnpm lint:fix` to verify no type errors or lint issues across the monorepo — all pre-existing; zero issues in modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 (code fix must land before safety tests can pass)
- **Phase 3 (US2)**: Depends on Phase 1 (detection tests don't need the code fix, but should run after)
- **Phase 4 (US3)**: No dependency on Phase 1 (different file entirely — `GitWorkspaceService.test.ts`)
- **Phase 5 (US4)**: Depends on Phase 1 (init tests need the script fix)
- **Phase 6 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Depends on T001 code fix → then T002-T006 sequentially (same file)
- **US2 (P2)**: Depends on T001 → then T007-T012 sequentially (same file)
- **US3 (P2)**: **Independent** — can start immediately, no dependency on T001 (different file)
- **US4 (P3)**: Depends on T001 → then T018-T019 sequentially (same file)

### Parallel Opportunities

- **Phase 3 (US2) and Phase 4 (US3) can run fully in parallel** — they modify different test files:
  - US2: `WorkspaceService.test.ts`
  - US3: `GitWorkspaceService.test.ts`
- Phase 4 (US3) can also start in parallel with Phase 2 (US1) since it targets a different file
- Within each phase, tasks are sequential (same target file)

---

## Parallel Example: US2 + US3

```bash
# These can run simultaneously (different files):
# Agent A: WorkspaceService edge case tests (US2)
Task T007: "Add test for empty playwright.config.ts in WorkspaceService.test.ts"
Task T008: "Add test for invalid cucumber.json in WorkspaceService.test.ts"
# ...through T012

# Agent B: GitWorkspaceService tests (US3) — in parallel
Task T013: "Add cloneOrOpen tests in GitWorkspaceService.test.ts"
Task T014: "Add cloneOrOpen error handling tests in GitWorkspaceService.test.ts"
# ...through T017
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Fix `ensurePackageJsonScripts` (T001)
2. Complete Phase 2: US1 file safety tests (T002-T006)
3. **STOP and VALIDATE**: Run `pnpm test -- WorkspaceService` — all pass
4. The app now guarantees file safety for existing projects

### Incremental Delivery

1. T001 → Code fix landed
2. T002-T006 → US1 complete (file safety verified) → **MVP!**
3. T007-T012 + T013-T017 → US2 + US3 complete in parallel (detection + git coverage)
4. T018-T019 → US4 complete (partial setup verified)
5. T020-T021 → Full validation pass

---

## Notes

- All tasks modify existing files only — no new files created
- All tests use memfs (WorkspaceService) or mocked isomorphic-git (GitWorkspaceService) per Constitution Principle III
- T001 is the only production code change; all other tasks are test additions
- Each test task describes the setup, action, and expected assertions for clarity
- Commit after each phase checkpoint to maintain a clean git history
