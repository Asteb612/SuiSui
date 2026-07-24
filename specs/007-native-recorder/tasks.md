---
description: 'Task list for the SuiSui-Native Playwright Recorder'
---

# Tasks: SuiSui-Native Playwright Recorder

**Input**: Design documents from `/specs/007-native-recorder/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D13), data-model.md, contracts/ (ipc-recorder, adapter-protocol, locator-scoring, action-step-mapping)

**Tests**: INCLUDED — Constitution Principle III (Test Isolation) is NON-NEGOTIABLE and the spec lists explicit unit + E2E coverage. Every test runs against the injected `FakeRecorderAdapter` replaying checked-in NDJSON fixtures or on in-memory fixtures — **no real Chromium/Playwright/CLI/network in CI**. The real `PlaywrightRecorderAdapter` + child script are validated by a manual/opt-in harness only.

**Organization**: Tasks are grouped by user story (US1–US6) to enable independent implementation and testing. Each story is independently testable because its behavior is exercised through the `FakeRecorderAdapter` seam, regardless of the real browser path.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US6 (Setup/Foundational/Polish carry no story label)
- Paths are repo-relative and exact.

## Path Conventions

- Shared types/IPC: `packages/shared/src/…`
- Electron main: `apps/desktop/electron/…` (services in `services/recorder/`, unit tests in `electron/__tests__/recorder/`)
- Renderer: `apps/desktop/app/…`
- E2E + fixtures: `apps/desktop/e2e/…`
- After any `packages/shared/` change: `pnpm --filter @suisui/shared build` (Principle V).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the recorder directories and fixture scaffolding.

- [x] T001 Create `apps/desktop/electron/services/recorder/` and `apps/desktop/electron/__tests__/recorder/` directories per plan structure.
- [x] T002 [P] Create `apps/desktop/app/components/recorder/` and `apps/desktop/e2e/fixtures/recorder/pages/` directories (fixture pages for the manual harness).

**Checkpoint**: Directory skeleton exists; nothing wired yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared serializable types, recorder IPC plumbing, the `IRecorderAdapter` seam + fake, and the `RecorderService` skeleton — everything ALL stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Shared serializable contract (SSoT, Principle V)

- [x] T003 Define all serializable recorder types in `packages/shared/src/types/recorder.ts` per data-model.md (enums: `RecordedActionType`, `RecordedActionStatus`, `RecorderStatusPhase` incl. `picking`, `PickPurpose`, `LocatorKind`, `MatchSource`, `Reliability`, `RecorderErrorCode`; `LocatorReference`, `LocatorCandidate`, `ElementFingerprint`, `RecordedAction`, `StepMatch`, `RecorderStartOptions`, `RecorderSession`, `RecorderStatus`, `RecorderError`, `RecorderLocatorSettings`, `LocatorValidationResult`, `PickedElement`).
- [x] T004 [P] Add `recorderAiEnabled?: boolean` and `recorderLocatorSettings?: RecorderLocatorSettings` to `AppSettings` in `packages/shared/src/types/settings.ts`.
- [x] T005 Export recorder types from `packages/shared/src/index.ts`, then run `pnpm --filter @suisui/shared build`.

### IPC plumbing (Principle II — 5 touchpoints)

- [x] T006 Add `RECORDER_*` channels (start/stop/pause/resume/pick/cancelPick/highlight/validateLocator + action/actionUpdated/picked/status/error) to `packages/shared/src/ipc/channels.ts`.
- [x] T007 Add the `recorder` namespace (methods + `onXxx` event subscriptions returning unsubscribe fns) to `packages/shared/src/ipc/api.ts` per `contracts/ipc-recorder.md`, then rebuild shared.

### Adapter seam + service skeleton (Principle IV)

- [x] T008 Define `IRecorderAdapter` (start/stop/pause/resume/pick/cancelPick/highlight/validateLocator + `onAction/onActionUpdated/onPicked/onSignal/onStatus/onError` callbacks) in `apps/desktop/electron/services/recorder/IRecorderAdapter.ts`.
- [x] T009 [P] Implement `FakeRecorderAdapter` (replays checked-in NDJSON: action, picked, status, error lines; honors stop/pause/pick commands) in `apps/desktop/electron/services/recorder/FakeRecorderAdapter.ts`.
- [x] T010 Implement `RecorderService` skeleton (singleton `getRecorderService()`; constructor DI of `IRecorderAdapter` + a clock/spawner; single-session registry; emitter fan-out) in `apps/desktop/electron/services/recorder/RecorderService.ts`; export from `apps/desktop/electron/services/index.ts`.
- [x] T011 Wire `RECORDER_*` handlers (validated payloads via `validateRecorderStartOptions`/`validateLocatorReference`/`validatePickRequest`, `isDestroyed()` guards, session registry, `SIGTERM` teardown; inject `FakeRecorderAdapter` under `APP_TEST_MODE`) in `apps/desktop/electron/ipc/handlers.ts`.
- [x] T012 Add `window.api.recorder` bindings (invoke methods + `onXxx(cb)=>unsubscribe` via per-listener `removeListener`) in `apps/desktop/electron/preload.ts`.

**Checkpoint**: `pnpm typecheck` passes monorepo-wide; `recorder:start` round-trips against `FakeRecorderAdapter` and returns an empty session. User stories can now begin.

---

## Phase 3: User Story 1 - Record a browser session and build a scenario (Priority: P1) 🎯 MVP

**Goal**: Record navigate/click/fill/select/check/uncheck/press/upload, show readable cards matched to bundled generic steps (deterministic, no AI), and insert confirmed steps into the current scenario producing a valid, runnable `.feature`.

**Independent Test**: Replay `login.ndjson` through `FakeRecorderAdapter` → navigation + click + fill cards appear in order, each matched to a generic step; confirm inserts valid `ScenarioStep`s; the exported feature is valid Gherkin.

### Tests for User Story 1 (write first, ensure they fail)

- [x] T013 [P] [US1] Unit test action normalization (`RawPlaywrightAction` → `RecordedAction`: navigate/click/doubleClick/fill/select/check/uncheck/press/upload; label building; `seq` ordering) in `apps/desktop/electron/__tests__/recorder/normalization.test.ts`.
- [x] T014 [P] [US1] Unit test `StepMatcherService` stage-1 (each action type → expected generic pattern + args from label/value; missing step → `gap`; missing required arg → `needs-review`) with a fake catalog in `apps/desktop/electron/__tests__/recorder/stepMatcher.test.ts`.
- [x] T015 [P] [US1] Unit test `RecorderService` against `FakeRecorderAdapter` (start→actions→stop; `seq` order preserved for ≥100 actions per SC-010; status/error events) in `apps/desktop/electron/__tests__/recorder/recorderService.test.ts`.
- [x] T016 [P] [US1] E2E: start/stop a session, replay nav+click+fill NDJSON, insert into a scenario, assert valid feature output in `apps/desktop/e2e/recorder/record-insert.spec.ts` (`APP_TEST_MODE`, `FakeRecorderAdapter`).

### Implementation for User Story 1

- [x] T017 [P] [US1] Create checked-in NDJSON fixture `apps/desktop/e2e/fixtures/recorder/login.ndjson` (ready → nav /login → fill Email → fill Password(secret) → click login-submit → stop).
- [x] T018 [P] [US1] Add `check`/`uncheck`/`press`/`upload` generic steps to `apps/desktop/electron/assets/generic.steps.ts` (real playwright-bdd `createBdd` steps).
- [x] T019 [P] [US1] Create `apps/desktop/electron/services/recorder/genericStepRecorderMap.ts` with interaction entries (navigate/click/fill/select/check/uncheck/press/upload) per `contracts/action-step-mapping.md`.
- [x] T020 [US1] Implement action normalization + human-readable label builder in `apps/desktop/electron/services/recorder/RecorderService.ts` (or a `normalize.ts` helper) — derives a best-guess `selectedLocator` from the Playwright selector (candidates deferred to US2).
- [x] T021 [US1] Implement `StepMatcherService` stage-1 in `apps/desktop/electron/services/recorder/StepMatcherService.ts` (uses `genericStepRecorderMap` + `getStepCatalogService().findMatchingSteps`; emits `match` + `matchAlternatives`; `gap`/`needs-review` status).
- [x] T022 [US1] Wire the `RecorderService` pipeline in `apps/desktop/electron/services/recorder/RecorderService.ts`: adapter action → normalize → match → emit `recorder:action`/`actionUpdated` (with alternatives) over IPC.
- [x] T023 [US1] Implement the real `PlaywrightRecorderAdapter` (`apps/desktop/electron/services/recorder/PlaywrightRecorderAdapter.ts`) + child `apps/desktop/electron/scripts/recorder-adapter.js` — **capture only**: spawn embedded Node with workspace Playwright (`cwd`/`NODE_PATH` like `RunnerService`), `_enableRecorder({recorderMode:'api'})`, NDJSON action stream, capability probe + version gate (`>=1.49 <1.61`), `SIGTERM`. (Manual-validated; overlay suppression + picker land in US2.)
- [x] T024 [P] [US1] Create the `recorder` Pinia store in `apps/desktop/app/stores/recorder.ts` (state: `sessionId/status/actions/selectedActionId/browserUrl/error/isDirty`; actions: start/stop/pause/resume, updateAction/removeAction/moveAction/acceptAction/selectStepMatch, `insertAcceptedActionsIntoScenario` → `scenario` store `addStep`/`insertStepAt`; subscribes to `onAction/onActionUpdated/onStatus/onError`, unsubscribes on teardown).
- [x] T025 [P] [US1] Create `apps/desktop/app/components/recorder/RecordedActionCard.vue` (readable description + per-action menu: edit/delete/disable/move/add-to-scenario).
- [x] T026 [P] [US1] Create `apps/desktop/app/components/recorder/StepMatchSelector.vue` (matched step + alternatives switch).
- [x] T027 [US1] Create `apps/desktop/app/components/recorder/RecorderPanel.vue` (Record/Pause/Stop controls + two-pane layout + browser status; wires store subscriptions).
- [x] T028 [US1] Add a "Record" entry point in `apps/desktop/app/components/ScenarioBuilder.vue` opening `RecorderPanel` bound to the current scenario.

**Checkpoint**: MVP — record → readable cards → deterministic matches → confirm → valid runnable `.feature` (SC-001/002/005/010). Fully testable via the fake adapter.

---

## Phase 4: User Story 2 - Reliable, explainable element targeting (Priority: P2)

**Goal**: Rank locator candidates with scores/reasons/warnings; suppress Playwright's overlay and provide SuiSui's own hover-highlight + click-to-pick so the user can re-target an action by clicking any element (D13).

**Independent Test**: A `data-testid`+generated-CSS element (from a picked/action fixture) → `data-testid` recommended `excellent`, generated-class candidate warned; "pick a different element" replays a `picked` fixture and re-derives candidates.

### Tests for User Story 2 (write first, ensure they fail)

- [x] T029 [P] [US2] Unit test `LocatorService` scoring (candidate generation order, base scores, uniqueness cap + warning, reliability buckets, recommendation, naming order §7) in `apps/desktop/electron/__tests__/recorder/locatorService.test.ts`.
- [x] T030 [P] [US2] Unit test generated-value detection (UUID/hex-hash/CSS-module/random-suffix/long-digits/nth-child) in `apps/desktop/electron/__tests__/recorder/generatedValue.test.ts`.
- [x] T031 [P] [US2] E2E: detect `data-testid`/`data-cy`, prefer role over unstable CSS, switch candidate, and pick-to-retarget via a `picked` NDJSON fixture in `apps/desktop/e2e/recorder/locators.spec.ts`.

### Implementation for User Story 2

- [x] T032 [P] [US2] Implement `LocatorService` (`apps/desktop/electron/services/recorder/LocatorService.ts`) — pure `ElementFingerprint` + raw candidates → scored `LocatorCandidate[]` per `contracts/locator-scoring.md`.
- [x] T033 [US2] Extend `recorder-adapter.js`: `ElementFingerprint` extraction + per-candidate uniqueness (`querySelectorAll(sel).length`) via `page.evaluate`; attach to action events.
- [x] T034 [US2] Extend `recorder-adapter.js`: overlay suppression (`x-pw-glass{opacity:0!important;pointer-events:none!important}` via `addInitScript`+`addStyleTag`), SuiSui hover-highlight + one-shot `window`-capture picker, `__pw_recorderSetMode('none'|'recording')` pause/resume; implement `pick`/`cancelPick`/`highlight`/`validate` commands + `picked`/`pickCancelled` events (D13).
- [x] T035 [US2] Extend `RecorderService` (`apps/desktop/electron/services/recorder/RecorderService.ts`): `pick`/`cancelPick`/`highlight`/`validateLocator` methods; score picked candidates via `LocatorService`; emit `recorder:picked`; handle `picking` status.
- [x] T036 [P] [US2] Honor `RecorderLocatorSettings` in `apps/desktop/electron/services/recorder/LocatorService.ts` ranking + persist/read `recorderLocatorSettings` via `apps/desktop/electron/services/SettingsService.ts`.
- [x] T037 [P] [US2] Create `apps/desktop/app/components/recorder/LocatorCandidateSelector.vue` (candidates + reliability + reasons/warnings + Highlight + "pick a different element" → `recorder.pick({purpose:'retarget',actionId})`).
- [x] T038 [US2] Wire the store pick flow in `apps/desktop/app/stores/recorder.ts` (`pick`/`cancelPick`; `onPicked` retarget → replace `locatorCandidates`/`selectedLocator`) and add `picked` NDJSON fixtures under `apps/desktop/e2e/fixtures/recorder/`.

**Checkpoint**: US1 + US2 — trustworthy, explainable targeting with SuiSui's own picker; Playwright's overlay suppressed (SC-003/006/011).

---

## Phase 5: User Story 3 - Protect credentials and sensitive data (Priority: P2)

**Goal**: Detect sensitive fields, redact values at the source (never cross stdio/IPC), and represent them as a Test Profile name (#98) or a named secret reference.

**Independent Test**: A password `fill` fixture (already `secret:true`, no value) → card shows "a protected value"; inserted step uses a committable name; no value appears in any AI payload.

### Tests for User Story 3 (write first, ensure they fail)

- [x] T039 [P] [US3] Unit test `secretDetection` (password input / `autocomplete` / name-substring heuristics) + the redaction invariant (`value` undefined ⇔ `secret` true, `secretRef` set) in `apps/desktop/electron/__tests__/recorder/secret.test.ts`.
- [x] T040 [P] [US3] E2E: record a protected password → masked card + secret reference in the inserted step + absent from the AI request payload in `apps/desktop/e2e/recorder/secret.spec.ts`.

### Implementation for User Story 3

- [x] T041 [P] [US3] Implement `apps/desktop/electron/services/recorder/secretDetection.ts` (field classification + secret-reference naming; `<UPPER_SNAKE>` default).
- [x] T042 [US3] Extend `recorder-adapter.js`: classify sensitive fields during the fingerprint `page.evaluate` and **omit** the value (`secret:true`) before it leaves the child.
- [x] T043 [US3] Extend `RecorderService` (`apps/desktop/electron/services/recorder/RecorderService.ts`): re-assert the secret invariant; resolve a recognized login sequence to a Test Profile name when #98 is available, else a named secret reference (`secretRef`).
- [x] T044 [P] [US3] UI in `apps/desktop/app/components/recorder/RecordedActionCard.vue`: show "a protected value"; allow renaming the secret reference / choosing a profile.

**Checkpoint**: Zero cleartext secrets anywhere, incl. AI payloads (SC-004/004a).

---

## Phase 6: User Story 4 - Record and suggest assertions (Priority: P2)

**Goal**: Assertion mode using SuiSui's picker to target any element (incl. never-interacted), with the **full assertion set** over genuine `expect` steps, plus optional before/after suggestions.

**Independent Test**: A `picked` fixture for a never-interacted heading → choose each of visible/hidden/text/value/checked/enabled/count/URL/title → correct "Verify …" step with args; a URL-changing action offers a suggestion that is not auto-added.

### Tests for User Story 4 (write first, ensure they fail)

- [x] T045 [P] [US4] Unit test assertion conversion for the full set (visible/hidden/text/value/checked/enabled/count/URL/title → expect-based generic step + args) in `apps/desktop/electron/__tests__/recorder/assertions.test.ts`.
- [x] T046 [P] [US4] E2E: assertion mode picks a never-interacted element (picked fixture), add each full-set assertion, and verify a suggestion is offered-but-not-auto-added in `apps/desktop/e2e/recorder/assertions.spec.ts`.

### Implementation for User Story 4

- [x] T047 [P] [US4] Add the full assertion generic steps (genuine `expect`) to `apps/desktop/electron/assets/generic.steps.ts` and their entries to `genericStepRecorderMap.ts` per `contracts/action-step-mapping.md`.
- [x] T048 [P] [US4] Implement `apps/desktop/electron/services/recorder/AssertionSuggestionService.ts` (before/after page-state diff → optional suggestions; never auto-added).
- [x] T049 [US4] Create `apps/desktop/app/components/recorder/AssertionPicker.vue` (assertion mode → `recorder.pick({purpose:'assert'})` → `onPicked` → choose a full-set assertion type → produce the `assert*` `RecordedAction`; suggestions accept/edit/reject).
- [x] T050 [US4] Wire assertion actions into `apps/desktop/app/stores/recorder.ts` + `apps/desktop/electron/services/recorder/StepMatcherService.ts` (`assert*` → assertion generic steps) and surface page-diff suggestions in `apps/desktop/app/components/recorder/AssertionPicker.vue`.

**Checkpoint**: Full-set assertions recorded as genuine checks; picker targets any element (SC-011/012).

---

## Phase 7: User Story 5 - Open the implementation behind any step (Priority: P3)

**Goal**: Jump from any recorded/hand-picked step to its definition's source file+line via the catalog's `StepSourceLocation`.

**Independent Test**: Two steps sharing a pattern at different locations each open their own file:line; an unknown-location step disables the action.

### Tests for User Story 5 (write first, ensure they fail)

- [x] T051 [P] [US5] Test that "Open implementation" resolves distinct `file:line` for same-pattern-different-location steps and is disabled when unknown in `apps/desktop/e2e/recorder/open-impl.spec.ts`.

### Implementation for User Story 5

- [x] T052 [US5] Add an "Open implementation" action wired from `StepMatchSelector.vue`/`RecordedActionCard.vue` using `StepMatch.definitionLocation` (catalog `getStepById`) → open via a system/editor IPC (`system:openInEditor`; add the channel to the 5 touchpoints if not present); unavailable when location unknown.

**Checkpoint**: Traceability from every step to its source (SC-009).

---

## Phase 8: User Story 6 - Optional AI-assisted enhancements (Priority: P3)

**Goal**: Behind `recorderAiEnabled` + a configured provider — suggest matches (validated), group actions, and repair locators — never silently; plus gap → missing-step stub handoff.

**Independent Test**: With AI off, the full record→insert flow works (SC-007). With AI on, a low-confidence/schema-invalid suggestion is neither preselected nor accepted; a valid high-confidence one is preselected but requires confirmation.

### Tests for User Story 6 (write first, ensure they fail)

- [x] T053 [P] [US6] Unit test AI match validation (valid / unknown-`definitionId` / arg-schema mismatch / low-confidence → not preselected/discarded) via `FakeAIProvider` in `apps/desktop/electron/__tests__/recorder/aiMatch.test.ts`.
- [x] T054 [P] [US6] Unit test that the deterministic pipeline is unchanged with AI disabled (no provider configured) in `apps/desktop/electron/__tests__/recorder/aiDisabled.test.ts`.

### Implementation for User Story 6

- [x] T055 [US6] Add the AI stage to `apps/desktop/electron/services/recorder/StepMatcherService.ts` (gated on `recorderAiEnabled` + provider present; `AIService.stream` → parse JSON `{definitionId,arguments,confidence,reason}`; validate against the catalog step's arg schema; confidence gates ≥0.90/0.65–0.89/<0.65; never auto-accept; secrets excluded).
- [x] T056 [P] [US6] Action grouping proposal + approval-based locator repair (#103) in `apps/desktop/electron/services/recorder/StepMatcherService.ts` (+ store confirm UI in `apps/desktop/app/stores/recorder.ts`) — propose → inspect affected actions → explicit confirm; never silent (FR-031/032).
- [x] T057 [P] [US6] Wire gap → missing-step stub handoff (#100) from `gap`-status actions in `apps/desktop/app/stores/recorder.ts` (offer route; matched actions stay insertable).

**Checkpoint**: AI is a confirmed-only accelerator; basic recording never depends on it.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Docs, remaining coverage, perf, and validation across stories.

- [x] T058 [P] Update `doc/ARCHITECTURE.md`, `doc/SERVICES.md` (`electron/services/recorder/`), `doc/IPC_TYPES.md` (`recorder:*`), `doc/FRONTEND.md` (`useRecorderStore` + recorder components), and add a recorder section to `CLAUDE.md`.
- [x] T059 [P] Add remaining unit tests: every `RecorderErrorCode` yields a specific message + recovery (SC-008); ≥100-action ordering (SC-010); pick-cancel path in `apps/desktop/electron/__tests__/recorder/errors.test.ts`.
- [x] T060 Run the quickstart.md flow end-to-end against the fake adapter; execute the manual harness checklist for the real adapter (overlay suppressed, own picker/highlight work — D13) in `apps/desktop/e2e/fixtures/recorder/pages/`.
- [x] T061 Perf validation (action→card < 300 ms; picked→UI < 300 ms; scoring < 50 ms/action) + cleanup; ensure `pnpm lint:fix` / `pnpm typecheck` / `pnpm test` all pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (types + IPC + adapter seam + service skeleton).
- **User Stories (Phases 3–8)**: all depend on Foundational. Delivery order = priority P1 → (P2 ×3) → (P3 ×2).
- **Polish (Phase 9)**: after the desired stories.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories. Real adapter = capture-only.
- **US2 (P2)**: after Foundational; independently testable via fake `picked` fixtures. Extends `recorder-adapter.js` (fingerprint/candidates + overlay suppression + picker).
- **US3 (P2)**: after Foundational; extends `recorder-adapter.js` (redaction). Independent of US2 in CI (fixtures carry `secret:true`).
- **US4 (P2)**: uses the picker from **US2** (assertion targets are picked) → sequence US2 → US4; testable via `picked` fixtures.
- **US5 (P3)**: after Foundational; only needs a `StepMatch` with a location (available from US1).
- **US6 (P3)**: after US1 (matcher exists); AI stage is additive and flagged off by default.

### Cross-story file note (real adapter)

`apps/desktop/electron/scripts/recorder-adapter.js` is created in US1 (T023) and **extended sequentially** in US2 (T033/T034) and US3 (T042) — these tasks touch the same file and are **not** parallel with each other. This does **not** couple the _tests_: all CI tests use `FakeRecorderAdapter`, so every story stays independently testable.

### Within Each User Story

- Tests (write first, ensure they fail) → services/models → adapter/child extension → store → components → wiring.
- After any `packages/shared/` edit: rebuild shared before dependent typecheck/test.

### Parallel Opportunities

- Setup T001/T002; Foundational T004/T009 (with their prerequisites); all `[P]` test tasks within a story; independent services/components marked `[P]`.
- Once Foundational completes, US1, US3, US5, US6 can be staffed largely in parallel; US4 waits on US2's picker.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files, run together — expect them to FAIL):
T013 normalization.test.ts   T014 stepMatcher.test.ts
T015 recorderService.test.ts T016 record-insert.spec.ts

# Then independent implementation files in parallel:
T017 login.ndjson   T018 generic.steps.ts   T019 genericStepRecorderMap.ts
T024 stores/recorder.ts   T025 RecordedActionCard.vue   T026 StepMatchSelector.vue
# Sequential (shared files / dependencies): T020→T021→T022→T023→T027→T028
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

Complete Phase 1 → Phase 2 → Phase 3, then STOP and validate: record → cards → matched steps → insert → runnable `.feature` (via the fake adapter in CI; via the real adapter in the manual harness). This is a shippable, demonstrable increment.

### Incremental Delivery

1. Foundational → US1 (MVP: capture + deterministic match + insert).
2. US2 (own picker + overlay suppression + ranked locators) — the core "replace the overlay" value.
3. US3 (secrets) → US4 (full-set assertions).
4. US5 (open implementation) → US6 (optional AI, flagged off).
5. Polish.

Each story is a checkpoint that keeps the app green (`lint`/`typecheck`/`test`).

---

## Notes

- **Principle III (NON-NEGOTIABLE)**: no test launches a real browser/CLI. The `IRecorderAdapter` seam + checked-in NDJSON fixtures make the whole pipeline deterministic; the real `PlaywrightRecorderAdapter`/child is manual-only (T060).
- **Principle I**: Playwright, the child process, DOM inspection, the picker/overlay, scoring, matching, and secret redaction stay in main/child; the renderer only uses `window.api.recorder` + the store; secrets never reach the renderer.
- **Principle II**: every `recorder:*` channel spans all five touchpoints with validated payloads.
- **Principle V**: all serializable types live in `@suisui/shared`; rebuild after edits.
- **Principle VI**: no new package, no `ScenarioStep` schema change, no bundled Playwright, no persisted recorder store; AI/grouping/provenance stay deferred seams.
- Private-API internals (`x-pw-glass`, `__pw_recorderSetMode`) are confined to `recorder-adapter.js` behind the capability probe/version gate.

## Completion

- [ ] All six user stories independently testable and passing via the fake adapter.
- [ ] Manual harness confirms the real adapter (overlay suppressed, own picker/highlight) on fixture pages.
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` green; quickstart.md validated.
