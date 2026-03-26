# Tasks: GitHub Token-Only Authentication

**Input**: Design documents from `/specs/003-github-token-auth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks are included only for the new validation utility and updated credential service (existing test files that must be updated).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Update shared types, add validation utility, rebuild shared package

- [x] T001 Update `GitCredentials` interface to `{ token: string }` and remove `username`/`password` from `GitWorkspaceParams` in `packages/shared/src/types/gitWorkspace.ts`
- [x] T002 [P] Create `validateGitHubToken()` function and `TokenValidationResult` interface in `packages/shared/src/validation/gitToken.ts`
- [x] T003 [P] Create tests for `validateGitHubToken()` in `packages/shared/src/__tests__/validateGitHubToken.test.ts` covering: empty string (valid), `ghp_` prefix (valid), `github_pat_` prefix (valid), plain password (invalid), `gho_` prefix (invalid), whitespace-only (invalid)
- [x] T004 Export `validateGitHubToken` and `TokenValidationResult` from `packages/shared/src/index.ts`
- [x] T005 Rebuild shared package: `pnpm --filter @suisui/shared build`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update backend services and IPC layer — MUST be complete before any UI work

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Update `GitCredentialsService` to accept `workspacePath` parameter on `saveCredentials`, `getCredentials`, and `deleteCredentials` methods; store encrypted file at `<workspacePath>/.app/credentials.enc` instead of global `userData/git-credentials.enc` in `apps/desktop/electron/services/GitCredentialsService.ts`
- [x] T007 Simplify `buildAuth()` in `apps/desktop/electron/services/GitWorkspaceService.ts` to only handle token auth (remove username/password branch)
- [x] T008 [P] Update IPC handler signatures for `GIT_CRED_SAVE`, `GIT_CRED_GET`, `GIT_CRED_DELETE` to pass `workspacePath` as first argument in `apps/desktop/electron/ipc/handlers.ts`
- [x] T009 [P] Update `gitCredentials` API interface to include `workspacePath` parameter in `packages/shared/src/ipc/api.ts`
- [x] T010 [P] Update preload bridge to pass `workspacePath` for credential methods in `apps/desktop/electron/preload.ts`
- [x] T011 Update `GitCredentialsService` tests to use `{ token: 'ghp_testtoken123' }` format and per-workspace storage in `apps/desktop/electron/__tests__/GitCredentialsService.test.ts`
- [x] T012 Update `gitCredentials` Pinia store to pass `workspacePath` on all credential operations in `apps/desktop/app/stores/gitCredentials.ts`
- [x] T013 Rebuild shared package and verify typecheck passes: `pnpm --filter @suisui/shared build && pnpm typecheck`

**Checkpoint**: Backend and IPC layer fully updated. All credential operations are per-workspace and token-only.

---

## Phase 3: User Story 1 - Clone Private Repository with Token (Priority: P1) MVP

**Goal**: Users can clone private GitHub repos by entering a PAT in the clone dialog with format validation.

**Independent Test**: Enter a GitHub PAT in the clone dialog and verify the clone succeeds for a private repository. Enter an invalid token and verify the validation error appears.

### Implementation for User Story 1

- [x] T014 [US1] Replace username/password fields with single "GitHub Token" input field in `apps/desktop/app/components/GitClone.vue` — remove `username` and `password` refs, add `token` ref
- [x] T015 [US1] Add token format validation using `validateGitHubToken()` with inline error display in `apps/desktop/app/components/GitClone.vue` — trim whitespace, show error when non-empty and invalid, disable Clone button on invalid
- [x] T016 [US1] Update `startClone()` to pass `token` in `GitWorkspaceParams` instead of `username`/`password`, and save `{ token }` credentials after successful clone in `apps/desktop/app/components/GitClone.vue`

**Checkpoint**: Clone dialog works with token-only auth. Users can clone private repos with a valid PAT, see validation errors for invalid tokens, and clone public repos without a token.

---

## Phase 4: User Story 2 - Token Saved per Workspace (Priority: P2)

**Goal**: Tokens persist per workspace; pull and push use the saved token automatically. Different workspaces can have different tokens.

**Independent Test**: Clone with a token, then pull or push and verify no auth prompt appears. Switch workspaces and verify each workspace uses its own token.

### Implementation for User Story 2

- [x] T017 [US2] Verify `GitPanel.vue` pull flow uses stored per-workspace credentials from `gitCredentials` store — update `getCredentials()` and `pull()` in `apps/desktop/app/components/GitPanel.vue`
- [x] T018 [US2] Verify `GitPanel.vue` commitAndPush flow uses stored per-workspace credentials — update `commitAndPush()` in `apps/desktop/app/components/GitPanel.vue`
- [x] T019 [US2] Update credentials indicator UI in `GitPanel.vue` to show token status (has token / no token) instead of username display in `apps/desktop/app/components/GitPanel.vue`

**Checkpoint**: Pull and push operations use the per-workspace saved token. Switching workspaces loads the correct token.

---

## Phase 5: User Story 3 - Re-authenticate on Auth Failure (Priority: P2)

**Goal**: When a git operation fails with an auth error, the user is prompted with a token-only dialog to re-enter their PAT.

**Independent Test**: Delete saved credentials, trigger a pull on a private repo, verify the auth dialog appears with a single token field and format validation.

### Implementation for User Story 3

- [x] T020 [US3] Replace `authUsername`/`authPassword` refs with `authToken` ref in auth retry dialog in `apps/desktop/app/components/GitPanel.vue`
- [x] T021 [US3] Add token format validation to auth dialog using `validateGitHubToken()` with inline error and disabled submit button in `apps/desktop/app/components/GitPanel.vue`
- [x] T022 [US3] Update `submitAuthCredentials()` to construct `{ token }` credentials and save per-workspace on success in `apps/desktop/app/components/GitPanel.vue`

**Checkpoint**: Auth retry dialog shows single token field with validation. Re-authentication works with PATs.

---

## Phase 6: User Story 4 - Clone Public Repository Without Token (Priority: P3)

**Goal**: Public repos can be cloned with an empty token field — no auth required.

**Independent Test**: Clone a public repository URL with the token field empty.

### Implementation for User Story 4

- [x] T023 [US4] Verify that clone flow works with empty token field — no validation error shown, Clone button enabled, `buildAuth()` returns `undefined` when no token provided (no code changes expected — verify existing behavior)

**Checkpoint**: Public repo cloning works without any token.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T024 Run full test suite: `pnpm test`
- [x] T025 Run typecheck: `pnpm typecheck`
- [x] T026 Run linter: `pnpm lint:fix`
- [x] T027 Remove the earlier debug logging added to `buildAuth` and `mapHttpError` in `apps/desktop/electron/services/GitWorkspaceService.ts` (from the initial debugging session)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3): Independent, no story dependencies
  - US2 (Phase 4): Can start after Phase 2 (uses same GitPanel.vue as US3 so sequential is safer)
  - US3 (Phase 5): Depends on US2 (same file: GitPanel.vue)
  - US4 (Phase 6): Independent, verification only
- **Polish (Phase 7)**: Depends on all user stories being complete

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different files)
- **Phase 2**: T008, T009, T010 can run in parallel (different files); T006 and T007 are independent
- **Phase 3**: T014 and T015 modify the same file — must be sequential
- **Phase 4-5**: Both modify GitPanel.vue — must be sequential
- **Phase 6**: Independent verification — can run anytime after Phase 2

---

## Parallel Example: Phase 2

```bash
# After T006 and T007 complete, launch these in parallel:
Task: T008 "Update IPC handlers in apps/desktop/electron/ipc/handlers.ts"
Task: T009 "Update API interface in packages/shared/src/ipc/api.ts"
Task: T010 "Update preload bridge in apps/desktop/electron/preload.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared types + validation)
2. Complete Phase 2: Foundational (services + IPC)
3. Complete Phase 3: User Story 1 (clone dialog)
4. **STOP and VALIDATE**: Test clone with PAT on a private repo
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. Add User Story 1 → Clone works with tokens → MVP
3. Add User Story 2 → Pull/push uses saved tokens
4. Add User Story 3 → Re-auth on failure works
5. Add User Story 4 → Verify public repos still work
6. Polish → Clean, tested, ready to merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 and US3 both modify GitPanel.vue — implement sequentially to avoid conflicts
- Commit after each phase completion
- Stop at any checkpoint to validate independently
