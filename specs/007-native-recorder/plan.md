# Implementation Plan: SuiSui-Native Playwright Recorder

**Branch**: `007-native-recorder` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-native-recorder/spec.md`

> **Re-plan note (post-clarify)**: This plan was regenerated after the 2026-07-24 clarifications. Phase 0 research from the first pass **stands** (the subprocess/adapter architecture is unchanged); it is **extended by decision D13** covering SuiSui's own in-browser element picker + suppression of Playwright's in-page overlay — a route research D4 already anticipated. The two clarifications folded in here: (1) SuiSui provides its **own picker** (no Playwright overlay), (2) the **full assertion set** ships in the MVP.

## Summary

Add a SuiSui-owned browser recorder that drives the **user's workspace Playwright** in a headed browser and converts interactions directly into editable, catalog-matched BDD scenario steps — never exposing Playwright's Inspector window **or its in-page overlay** (unifies issues #106 + #105). A killable **embedded-Node child process** (`recorder-adapter.js`, mirroring `RunnerService`) is the _only_ code that touches Playwright's private `context._enableRecorder({ recorderMode:'api' })` API; it streams normalized actions as NDJSON. The child **suppresses Playwright's overlay** and hosts **SuiSui's own in-browser element picker** (hover-highlight + one-shot click-capture) so choosing/adjusting a selector and defining an assertion both happen through SuiSui's UI — including asserting on elements the user never interacted with. The child also does its own DOM inspection to emit an **ElementFingerprint** + per-candidate uniqueness counts and to **redact secrets at the source** (a password value never leaves the subprocess). In the main process, `RecorderService` orchestrates the session and pushes live `RecordedAction`s / picked elements over AI-style streaming IPC; `LocatorService` turns fingerprints into scored, explained `LocatorCandidate[]` (pure/testable); `StepMatcherService` maps each action to an existing catalog step **deterministically first** (bundled generic-step map + `StepCatalogService.findMatchingSteps`), with an **optional, feature-flagged AI** stage validated against the real arg schema. The renderer gets a dedicated recorder workspace (Pinia `recorder` store + PrimeVue components) whose confirmed actions are inserted into the current scenario through the existing `scenario` store `addStep()` seam, keeping `toGherkin`/`parseGherkin` and feature-006 catalog behavior unchanged. Sensitive logins resolve to a Test Profile name (#98) or a named secret reference; unmatched actions become gaps routed to missing-step stubs (#100). All serializable recorder types live in `@suisui/shared` (SSoT); the whole pipeline is DI-seamed so tests replay NDJSON fixtures and never launch a real browser (Principle III). Delivery follows the spec's P1→P3 story order; the **full assertion set** ships in Phase 4; AI (US6) ships last behind a flag.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 21.x (repo/tests use 22; recorder child uses the app's embedded Node 22.13.1)  
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x. **No new bundled dependency** — the recorder drives the **workspace's** Playwright (`>=1.49 <1.61` supported) via the app's existing embedded Node; reuses `@suisui/step-catalog` (feature 006), `RunnerService`/`NodeService` infra (feature 002), the AI provider seam (feature 005), and the `safeStorage`/`.app/` pattern (feature 003, via #98 for credentials)  
**Storage**: In-memory session state (main `RecorderService` + renderer `recorder` store). No new persisted store: secrets are redacted (never stored); provenance stays in the renderer/optional `.app/` sidecar (deferred); source locations come from the catalog  
**Testing**: Vitest 2.x — pure services (locator scoring, matcher, secret masking, assertion conversion, action normalization, AI-response validation) on in-memory fixtures; `RecorderService` against a `FakeRecorderAdapter` replaying checked-in NDJSON (actions **and** picked-element events). E2E (`APP_TEST_MODE=1`) uses the fake adapter — **no real Chromium in CI**. The real `PlaywrightRecorderAdapter` (incl. overlay suppression + own picker) has a manual/opt-in integration harness only  
**Target Platform**: Cross-platform desktop (Windows, macOS, Linux); child paths/env resolved as `RunnerService` does  
**Project Type**: Desktop app (Electron main + Nuxt renderer) + shared types in a pnpm monorepo — **no new workspace package**  
**Performance Goals**: A captured interaction appears as a card < 300 ms after it happens; a picked element returns to the UI < 300 ms after the click; locator scoring < 50 ms/action; a session of ≥100 actions loses none (SC-010)  
**Constraints**: Private `_enableRecorder` isolated behind a single adapter + capability probe + version gate, failing gracefully (never a crash); **Playwright's in-page overlay is suppressed and SuiSui hosts its own picker/highlight**; renderer never imports Node/Playwright; secret values never cross the stdio/IPC boundary; browser runs in the workspace context (cwd, `NODE_PATH`, `BASE_URL`); no raw Playwright code as the primary model; AI never required for basic recording  
**Scale/Scope**: 10 MVP action types + **full assertion set (9 types)**; ~4 new interaction generic steps + assertion generic steps; own picker (pick/cancel + picked event); 4 new main-process services + 1 child script; ~8 request/response + 5 event IPC channels; 5 new renderer components + 1 store; delivery in phases mapped to user stories P1–P3 (+P2 locators/secrets/assertions, P3 source-link & AI)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Gate                                                                                                                                                                                                                                                                                                                                                           | Status                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| I. Process Isolation                 | Playwright, the child process, DOM inspection, the picker/overlay, scoring, matching, and secret redaction live **only** in main/child; the renderer touches the recorder solely via `window.api.recorder` + the Pinia store. No Node/Playwright import in `app/`. Secrets never reach the renderer.                                                           | ✅ Pass                           |
| II. Typed IPC Contracts              | New `recorder:*` channels (start/stop/pause/resume/pick/cancelPick/highlight/validateLocator + action/actionUpdated/picked/status/error events) added to all five touchpoints with validated payloads; all recorder types in `@suisui/shared`.                                                                                                                 | ✅ Pass (enforced in tasks)       |
| III. Test Isolation (NON-NEGOTIABLE) | `RecorderService` uses an injected `IRecorderAdapter`; CI/unit/E2E use `FakeRecorderAdapter` replaying NDJSON (actions + picked events) — **no real Playwright/Chromium/CLI, no network**. Pure services tested on in-memory fixtures. Real adapter (overlay suppression + picker) is manual/opt-in only.                                                      | ✅ Pass (see Complexity Tracking) |
| IV. Service Pattern                  | `RecorderService`, `LocatorService`, `StepMatcherService`, `AssertionSuggestionService` = singleton factory + constructor DI (inject adapter/spawner, catalog service, clock).                                                                                                                                                                                 | ✅ Pass                           |
| V. Shared Package SSoT               | All serializable recorder types (`RecordedAction`, `PickedElement`, `LocatorReference`, `LocatorCandidate`, `ElementFingerprint`, `StepMatch`, `RecorderStatus`, `RecorderError`, `RecorderStartOptions`, `RecorderLocatorSettings`, …) in `@suisui/shared/src/types/recorder.ts`; rebuild after changes. Adapter/child-internal types stay in `apps/desktop`. | ✅ Pass                           |
| VI. Simplicity (YAGNI)               | MVP = deterministic US1–US3 + the picker (required to replace the overlay) + full assertion set. Source-link (US5) reuses existing seams; AI (US6) is a deferred, flagged stage behind the same matcher interface. No new package, no `ScenarioStep` schema change, no bundled Playwright, no persisted recorder store.                                        | ✅ Pass (see Complexity Tracking) |

**Additional stack rules honored**: `any` prohibited (use `unknown`, esp. at the NDJSON boundary — validate then narrow); Composition API + `<script setup lang="ts">` for all recorder components; PascalCase services, `getRecorderService()` factory, `SCREAMING_SNAKE_CASE` channels; pre-commit lint/typecheck/test gates; shared rebuild rule; IPC 5-touchpoint checklist.

**Result**: PASS — no unjustified violations. Three decisions carry documented justification in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-native-recorder/
├── plan.md              # This file
├── research.md          # Phase 0 output (D1–D13)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ipc-recorder.md          # recorder:* channels (5 touchpoints), incl. pick/picked
│   ├── adapter-protocol.md      # NDJSON child↔parent protocol + capability probe + overlay suppression + picker
│   ├── locator-scoring.md       # candidate scoring + generated-value detection algorithm
│   └── action-step-mapping.md   # RecordedActionType → generic step map (incl. full assertion set)
├── checklists/
│   └── requirements.md  # from /speckit.specify
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/recorder.ts                        # NEW serializable recorder contracts (SSoT), incl. PickedElement
├── types/settings.ts                        # + recorderAiEnabled, recorderLocatorSettings
├── ipc/channels.ts                          # + RECORDER_* (request/response + event channels)
├── ipc/api.ts                               # + recorder namespace (methods + onXxx events)
└── index.ts                                 # export new types

apps/desktop/electron/
├── services/recorder/
│   ├── RecorderService.ts                   # NEW singleton+DI: session lifecycle, child mgmt, emits RecordedAction/PickedElement
│   ├── PlaywrightRecorderAdapter.ts         # NEW real IRecorderAdapter (spawn child, NDJSON, capability probe)
│   ├── IRecorderAdapter.ts                  # NEW seam interface + FakeRecorderAdapter (tests)
│   ├── LocatorService.ts                    # NEW pure scoring: ElementFingerprint → LocatorCandidate[]
│   ├── StepMatcherService.ts                # NEW deterministic matcher (+ optional AI stage)
│   ├── AssertionSuggestionService.ts        # NEW before/after page-diff → suggestions (P2)
│   ├── genericStepRecorderMap.ts            # NEW static map: generic step pattern → {action,targetArg,...} (incl. asserts)
│   └── secretDetection.ts                   # NEW field-classification + reference helpers (mirror of child logic)
├── services/index.ts                        # export getRecorderService() (+ others)
├── scripts/recorder-adapter.js              # NEW child: workspace Playwright + _enableRecorder(api); suppress PW overlay;
│                                            #      own hover-highlight + one-shot picker; DOM inspect; redact secrets
├── ipc/handlers.ts                          # + RECORDER_* handlers (validated I/O, session registry, SIGTERM)
├── preload.ts                               # + window.api.recorder bindings (invoke + onXxx=>unsubscribe)
└── assets/generic.steps.ts                  # + check/uncheck/press/upload steps; + full assertion set via expect()

apps/desktop/app/
├── stores/recorder.ts                       # NEW Pinia store: actions[], selection, status, pick state; edits; insert into scenario
└── components/recorder/
    ├── RecorderPanel.vue                     # controls + two-pane layout + browser status
    ├── RecordedActionCard.vue                # readable description + per-action actions
    ├── LocatorCandidateSelector.vue          # candidates + reliability + reasons/warnings + highlight + "pick a different element"
    ├── AssertionPicker.vue                    # assertion mode: "pick element" → full-set assertion choice + suggestions (P2)
    └── StepMatchSelector.vue                 # matched step + alternatives + Open implementation

apps/desktop/app/components/ScenarioBuilder.vue   # + "Record" entry point wiring the panel to the current scenario
apps/desktop/e2e/fixtures/recorder/               # NEW checked-in NDJSON fixtures (actions + picked) + local fixture pages
```

**Structure Decision**: Extend `apps/desktop` — **no new workspace package** (unlike feature 006), because the recorder is desktop-app behavior, not a reusable engine. Serializable cross-process types go in `@suisui/shared` (Principle V); the private-API-aware code (incl. overlay suppression + the injected picker) is confined to two files (`PlaywrightRecorderAdapter.ts` + `recorder-adapter.js`) behind the `IRecorderAdapter` seam. The renderer consumes the recorder only through typed IPC + the Pinia store, and inserts steps only through the existing `scenario` store — so `toGherkin/parseGherkin` and the feature-006 catalog path are untouched.

## Complexity Tracking

| Decision                                                                                                                     | Why Needed                                                                                                                                                                                                                                                                                             | Simpler Alternative Rejected Because                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependence on Playwright's private `_enableRecorder` (`recorderMode:'api'`) + suppressing its in-page overlay                | It is the only headless recording API; the Inspector UI **and its in-page overlay** are explicitly rejected (spec/#105/#106), and there is no public equivalent. Isolated behind one adapter + child script + capability probe + version gate.                                                         | A hand-rolled CDP recorder would re-implement Playwright's selector engine and event model (far more code + drift); the Inspector/overlay UI is the exact UX #106 removes.                                                                                                             |
| New long-lived **bidirectional** child process managed by `RecorderService` (not `CommandRunner`)                            | The recorder needs interactive stdin (pause/resume/goto/pick/cancelPick/highlight/validate), a persistent per-session process, and live streaming — `CommandRunner.exec` is one-shot, has no stdin, and doesn't expose the `ChildProcess`.                                                             | Extending `CommandRunner` to be interactive/bidirectional would bloat a deliberately simple one-shot abstraction used everywhere else (Principle VI). A dedicated, DI-seamed child manager is the minimum.                                                                             |
| SuiSui builds its **own** locator candidates **and its own in-browser element picker** (child DOM inspection + main scoring) | Playwright's `api` sink emits one opinionated selector per action and does **not** surface element-pick events; the spec requires ranked/explained candidates with manual override (FR-007–FR-011) **and** picking any element for a selector or an assertion, replacing the overlay (FR-001a/FR-027). | Trusting Playwright's single selector cannot satisfy ranking/override; and there is no api-mode pick event to reuse, so the picker must be SuiSui's. Doing the scoring in the child would couple the deterministic algorithm to a live browser and block unit testing (Principle III). |

## Phase Mapping (delivery order = spec user stories)

| Phase | Spec story        | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | US1 (P1)          | Shared recorder types + `recorder:*` IPC (streaming); `IRecorderAdapter` seam + `FakeRecorderAdapter`; `RecorderService` session lifecycle + child spawn (`recorder-adapter.js`, capability probe, NDJSON, SIGTERM); action **normalization** (Playwright action → `RecordedAction` with a best-guess target); Stage-1 deterministic matching via `genericStepRecorderMap` + `StepCatalogService`; `recorder` store; `RecorderPanel`/`RecordedActionCard`/`StepMatchSelector`; **insert into scenario** via `addStep`; add check/uncheck/press/upload generic steps. Result: record → readable cards → matched steps → valid runnable `.feature`. |
| 2     | US2 (P2)          | Child `ElementFingerprint` + per-candidate uniqueness; `LocatorService` scoring + generated-value detection + reliability buckets; **overlay suppression + SuiSui picker/highlight** (child) and `recorder:pick`/`cancelPick`/`highlight`/`validateLocator` + `recorder:picked` (D13); `LocatorCandidateSelector` (candidates, reasons/warnings, highlight, **"pick a different element"**); `RecorderLocatorSettings` in settings + honored in ranking.                                                                                                                                                                                          |
| 3     | US3 (P2)          | Child **secret redaction** (never emits the value); main marks secret + emits a committable reference; **Test Profile (#98)** resolution for recognized logins, else named secret reference; UI shows "a protected value"; AI payloads provably exclude secrets.                                                                                                                                                                                                                                                                                                                                                                                  |
| 4     | US4 (P2)          | Assertion mode (`AssertionPicker`) using the SuiSui picker to target any element; **full assertion set** (visible, hidden, contains text, has value, is checked, is enabled, has element count, URL contains/equals, page title contains/equals) over genuine `expect` steps; `AssertionSuggestionService` before/after page diff → optional suggestions (accept/edit/reject, never auto-added).                                                                                                                                                                                                                                                  |
| 5     | US5 (P3)          | "Open implementation" from any step/card using the catalog's `StepSourceLocation` + configured/system editor; distinct IDs for same-pattern-different-location steps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 6     | US6 (P3) + polish | Optional AI stage in `StepMatcherService` (validated JSON, confidence gates), action grouping + approval-based locator repair (#103), all behind `recorderAiEnabled`; gap → missing-step stub handoff (#100) wiring; docs (ARCHITECTURE/SERVICES/IPC_TYPES/FRONTEND) + CLAUDE.md.                                                                                                                                                                                                                                                                                                                                                                 |

## Progress

- [x] Phase 0: research.md (D1–D13; extended post-clarify)
- [x] Phase 1: data-model.md, contracts/, quickstart.md, agent context updated
- [x] Constitution re-check post-design (below)
- [ ] Phase 2: tasks.md (via `/speckit.tasks`)

### Post-Design Constitution Re-Check

Re-evaluated after the clarify-driven updates (own picker + full assertion set): no new violations. The picker/overlay-suppression code stays inside the single adapter/child seam (I); pick is added as validated `recorder:*` channels with a serializable `PickedElement` in shared (II, V); the picker is exercised through the `IRecorderAdapter` fake with picked-event fixtures, so no real browser in tests (III); services stay singleton + injectable (IV); the full assertion set reuses the existing generic-step + matcher machinery — no new abstraction — and AI/grouping/persisted provenance remain deferred seams (VI). `ScenarioStep`/Gherkin unchanged. **PASS.**
