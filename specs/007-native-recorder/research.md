# Research: SuiSui-Native Playwright Recorder

**Feature**: 007-native-recorder | **Date**: 2026-07-24 | **Phase**: 0
**Grounding**: all Playwright findings verified against the installed `playwright-core@1.60.0` (`node_modules/.pnpm/playwright-core@1.60.0/.../lib/coreBundle.js`); all codebase findings verified against current source on branch `007-native-recorder` (post feature 006).

---

## D1. How to capture interactions without the Playwright Inspector

**Decision**: Use Playwright's private `context._enableRecorder({ mode: 'recording', recorderMode: 'api' }, eventSink)` on a `BrowserContext`. In `api` mode Playwright routes to `ProgrammaticRecorderApp` (a headless event sink) instead of opening the Inspector window — exactly the spec's "no separate raw-code window" goal (FR-001, issue #106).

**Confirmed shapes** (isolated behind one adapter):

- Sink methods: `actionAdded(page, action, code)`, `actionUpdated(page, action, code)`, `signalAdded(page, signal)`.
- Payload `data` = `ActionInContext = { frame: { pageAlias, pageGuid, framePath }, action: {...} }`.
- `action.name ∈ { openPage, closePage, navigate, click, check, uncheck, hover, fill, press, select, setInputFiles, assertText, assertChecked, assertVisible, assertValue, assertSnapshot }` — covers the entire MVP interaction + assertion set. `fill` carries the final `text` (Playwright coalesces keystrokes into `actionUpdated`, so we get debounced values for free). `press` carries `key` + `modifiers` (bitmask). `setInputFiles` = file upload. `select` carries `options`.
- `code` is Playwright's generated snippet for that action — used only as a fallback/hint, never as the primary model (FR-004).

**Rationale**: There is no public recording API; the Inspector is explicitly rejected by the spec and issues #105/#106. `recorderMode:'api'` is the sanctioned headless path and needs no UI window.

**Alternatives considered**:

- _Playwright Inspector / `codegen` UI_ — rejected (separate window, raw code, poor UX; the exact thing #106 wants gone).
- _CDP-only capture (our own recorder injected via `Runtime.evaluate`)_ — rejected: re-implements Playwright's robust selector engine and event model; far more code and drift. We reuse Playwright's capture and add only our own DOM enrichment (D4).

---

## D2. Where the browser runs: in-process vs subprocess

**Decision**: **Subprocess (b)** — spawn the app's **embedded Node** (`NodeService.getNodePath()`, v22.13.1) running a small child script `recorder-adapter.js` with `cwd = <workspace>` and `env.NODE_PATH = <workspace>/node_modules`, so it `require('playwright')` from **the user's workspace**. This mirrors `RunnerService` exactly. Actions stream back as **NDJSON over stdio**; commands (`stop`/`pause`/`resume`/`goto`/`highlight`/`validate`) go in over stdin; cancellation via `kill('SIGTERM')`.

**Rationale**:

- **Version parity with the project under test**: recorded selectors/`data-testid` semantics must match the browser + Playwright the user's tests actually run on. A packaged SuiSui ships **no Playwright** (it is only a devDependency of the dev checkout), so bundling would be both large _and_ the wrong version.
- **Precedent**: `RunnerService` already resolves the workspace's Playwright CLI, runs it under embedded Node with `cwd=<ws>`/`NODE_PATH`, streams via `onOutput`, and kills a held `ChildProcess` — the recorder reuses this shape.
- **Isolation**: launching Chromium in the Electron main process shares the UI event loop and complicates the `safeStorage`/CSP boundary; a killable child process is cleaner (Principle I).

**Alternatives considered**:

- _In-process, app-bundled `playwright-core`_ — rejected: adds a heavy production dep + Chromium download, freezes us to one Playwright version, and still mismatches the user's project.

**Consequence for CommandRunner**: `CommandRunner.exec` is one-shot, has no stdin channel, and doesn't expose the live `ChildProcess`. The recorder needs a **bidirectional, long-lived** session. Rather than bloat `CommandRunner` (Principle VI), `RecorderService` owns the child directly via an injected spawner (`INodeProcessSpawner`, DI for tests) and reuses `NodeService` + the workspace-env resolution helpers.

---

## D3. Session control (start / pause / resume / stop)

**Decision**: Start = `_enableRecorder({ mode:'recording', recorderMode:'api' })` (begins immediately — the server calls `setMode('recording')` on construction; no extra "start" call). Stop = `_disableRecorder()` then close context/browser. **Pause/resume are handled inside the child on the recorder object** (`recorder.setMode('none'|'recording')`), **never** by re-calling `_enableRecorder`.

**Rationale**: `Recorder.forContext` is memoized, and the `api`-mode path (`ProgrammaticRecorderApp.run`) has **no idempotency guard** — re-calling `_enableRecorder` double-registers listeners (duplicate actions). The child has direct access to the server object graph, so it flips modes on the existing recorder. Also: the child must ensure `PW_CODEGEN_NO_INSPECTOR` is unset (it silently disables recording).

**Alternatives considered**: _`DebugController.setRecorderMode`_ — rejected: it's the global test-server/reuse controller (operates on all recorders, launches its own browser). _Treat pause as disable + resume as fresh `goto`_ — kept as a documented fallback if in-child `setMode` proves fragile across versions.

---

## D4. Building semantic locator candidates (the spec's `LocatorReference[]`)

**Decision**: The `api` sink gives **exactly one** opinionated selector per action (Playwright internal syntax, `multiple:false`). SuiSui builds its ranked candidate set itself: **the child adapter** runs a single `page.evaluate` against the recorded element to extract a raw **ElementFingerprint** (tag, role, accessible name, all `data-*`/test attributes, `id`, `name`, `aria-*`, `placeholder`, visible text, nearby text, ancestor context) **plus per-candidate uniqueness counts** (`document.querySelectorAll(candidate).length`). The **main-process `LocatorService`** then turns that raw data into scored, ranked `LocatorCandidate[]` — a **pure, deterministic function** (heavily unit-tested per the spec's testing list).

**Rationale**: Split of concerns — the child does DOM/Playwright work (needs a live page); the main service does scoring (pure, testable without a browser, Principle III). Uniqueness must be measured in the page, so the child returns match counts; the score/reasons/warnings are computed in main.

**Alternatives considered**: _Trust Playwright's single selector_ — rejected: the spec requires candidate ranking, explanations, and manual override (FR-007–FR-011). _Do scoring in the child_ — rejected: couples the deterministic algorithm to the browser and makes it hard to unit-test.

---

## D5. Locator scoring & generated-value detection

**Decision**: Implement the spec's scoring table as a pure function in `LocatorService`. Base scores by candidate kind (configured test-id unique = 100, other test-data = 90, role+name = 85, label = 80, stable id = 75, name = 70, placeholder = 60, text = 50, css class = 25, position/nth-child = 5), multiplied/penalized by: uniqueness (non-unique caps the score sharply and adds a warning), and **generated-value detection** — regex heuristics for UUID, hex hash (≥8 hex), long digit runs, timestamps, random suffixes, CSS-module hashes (e.g. `Button_root__x8Ff2`), and `nth-child`/index. Each candidate carries `reasons[]` and `warnings[]` strings (FR-009/FR-010). Reliability buckets for the UI: Excellent ≥ 90, Good 70–89, Fair 40–69, Poor < 40.

**Rationale**: Deterministic, explainable, unit-testable; matches the spec's table and the "explain why" requirement.

**Alternatives considered**: _ML/heuristic blend_ — rejected (YAGNI, not explainable). _Playwright's own selector "score"_ — not exposed and not semantic.

---

## D6. Recorded-action → BDD-step matching

**Decision**: Multi-stage matcher (`StepMatcherService`, main), matching **deterministically first**:

1. **Stage 1 — bundled generic steps**: a static, SuiSui-authored map `GENERIC_STEP_RECORDER_MAP` keyed by generic-step pattern → `{ action, targetArg?, valueArg?, assertionArg? }`. For a recorded `click`/`fill`/etc. we select the matching generic step and fill its args from the action's human-readable target label + value. No AI.
2. **Stage 2 — project metadata** (later phase): optional `@suisui-action`/`@suisui-target` JSDoc on custom steps, read by extending feature 006's TypeScript analyzer, surfaced as an optional `recorder?` field on `CatalogStep`. Kept as an extensible seam; not in the MVP.
3. **Stage 3 — optional AI** (US6, behind flag): reuse `AIService.stream`, parse a JSON `{definitionId, arguments, confidence, reason}`, and **validate against the real catalog step's arg schema** before offering it. Confidence gates: ≥0.90 preselect, 0.65–0.89 recommend, <0.65 keep generic/require manual.

Reconciliation to existing infra: reuse `StepCatalogService.findMatchingSteps(text, keyword)` and shared `findBestMatch/matchStep/resolvePattern` for text↔step reconciliation. Matching runs in **main** at emit time so each streamed `RecordedAction` already carries its primary `StepMatch` + top-N alternatives; the renderer's `StepMatchSelector` just lets the user switch among them (no extra IPC).

**Rationale**: Deterministic-first satisfies "AI never required" (FR-030, refines #105). A static bundled map avoids requiring metadata in user step files for the known generic set (YAGNI); custom-step metadata is an additive seam.

**Alternatives considered**: _AI-first mapping (as #105 literally proposes)_ — rejected per spec (deterministic MVP; AI optional). _Require `defineStep` recorder metadata everywhere_ — rejected (breaks plain playwright-bdd projects, FR backward-compat).

**Gap**: today's 11 bundled generic steps cover click/fill/select/navigate + see/not-see/URL/element-visible, but **lack check/uncheck/press/upload** and genuine-`expect` assertions. New generic steps are added to the bundled `generic.steps.ts` template (D8). Actions with no workspace step become **gaps** routed to missing-step stub generation (#100), never silently dropped (FR-018a).

---

## D7. Sensitive-data protection

**Decision**: Redaction happens **in the child adapter**, so a secret value **never crosses the stdio boundary**. During the same `page.evaluate` used for fingerprinting, the child classifies the field (`input[type=password]`, `autocomplete=current-password|new-password`, and `name`/`id` containing password|token|secret|api-key|authorization). If sensitive, the child sets `secret: true` and **omits** `value`; main marks the action and emits a committable reference. Resolution preference: a **Test Profile name** (#98) when a login sequence is recognized, else a named secret reference `<UPPER_SNAKE>` (FR-025/FR-026/FR-026a). The recorder **does not persist** the secret at all — profile credential storage is #98's concern (which already follows the `safeStorage` + `<ws>/.app/` pattern).

**Rationale**: Redacting at the source is the strongest guarantee (SC-004: zero cleartext anywhere, including AI payloads — trivially satisfied since main never receives the value).

**Alternatives considered**: _Mask in the renderer_ — rejected: the secret would still traverse IPC and could be logged. _Store the secret encrypted for replay_ — rejected (YAGNI + risk; profiles own credentials).

---

## D8. Bundled generic steps: additions & assertion semantics

**Decision**: Extend `apps/desktop/electron/assets/generic.steps.ts` with the MVP-missing interaction steps — check/uncheck, keyboard press, file upload — and add/adjust assertion steps to use Playwright's genuine `expect` API (FR-029) for the **full assertion set** (2026-07-24 clarification): visible, hidden, contains text, has value, is checked, is enabled, has element count, URL contains/equals, page title contains/equals. Each new/updated step gets an entry in `GENERIC_STEP_RECORDER_MAP` (D6; patterns enumerated in `contracts/action-step-mapping.md`).

**Rationale**: The recorder can only insert steps that exist in the workspace; the MVP action set requires these. Assertions must be real expectations, not waits.

**Limitation (documented)**: bundled-step changes only reach **new or re-initialized** workspaces. Existing workspaces lacking a step will see those actions as **gaps** (D6/FR-018a) — acceptable and consistent with the spec.

**Alternatives considered**: _Emit raw Playwright for missing actions_ — rejected (violates "catalog-constrained, no raw code"). _Auto-write steps into the user's files_ — rejected (out of scope; that's #100).

---

## D9. Testing strategy under Principle III (no real browser/CLI in tests)

**Decision**: The `RecorderService` depends on a `IRecorderAdapter` seam (DI). CI/unit/E2E use a **`FakeRecorderAdapter`** that replays canned **NDJSON action fixtures** (recorded once from a real session, checked in), so no real Chromium/Playwright ever runs in the test suite. Pure services (`LocatorService` scoring, `StepMatcherService`, secret masking, assertion conversion, action normalization, AI-response validation) are unit-tested on in-memory fixtures. The real `PlaywrightRecorderAdapter` (+ `recorder-adapter.js`) is exercised only by a **manual/opt-in integration harness** against local fixture pages, outside the standard `pnpm test`/`test:e2e` runs.

**Rationale**: Constitution III is NON-NEGOTIABLE — tests must never execute real Playwright. The adapter seam makes the whole pipeline testable deterministically; the private-API path is validated manually where a real browser is acceptable.

**Alternatives considered**: _Run headless Chromium in CI_ — rejected (violates III; slow, non-deterministic). _Mock at the Playwright level_ — rejected: fragile and re-implements the API; the NDJSON fixture at our own boundary is simpler and stable.

---

## D10. Streaming IPC transport

**Decision**: Copy the AI streaming pattern (Pattern A). `recorder:start` is an `ipcMain.handle` that spawns the child and returns `{ accepted: true, sessionId }` immediately; the service then pushes `recorder:action` / `recorder:actionUpdated` / `recorder:status` / `recorder:error` via `event.sender.send(...)`, guarded by `webContents.isDestroyed()` and keyed by `sessionId`. Preload exposes `onAction/onActionUpdated/onStatus/onError(cb) => unsubscribe` using per-listener `removeListener`. Request/response methods (`stop`, `pause`, `resume`, `highlight`, `validateLocator`) are plain `invoke`. Session-registry + `SIGTERM` mirror the AI `AbortController` registry.

**Rationale**: The exact pattern already exists and is proven (AI token streaming), satisfying Principle II with validated payloads.

**Alternatives considered**: _Polling `getActions()`_ — rejected (laggy, misses the live UX #106 wants). _A dedicated MessagePort_ — rejected (unnecessary; `webContents.send` suffices and matches house style).

---

## D11. Recorder provenance storage

**Decision**: Do **not** add provenance to the Gherkin. Keep recorder provenance (`definitionId`, chosen locator, source actions, confidence, `generatedBy`) in the **renderer recorder store** (in-memory) during a session; the inserted `ScenarioStep` stays the existing minimal shape (`id/keyword/pattern/args`). Persistent provenance, if ever needed, is a `.app/`-scoped sidecar keyed by scenario — deferred (YAGNI). Source-location linkage (FR-022–024, US5) reuses the catalog's existing `StepSourceLocation` + `getStepById`; no new storage.

**Rationale**: FR-020/FR-021 explicitly allow reconstruction-or-sidecar and forbid Gherkin pollution. Not extending `ScenarioStep` keeps `toGherkin/parseGherkin` untouched (Principle VI, preserves feature 006 behavior).

**Alternatives considered**: _Add `recording?`/`definitionId?` to `ScenarioStep`_ — deferred: they wouldn't serialize to Gherkin and aren't needed for MVP insertion; can be added later behind the same seam.

---

## D12. AI enablement / feature flag

**Decision**: The recorder AI layer is gated on **both** a configured provider (`AppSettings.aiProvider.type !== null`) **and** a new explicit `AppSettings.recorderAiEnabled` flag (default off). With AI off, the deterministic pipeline is fully functional (FR-030, SC-007).

**Rationale**: The spec mandates an explicit flag and "AI never a dependency"; reuses feature 005's provider seam and settings plumbing.

---

## D13. Suppressing Playwright's in-page overlay & providing SuiSui's own picker

**Context (clarification 2026-07-24)**: SuiSui must replace Playwright's **in-page overlay** — the injected UI it draws on the recorded page — for both selectors and assertions, and provide its own element picker. Verified against installed `playwright-core@1.60.0`.

**Findings (confirmed in the bundle)**:

- The api recorder mode (`recorderMode:'api'`) only swaps the _out-of-page_ frontend; the **in-page overlay still renders**. The entire overlay — glasspane, highlight boxes, tooltip, and the record/pick/assert **toolbar** — lives inside **one light-DOM host element `x-pw-glass`** (appended to `document.documentElement`, closed shadow root). Its glasspane recreates every ~500 ms.
- There is **no public flag** to hide it: `hideToolbar` exists server-side but is stripped by the `_enableRecorder` wire schema, and `PW_CODEGEN_NO_INSPECTOR` disables recording entirely.
- Native element-pick (`ElementPicked`) is **not** forwarded to the api sink, confirming the picker must be SuiSui's own.

**Decision**:

1. **Suppress the overlay with one document-level CSS rule** on the host: `x-pw-glass { opacity: 0 !important; pointer-events: none !important }`. Inject via `page.addInitScript` (constructable `adoptedStyleSheets`, so it survives the 500 ms glasspane recreate and navigations) **plus** `page.addStyleTag` for the already-loaded document. Use `opacity:0` (not `display:none`) to avoid `showPopover()` errors in the recreate loop. This hides glasspane + highlight + tooltip + toolbar together and does **not** affect action capture (capture listeners are on `document`; the glasspane is `pointer-events:none`).
2. **SuiSui's own one-shot picker** = a single `page.evaluate` that returns a Promise resolving on the next click. It injects a fixed-position hover-highlight `<div>`, registers a **`window`-capture** click listener that `preventDefault()` + `stopImmediatePropagation()` (so Playwright's `document`-capture listener never sees the pick click), reads the element's `tagName/id/name/attributes (data-*/aria-*/placeholder/role)/textContent` and computes candidate **uniqueness** via `document.querySelectorAll(sel).length`. The returned object serializes straight back to Node — **no `exposeBinding` needed** for one-shot. Role/accessible-name are computed by us (Playwright's in-page `generateSelector`/aria utils are not reachable from `page.evaluate`).
3. **Pause/resume capture around a pick** via the already-exposed main-frame binding `window.__pw_recorderSetMode('none'|'recording')` — it flips the existing recorder's mode without adding listeners. Do **not** toggle with `_disableRecorder`/`_enableRecorder` (confirmed double-listener bug in the api path).
4. **FR-011 highlight** reuses the same injected `<div>` mechanism (independent of the suppressed `x-pw-glass`), never Playwright's `locator.highlight()`.

**Rationale**: A single host element means one CSS rule cleanly removes the whole overlay while leaving capture intact; a self-contained `page.evaluate` picker is the simplest robust way to get an arbitrary element back to Node without depending on the unforwarded native pick event.

**Alternatives considered**: _`hideToolbar` param_ — rejected (stripped by the wire schema; only hides the toolbar anyway). _`page.pickLocator()`_ — rejected as the primary path (drives Playwright's native inspect highlight and shares the recorder, conflicting with overlay suppression); kept only as a last-resort fallback for Playwright-grade selectors. _CDP style injection_ — rejected (strictly more complex than `addInitScript`+`addStyleTag`).

**Version-pinned internals (isolated in the adapter/child)**: `x-pw-glass` (overlay host tag) and `window.__pw_recorderSetMode` (mode binding) are `playwright-core` internals stable for the supported range; the capability probe (D1/D2) treats their absence/shape-change like any other unsupported-version signal and fails gracefully.

## Resolved unknowns summary

| Unknown (from Technical Context)                     | Resolution                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Does `_enableRecorder` exist / what's its shape?     | Yes — `BrowserContext._enableRecorder(params, sink)`, `recorderMode:'api'`; shapes in D1 (confirmed in 1.60.0).       |
| In-process or workspace Playwright?                  | Workspace Playwright via embedded-Node subprocess (D2).                                                               |
| How to get ranked locators?                          | Own DOM inspection in child + pure scoring in main (D4/D5).                                                           |
| How to test without a real browser?                  | `IRecorderAdapter` DI + NDJSON fixtures; real adapter manual-only (D9).                                               |
| Streaming transport?                                 | AI Pattern A over `event.sender.send` (D10).                                                                          |
| Provenance storage?                                  | Renderer store / optional sidecar; not in Gherkin (D11).                                                              |
| Version fragility of the private API?                | Single adapter + capability probe + version gate `>=1.49 <1.61`, graceful error (D1/D2).                              |
| How to suppress Playwright's in-page overlay?        | One CSS rule on the `x-pw-glass` host via `addInitScript`+`addStyleTag`; no public flag exists (D13).                 |
| How to pick an arbitrary element (overlay replaced)? | SuiSui's own one-shot `page.evaluate` picker (window-capture click), capture paused via `__pw_recorderSetMode` (D13). |
