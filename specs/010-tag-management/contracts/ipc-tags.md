# IPC Contract: `tags:*`

**Feature**: 010-tag-management | **Date**: 2026-07-28

Two request/response channels (`ipcRenderer.invoke`) and one main→renderer push. Follows the
five-touchpoint checklist in the constitution; omitting any step is a blocking defect.

**There is deliberately no `tags:runTag` channel** — running a tag reuses the existing
`runner.runBatch({ tags: [...] })`. See `plan.md` (post-Phase-1 re-check) and `research.md`
Decision 5.

---

## 1. `packages/shared/src/ipc/channels.ts`

```ts
// Tag management (feature 010)
TAGS_GET_INDEX: 'tags:getIndex',
TAGS_APPLY_BULK: 'tags:applyBulk',

// Tag management: main -> renderer push (webContents.send)
TAGS_INDEX_CHANGED: 'tags:indexChanged',
```

## 2. `packages/shared/src/ipc/api.ts`

```ts
tags: {
  /**
   * Current tag index. Includes per-tag usages, so the renderer never needs a
   * second round-trip to show the scenarios behind a count.
   */
  getIndex: () => Promise<TagIndex>

  /**
   * Apply a bulk add/remove. Returns a per-scenario outcome AND the rebuilt
   * index, so counts can never lag the change that produced them.
   */
  applyBulk: (request: BulkTagRequest) => Promise<BulkTagResult>

  /** Subscribe to index changes (file watcher); returns an unsubscribe fn. */
  onIndexChanged: (callback: (index: TagIndex) => void) => () => void
}
```

## 3. `apps/desktop/electron/ipc/handlers.ts`

```ts
ipcMain.handle(IPC_CHANNELS.TAGS_GET_INDEX, async () => getTagService().getIndex())

ipcMain.handle(IPC_CHANNELS.TAGS_APPLY_BULK, async (_e, request: unknown) => {
  return getTagService().applyBulk(validateBulkTagRequest(request))
})
```

`validateBulkTagRequest` is a boundary validator in the style of the existing
`validateUpdatePreferences` / recorder validators. It MUST enforce:

- `operation` is exactly `'add'` or `'remove'`
- `tag` is a string that passes the shared tag-name rule after stripping one optional `@`
  (FR-022) — rejected **before** any file is touched
- `targets` is a non-empty array of `{ relativePath: string, scenarioIndex: number }`
- each `relativePath` ends in `.feature`, is relative, and does not escape the features directory

Additionally, the workspace handlers (`WORKSPACE_GET` / `SET` / `SELECT` / `INIT`) must keep the tag
index in step with the workspace, the same way the search index is wired — including the
**restore-from-settings path (`WORKSPACE_GET`)**, which is easy to miss and produces an index that is
silently empty for the whole session.

## 4. `apps/desktop/electron/preload.ts`

```ts
tags: {
  getIndex: () => ipcRenderer.invoke(IPC_CHANNELS.TAGS_GET_INDEX),
  applyBulk: (request) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_APPLY_BULK, request),
  onIndexChanged: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, index: TagIndex) => callback(index)
    ipcRenderer.on(IPC_CHANNELS.TAGS_INDEX_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TAGS_INDEX_CHANGED, listener)
  },
},
```

## 5. Shared package rebuild

```bash
pnpm --filter @suisui/shared build
```

Required before lint, typecheck, or tests on `apps/desktop`.

---

## Behavioural contract

| Condition                                                 | Guaranteed behaviour                                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No workspace open                                         | `getIndex` resolves with `state: 'idle'` and empty collections. It does not throw — the renderer disables the view (FR-009), but a race must not produce an unhandled rejection. |
| Index still building                                      | `getIndex` resolves with `state: 'building'` and whatever is known so far; the renderer shows progress rather than "no tags".                                                    |
| Tag carried only by features with no scenarios            | Present in `tags` with `scenarioCount: 0` and `orphaned: true`.                                                                                                                  |
| `applyBulk` with an invalid tag name                      | Rejects at the handler. **No file is written.** (FR-022)                                                                                                                         |
| `applyBulk` target is inherited-only, operation `remove`  | That target reports `status: 'skipped'` with a reason; other targets still apply. (FR-021)                                                                                       |
| `applyBulk` target already satisfies the operation        | `status: 'unchanged'`; the file is not rewritten. (FR-020)                                                                                                                       |
| A file cannot be written, or fails to re-parse afterwards | Its targets report `status: 'failed'` with a reason; other files still apply. **No rollback.** (FR-024, SC-009)                                                                  |
| `applyBulk` succeeds                                      | The returned `index` already reflects the change; the renderer does not need to re-fetch. (FR-026)                                                                               |
| A watcher event arrives                                   | `tags:indexChanged` pushes the new index. Bulk edits update the index directly and do **not** depend on this.                                                                    |
| Workspace changes mid-operation                           | The operation completes against the paths it resolved; the subsequent index push reflects the new workspace.                                                                     |

## Security notes

- `relativePath` values sent by the renderer are **matched against indexed usages** before use; the
  service never joins a renderer-supplied path onto the workspace root without that check. This
  mirrors `FeatureService.validatePath` and closes the traversal vector that a write-capable channel
  would otherwise open.
- The workspace root always comes from `WorkspaceService`, never the renderer.
- `applyBulk` is the only write-capable channel in this feature; `getIndex` and the push channel are
  strictly read-only.
- Tag names are never interpolated into a shell command or a regular expression by this feature. (The
  runner builds a grep pattern from tags for tag runs — that path already escapes its input, and this
  feature adds no new construction of it.)
