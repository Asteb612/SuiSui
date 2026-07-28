# Phase 0 Research: Live Run Progress

**Feature**: 011-live-run-progress | **Date**: 2026-07-28

No `NEEDS CLARIFICATION` items came out of the Technical Context. The product-level decisions (where
status appears, no auto-navigation, report authoritative, retries show latest attempt, transient
state) were settled in the spec. What follows are the technical decisions needed to implement them,
several of which rest on facts verified directly against the installed dependencies rather than
assumed.

---

## Decision 1: Source of execution progress — a custom Playwright reporter

**Decision**: Add a small CommonJS reporter to the existing `--reporter=list,json,html` chain,
implementing `onTestBegin`, `onStepBegin`, `onStepEnd`, `onTestEnd`, and `onEnd`.

**Rationale**: The data simply does not exist anywhere the app currently looks.

- The `list` reporter prints **one line per test, after it completes**. That is why today's live
  progress is limited to aggregate counters — "what is running now" and "which step" are not
  derivable from it at any level of parsing cleverness.
- The `json` reporter writes a **file read after the run ends**, so it cannot drive anything live.
- The Playwright reporter API is the supported mechanism for observing execution as it happens, and
  `onStepBegin`/`onStepEnd` are exactly the per-step events FR-001–FR-004 require.

**Alternatives considered**:

- *Parse the `list` reporter harder.* Rejected — the information is not in the stream. This is the
  single most important finding of this research: no amount of parsing recovers step-level events.
- *Use the `json` reporter's `steps` array.* Rejected — only available after the run.
- *Patch the user's `playwright.config.ts` to register a reporter.* Rejected — mutating a file the
  user owns and has committed, to add app-specific wiring, is far more invasive than passing
  `--reporter` on the command line for the duration of one run.
- *Wrap step definitions to report themselves.* Rejected — would require modifying the user's step
  code, and would miss steps that fail before the definition body runs.

---

## Decision 2: Transport — sentinel-prefixed NDJSON on stdout, intercepted in main

**Decision**: The reporter writes one NDJSON object per event to stdout, each prefixed with a
sentinel (e.g. `@@SUISUI_PROGRESS@@`). The main process splits sentinel lines out of the stream,
parses them, and forwards typed events on a new IPC channel. **Sentinel lines never reach the user's
log panel.**

**Rationale**: The `RUNNER_RUN_BATCH` handler already buffers stdout and emits only **complete
lines**, so a structured line can never arrive split — the hard part of a stdout protocol is already
solved. This also honours the issue's "reuse existing runner log event channel" without conflating
machine events with human-readable output.

Filtering matters: leaving sentinel lines in the log would replace a readable run log with a wall of
JSON, which is a regression against FR-018.

**Alternatives considered**:

- *Write NDJSON to a file and tail it.* Rejected — adds filesystem watching, latency, and a cleanup
  obligation, to avoid a problem (line splitting) the existing pipe already handles.
- *Open a local socket / named pipe.* Rejected — a new transport, new failure modes, and
  platform-specific behaviour, for no benefit at this volume.
- *Emit events on stderr.* Rejected — stderr is surfaced to the user on failure; polluting it would
  hurt exactly the case where diagnostics matter most.

---

## Decision 3: Mapping a reported step back to a step in the editor — ordinal, verified by title

**Decision**: Match by **ordinal position** among steps with `category === 'test.step'` within a
test, and carry the step **title** in every event so the consumer can verify the match. On
disagreement, drop the status rather than apply it.

**Rationale**: Verified against `playwright-bdd` 8.4.2:

- `bddStepInvoker` calls `runStepWithLocation(test, stepTextWithKeyword, location, body)` once per
  Gherkin step, so `step.title` is the step text **with its keyword** (`Given I am on the "/login"
  page`) and steps arrive in authored order — background steps first, then scenario steps, which is
  the order the editor displays them.
- **The `location` points at the generated spec file, not the `.feature` file.** The source comment
  is explicit: *"Get location of step call in generated test file."* This corrected an early
  assumption that step locations could be used for an exact source mapping — they cannot.

Title verification is what makes ordinal matching safe. A silently wrong mapping would put a green
tick on the wrong step, which is worse than showing nothing at all; showing nothing degrades to
today's behaviour, whereas a wrong tick actively misleads.

**Alternatives considered**:

- *Match by step location.* Rejected — points at generated code (verified above).
- *Match by title alone.* Rejected — a scenario may legitimately repeat the same step text, making
  the match ambiguous.
- *Ask `playwright-bdd` for its internal `stepIndex`.* Rejected — `bddContext.stepIndex` is internal
  state, not exposed to reporters; depending on it would be exactly the kind of private-API coupling
  the recorder feature was careful to confine behind a seam.

---

## Decision 4: Scenario → feature mapping — reuse `extractFeatureRelativePath`

**Decision**: Map a reported test to its `.feature` file with the existing
`extractFeatureRelativePath`, using the test's file path.

**Rationale**: It already converts `.features-gen/features/auth/login.feature.spec.js` →
`features/auth/login.feature`, handles the with/without-prefix cases, and is unit-tested. The final
report path uses it, so live events and final results agree by construction — which is precisely
what FR-017's reconciliation depends on.

**Alternatives considered**:

- *Re-derive the mapping in the reporter.* Rejected — two implementations of the same rule, able to
  drift, one of them untestable in isolation.

---

## Decision 5: Not-yet-run steps come from the feature file, not from events

**Decision**: Events carry only the step that changed. The **full** step list for a scenario —
needed to show "not yet run" steps (FR-002) — comes from reading and parsing the feature file, which
the app already does.

**Rationale**: Reporters learn about a step only when it begins, so an event stream alone can never
describe steps that have not started. The app already has the feature content (the editor for the
open scenario; `features.read` otherwise), so shipping step lists inside events would duplicate data
the app holds and inflate every payload.

**Alternatives considered**:

- *Have the reporter emit the whole scenario's steps on `onTestBegin`.* Rejected — Playwright does
  not know the steps before they run; only `playwright-bdd`'s internal data does.
- *Show only steps that have started.* Rejected — fails FR-002 and makes progress ambiguous ("is
  this the last step, or are there twelve more?").

---

## Decision 6: Parallel execution — a map keyed by test id, not a single "current"

**Decision**: Live state holds a map of scenario executions keyed by the reporter's stable test id;
"currently executing" is a derived *set*, not a single value.

**Rationale**: `executionMode: 'parallel'` is a supported run mode, so several tests are genuinely
in flight at once and their step events interleave. A single "current scenario" field would be
overwritten on every interleaved event and would flicker between workers. Keying by test id means
interleaving is a non-issue — each event lands in its own bucket (FR-009, SC-005).

**Alternatives considered**:

- *Track only the most recently started test.* Rejected — visibly wrong under parallelism, and
  parallel is the mode most likely to be used on a suite big enough to need this feature.

---

## Decision 7: Failure modes — the reporter must never be able to break a run

**Decision**: The reporter is best-effort at every level: if it cannot be written, cannot be loaded,
throws, or emits nothing, the run proceeds and reports exactly as it does today, with live status
degrading to the existing aggregate counters.

**Rationale**: FR-019 makes this explicit, and it is the difference between a nice-to-have that
enhances runs and a new component that can take running tests away from the user. Concretely:

- Writing the reporter file is wrapped; failure means simply not appending it to `--reporter`.
- Every reporter callback body is wrapped in try/catch — a throwing reporter must not fail the run.
- Unparseable sentinel lines are skipped, not fatal.
- On run end, any step or scenario still marked running is reconciled to a terminal state from the
  final report (FR-006, FR-017, SC-003).

**Alternatives considered**:

- *Fail the run if the reporter cannot load.* Rejected outright — a progress indicator must never be
  able to prevent testing.

---

## Decision 8: Reporter file location and lifecycle

**Decision**: Write the reporter to `<workspace>/.app/suisui-progress-reporter.cjs` before each run,
overwriting it every time.

**Rationale**: `.app/` is the established location for app-owned artifacts inside a workspace
(credentials, reports, the step-catalog cache) and is already git-ignored, so the file never pollutes
the user's VCS. Rewriting per run means a version upgrade cannot leave a stale reporter behind.
`.cjs` is used so the file loads regardless of whether the workspace's `package.json` declares
`"type": "module"`.

**Alternatives considered**:

- *A temp directory outside the workspace.* Rejected — some setups restrict what Playwright may load
  from outside the project root, and `.app/` keeps everything the app generates in one predictable
  place.
- *Write it once and reuse.* Rejected — leaves a stale reporter after an app upgrade, with no
  mechanism to notice.

---

## Resolved risks summary

| Risk | Mitigation |
| --- | --- |
| Step-level data is unobtainable from current output | Custom reporter — the only mechanism that sees execution as it happens (Decision 1) |
| Structured events pollute the human-readable log | Sentinel prefix stripped in main before the log is forwarded (Decision 2) |
| A wrong step→editor mapping paints a tick on the wrong step | Ordinal match **verified against the title**; drop on mismatch rather than mislabel (Decision 3) |
| Live status disagrees with the final report | Reconcile from the report at run end; the report wins (Decision 7, FR-017) |
| Parallel runs flicker or attribute steps to the wrong scenario | State keyed by test id; "executing" is a set (Decision 6) |
| The reporter breaks the user's ability to run tests | Best-effort at every level; the run never depends on it (Decision 7) |
| Coupling to `playwright-bdd` internals | Uses only the public `test.step` title/order; internal `stepIndex` deliberately not used (Decision 3) |
