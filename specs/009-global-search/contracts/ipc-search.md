# IPC Contract: `search:*`

**Feature**: 009-global-search | **Date**: 2026-07-28

Three channels. Two request/response (`ipcRenderer.invoke`), one main→renderer push. Follows the
five-touchpoint checklist in the constitution; omitting any step is a blocking defect.

---

## 1. `packages/shared/src/ipc/channels.ts`

```ts
// Search (feature 009)
SEARCH_QUERY: 'search:query',
SEARCH_GET_STATUS: 'search:getStatus',
SEARCH_INDEX_STATUS: 'search:indexStatus',   // main → renderer push
```

## 2. `packages/shared/src/ipc/api.ts`

```ts
search: {
  /**
   * Run a query against the workspace search index.
   * `requestId` is echoed back so the caller can discard stale responses.
   * An empty or whitespace-only query resolves to an empty result set without scanning.
   */
  query(requestId: number, text: string): Promise<SearchResponse>

  /** Current index state — used on mount to render the correct initial UI. */
  getStatus(): Promise<SearchIndexStatus>

  /** Subscribe to index-state pushes; returns an unsubscribe fn. Call it on unmounted. */
  onIndexStatus: (callback: (status: SearchIndexStatus) => void) => () => void
}
```

## 3. `apps/desktop/electron/ipc/handlers.ts`

```ts
ipcMain.handle(IPC_CHANNELS.SEARCH_QUERY, async (_e, requestId: number, text: string) => {
  return getSearchIndexService().search(requestId, text)
})

ipcMain.handle(IPC_CHANNELS.SEARCH_GET_STATUS, async () => {
  return getSearchIndexService().getStatus()
})
```

Additionally — **not a channel, but required wiring**: the existing workspace handlers
(`WORKSPACE_SET`, `WORKSPACE_SELECT`, `WORKSPACE_INIT`) must trigger
`getSearchIndexService().rebuild()` after the workspace path changes, and the service pushes
`SEARCH_INDEX_STATUS` to the focused window as its state advances. This is why no `search:rebuild`
channel exists — the renderer never needs to ask (Principle VI).

## 4. `apps/desktop/electron/preload.ts`

```ts
search: {
  query: (requestId: number, text: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_QUERY, requestId, text),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_GET_STATUS),
  onIndexStatus: (callback: (status: SearchIndexStatus) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: SearchIndexStatus) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.SEARCH_INDEX_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_INDEX_STATUS, listener)
  },
},
```

Matches the established `update.onStateChanged` / `recorder.onStatus` shape — an unsubscribe-returning
subscriber, so components can clean up in `onUnmounted` without leaking listeners across workspace
switches.

## 5. Shared package rebuild

```bash
pnpm --filter @suisui/shared build
```

Required before lint, typecheck, or tests on `apps/desktop`.

---

## Behavioral contract

| Condition                            | Guaranteed behavior                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No workspace open                    | `query` resolves with empty `results`, `totalMatches: 0`, `status.state: 'idle'`. It does not throw — the renderer disables the input (FR-031), but a race must not produce an unhandled rejection. |
| Index still building                 | `query` resolves with whatever is indexed so far and `status.state: 'building'`. The renderer shows progress rather than "no results" (FR-015).                                                     |
| Empty / whitespace-only `text`       | Empty result set, no scan performed.                                                                                                                                                                |
| `text` contains regex metacharacters | Treated as literal text (FR-010). No exception, no pattern semantics.                                                                                                                               |
| More than 100 matches                | `results` truncated to 100 after ranking; `totalMatches` reports the true count; `truncated: true` (FR-020).                                                                                        |
| A feature file cannot be parsed      | Excluded from scenario rows but still present as a feature row matchable by file name; listed in `status.unparsedFiles` (FR-028).                                                                   |
| Two `query` calls in flight          | Both resolve. Ordering is not guaranteed — the renderer discards any response whose `requestId` is below the latest (FR-029).                                                                       |
| Workspace changes mid-query          | The in-flight query resolves against the old index; the subsequent `SEARCH_INDEX_STATUS` push tells the renderer to clear stale results (edge case: workspace switched while results shown).        |

## Security notes

- `relativePath` in every `SearchResult` originates from the service's own directory scan, never from
  renderer input. Navigation re-enters the existing `features.read(relativePath)` path, which already
  validates against directory traversal (`FeatureService.validatePath`).
- The renderer supplies only `requestId` (number) and `text` (string). Both are validated at the
  handler boundary — the only place validation belongs (Principle VI).
- No filesystem paths outside the features directory are ever exposed to the renderer; `SearchResult`
  carries the relative path only, not the absolute one.
