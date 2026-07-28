---
description: 'Task list for 011-live-run-progress'
---

# Tasks: Live Streaming Run Progress (Per-Step Pass/Fail During Execution)

**Input**: Design documents from `/specs/011-live-run-progress/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ipc-run-progress.md](./contracts/ipc-run-progress.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Constitution Principle III (NON-NEGOTIABLE) and the pre-commit gate require
`pnpm test` to pass, and `plan.md` prescribes the test files. Two pieces carry extra weight here:
the **parser** and the **reducer** are the only places a wrong step→status mapping can be caught
before it paints a green tick on the wrong step.

**Organization**: Grouped by user story. US1 is the MVP and ships alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: [US1], [US2], [US3] — maps to the user stories in spec.md
- Every task states its exact file path

## Path Conventions

pnpm monorepo. Shared contracts and pure logic in `packages/shared/src/`; main process in
`apps/desktop/electron/`; renderer in `apps/desktop/app/`; E2E in `apps/desktop/e2e/`.

**⚠️ Standing rules**

- After ANY change under `packages/shared/`, run `pnpm --filter @suisui/shared build` before
  dependent lint/typecheck/test.
- **Check exit codes; do not eyeball a piped tail.** `pnpm typecheck | tail -2` discards the status
  and a failure reads as success. Use `pnpm typecheck; echo "exit=$?"`.

---

## Phase 1: Setup

**Purpose**: Establish the shared type surface everything else compiles against.

- [x] T001 Create `packages/shared/src/types/run-progress.ts` with `ExecutionStatus`, `StepExecution`, `ScenarioExecution`, `LiveRunState`, and the `RunProgressEvent` union, exactly as specified in data-model.md
- [x] T002 Create the barrel `packages/shared/src/run-progress/index.ts` and add `export * from './types/run-progress'` plus `export * from './run-progress'` to `packages/shared/src/index.ts`
- [x] T003 Run `pnpm --filter @suisui/shared build` then `pnpm typecheck; echo "exit=$?"` and confirm the new types resolve from both `apps/desktop/electron` and `apps/desktop/app`

**Checkpoint**: Shared types compile and are importable from both processes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The whole event pipeline — reporter → stdout → parser → IPC → store — carrying raw
events end to end. No per-step display yet; that is US1.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Pure logic in `@suisui/shared`

- [x] T004 [P] Write failing tests in `packages/shared/src/__tests__/parseProgressLine.test.ts`: a valid event of each `type` parses; a line without the sentinel returns `null`; a sentinel with malformed JSON returns `null`; an unknown `type` returns `null`; an event missing a required field returns `null`; and a plain log line that merely _contains_ the sentinel mid-line is not treated as an event
- [x] T005 Implement `parseProgressLine(line: string): RunProgressEvent | null` in `packages/shared/src/run-progress/parseProgressLine.ts` until T004 passes. Treat the payload as untrusted input — never throw, return `null` for anything unrecognized
- [x] T006 [P] Write failing tests in `packages/shared/src/__tests__/liveRunReducer.test.ts`: `stepEnd` arriving before `stepStart`; an event for an unknown `testId` creates its scenario rather than being dropped; two tests interleaved keep separate step state; a retry bumps `attempt`; **a `stepEnd` whose title disagrees with the authored step at that index is dropped**; `runEnd` forces every `running` step and scenario to a terminal status; and `available` flips true on the first event
- [x] T007 Implement `liveRunReducer(state, event, authoredSteps?)` in `packages/shared/src/run-progress/liveRunReducer.ts` until T006 passes. Pure — no I/O, no Pinia. `running` is a **set of testIds**, never a single value
- [x] T008 Run `pnpm --filter @suisui/shared build` then `pnpm test; echo "exit=$?"` and confirm the shared suite is green

### Reporter (runs inside the workspace's Playwright)

- [x] T009 Create the reporter asset `apps/desktop/electron/assets/suisui-progress-reporter.cjs`: plain CommonJS implementing `onBegin`/`onTestBegin`/`onStepBegin`/`onStepEnd`/`onTestEnd`/`onEnd`, emitting one sentinel-prefixed NDJSON line per event. Only steps with `category === 'test.step'` produce events; the step `index` is the running count of such steps per test; every step event carries its `title`. **Every callback body wrapped in try/catch** — a reporter exception must never fail the user's tests
- [x] T010 [P] Capture a reporter fixture to `apps/desktop/electron/__tests__/fixtures/progress-capture.ndjson` following the recipe in quickstart.md, covering: a passing scenario, a failing scenario with following steps skipped, a scenario with a `Background`, a `Scenario Outline` with 2+ rows, and a parallel run with interleaved tests
- [x] T011 Write a replay test in `apps/desktop/electron/__tests__/progressReplay.test.ts` that feeds the captured fixture through the real `parseProgressLine` + `liveRunReducer` and asserts the terminal state: no step left `running`, statuses matching the known suite. This is how the reporter is covered without running real Playwright (Constitution III)

### RunnerService wiring

- [x] T012 Write failing tests in `apps/desktop/electron/__tests__/runnerProgress.test.ts` using `FakeCommandRunner`: the reporter path is appended to `--reporter` when the file was written; it is **not** appended when writing fails **and the run still proceeds**; sentinel lines in the fake stdout are not forwarded to the human log; ordinary lines are
- [x] T013 Implement reporter provisioning in `apps/desktop/electron/services/RunnerService.ts`: copy the asset to `<workspace>/.app/suisui-progress-reporter.cjs` before each run (overwriting), and append its absolute path to the existing `--reporter=list,json,html` chain. Wrap the write — a failure silently skips the reporter and never fails the run (FR-019)

### IPC (all five touchpoints)

- [x] T014 Add `RUNNER_PROGRESS: 'runner:progress'` to `packages/shared/src/ipc/channels.ts`
- [x] T015 Add `onProgress: (callback: (event: RunProgressEvent) => void) => () => void` to the `runner` block in `packages/shared/src/ipc/api.ts`. Use the **unsubscribe-returning** shape used by `update`/`recorder`/`search` — do not copy the older `onRunnerLog`/`offRunnerLog` pattern
- [x] T016 Split the output stream in the `RUNNER_RUN_BATCH` handler in `apps/desktop/electron/ipc/handlers.ts`: run each complete line through `parseProgressLine`; forward a parsed event on `RUNNER_PROGRESS` and `continue` so it **never reaches the log**; pass everything else to the existing log emit unchanged (FR-018)
- [x] T017 Add the `onProgress` binding to `apps/desktop/electron/preload.ts`, returning an unsubscribe fn
- [x] T018 Run `pnpm --filter @suisui/shared build`, then `pnpm typecheck; echo "exit=$?"` and `pnpm test; echo "exit=$?"`; confirm `packages/shared/src/__tests__/ipcContract.test.ts` passes with the new channel

### Renderer plumbing

- [x] T019 Write failing tests in `apps/desktop/app/__tests__/liveRunProgress.test.ts` for the store shell: subscribing on run start, unsubscribing when the run ends, live state cleared when a new run starts (FR-022), and `available` staying false when no events arrive
- [x] T020 Add live run state to `apps/desktop/app/stores/runner.ts`: hold a `LiveRunState` per run scope, subscribe to `onProgress` on run start, feed events through the shared reducer, unsubscribe on completion, and reset on the next run, until T019 passes

**Checkpoint**: Events flow from the workspace's Playwright to the renderer store and the log panel
stays clean. Nothing is displayed yet — that is US1.

---

## Phase 3: User Story 1 - Watch the steps of a scenario execute (Priority: P1) 🎯 MVP

**Goal**: While a scenario runs, its steps show running, then passed/failed/skipped, live.

**Independent Test**: Quick-run a scenario where a known step fails. Each step shows running and then
a terminal status while the run is in flight, the failing step goes red at the moment it fails, later
steps show skipped, and the outcomes match the final report.

### Tests for User Story 1

- [x] T021 [P] [US1] Write failing tests in `apps/desktop/app/__tests__/liveRunProgress.test.ts` for the display merge: authored steps with no execution show `pending`; executions overlay onto the authored list by index; background steps appear first and are labelled as background; a step after a failure shows `skipped` rather than `pending`
- [x] T022 [P] [US1] Write failing tests in `apps/desktop/app/__tests__/liveRunProgress.test.ts` for reconciliation: when the final report disagrees with a live status, the report wins (FR-017); after `runEnd` no step remains `running` (FR-006); a step that never reported completion resolves from the report rather than staying running
- [x] T023 [P] [US1] Write a failing test in `packages/shared/src/__tests__/liveRunReducer.test.ts` asserting the **mismatch guard**: a `stepEnd` whose `title` does not match the authored step at that index leaves the step untouched rather than applying a status to the wrong step

### Implementation for User Story 1

- [x] T024 [US1] Provide the authored step list for a scenario in `apps/desktop/app/stores/runner.ts`: use the open feature's parsed scenario when available, otherwise read and parse the feature via the existing `features.read`, so `pending` steps can be shown (FR-002, research Decision 5)
- [x] T025 [US1] Implement the merge selector in `apps/desktop/app/stores/runner.ts` that combines the authored step list with `StepExecution` records into the display model, applying the title mismatch guard, until T021 and T023 pass
- [x] T026 [US1] Add a live status indicator to `apps/desktop/app/components/StepRow.vue` covering pending, running, passed, failed, skipped, and interrupted, with the running state visually distinct (FR-002, FR-003)
- [x] T027 [US1] Reflect live statuses in the scenario editor in `apps/desktop/app/components/ScenarioBuilder.vue` when the executing scenario is the one displayed (FR-012), without mutating scenario content (FR-023)
- [x] T028 [US1] Label background steps in the live display in `apps/desktop/app/components/ScenarioBuilder.vue` so they are identifiable as background (FR-005)
- [x] T029 [US1] Implement end-of-run reconciliation in `apps/desktop/app/stores/runner.ts`: on run completion, override live statuses from the final report and force any remaining `running` to a terminal status, until T022 passes (FR-006, FR-017)
- [x] T030 [US1] Write `apps/desktop/e2e/live-run-progress.spec.ts` covering the US1 journey in `APP_TEST_MODE` with scripted run output: steps transition running → terminal during the run, the failing step is marked failed, later steps show skipped, and nothing remains running at the end

**Checkpoint**: US1 is fully functional and shippable on its own.

---

## Phase 4: User Story 2 - See what is executing right now during a batch run (Priority: P2)

**Goal**: During a run, see which scenario(s) are executing, which have finished and how, and inspect
the running scenario's steps without leaving the run view.

**Independent Test**: Start a run over several feature files and confirm, while in flight, that the
executing scenario is identified and visually distinguished from completed and not-yet-started ones.

### Tests for User Story 2

- [x] T031 [P] [US2] Write failing tests in `apps/desktop/app/__tests__/liveRunProgress.test.ts` for parallel execution: with several `testStart` events and no `testEnd`, **all** of them appear in `running` (FR-009); a `testEnd` removes only that one; interleaved step events from two tests do not cross-contaminate
- [x] T032 [P] [US2] Write a failing test in `apps/desktop/app/__tests__/liveRunProgress.test.ts` asserting each `Scenario Outline` example row is tracked as its own scenario execution keyed by its own `testId` (FR-010)

### Implementation for User Story 2

- [x] T033 [US2] Render a live scenario list in `apps/desktop/app/components/RunResultsPanel.vue` showing each scenario's name, owning feature, and current status, updating as events arrive (FR-007)
- [x] T034 [US2] Visually distinguish executing scenarios from completed and not-yet-started ones in `apps/desktop/app/components/RunResultsPanel.vue`, highlighting **every** running scenario, not just one (FR-008, FR-009)
- [x] T035 [US2] Allow selecting a scenario in the live list in `apps/desktop/app/components/RunResultsPanel.vue` to see its steps and live statuses without opening it in the editor (FR-011)
- [x] T036 [US2] Confirm and guard the no-auto-navigation rule in `apps/desktop/app/pages/index.vue`: run progress must never change the editor's selected feature or scenario (FR-013)
- [x] T037 [US2] Extend `apps/desktop/e2e/live-run-progress.spec.ts` with the US2 journey: a multi-scenario run identifies the executing scenario, shows finished ones with outcomes, exposes the running scenario's steps from the run view, and leaves the editor selection untouched

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Find out where a run is stuck (Priority: P3)

**Goal**: See how long the current step has been running, so a hung run is attributable to a step.

**Independent Test**: Run a scenario containing a deliberately slow step and confirm the run view
shows that step as running with a visibly increasing elapsed time.

### Tests for User Story 3

- [x] T038 [P] [US3] Write failing tests in `apps/desktop/app/__tests__/liveRunProgress.test.ts`: a running step exposes its elapsed time derived from `startedAt`; a step that never completes stays `running` and is never auto-marked passed (FR-015); stopping a run marks in-flight steps `interrupted` and leaves unreached steps unmarked rather than failed (FR-020)

### Implementation for User Story 3

- [x] T039 [US3] Show per-step elapsed time for the running step in `apps/desktop/app/components/RunResultsPanel.vue`, driven by a single shared ticker rather than a timer per step (FR-014)
- [x] T040 [US3] Surface the longest-running step prominently in `apps/desktop/app/components/RunResultsPanel.vue` so a stalled run is attributable without reading the log (US3 scenario 2, SC-007)
- [x] T041 [US3] Handle stop and crash in `apps/desktop/app/stores/runner.ts`: mark in-flight steps and scenarios `interrupted` (never `failed`), leave unreached steps unmarked, and ensure a died run settles with nothing `running`, until T038 passes (FR-020, FR-021)
- [x] T042 [US3] Extend `apps/desktop/e2e/live-run-progress.spec.ts` with the US3 journey: a slow step shows a climbing elapsed time, and stopping mid-step leaves it marked interrupted rather than failed

**Checkpoint**: All three user stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T043 Close the FR-016 gap: `RUNNER_RUN_HEADLESS` and `RUNNER_RUN_UI` in `apps/desktop/electron/ipc/handlers.ts` pass no output callback, so those paths stream nothing. Either wire them the same way as `RUNNER_RUN_BATCH`, or delete them together with their now-unused store actions and the unmounted `apps/desktop/app/components/ValidationPanel.vue` — **decide deliberately and record which**
- [ ] T044 [P] Add `electron/assets/suisui-progress-reporter.cjs` to the coverage exclude list in `apps/desktop/vitest.config.ts`, beside `PlaywrightRecorderAdapter.ts` and `ElectronUpdaterAdapter.ts`, with a comment explaining it only runs inside Playwright
- [ ] T045 [P] Verify FR-018 by hand: run a full suite and confirm **no sentinel or JSON lines appear in the log panel**, and that the existing aggregate counters, progress bar, and elapsed timer still work
- [ ] T046 [P] Run the SC-006 check with a generated 200-scenario workspace: the run view keeps updating and responding throughout, and live state does not grow in proportion to log volume
- [ ] T047 [P] Verify SC-009 by deliberately breaking the reporter (corrupt the `.cjs` after it is written): the run still completes and reports, and no step is left showing running
- [ ] T048 [P] Document the feature in `doc/SERVICES.md` (reporter provisioning + the stdout split), `doc/IPC_TYPES.md` (`runner:progress`), and `doc/FRONTEND.md` (live run state, merge selector, step indicator)
- [ ] T049 [P] Add a Live Run Progress section to `CLAUDE.md` noting the sentinel-stripping rule, ordinal+title step matching, the set-valued `running`, and that the reporter must never fail a run
- [ ] T050 Verify accessibility of the live run UI in `apps/desktop/app/components/RunResultsPanel.vue` and `StepRow.vue`: step status is conveyed by more than colour, and run progress is announced to assistive tech without spamming on every event
- [ ] T051 Walk the manual verification table in quickstart.md, then run `pnpm lint; echo "exit=$?"`, `pnpm typecheck; echo "exit=$?"`, `pnpm test; echo "exit=$?"`, and `pnpm build && pnpm test:e2e`
- [ ] T052 Update GitHub issue #77: tick the two criteria that were already met, note what this feature added, and record anything deliberately excluded (debugging controls, persisted timings, live progress for runs started outside the app)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks all three user stories**
- **US1 (Phase 3)**: Depends on Foundational only
- **US2 (Phase 4)**: Depends on Foundational; reuses US1's merge selector for the step detail in T035
- **US3 (Phase 5)**: Depends on Foundational; needs US1/US2's per-step state to attach elapsed time to
- **Polish (Phase 6)**: Depends on the desired stories being complete

### Critical path within Foundational

```text
T001 → T002 → T003 ─┬─> T004 → T005            (parser)
                    ├─> T006 → T007 → T008      (reducer)
                    ├─> T009 → T010 → T011      (reporter + replay)
                    └─> T014 → T015             (channel + api)
                                  │
              T005, T009 ─────────┴──> T012 → T013     (RunnerService)
                                  │
              T005, T015 ─────────┴──> T016 → T017 → T018   (handler split, preload)
                                                      │
                                              T019 → T020   (store plumbing)
```

### Within each user story

- Tests first, failing, before the implementation they gate
- Shared reducer/selector → store → component → page wiring → E2E
- **T023's mismatch guard must pass before T026 renders anything** — a status applied to the wrong
  step is worse than no status at all

### Parallel Opportunities

- **Phase 2**: T004 and T006 (different test files); T009/T010 alongside the parser work; T014/T015 early
- **US1**: T021, T022, T023 in parallel (three test files)
- **US2**: T031 and T032 in parallel
- **Polish**: T044–T049 all in parallel

---

## Parallel Example: User Story 1

```bash
# Write the three failing test suites together:
Task: "Display merge tests in apps/desktop/app/__tests__/liveRunProgress.test.ts"
Task: "Reconciliation tests in apps/desktop/app/__tests__/liveRunProgress.test.ts"
Task: "Title mismatch guard in packages/shared/src/__tests__/liveRunReducer.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001–T003)
2. Phase 2: Foundational (T004–T020) — the whole event pipeline; blocks everything
3. Phase 3: User Story 1 (T021–T030)
4. **STOP and VALIDATE**: run the US1 independent test and the US1 rows of the quickstart table
5. Shippable: per-step live status for the scenario being run — the core of issue #77

### Incremental Delivery

1. Setup + Foundational → events flow end to end, log stays clean
2. - US1 → **MVP**: steps light up live
3. - US2 → whole-run visibility, including parallel
4. - US3 → stuck-run attribution
5. - Polish → FR-016 parity, docs, accessibility, issue #77 update

### Parallel Team Strategy

Foundational is 17 of 52 tasks and gates all three stories. With two developers, split along the
process boundary: one takes the pure logic and reporter (T004–T011), the other takes RunnerService,
IPC, and store plumbing (T012–T020), synchronizing at T018.

After that, **US1 and US3 conflict** — both edit `stores/runner.ts` and `RunResultsPanel.vue`, and
US3's elapsed display hangs off US1's step state. US2 is largely additive in
`RunResultsPanel.vue` and can be handed off once US1's merge selector exists.

---

## Notes

- **Rebuild `@suisui/shared`** after T001, T002, T005, T007, T014, T015
- **Keep sentinel lines out of the log** (T016) — the easiest thing to get wrong and the most visible
  when wrong
- **Show nothing rather than the wrong thing**: if ordinal and title disagree, drop the status
- **`running` is a set** — parallel mode has several scenarios in flight; a single "current" field
  will flicker between workers
- **The reporter must never fail a run** — wrap every callback, and treat a failed write as "skip the
  reporter", not "fail the run"
- Step locations point at the **generated spec**, not the `.feature` file (verified in
  `playwright-bdd` 8.4.2) — do not try to map steps by location
- Commit after each task or logical group; every commit must pass `pnpm lint`, `pnpm typecheck`,
  `pnpm test` — verified by exit code, not by reading a piped tail
