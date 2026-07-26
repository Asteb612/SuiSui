# Contract: Recorder Adapter Protocol (child ↔ parent)

**Feature**: 007-native-recorder | **Phase**: 1
This is the **only** boundary that touches Playwright's private `_enableRecorder`. It is isolated in `PlaywrightRecorderAdapter.ts` (parent, main process) + `scripts/recorder-adapter.js` (child). Everything else consumes SuiSui's shared `RecordedAction`/`LocatorReference` types.

## Process launch (parent → OS)

Spawn like `RunnerService` does:

```ts
spawn(nodeExec, [recorderAdapterPath, `--start-url=${startUrl}`, `--test-id-attr=${attr}`], {
  cwd: workspacePath, // WorkspaceService.getPath()
  env: {
    ...process.env,
    NODE_PATH: path.join(workspacePath, 'node_modules'),
    PATH: `${nodeBinDir}${sep}${path.join(workspacePath, 'node_modules', '.bin')}${sep}${process.env.PATH}`,
    PW_CODEGEN_NO_INSPECTOR: '', // MUST be unset/empty (it silently disables recording)
  },
  stdio: ['pipe', 'pipe', 'pipe'], // stdin cmds, stdout NDJSON, stderr logs
})
```

- `nodeExec` = `getNodeService().getNodePath()` (embedded Node 22.13.1), **not** Electron/`process.execPath`.
- The child `require('playwright')` resolves from the **workspace** `node_modules` (version parity with the project under test).
- Cancel = `child.kill('SIGTERM')`. The parent holds the `ChildProcess` in the session registry.

## Capability probe (child, first thing after resolving Playwright)

```text
1. Resolve workspace playwright + read its package.json version.
2. If require fails            → error PLAYWRIGHT_NOT_INSTALLED, exit.
3. If version ∉ [1.49, 1.61)   → error UNSUPPORTED_PLAYWRIGHT {installed, supported:'>=1.49 <1.61'}, exit.
4. If typeof context._enableRecorder !== 'function' → error RECORDER_API_CHANGED, exit.
5. Launch chromium headed; on launch failure → BROWSER_LAUNCH_FAILED;
   on missing browser binary → BROWSER_BINARY_MISSING ("run: npx playwright install").
6. Emit {t:'ready', playwrightVersion, browser}.
```

An **event-shape guard** wraps the first `actionAdded`: if `data.action.name` is not a string or `data.frame` is missing, emit `RECORDER_API_CHANGED` (fatal) instead of forwarding garbage.

## Child → parent — NDJSON on **stdout** (one JSON object per line)

```jsonc
{"v":1,"t":"ready","playwrightVersion":"1.49.1","browser":"chromium"}
{"v":1,"t":"status","phase":"recording","url":"https://app.test/login"}

// element interaction, enriched by the child's page.evaluate:
{"v":1,"t":"actionAdded","seq":4,"pageGuid":"p1",
 "action":{"name":"click","selector":"internal:role=button[name=\"Sign in\"i]","button":"left","clickCount":1},
 "fingerprint":{"tagName":"button","role":"button","accessibleName":"Sign in",
                "testAttributes":{"data-testid":"login-submit"},"text":"Sign in"},
 "candidates":[
   {"kind":"testId","attribute":"data-testid","value":"login-submit","matchedElements":1},
   {"kind":"role","role":"button","name":"Sign in","matchedElements":1},
   {"kind":"css","value":"button.Btn_primary__a9f3","matchedElements":3}
 ],
 "code":"await page.getByTestId('login-submit').click();"}

// typing — coalesced by Playwright into actionUpdated on the same seq:
{"v":1,"t":"actionUpdated","seq":5,"pageGuid":"p1",
 "action":{"name":"fill","selector":"internal:label=\"Email\"i","text":"arthur@example.com"},
 "fingerprint":{"tagName":"input","label":"Email","inputType":"email"},
 "candidates":[{"kind":"label","value":"Email","matchedElements":1}]}

// SECRET — value is NEVER present; the child dropped it:
{"v":1,"t":"actionUpdated","seq":6,"pageGuid":"p1",
 "action":{"name":"fill","selector":"internal:label=\"Password\"i"},
 "secret":true,
 "fingerprint":{"tagName":"input","label":"Password","inputType":"password","autocomplete":"current-password"},
 "candidates":[{"kind":"label","value":"Password","matchedElements":1}]}

{"v":1,"t":"signalAdded","signal":{"name":"navigation","url":"https://app.test/dashboard"}}

// user clicked an element while pick mode was armed (recording was suspended for this click):
{"v":1,"t":"picked","pickId":"pk-1","pageGuid":"p1",
 "fingerprint":{"tagName":"h1","role":"heading","accessibleName":"Welcome","text":"Welcome"},
 "candidates":[{"kind":"role","role":"heading","name":"Welcome","matchedElements":1},
               {"kind":"text","value":"Welcome","matchedElements":1}]}
{"v":1,"t":"pickCancelled","pickId":"pk-1"}

{"v":1,"t":"error","code":"TARGET_PAGE_CLOSED","message":"The page was closed."}
```

**Rules**

- `action.text`/`value` MUST be **absent** whenever `secret:true` (redacted at source, D7/FR-026). The parent re-asserts this invariant.
- `candidates` carry the child-measured `matchedElements`; **scoring/reasons/warnings are added by the main `LocatorService`**, not the child (D4/D5).
- `stderr` is diagnostics only — it MUST NOT carry protocol data (keeps stdout a clean stream). The parent forwards nothing from stderr to the renderer except as a generic diagnostic.
- The child emits `status` on navigation (URL changes) so the UI can show the browser URL.

## Parent → child — NDJSON on **stdin**

```jsonc
{"cmd":"pause"}                       // recorder.setMode('none') on the existing recorder (NOT re-_enableRecorder)
{"cmd":"resume"}                      // recorder.setMode('recording')
{"cmd":"goto","url":"https://app.test/other"}
{"cmd":"pick","pickId":"pk-1"}        // arm SuiSui's own one-shot picker (suspend recording → status 'picking')
{"cmd":"cancelPick","pickId":"pk-1"}  // disarm the picker, resume recording
{"cmd":"highlight","selector":"internal:testid=[data-testid=\"login-submit\"]"}
{"cmd":"validate","selector":"..."}   // → child replies with a status/validate result line
{"cmd":"stop"}                        // _disableRecorder() + close context/browser + exit(0)
```

- `pause`/`resume` are implemented on the **existing** recorder object inside the child (avoids the memoized-recorder double-listener bug, D3). Re-calling `_enableRecorder` is prohibited.
- `pick` suspends action recording (so the pick click is not captured), arms SuiSui's own in-page hover-highlight + one-shot click capture (D13), and on the next click emits a `picked` event and resumes recording; `cancelPick` disarms and resumes.
- The parent converts a shared `LocatorReference` back into a Playwright selector string for `highlight`/`validate` (the reverse of `asLocator`); this conversion lives in the adapter, not the renderer.

## Pick mode & overlay suppression (D13, confirmed in playwright-core@1.60.0)

- **Overlay suppression**: Playwright's entire in-page overlay lives in one host element `x-pw-glass`. On session start (and every navigation) the child hides it with a document-level rule — `x-pw-glass { opacity:0 !important; pointer-events:none !important }` — injected via `page.addInitScript` (constructable `adoptedStyleSheets`, survives the recorder's ~500 ms glasspane recreate) **plus** `page.addStyleTag` for the current document. `opacity:0` (not `display:none`) avoids `showPopover()` errors. Capture is unaffected (its listeners are on `document`).
- **SuiSui's own picker/highlight**: injected by the child via `page.evaluate`. `pick` runs a single `page.evaluate` returning a Promise that resolves on the next click; it draws a fixed-position hover-highlight `<div>`, registers a **`window`-capture** click listener that `preventDefault()` + `stopImmediatePropagation()` (so Playwright's `document`-capture listener never records the pick click), then reads `tagName/id/name/attributes/text` and computes candidate uniqueness (`querySelectorAll(sel).length`) → `RawFingerprint` + `RawCandidate[]` (same shape as an action's target). The `highlight` command reuses the same injected `<div>`.
- **Capture pause during pick**: the child calls `page.evaluate(() => window.__pw_recorderSetMode('none'))` before arming and `('recording')` after — flipping the existing recorder's mode with no listener leak. It MUST NOT toggle via `_disableRecorder`/`_enableRecorder` (double-listener bug).
- **Version-pinned internals**: `x-pw-glass` and `window.__pw_recorderSetMode` are `playwright-core` internals; the capability probe treats their absence like any unsupported-version signal (`RECORDER_API_CHANGED`).

## Normalization (parent: `RawPlaywrightAction` → shared `RecordedAction`)

| Playwright `action.name` | `RecordedActionType` | Notes                                                   |
| ------------------------ | -------------------- | ------------------------------------------------------- |
| `openPage` / `navigate`  | `navigate`           | `value = url`. `closePage` ignored.                     |
| `click` (clickCount 2)   | `doubleClick`        | else `click`.                                           |
| `fill`                   | `fill`               | `value = text` (unless secret).                         |
| `select`                 | `select`             | `value = options.join(', ')`.                           |
| `check` / `uncheck`      | `check` / `uncheck`  | no value.                                               |
| `press`                  | `press`              | `value = key` (+ modifiers into label).                 |
| `setInputFiles`          | `upload`             | `value = basename(files[0])`.                           |
| `hover`                  | _(dropped for MVP)_  | not in MVP set; retained raw for later.                 |
| `assert*`                | matching `assert*`   | produced by the assertion flow, not the capture stream. |

The parent assigns `id`/`seq`, builds the human `label` (via `ElementFingerprint`, D-labeling order), then hands off to `LocatorService` (scoring) and `StepMatcherService` (matching) before emitting.

## Failure isolation (FR-034)

- Child crash / non-zero exit ⇒ parent emits `ADAPTER_CRASHED` (fatal) with the last stderr tail; the store keeps all actions received so far.
- A malformed NDJSON line ⇒ logged + skipped (does not kill the session) unless it is the shape-guard tripwire on the first action.
- Parent `stop` is idempotent and safe to call after the child already exited.
