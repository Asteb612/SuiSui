# Quickstart: GitHub Token-Only Authentication

## What This Feature Does

Replaces the broken username/password git authentication with GitHub Personal Access Token (PAT) authentication. Tokens are stored per-workspace so different repos can use different tokens.

## Key Files to Modify

| File                                                            | Change                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/shared/src/types/gitWorkspace.ts`                     | Update `GitCredentials` to `{ token }`, remove `username`/`password` from `GitWorkspaceParams` |
| `packages/shared/src/validation/gitToken.ts`                    | New: `validateGitHubToken()` utility                                                           |
| `packages/shared/src/index.ts`                                  | Export new validation utility                                                                  |
| `apps/desktop/electron/services/GitCredentialsService.ts`       | Change to per-workspace storage, accept `workspacePath` parameter                              |
| `apps/desktop/electron/services/GitWorkspaceService.ts`         | Simplify `buildAuth()` to token-only                                                           |
| `apps/desktop/electron/ipc/handlers.ts`                         | Update credential IPC handlers to pass `workspacePath`                                         |
| `apps/desktop/electron/preload.ts`                              | Update credential API signatures                                                               |
| `packages/shared/src/ipc/api.ts`                                | Update `gitCredentials` API signatures                                                         |
| `apps/desktop/app/components/GitClone.vue`                      | Replace username/password with token field + validation                                        |
| `apps/desktop/app/components/GitPanel.vue`                      | Replace auth dialog fields with token field + validation                                       |
| `apps/desktop/app/stores/gitCredentials.ts`                     | Update to pass workspace path, use `{ token }`                                                 |
| `apps/desktop/electron/__tests__/GitCredentialsService.test.ts` | Update for per-workspace + token format                                                        |
| `packages/shared/src/__tests__/validateGitHubToken.test.ts`     | New: validation tests                                                                          |

## Build & Test

```bash
# After modifying shared package
pnpm --filter @suisui/shared build

# Run unit tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint:fix
```

## Architecture Notes

- Tokens stored encrypted in `<workspace>/.app/credentials.enc` (Electron `safeStorage`)
- `buildAuth()` converts token to `{ username: 'x-access-token', password: token }` for isomorphic-git
- Validation is frontend-only, pure function in shared package
- Old global `~/.config/SuiSui/git-credentials.enc` is ignored (not migrated)
