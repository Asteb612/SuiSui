# IPC Contract Changes: GitHub Token Auth

## Modified: `gitCredentials` API

### Before

```typescript
gitCredentials: {
  save: (credentials: GitCredentials) => Promise<void>
  get: () => Promise<GitCredentials | null>
  delete: () => Promise<void>
}
```

### After

```typescript
gitCredentials: {
  save: (workspacePath: string, credentials: GitCredentials) => Promise<void>
  get: (workspacePath: string) => Promise<GitCredentials | null>
  delete: (workspacePath: string) => Promise<void>
}
```

All three methods now require `workspacePath` to scope credentials per workspace.

## Modified: `GitCredentials` Type

### Before

```typescript
export interface GitCredentials {
  username: string
  password: string
}
```

### After

```typescript
export interface GitCredentials {
  token: string
}
```

## Modified: `GitWorkspaceParams` Type

### Before

```typescript
export interface GitWorkspaceParams {
  owner: string
  repo: string
  repoUrl: string
  branch: string
  localPath: string
  token?: string
  username?: string
  password?: string
}
```

### After

```typescript
export interface GitWorkspaceParams {
  owner: string
  repo: string
  repoUrl: string
  branch: string
  localPath: string
  token?: string
}
```

## New: `validateGitHubToken` Export

```typescript
export interface TokenValidationResult {
  valid: boolean
  error?: string
}

export function validateGitHubToken(token: string): TokenValidationResult
```

## IPC Channel Names (Unchanged)

- `GIT_CRED_SAVE`: `'git:credSave'`
- `GIT_CRED_GET`: `'git:credGet'`
- `GIT_CRED_DELETE`: `'git:credDelete'`

Channel names stay the same; only the handler signatures change.
