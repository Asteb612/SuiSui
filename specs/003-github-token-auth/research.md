# Research: GitHub Token-Only Authentication

## Decision 1: Per-Workspace Credential Storage Strategy

**Decision**: Store encrypted token in `<workspace_path>/.app/credentials.enc`, following the existing workspace metadata pattern.

**Rationale**: The codebase already stores per-workspace data in `.app/workspace.json`. Credentials follow the same pattern but use Electron's `safeStorage` encryption. This provides natural workspace isolation without needing a global index or keying mechanism.

**Alternatives considered**:

- **Global file keyed by workspace path**: Would create a single large encrypted blob; harder to clean up when workspaces are removed.
- **Token field inside workspace.json**: Rejected because workspace.json is plain JSON (not encrypted), and tokens are sensitive.
- **Keep global single file**: Rejected per spec — user needs per-workspace tokens.

## Decision 2: GitCredentialsService Refactoring

**Decision**: Modify `GitCredentialsService` to accept a `workspacePath` parameter on all methods. Remove the global `git-credentials.enc` file approach. The service writes to `<workspacePath>/.app/credentials.enc`.

**Rationale**: Minimal change to the existing service. The encryption/decryption logic stays the same; only the file path changes from a fixed global path to a workspace-relative path.

**Alternatives considered**:

- **Create new WorkspaceCredentialsService**: More code, two services doing similar things. Violates YAGNI (Constitution Principle VI).
- **Store in SettingsService**: Settings are unencrypted; tokens must be encrypted.

## Decision 3: IPC Signature Changes

**Decision**: Update `GIT_CRED_SAVE` and `GIT_CRED_GET` and `GIT_CRED_DELETE` IPC handlers to require a `workspacePath` parameter. Update the shared API interface accordingly.

**Rationale**: The renderer needs to specify which workspace's credentials to load/save. The current workspace path is available in the frontend stores.

**Alternatives considered**:

- **Auto-detect from current workspace in main process**: Would require the credential service to depend on WorkspaceService, introducing coupling. The renderer already knows the path.

## Decision 4: GitHub PAT Format Validation

**Decision**: Validate against `ghp_` (classic PAT, 40 chars after prefix) and `github_pat_` (fine-grained PAT, variable length) prefixes. Validation is a pure function in `@suisui/shared` so it can be used in both processes.

**Rationale**: These are the only two PAT formats GitHub issues. Classic PATs always start with `ghp_` followed by 36 alphanumeric characters. Fine-grained PATs start with `github_pat_` followed by a variable-length base62 string.

**Alternatives considered**:

- **Backend-only validation**: Would allow invalid tokens to reach the network. Frontend validation gives instant feedback.
- **Regex-only without prefix check**: Too permissive; wouldn't catch the password-vs-token mistake.

## Decision 5: Migration from Old Credentials

**Decision**: No migration. Old global `git-credentials.enc` file is ignored. Old workspace credentials with `{ username, password }` format are treated as absent (no `token` field). Users re-enter their token once.

**Rationale**: The old format stored passwords, which don't work with GitHub anyway. No value in migrating broken credentials. The old global file can be left in place (harmless) or cleaned up in a future release.
