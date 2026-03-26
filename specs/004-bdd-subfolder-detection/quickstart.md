# Quickstart: BDD Subfolder Detection

## What This Feature Does

After cloning a git repo, automatically scans first-level subdirectories for BDD workspace indicators (`features/` or `cucumber.json`). Sets the SuiSui workspace to the detected subfolder while keeping git operations pointed at the repo root.

## Key Files to Modify

| File                                                       | Change                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/shared/src/types/workspace.ts`                   | Add `gitRoot?` to `WorkspaceInfo`, add `BddDetectionResult` type |
| `packages/shared/src/ipc/channels.ts`                      | Add `WORKSPACE_DETECT_BDD` channel                               |
| `packages/shared/src/ipc/api.ts`                           | Add `detectBdd` method to workspace API                          |
| `apps/desktop/electron/services/WorkspaceService.ts`       | Add `detectBddWorkspace()` method                                |
| `apps/desktop/electron/ipc/handlers.ts`                    | Add handler for `WORKSPACE_DETECT_BDD`                           |
| `apps/desktop/electron/preload.ts`                         | Expose `detectBdd` in preload bridge                             |
| `apps/desktop/app/stores/workspace.ts`                     | Add `gitRoot` tracking, add `gitRootPath` getter                 |
| `apps/desktop/app/pages/index.vue`                         | Update `handleGitCloned` to run detection and handle results     |
| `apps/desktop/app/components/GitPanel.vue`                 | Use `gitRoot` for git operations                                 |
| `apps/desktop/app/components/BddFolderSelect.vue`          | New: selection dialog for multiple candidates                    |
| `apps/desktop/electron/__tests__/WorkspaceService.test.ts` | Tests for `detectBddWorkspace()`                                 |

## Build & Test

```bash
pnpm --filter @suisui/shared build
pnpm test
pnpm typecheck
pnpm lint:fix
```

## Architecture Notes

- Detection runs in the main process (filesystem access), exposed via IPC
- Selection dialog is a frontend concern — backend returns candidates, frontend shows UI
- `gitRoot` is optional on `WorkspaceInfo` — when absent, all operations use `path`
- Git operations: `workspace.gitRoot ?? workspace.path`
- BDD operations: `workspace.path` (unchanged)
