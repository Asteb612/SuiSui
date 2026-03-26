# Feature Specification: GitHub Token-Only Authentication

**Feature Branch**: `003-github-token-auth`
**Created**: 2026-03-26
**Status**: Draft
**Input**: Replace username/password git authentication with GitHub Personal Access Token (PAT) only. GitHub deprecated password auth for HTTPS git operations in August 2021.

## Clarifications

### Session 2026-03-26

- Q: Credential scope — one token per app, or per repository, or per workspace? → A: One token per SuiSui workspace — each workspace remembers its own token.
- Q: Should the spec address the distinction between git clone target and SuiSui workspace path? → A: Document as assumption only — auth feature is not affected, workspace selection is separate.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Clone Private Repository with Token (Priority: P1)

A user wants to clone a private GitHub repository into SuiSui. They open the clone dialog, enter the repository URL and their GitHub Personal Access Token. The system validates the token format before attempting the clone, preventing wasted time on requests that will fail.

**Why this priority**: This is the core use case that is currently broken - users cannot clone private repos because the app only accepts passwords, which GitHub no longer supports.

**Independent Test**: Can be fully tested by entering a GitHub PAT in the clone dialog and verifying the clone succeeds for a private repository.

**Acceptance Scenarios**:

1. **Given** the clone dialog is open, **When** the user enters a valid GitHub PAT (starting with `ghp_` or `github_pat_`), **Then** the token is accepted and the clone proceeds using the token for authentication.
2. **Given** the clone dialog is open, **When** the user enters an invalid token (e.g., a plain password), **Then** an inline validation error is shown explaining the expected format, and the Clone button is disabled.
3. **Given** the clone dialog is open, **When** the user leaves the token field empty, **Then** no validation error is shown and the Clone button remains enabled (public repos don't require auth).

---

### User Story 2 - Token Saved per Workspace for Pull and Push Operations (Priority: P2)

After a successful clone with a token, the token is saved securely and associated with the current SuiSui workspace so that subsequent pull and push operations use it automatically. Different workspaces can have different tokens (e.g., repos across different GitHub organizations).

**Why this priority**: Without persisted credentials, users would need to enter their token for every git operation, which is impractical.

**Independent Test**: Can be tested by cloning with a token, then performing a pull or push and verifying no auth prompt appears. Can also verify that switching workspaces uses the correct token for each.

**Acceptance Scenarios**:

1. **Given** a successful clone with a token, **When** the user performs a pull, **Then** the saved token for that workspace is used automatically for authentication.
2. **Given** a successful clone with a token, **When** the user performs a commit and push, **Then** the saved token for that workspace is used automatically for authentication.
3. **Given** saved credentials exist for workspace A, **When** the user switches to workspace B that has no saved token, **Then** workspace B prompts for a token independently.
4. **Given** saved credentials exist, **When** the user clicks the delete credentials button, **Then** the stored token for the current workspace is removed and the next git operation prompts for a token.

---

### User Story 3 - Re-authenticate on Auth Failure (Priority: P2)

When a git operation (pull or push) fails due to authentication, the user is prompted with a dialog to enter their GitHub token. The dialog validates the token format before retrying the operation.

**Why this priority**: Tokens expire or get revoked. Users need a way to re-authenticate without restarting the app or re-cloning.

**Independent Test**: Can be tested by deleting saved credentials, triggering a pull on a private repo, and verifying the auth dialog appears with token validation.

**Acceptance Scenarios**:

1. **Given** a pull fails with an authentication error, **When** the auth dialog appears, **Then** it shows a single token field with format validation.
2. **Given** the auth dialog is open, **When** the user enters a valid token and submits, **Then** the operation is retried with the new token and the token is saved for the current workspace on success.
3. **Given** the auth dialog is open, **When** the user enters an invalid token format, **Then** an inline error is shown and the submit button is disabled.

---

### User Story 4 - Clone Public Repository Without Token (Priority: P3)

A user wants to clone a public GitHub repository. They should be able to do so without providing any token at all.

**Why this priority**: Public repos are a common use case and should work frictionlessly.

**Independent Test**: Can be tested by cloning a public repository URL with the token field left empty.

**Acceptance Scenarios**:

1. **Given** the clone dialog is open with a public repo URL, **When** the user leaves the token field empty and clicks Clone, **Then** the clone succeeds without authentication.

---

### Edge Cases

- What happens when a user has old stored credentials (username/password format from before this change)? The old format is silently discarded; the user sees the auth prompt on next operation.
- What happens when a user pastes a token with leading/trailing whitespace? The token should be trimmed before validation and use.
- What happens when a token is valid format but revoked/expired? The clone or operation fails with an "Authentication failed" error, and the user is prompted to re-enter.
- What happens when a user switches workspaces? Each workspace has its own stored token; switching workspaces loads the token associated with that workspace (or no token if none was saved).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST accept only GitHub Personal Access Tokens for git authentication (classic PATs starting with `ghp_` and fine-grained PATs starting with `github_pat_`).
- **FR-002**: System MUST validate token format on the frontend when a token is entered, displaying an inline error for invalid formats.
- **FR-003**: System MUST NOT require a token for cloning or operating on public repositories (token field is optional).
- **FR-004**: System MUST store tokens securely using platform encryption, scoped per SuiSui workspace. Each workspace maintains its own token independently.
- **FR-005**: System MUST trim whitespace from tokens before validation and use.
- **FR-006**: System MUST present a single "GitHub Token" input field instead of separate username and password fields in all authentication dialogs.
- **FR-007**: System MUST disable the action button (Clone/Submit) when a non-empty token fails format validation.
- **FR-008**: System MUST gracefully handle old stored credentials by treating them as absent (no token field), prompting the user to enter a new token.
- **FR-009**: System MUST load the correct token when switching between workspaces, using only the token associated with the active workspace.

### Key Entities

- **GitCredentials**: Represents a stored authentication credential scoped to a SuiSui workspace. Contains a single `token` field (the GitHub PAT).
- **Token Validation Result**: Represents the outcome of format validation. Contains `valid` (boolean) and optional `error` message.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can successfully clone a private GitHub repository using a Personal Access Token on the first attempt.
- **SC-002**: 100% of authentication dialogs show a single token field with no username or password fields.
- **SC-003**: Users who enter an invalid token format see a validation error before any network request is made.
- **SC-004**: Users with previously saved username/password credentials are seamlessly prompted to enter a token on their next git operation, with no errors or crashes.
- **SC-005**: Users working with multiple workspaces can use different tokens for each without interference.

### Assumptions

- Only GitHub repositories are supported. Tokens from other git hosts (GitLab, Bitbucket) are intentionally rejected by format validation.
- GitHub OAuth app tokens (`gho_` prefix) are not supported - only user-generated PATs.
- The existing encrypted storage mechanism is sufficient for token storage (adapted for per-workspace scoping).
- The git clone target path and the SuiSui workspace path may differ. The workspace path is where `features/` and `cucumber.json` reside, which may be a subdirectory of the git root. This distinction does not affect the auth feature — tokens are associated with the SuiSui workspace, and git operations use the token from the active workspace regardless of directory structure.
