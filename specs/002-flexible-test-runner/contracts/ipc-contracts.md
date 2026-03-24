# IPC Contracts: Flexible Test Runner

**Feature**: 002-flexible-test-runner
**Date**: 2026-03-02

## New IPC Channels

### RUNNER_RUN_BATCH

Executes a batch test run with filtering and execution mode options.

| Property      | Value                     |
| ------------- | ------------------------- |
| Channel name  | `runner:runBatch`         |
| Constant      | `RUNNER_RUN_BATCH`        |
| Direction     | Renderer → Main           |
| Request type  | `BatchRunOptions`         |
| Response type | `Promise<BatchRunResult>` |

**Request shape**:

```typescript
interface BatchRunOptions {
  featurePaths?: string[] // Specific feature file relative paths
  tags?: string[] // Tags to filter by (OR logic, without @ prefix)
  nameFilter?: string // Scenario name substring filter
  executionMode: 'sequential' | 'parallel'
  mode: 'headless' | 'ui'
  baseUrl?: string
}
```

**Response shape**: `BatchRunResult` (see data-model.md)

**Behavior**:

1. Runs bddgen to generate all spec files (no FEATURE env var)
2. Constructs playwright CLI args:
   - File paths from `featurePaths` (converted to `.features-gen/` equivalents)
   - `--grep` combining tags (as `@tag1|@tag2`) and name filter
   - `--workers=1` if `executionMode === 'sequential'`, omitted for parallel
   - `--reporter=json,html` for structured output
   - `--ui` if `mode === 'ui'`
3. Executes playwright test
4. Parses JSON reporter output into `BatchRunResult`

---

### RUNNER_GET_WORKSPACE_TESTS

Scans all feature files in the workspace and returns their metadata (scenarios, tags, folders) for filter computation.

| Property      | Value                        |
| ------------- | ---------------------------- |
| Channel name  | `runner:getWorkspaceTests`   |
| Constant      | `RUNNER_GET_WORKSPACE_TESTS` |
| Direction     | Renderer → Main              |
| Request type  | None                         |
| Response type | `Promise<WorkspaceTestInfo>` |

**Response shape**: `WorkspaceTestInfo` (see data-model.md)

**Behavior**:

1. Gets workspace path and features directory from WorkspaceService
2. Recursively finds all `.feature` files
3. Parses each file's Gherkin to extract feature name, tags, scenario names, and scenario tags
4. Aggregates all unique tags and folder paths
5. Returns the complete `WorkspaceTestInfo` structure

---

## Modified IPC Channels

### RUNNER_RUN_HEADLESS / RUNNER_RUN_UI (existing)

No changes to existing channels. They remain functional for backward compatibility during transition but the new run view will use `RUNNER_RUN_BATCH` exclusively.

### RUNNER_STOP (existing)

No signature change. Behavior extended: when a batch run is in progress, `stop()` kills the active playwright process, which terminates all workers.

---

## 5-Step IPC Checklist

For each new channel, the following files must be updated:

| Step | File                                    | Change                                                            |
| ---- | --------------------------------------- | ----------------------------------------------------------------- |
| 1    | `packages/shared/src/ipc/channels.ts`   | Add `RUNNER_RUN_BATCH` and `RUNNER_GET_WORKSPACE_TESTS` constants |
| 2    | `packages/shared/src/ipc/api.ts`        | Add `runBatch()` and `getWorkspaceTests()` to `runner` interface  |
| 3    | `apps/desktop/electron/ipc/handlers.ts` | Register `ipcMain.handle` for both new channels                   |
| 4    | `apps/desktop/electron/preload.ts`      | Expose `runBatch` and `getWorkspaceTests` in `runner` bridge      |
| 5    | Shared package rebuild                  | `pnpm --filter @suisui/shared build`                              |

## API Interface Update

```typescript
// In packages/shared/src/ipc/api.ts
runner: {
  runHeadless: (options?: Partial<RunOptions>) => Promise<RunResult> // existing
  runUI: (options?: Partial<RunOptions>) => Promise<RunResult> // existing
  runBatch: (options: BatchRunOptions) => Promise<BatchRunResult> // NEW
  getWorkspaceTests: () => Promise<WorkspaceTestInfo> // NEW
  stop: () => Promise<void> // existing
}
```
