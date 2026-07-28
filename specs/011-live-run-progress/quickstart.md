# Quickstart: Live Run Progress (011)

**Feature**: 011-live-run-progress | **Branch**: `011-live-run-progress`

How to build, run, and verify this feature. Read `plan.md` for the design and
`contracts/ipc-run-progress.md` for the IPC + reporter contract.

---

## Build order

```bash
pnpm --filter @suisui/shared build   # after ANY change under packages/shared/
pnpm typecheck
pnpm lint
pnpm test
```

**Check exit codes, don't eyeball the tail.** Piping these through `tail` discards the exit status
and a failure will look like success:

```bash
pnpm typecheck; echo "typecheck=$?"
```

---

## Implementation order

Ordered so the pure, testable pieces land before anything touches a real run.

1. **Shared types** — `packages/shared/src/types/run-progress.ts`, exported from `src/index.ts`. Rebuild.
2. **Parser** — `packages/shared/src/run-progress/parseProgressLine.ts`. Pure: line → event | null.
   Unit-test malformed input as a first-class case, not an afterthought.
3. **Reducer** — `packages/shared/src/run-progress/liveRunReducer.ts`. Pure: (state, event) → state.
   Unit-test out-of-order events, unknown testId, parallel interleaving, and title mismatch.
4. **Reporter asset** — `apps/desktop/electron/assets/suisui-progress-reporter.cjs`. Plain CommonJS,
   every callback wrapped in try/catch, only sentinel lines on stdout.
5. **RunnerService** — write the reporter into `<workspace>/.app/` and append it to `--reporter`.
   Failure to write must silently skip it, never fail the run.
6. **Handler split** — intercept sentinel lines in `RUNNER_RUN_BATCH`'s `onOutput`, forward on
   `runner:progress`, and **keep them out of the log**. All five IPC touchpoints. Rebuild shared.
7. **Store** — live state in `app/stores/runner.ts`: subscribe on run start, reset per run,
   reconcile against the final report at the end.
8. **UI** — per-step indicator in `StepRow.vue`; live scenario list with executing highlight and step
   detail in `RunResultsPanel.vue`.
9. **Non-batch parity** — FR-016: make every run entry point stream, or remove the dead paths.
10. **E2E** — `apps/desktop/e2e/live-run-progress.spec.ts` against a production build.

---

## Manual verification

```bash
pnpm dev
```

| Check | Expected | Requirement |
| --- | --- | --- |
| Quick-run a scenario | Steps show running, then passed/failed, one at a time | FR-001–FR-004 |
| A step fails mid-scenario | That step goes red immediately; later steps show skipped | FR-002, US1 |
| Scenario with a `Background` | Background steps also show status, labelled as background | FR-005 |
| Run the whole suite | The executing scenario is named and highlighted | FR-007, FR-008 |
| Set execution mode to parallel | **Several** scenarios show as running at once | FR-009, SC-005 |
| A `Scenario Outline` runs | Each example row appears as its own running item | FR-010 |
| Select the running scenario in the run view | Its steps and statuses are visible without opening the editor | FR-011 |
| The running scenario is open in the editor | Editor shows the same statuses | FR-012 |
| Edit a *different* scenario during a run | The app does not navigate away | FR-013 |
| Add a `await page.waitForTimeout(90000)` step | That step shows running with a climbing elapsed time | FR-014, US3 |
| Stop the run mid-step | That step shows interrupted, not failed; later steps not marked failed | FR-020 |
| Kill the app's test process mid-run | Nothing is left showing running | FR-021 |
| Start a second run | No state from the first run is visible | FR-022 |
| Delete the reporter from `.app/` mid-run, or break it | Run still completes and reports; UI falls back to counters | FR-019, SC-009 |
| Watch the log panel throughout | **No JSON/sentinel lines appear**; the log reads as it does today | FR-018 |

**The last row is the one most likely to regress.** If sentinel lines reach the log panel, the
`continue` in the handler's output split is missing.

---

## Capturing a reporter fixture

The reporter cannot be unit-tested in isolation (Principle III forbids running real Playwright), so
its output is captured once and replayed through the real parser + reducer:

```bash
# In a scratch workspace with a small suite, run Playwright manually with the
# reporter, and keep only the sentinel lines:
npx playwright test --reporter=list,<path>/suisui-progress-reporter.cjs \
  | grep '^@@SUISUI_PROGRESS@@' \
  > apps/desktop/electron/__tests__/fixtures/progress-capture.ndjson
```

Capture at least: a passing scenario, a failing scenario (with following steps skipped), a scenario
with a background, a `Scenario Outline` with 2+ rows, and a parallel run with interleaved tests.

The replay test asserts that feeding the capture through the reducer produces the expected terminal
state — no step left `running`, statuses matching the known suite.

---

## Test coverage checklist

**Parser** — valid event of each type; missing sentinel; sentinel with malformed JSON; unknown
`type`; missing required field; a log line that merely *contains* the sentinel mid-line.

**Reducer** — `stepEnd` before `stepStart`; event for an unknown `testId`; two tests interleaved;
retry bumping `attempt`; title mismatch dropping the update; `runEnd` forcing terminal statuses;
state cleared on a new run.

**RunnerService** — reporter appended when written; **not** appended when writing fails, and the run
still proceeds; sentinel lines removed from the forwarded log.

**Store** — reconciliation with the final report overriding live status; stop → `interrupted`;
reset between runs.

---

## Gotchas

- **Rebuild `@suisui/shared`** after every change there.
- **Do not let sentinel lines into the log** (FR-018). This is the easiest thing to get wrong and the
  most visible when wrong.
- **Step locations point at the generated spec, not the `.feature` file.** Verified in
  `playwright-bdd` 8.4.2 — do not try to map steps by location. Match by ordinal, verify by title.
- **Show nothing rather than the wrong thing.** If ordinal and title disagree, drop the status. A
  green tick on the wrong step is worse than no tick.
- **Never let the reporter fail a run.** Wrap every callback; a broken progress indicator must not
  cost the user their test run.
- **`running` is a set, not a value.** Parallel mode has several scenarios in flight; a single
  "current" field will flicker between workers.
- **Do not import `node:fs` in `app/`.** The renderer receives typed events only.
- The existing `onRunnerLog` uses `removeAllListeners` and has no unsubscribe fn — do **not** copy
  that shape for `onProgress`; follow the newer `update`/`recorder`/`search` convention.
