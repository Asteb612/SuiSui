# IPC + Reporter Contract: `runner:progress`

**Feature**: 011-live-run-progress | **Date**: 2026-07-28

One new main→renderer push channel. No new request/response channels — the renderer builds live state
purely from the event stream plus data it already holds, so a pull channel would be a second source
of truth for the same thing.

---

## 1. `packages/shared/src/ipc/channels.ts`

```ts
// Live run progress (feature 011): main -> renderer push (webContents.send)
RUNNER_PROGRESS: 'runner:progress',
```

## 2. `packages/shared/src/ipc/api.ts`

```ts
runner: {
  // …existing members unchanged…

  /**
   * Subscribe to live execution progress; returns an unsubscribe fn.
   *
   * Events describe only what CHANGED. The full step list for a scenario comes
   * from the feature file, which the app already reads — a step present there
   * with no event is 'pending'.
   */
  onProgress: (callback: (event: RunProgressEvent) => void) => () => void
}
```

Note the existing `onRunnerLog`/`offRunnerLog` pair uses an older shape (`removeAllListeners`, no
unsubscribe fn). The new subscriber follows the **current** convention used by `update`, `recorder`,
`ai`, and `search` — returning an unsubscribe function — rather than propagating the older one.

## 3. `apps/desktop/electron/ipc/handlers.ts`

Inside the existing `RUNNER_RUN_BATCH` handler, the already-line-buffered `onOutput` gains a split:

```ts
const onOutput = (_stream: 'stdout' | 'stderr', data: string) => {
  buf += data
  let nl: number
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)

    const event = parseProgressLine(line)
    if (event) {
      // Structured event: forward it, and DO NOT put it in the human log.
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.RUNNER_PROGRESS, event)
      }
      continue
    }
    emit(line) // unchanged: the user-visible log
  }
}
```

`parseProgressLine` returns `null` for any line that is not a well-formed sentinel event, so ordinary
output flows through untouched.

**This split is the load-bearing part of the contract**: forgetting the `continue` would flood the
run log with JSON and regress FR-018.

## 4. `apps/desktop/electron/preload.ts`

```ts
runner: {
  // …existing members unchanged…
  onProgress: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, event: Parameters<typeof callback>[0]) =>
      callback(event)
    ipcRenderer.on(IPC_CHANNELS.RUNNER_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RUNNER_PROGRESS, listener)
  },
}
```

## 5. Shared package rebuild

```bash
pnpm --filter @suisui/shared build
```

Required before lint, typecheck, or tests on `apps/desktop`.

---

## Reporter contract (app → workspace)

`RunnerService` writes `<workspace>/.app/suisui-progress-reporter.cjs` before each run and appends it
to the reporter chain:

```text
--reporter=list,json,html,<abs path to suisui-progress-reporter.cjs>
```

The reporter implements the Playwright `Reporter` interface and emits one sentinel line per event:

| Callback | Emits |
| --- | --- |
| `onBegin(config, suite)` | `runStart` (with `totalTests` when available) |
| `onTestBegin(test, result)` | `testStart` — `testId`, `relativePath` (derived from `test.location.file`), `title`, `attempt` from `result.retry` |
| `onStepBegin(test, result, step)` | `stepStart` — only when `step.category === 'test.step'`; `index` is the running count of such steps for that test |
| `onStepEnd(test, result, step)` | `stepEnd` — status from `step.error`, plus `durationMs` |
| `onTestEnd(test, result)` | `testEnd` — status and duration |
| `onEnd(result)` | `runEnd` |

### Reporter obligations

| Obligation | Reason |
| --- | --- |
| Every callback body wrapped in try/catch, swallowing errors | A reporter exception must never fail the user's tests (FR-019) |
| Never write anything but sentinel lines to stdout | Anything else lands in the user's log |
| Never read or write files, never touch the network | It runs inside the user's test process; it observes only |
| Step index counts only `category === 'test.step'` entries, per test, in arrival order | Matches editor order: background steps first, then scenario steps |
| Emit the step `title` on every step event | Lets the consumer verify the ordinal and refuse a mismatched update (research Decision 3) |

---

## Behavioural contract

| Condition | Guaranteed behaviour |
| --- | --- |
| Reporter file cannot be written | It is not appended to `--reporter`; the run proceeds exactly as today. No error surfaced to the user. |
| Reporter fails to load, or throws | Playwright continues; no progress events arrive; the UI falls back to aggregate counters (`available` stays false). |
| A sentinel line is malformed | That line is skipped. It does **not** appear in the log and does **not** abort anything. |
| Events arrive out of order or before `testStart` | The reducer creates the scenario entry on demand; no event is discarded for arriving early. |
| Run is stopped mid-step | In-flight steps/scenarios reconcile to `interrupted`, never `failed` (FR-020). |
| Run crashes | Same as above; nothing is left `running` (FR-021, SC-003). |
| Run ends normally | Live statuses are reconciled against the final report; the report wins on any disagreement (FR-017). |
| A new run starts | Live state is cleared before the first event of the new run is applied (FR-022). |
| Non-batch run paths | Must also stream (FR-016) — see quickstart; the dormant `RUNNER_RUN_HEADLESS`/`RUNNER_RUN_UI` handlers currently pass no output callback at all. |

## Security notes

- The reporter is **generated by the app**, not supplied by the workspace: its content is a constant
  shipped as an app asset, so a hostile workspace cannot inject code through it.
- It is written inside the workspace's own `.app/` directory (already git-ignored), never outside the
  workspace root.
- Nothing from the reporter's output is executed, interpolated into a shell command, or used as a
  filesystem path. `relativePath` derived from event data is used only to look up scenarios the app
  already indexed — it is never joined onto the workspace root to read or write a file.
- Event payloads are treated as untrusted input in the parser: unknown `type` values and malformed
  fields are dropped rather than assumed.
