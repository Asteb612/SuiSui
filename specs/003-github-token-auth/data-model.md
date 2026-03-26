# Data Model: GitHub Token-Only Authentication

## Entities

### GitCredentials (Modified)

Represents stored authentication credentials scoped to a SuiSui workspace.

| Field | Type   | Required | Description                        |
| ----- | ------ | -------- | ---------------------------------- |
| token | string | Yes      | GitHub Personal Access Token (PAT) |

**Previous shape** (being replaced): `{ username: string, password: string }`

**Storage**: Encrypted file at `<workspace_path>/.app/credentials.enc` using Electron `safeStorage`.

**Lifecycle**:

- Created when user provides a token during clone or re-authentication
- Read when performing pull, push, or commit operations
- Deleted when user explicitly clears credentials or workspace is removed
- Overwritten when user re-authenticates with a new token

### GitWorkspaceParams (Modified)

Parameters for clone operations.

| Field     | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| owner     | string | Yes      | Repository owner                       |
| repo      | string | Yes      | Repository name                        |
| repoUrl   | string | Yes      | HTTPS clone URL                        |
| branch    | string | Yes      | Branch to clone                        |
| localPath | string | Yes      | Local filesystem path                  |
| token     | string | No       | GitHub PAT (optional for public repos) |

**Removed fields**: `username`, `password`

### TokenValidationResult (New)

Result of GitHub PAT format validation.

| Field | Type    | Required | Description                       |
| ----- | ------- | -------- | --------------------------------- |
| valid | boolean | Yes      | Whether the token format is valid |
| error | string  | No       | Error message if invalid          |

**Validation rules**:

- Empty string → `{ valid: true }` (token is optional)
- Starts with `ghp_` → `{ valid: true }` (classic PAT)
- Starts with `github_pat_` → `{ valid: true }` (fine-grained PAT)
- Anything else → `{ valid: false, error: "..." }`

## Relationships

```
Workspace (1) ──has── (0..1) GitCredentials
  └── stored in: <workspace_path>/.app/credentials.enc

Clone Dialog ──produces── GitWorkspaceParams
  └── includes optional token

Token Input ──validated by── validateGitHubToken()
  └── returns TokenValidationResult
```

## Storage Layout

```
<workspace_path>/
  .app/
    workspace.json      # Existing: owner, repo, branch, remoteUrl, lastPulledOid
    credentials.enc     # New: encrypted { token: string }
    lock                # Existing: temporary lock file

~/.config/SuiSui/
    settings.json       # Unchanged: global app settings
    git-credentials.enc # Deprecated: old global credentials (ignored)
```
