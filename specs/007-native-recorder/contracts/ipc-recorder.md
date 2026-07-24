# Contract: Recorder IPC

**Feature**: 007-native-recorder | **Phase**: 1
**Principle II** — every channel declared in all five touchpoints and rebuilt. Transport copies the AI streaming pattern (`recorder:start` returns immediately, events pushed via `event.sender.send`).

## Channels (add to `packages/shared/src/ipc/channels.ts`)

```ts
// Recorder — request/response
RECORDER_START: 'recorder:start',
RECORDER_STOP: 'recorder:stop',
RECORDER_PAUSE: 'recorder:pause',
RECORDER_RESUME: 'recorder:resume',
RECORDER_PICK: 'recorder:pick',                  // arm SuiSui's own element picker (D13)
RECORDER_CANCEL_PICK: 'recorder:cancelPick',
RECORDER_HIGHLIGHT: 'recorder:highlight',
RECORDER_VALIDATE_LOCATOR: 'recorder:validateLocator',
// Recorder — main → renderer push
RECORDER_ACTION: 'recorder:action',
RECORDER_ACTION_UPDATED: 'recorder:actionUpdated',
RECORDER_PICKED: 'recorder:picked',              // user clicked an element in pick mode
RECORDER_STATUS: 'recorder:status',
RECORDER_ERROR: 'recorder:error',
```

## API signatures (add to `packages/shared/src/ipc/api.ts`)

```ts
recorder: {
  start(options: RecorderStartOptions): Promise<{ accepted: true; session: RecorderSession }>
  stop(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  // SuiSui's own element picker (replaces Playwright's overlay, D13):
  pick(request: { purpose: PickPurpose; actionId?: string }): Promise<{ accepted: true; pickId: string }>
  cancelPick(): Promise<void>
  highlight(locator: LocatorReference): Promise<void>
  validateLocator(locator: LocatorReference): Promise<LocatorValidationResult>
  // subscriptions — each returns an unsubscribe fn; call it on onUnmounted
  onAction(cb: (action: RecordedAction) => void): () => void
  onActionUpdated(cb: (action: RecordedAction) => void): () => void
  onPicked(cb: (picked: PickedElement) => void): () => void
  onStatus(cb: (status: RecorderStatus) => void): () => void
  onError(cb: (error: RecorderError) => void): () => void
}
```

> **Deliberate simplification vs. the spec's suggested surface** (Principle VI): `getStepMatches`/`selectStepMatch`/`selectLocator`/`replayAction`/`removeAction`/`moveAction`/`acceptAction`/`insertAcceptedActionsIntoScenario` are **renderer `recorder`-store operations**, not IPC — matching is computed in main and the alternatives ship on each `RecordedAction` (`match` + `matchAlternatives`), so no round-trip is needed to switch a step. `replayAction` is deferred (US6). Only browser-touching operations are IPC.

## Preload bindings (`apps/desktop/electron/preload.ts`)

```ts
recorder: {
  start: (options) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_START, options),
  stop: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_STOP),
  pause: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_PAUSE),
  resume: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_RESUME),
  pick: (request) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_PICK, request),
  cancelPick: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_CANCEL_PICK),
  highlight: (locator) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_HIGHLIGHT, locator),
  validateLocator: (locator) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_VALIDATE_LOCATOR, locator),
  onAction: (cb) => {
    const l = (_e, a) => cb(a)
    ipcRenderer.on(IPC_CHANNELS.RECORDER_ACTION, l)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDER_ACTION, l)
  },
  // onActionUpdated / onPicked / onStatus / onError identical (per-listener removeListener, like AI)
},
```

## Handlers (`apps/desktop/electron/ipc/handlers.ts`)

```ts
const recorder = getRecorderService()

ipcMain.handle(IPC_CHANNELS.RECORDER_START, async (event, options: unknown) => {
  const opts = validateRecorderStartOptions(options) // reject bad shapes; startUrl scheme-checked
  // wire the service's emitters to THIS webContents, guarded by isDestroyed()
  const session = await recorder.start(opts, {
    onAction: (a) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.RECORDER_ACTION, a)
    },
    onActionUpdated: (a) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.RECORDER_ACTION_UPDATED, a)
    },
    onPicked: (p) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.RECORDER_PICKED, p)
    },
    onStatus: (s) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.RECORDER_STATUS, s)
    },
    onError: (e) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.RECORDER_ERROR, e)
    },
  })
  return { accepted: true as const, session }
})

ipcMain.handle(IPC_CHANNELS.RECORDER_STOP, async () => recorder.stop())
ipcMain.handle(IPC_CHANNELS.RECORDER_PAUSE, async () => recorder.pause())
ipcMain.handle(IPC_CHANNELS.RECORDER_RESUME, async () => recorder.resume())
ipcMain.handle(IPC_CHANNELS.RECORDER_PICK, async (_e, req: unknown) =>
  recorder.pick(validatePickRequest(req))
) // purpose ∈ {retarget,assert}; actionId string if present
ipcMain.handle(IPC_CHANNELS.RECORDER_CANCEL_PICK, async () => recorder.cancelPick())
ipcMain.handle(IPC_CHANNELS.RECORDER_HIGHLIGHT, async (_e, loc: unknown) =>
  recorder.highlight(validateLocatorReference(loc))
)
ipcMain.handle(IPC_CHANNELS.RECORDER_VALIDATE_LOCATOR, async (_e, loc: unknown) =>
  recorder.validateLocator(validateLocatorReference(loc))
)
```

## Input validation rules (FR-033, FR-035)

- `RECORDER_START`: `options` MUST be an object; `startUrl`, if present, MUST be a string with an `http`/`https` (or workspace-relative) form — reject `file:`/`javascript:` and other schemes (reuse the runner's `BASE_URL` normalization). `scenarioId` MUST be a string if present. `locatorSettings`, if present, MUST match `RecorderLocatorSettings` (string arrays / booleans only).
- `RECORDER_PICK`: `request.purpose` MUST be `'retarget'` or `'assert'`; `actionId` MUST be a string if present (and MUST reference a known action for `retarget`). Rejected if no active session.
- `RECORDER_HIGHLIGHT` / `RECORDER_VALIDATE_LOCATOR`: payload MUST be a valid `LocatorReference` (known `type` + required fields); reject otherwise.
- The **workspace root is taken from `WorkspaceService`, never the renderer**; the renderer cannot point the recorder at an arbitrary directory or browser binary.
- No channel returns file handles, streams, raw selectors, or secret values — only serialized shared types. `RecordedAction.value` is absent whenever `secret` is true (guaranteed upstream in the child).

## Output guarantees

- `start` resolves with `{ accepted:true, session }` **before** any action is captured (async spawn + capability probe run inside); a failed spawn/probe rejects with a user-safe message **or**, once a `sessionId` exists, surfaces as a fatal `recorder:error`. A single bad action never ends the session (FR-034).
- `stop`/`pause`/`resume` resolve after the child acknowledges (or the child is dead, in which case `stop` is idempotent). `stop` always tears down the child (`SIGTERM`) and clears the session registry.
- `validateLocator` resolves with match counts computed in the live page; `highlight` resolves after the child paints the highlight.
- Events always carry `sessionId`; the renderer ignores events for stale sessions.

## Behavioral contract

| Precondition                                     | Call      | Postcondition                                                                                                                                                                                |
| ------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace set, Playwright `>=1.49 <1.61` present | `start()` | child spawns, `ready` → `{accepted,session}` with resolved `playwrightVersion`; status → `recording`.                                                                                        |
| Workspace set, no Playwright in `node_modules`   | `start()` | rejects/emits `PLAYWRIGHT_NOT_INSTALLED` with recovery text.                                                                                                                                 |
| Playwright present but version/API unsupported   | `start()` | `UNSUPPORTED_PLAYWRIGHT` (installed vs supported), fatal, no crash.                                                                                                                          |
| No workspace selected                            | any       | rejects with "No workspace selected".                                                                                                                                                        |
| Browser binary missing                           | `start()` | `BROWSER_BINARY_MISSING` + "run `playwright install`".                                                                                                                                       |
| Recording, user interacts                        | (stream)  | `recorder:action` per interaction; typing coalesces into `actionUpdated`.                                                                                                                    |
| `pause()` then user interacts                    | —         | no actions emitted; `resume()` re-enables.                                                                                                                                                   |
| `pick({purpose})` then user clicks an element    | (stream)  | status → `picking` (recording suspended, so the pick click is not captured); a `recorder:picked` event carries the element's fingerprint + scored candidates; status returns to `recording`. |
| `cancelPick()` while picking                     | —         | picker disarmed, `recorder:pickCancelled`/`picked{cancelled}`, status → `recording`; no element captured.                                                                                    |
| Target page closed mid-session                   | (stream)  | `TARGET_PAGE_CLOSED` (fatal), captured actions preserved in the store.                                                                                                                       |
| Renderer window closed                           | —         | `isDestroyed()` guard drops sends; `stop` on unmount kills the child.                                                                                                                        |

## Session registry & teardown

`RecorderService` keeps at most one active session (single browser) in a registry keyed by `sessionId`, holding the child `ChildProcess`. `stop`, a fatal error, `app` quit, or workspace change all `SIGTERM` the child and clear the registry (mirrors the AI `AbortController` map + runner `SIGTERM`).
