# Contract: Step Catalog IPC

**Feature**: 006-step-catalog | **Phase**: 1
**Principle II** — every channel is declared in all five touchpoints and rebuilt.

## Channels (add to `packages/shared/src/ipc/channels.ts`)

```ts
// Step Catalog
STEP_CATALOG_GENERATE: 'catalog:generate',
STEP_CATALOG_GET_CACHED: 'catalog:getCached',
STEP_CATALOG_CLEAR_CACHE: 'catalog:clearCache',
STEP_CATALOG_GET_STEP: 'catalog:getStep',
```

## API signatures (add to `packages/shared/src/ipc/api.ts`)

```ts
stepCatalog: {
  generate(options?: GenerateCatalogOptions): Promise<StepCatalogResult>
  getCached(): Promise<StepCatalogResult | null>
  clearCache(): Promise<void>
  getStep(id: string): Promise<CatalogStep | null>
}
```

## Preload bindings (`apps/desktop/electron/preload.ts`)

```ts
stepCatalog: {
  generate: (options) => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_GENERATE, options),
  getCached: () => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_GET_CACHED),
  clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_CLEAR_CACHE),
  getStep: (id) => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_GET_STEP, id),
},
```

## Handlers (`apps/desktop/electron/ipc/handlers.ts`)

```ts
const stepCatalog = getStepCatalogService()

ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_GENERATE, async (_e, options?: unknown) =>
  stepCatalog.generate(validateGenerateOptions(options))
)

ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_GET_CACHED, async () => stepCatalog.getCached())

ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_CLEAR_CACHE, async () => stepCatalog.clearCache())

ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_GET_STEP, async (_e, id: unknown) => {
  if (typeof id !== 'string' || id.length === 0) throw new Error('getStep: invalid id')
  return stepCatalog.getStepById(id) ?? null
})
```

## Input validation rules (FR-033)

- `STEP_CATALOG_GET_STEP`: `id` MUST be a non-empty string. Reject otherwise.
- `STEP_CATALOG_GENERATE`: `options` MUST be `undefined` or an object; `include`/`exclude` MUST be `string[]` of **workspace-relative** globs — reject absolute paths, `..` traversal, or non-string entries. The workspace root is taken from `WorkspaceService`, **never** from the renderer. `force` MUST be boolean if present.
- The renderer can never request analysis of an arbitrary directory; only the active workspace is analyzed.
- No channel returns file handles, streams, or raw fs access — only serialized `StepCatalogResult`/`CatalogStep` JSON (FR-033).

## Output guarantees

- `generate` / `getCached` return a `StepCatalogResult` (or `null` for `getCached` when no cache/in-memory result exists) whose every field is JSON-serializable (FR-003). Errors are thrown (rejected promise) with a user-safe message; a single bad step/file never rejects the call (it surfaces as diagnostics).
- `getStep` returns the matching `CatalogStep` from the current in-memory result, or `null`.
- `clearCache` resolves after deleting the on-disk cache and dropping the in-memory result.

## Behavioral contract

| Precondition                              | Call         | Postcondition                                                                         |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Workspace set, cache valid                | `generate()` | returns cached result, `durationMs` small; no re-analysis.                            |
| Workspace set, cache stale/absent         | `generate()` | full analysis, cache written, `analyzedFiles`>0.                                      |
| `generate({force:true})`                  | —            | ignores cache, re-analyzes, rewrites cache.                                           |
| No workspace selected                     | any          | rejects with "No workspace selected".                                                 |
| No Playwright/BDD config or no step files | `generate()` | resolves with `steps:[]` + an explanatory catalog-level diagnostic (not a rejection). |
| One unparseable file                      | `generate()` | other files' steps present; `FILE_PARSE_ERROR` diagnostic names the file.             |

## Migration note

Legacy `STEPS_EXPORT` / `STEPS_GET_CACHED` / `STEPS_GET_DECORATORS` remain until the renderer fully migrates to `stepCatalog:*` (Phase 5), then are removed together with `bddgen-export.js`.
