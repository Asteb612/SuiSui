# Implementation Plan: Live Streaming Run Progress (Per-Step Pass/Fail During Execution)

**Branch**: `011-live-run-progress` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-live-run-progress/spec.md`

## Summary

Surface per-step execution status while a run is in flight, and highlight what is executing right
now — including all scenarios when running in parallel.

Technical approach: add a **custom Playwright reporter** to the existing
`--reporter=list,json,html` chain. It is a small CommonJS file written into the workspace's `.app/`
directory and loaded by the **workspace's own** Playwright. On `onTestBegin`/`onStepBegin`/
`onStepEnd`/`onTestEnd` it emits NDJSON lines on stdout behind a sentinel prefix. The existing
line-buffered stdout pipe in the `RUNNER_RUN_BATCH` handler already guarantees complete lines; the
main process **intercepts** sentinel lines (so they never reach the user's log panel), parses them
into typed events, and pushes them to the renderer over a new `runner:progress` channel. The renderer
keeps a live run model and overlays step statuses onto the steps it already renders.

Feature-file mapping reuses `extractFeatureRelativePath`, which already converts
`.features-gen/features/login.feature.spec.js` → `features/login.feature` and is unit-tested.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20.x (Electron 33 runtime); repo/tests on Node 22. The reporter itself is plain CommonJS JavaScript, executed by the **workspace's** Playwright, not by the app.  
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x — **no new runtime dependency**. Uses the workspace's existing `@playwright/test` reporter API (`onTestBegin`/`onStepBegin`/`onStepEnd`/`onTestEnd`) and `playwright-bdd` (≥8.x), which wraps every Gherkin step in `test.step(textWithKeyword, …)`.  
**Storage**: None persisted. Live run state is in-memory in the renderer and discarded when a new run starts. The reporter file is a generated artifact under `<workspace>/.app/` (already git-ignored), rewritten on each run.  
**Testing**: Vitest 2.x — the sentinel-line parser and the live-state reducer are pure and unit-tested; `RunnerService` wiring is tested with `FakeCommandRunner` emitting canned stdout. The reporter file is covered by a fixture-replay test (see Complexity Tracking). Playwright E2E asserts live status in `APP_TEST_MODE` against scripted output.  
**Target Platform**: Electron desktop (Linux, macOS, Windows)  
**Project Type**: Desktop app — pnpm monorepo (`apps/desktop` + `packages/shared`)  
**Performance Goals**: step status visible within 1 s of the step starting/completing (SC-002); run view responsive at 200 scenarios (SC-006) with live state bounded independently of log volume  
**Constraints**: Renderer must not touch `node:fs` (Principle I); tests must never launch a real browser or run real Playwright (Principle III); a missing/broken reporter must never break a run (FR-019)  
**Scale/Scope**: 200 scenarios × ~10 steps ≈ 2,000 live step records per run; 1 new IPC push channel; 1 new generated reporter file; changes to `RunnerService`, the runner store, and the results/step UI

No `NEEDS CLARIFICATION` items remain. The spec's open decisions (where status appears, no auto-navigation, report stays authoritative, retries show latest attempt, transient state) are recorded there as Assumptions.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle | Assessment | Status |
| --- | --- | --- |
| **I. Process Isolation** | The reporter runs inside the workspace's Playwright subprocess. Its output is parsed in the **main** process; the renderer only receives typed events via `window.api.runner.onProgress`. No `node:*` under `app/`. | ✅ Pass |
| **II. Typed IPC Contracts** | One new push channel `runner:progress` declared in `channels.ts`, signature in `api.ts`, emitted from `handlers.ts`, bound in `preload.ts`, then shared rebuild. Follows the established unsubscribe-returning subscriber shape. | ✅ Pass |
| **III. Test Isolation** | No real Playwright, no browser. The parser and reducer are pure functions. `RunnerService` tests drive `FakeCommandRunner` with canned sentinel lines. The reporter file is exercised by replaying a checked-in capture rather than by running Playwright — same approach as the recorder's NDJSON fixtures. | ✅ Pass |
| **IV. Service Pattern** | Extends the existing `RunnerService` singleton (already constructor-injected). The reporter path is resolved through `WorkspaceService`, never the renderer. | ✅ Pass |
| **V. Shared Package SSoT** | `RunProgressEvent`, `StepExecution`, `ScenarioExecution`, `LiveRunState` and the status enums live in `packages/shared/src/types/run-progress.ts`; the sentinel parser and the reducer live in `packages/shared/src/run-progress/` so both processes share one definition of how an event changes state. | ✅ Pass |
| **VI. Simplicity (YAGNI)** | Reuses the existing stdout pipe rather than opening a second transport, reuses `extractFeatureRelativePath`, adds no dependency. No debugger, no persistence, no per-attempt history. Two tracked items below. | ⚠️ Pass with tracked items |

**Gate result: PASS.** No unjustified violations; two tracked complexities recorded below.

### Post-Phase-1 re-check

Re-evaluated after `data-model.md` and `contracts/`: no principle moved. Three simplifications were
found during design and applied:

- **No `runner:getProgress` request channel.** The renderer builds live state purely from the pushed
  event stream plus what it already holds; a pull channel would be a second source of truth for the
  same data.
- **The reducer moved into `@suisui/shared`.** It was originally renderer-only, but putting it beside
  the parser means the "what does this event do to state" rule is defined once and is unit-testable
  without a Pinia instance.
- **Step lists are not shipped in events.** An event carries the step's ordinal and title; the full
  step list (including not-yet-run steps, required by FR-002) comes from the feature file the app can
  already read and parse. Sending whole step lists per event would multiply payload size for data the
  app already has.

## Project Structure

### Documentation (this feature)

```text
specs/011-live-run-progress/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-run-progress.md   # Phase 1 output — IPC + reporter wire contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   └── run-progress.ts               # NEW — event + live-state contracts, status enums
├── run-progress/
│   ├── parseProgressLine.ts          # NEW — sentinel line → RunProgressEvent | null (pure)
│   ├── liveRunReducer.ts             # NEW — (state, event) → state (pure)
│   └── index.ts                      # NEW — barrel
├── index.ts                          # EDIT — export the new types + module
└── __tests__/
    ├── parseProgressLine.test.ts     # NEW
    └── liveRunReducer.test.ts        # NEW

apps/desktop/electron/
├── assets/
│   └── suisui-progress-reporter.cjs  # NEW — the Playwright reporter, copied into the workspace
├── services/
│   └── RunnerService.ts              # EDIT — write the reporter, extend --reporter, split
│                                     #        sentinel lines out of the human log
├── utils/
│   └── playwrightReport.ts           # REUSE — extractFeatureRelativePath (unchanged)
├── ipc/handlers.ts                   # EDIT — forward parsed events on runner:progress
├── preload.ts                        # EDIT — onProgress binding
└── __tests__/
    ├── runnerProgress.test.ts        # NEW — FakeCommandRunner + canned sentinel output
    └── fixtures/progress-capture.ndjson  # NEW — recorded reporter output for replay

apps/desktop/app/
├── components/
│   ├── RunResultsPanel.vue           # EDIT — live scenario list, executing highlight, step detail
│   └── StepRow.vue                   # EDIT — per-step live status indicator
├── stores/
│   └── runner.ts                     # EDIT — live run state, subscribe/reset, reconcile at end
└── __tests__/
    └── liveRunProgress.test.ts       # NEW — store-level: ordering, reconcile, reset, parallel

apps/desktop/e2e/
└── live-run-progress.spec.ts         # NEW — scripted run output in APP_TEST_MODE
```

**Structure Decision**: Standard SuiSui split. The reporter is shipped as an **asset** (like
`electron/assets/generic.steps.ts` and `electron/scripts/recorder-adapter.js`) and copied into the
workspace at run time, because it must be loaded by the *workspace's* Playwright, not bundled into
the app's own module graph. Parser and reducer go to `packages/shared` so the same rules apply in
main (parsing) and renderer (state), and so both are testable as pure functions.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| A generated **reporter file written into the user's workspace** (`.app/suisui-progress-reporter.cjs`) | Playwright loads reporters by path, in the workspace's own process. Per-step timing is only observable from inside that process — no amount of parsing the `list` reporter's stdout can recover it, because `list` emits one line per test *after it finishes*. | Parsing existing output cannot work (the data is not there). A Playwright *plugin* or config edit would mutate the user's `playwright.config.ts`, which is far more invasive than a file in the already-git-ignored `.app/`. |
| The reporter file is **not unit-testable in isolation** (it only runs inside Playwright) | Principle III forbids running real Playwright in tests. | Covered instead by replaying a checked-in capture of its output through the real parser + reducer, mirroring the recorder's `FakeRecorderAdapter` + NDJSON fixture approach. The file is added to the coverage-exclude list beside `PlaywrightRecorderAdapter.ts` and `ElectronUpdaterAdapter.ts`. |

### Risk note — this feature depends on a third-party internal shape

`playwright-bdd` wraps each Gherkin step as `test.step(textWithKeyword, body, { location })`. That is
observable behaviour of a supported API, not a private hook — but the **mapping from a reported step
back to a step index in the editor** relies on steps arriving in authored order, one `test.step` per
Gherkin step.

Mitigations, in priority order:

1. Match by **ordinal** among `category === 'test.step'` entries (background steps first, then
   scenario steps — the order the editor displays them).
2. Carry the **step title** in every event so the renderer can verify the ordinal it matched and drop
   the status rather than mislabel a step when they disagree.
3. If neither resolves, the step simply shows no live status — the run and the final report are
   unaffected (FR-019).

A wrong mapping would paint a green tick on the wrong step, which is worse than showing nothing;
hence mitigation 2 is mandatory, not optional.

### Verified during planning (not assumptions)

- `playwright-bdd` 8.4.2 invokes `runStepWithLocation(test, stepTextWithKeyword, location, body)` per
  Gherkin step — so `step.title` is the step text **including its keyword**.
- That `location` points at the **generated spec file**, not the `.feature` file (the source comment
  says so explicitly). Step→editor mapping therefore cannot use step locations, which is why it is
  ordinal+title based. This corrected an early assumption and is the reason the risk note above
  exists.
- `extractFeatureRelativePath` already maps a generated spec path back to the `.feature` relative
  path and has tests; scenario→feature mapping needs no new logic.
- The `RUNNER_RUN_BATCH` handler already buffers stdout into complete lines before emitting, so a
  sentinel-prefixed NDJSON line can never arrive split.
