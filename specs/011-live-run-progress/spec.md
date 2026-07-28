# Feature Specification: Live Streaming Run Progress (Per-Step Pass/Fail During Execution)

**Feature Branch**: `011-live-run-progress`  
**Created**: 2026-07-28  
**Status**: Draft  
**Input**: GitHub issue [#77](https://github.com/Asteb612/SuiSui/issues/77) — "Live streaming run progress (per-step pass/fail during execution)"

> **Problem**: Execution currently feels like a black box: users only see results when the run finishes. They can't tell where a test is hanging.
>
> **Proposal**: Stream per-step status (running → passed/failed) live during execution.

## Already shipped (verified 2026-07-28)

Two of the issue's four acceptance criteria are **already met**; this feature delivers the other two.
Recorded here so scope is not re-litigated during planning.

| Issue criterion | State |
| --- | --- |
| Logs stream incrementally, reusing the runner log event channel | **Done.** Output streams line-by-line while the run is in flight and renders live. |
| Works for both single and batch runs | **Done for every path reachable in the UI** — both the whole-suite run and the single-spec quick run stream. One dormant, unreachable code path does not stream; see FR-016. |
| Each step shows a live status indicator | **Not implemented.** Live progress today is *aggregate counters* (`12 / 40 tests — 8 passed, 1 failed`) plus a progress bar and elapsed timer. There is no per-step state anywhere. |
| Currently-executing scenario/step is highlighted | **Not implemented.** Nothing tracks what is executing right now; the closest approximation is the most recent raw log line. |

The gap is not cosmetic. Today's counters are derived from a source that reports each test only
**after it finishes**, so "what is running right now" and "which step is it on" cannot be answered at
all. This feature is about obtaining and surfacing execution progress *as it happens*.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Watch the steps of a scenario execute (Priority: P1)

An author quick-runs the scenario they are editing. Instead of a spinner and a growing log, they see
the scenario's steps light up one at a time: the step being executed is marked as running, and as
each finishes it turns to passed or failed. When a step fails, they see immediately which step it
was, without reading the log or waiting for the report.

**Why this priority**: This is the core of the issue and the direct answer to "execution feels like a
black box". It is also the smallest useful slice — one scenario, its steps, live — and it delivers
value on its own even if nothing else ships.

**Independent Test**: Quick-run a scenario containing several steps where a known step fails. Observe
that each step shows running and then a final status while the run is in flight, that the failing
step is marked failed at the moment it fails, and that the outcome matches the final report.

**Acceptance Scenarios**:

1. **Given** a scenario is executing, **When** a step begins, **Then** that step is shown as running
   before it completes — not only after.
2. **Given** a step completes, **When** its result is known, **Then** the step shows passed or failed
   without waiting for the rest of the run.
3. **Given** a step fails, **When** the run continues or ends, **Then** that step remains marked as
   failed and is distinguishable from steps that never ran.
4. **Given** steps after a failed step are not executed, **When** the run ends, **Then** they are
   shown as skipped rather than pending or passed.
5. **Given** the run finishes, **When** the final results arrive, **Then** the live per-step statuses
   agree with the final report; where they disagree, the report wins and the display is corrected.
6. **Given** a scenario has background steps, **When** it executes, **Then** those steps also show
   live status, labelled as belonging to the background.

---

### User Story 2 - See what is executing right now during a batch run (Priority: P2)

An author starts a run of the whole suite and walks away. Returning, they want to know what is
happening without reading the log: which scenario is executing right now, which have finished and how
they went, and how far through the run is. With parallel execution several scenarios may be running
at once, and all of them are shown as running.

**Why this priority**: Extends US1's step-level visibility to the whole run, which is where the
"black box" complaint bites hardest. It draws on the same execution-progress source as US1, so it is
cheap once US1 exists, but it is not required for US1 to be useful.

**Independent Test**: Start a run over several feature files and observe, while it is in flight, that
the executing scenario is identified and visually distinguished from completed and not-yet-started
ones, and that completed scenarios show their outcome.

**Acceptance Scenarios**:

1. **Given** a run is in flight, **When** the author looks at the run view, **Then** the scenario
   currently executing is identified by name and owning feature, and is visually distinguished.
2. **Given** several scenarios execute concurrently, **When** the author looks at the run view,
   **Then** every currently-executing scenario is shown as running, not just one.
3. **Given** a scenario finishes, **When** the next begins, **Then** the finished one shows its
   outcome and the new one becomes the highlighted running item.
4. **Given** the currently-executing scenario is selected, **When** the author looks at it, **Then**
   its steps and their live statuses are visible without leaving the run view.
5. **Given** the scenario being executed is also open in the editor, **When** it runs, **Then** the
   editor reflects the same live step statuses.
6. **Given** the author is editing a different scenario, **When** a run is in flight, **Then** the
   app does not navigate away from what they are editing.

---

### User Story 3 - Find out where a run is stuck (Priority: P3)

A run has been going for several minutes with no output. The author wants to know whether it is
progressing slowly or hung, and on what. The run view shows how long the current step has been
running, so a step sitting at 90 seconds is obviously the culprit — and they can stop the run knowing
which step to investigate.

**Why this priority**: This is the problem statement's second half ("they can't tell where a test is
hanging") and the reason live status beats a final report. It is ranked last because it builds
directly on US1/US2's per-step state — once a step is known to be running, showing its elapsed time
is a small addition.

**Independent Test**: Run a scenario containing a deliberately slow step and confirm that, while it
executes, the run view shows that step as running with a visibly increasing elapsed time.

**Acceptance Scenarios**:

1. **Given** a step is executing, **When** the author looks at the run view, **Then** they can see
   how long that step has been running.
2. **Given** a step has been running unusually long, **When** the author looks at the run view,
   **Then** it is evident which step is responsible without reading the log.
3. **Given** the author stops a run mid-step, **When** the run ends, **Then** the step that was
   executing is shown as interrupted rather than passed or failed.

---

### Edge Cases

- **No progress information available** (the run produces no usable execution updates): the run still
  completes and the final report is still shown; live status degrades to the aggregate progress that
  exists today rather than blocking or showing a permanently-running step.
- **Run fails to start** (dependency missing, config error): no step is left showing running, and the
  failure is reported as it is today.
- **Run stopped by the user mid-step**: the executing step is marked interrupted; steps not reached
  are not marked failed.
- **Run crashes or the process dies mid-step**: no step is left running forever; the run settles into
  a terminal state.
- **Parallel execution**: several scenarios run simultaneously and all are shown as such.
- **Scenario Outline**: each example row executes separately, so each is tracked as its own running
  item rather than collapsing into one.
- **Retries**: a step or scenario that is retried shows the latest attempt, and it is evident that a
  retry occurred rather than the first failure silently disappearing.
- **A step never reports completion**: it stays visibly running with an increasing elapsed time
  (US3), rather than being silently marked passed.
- **Live status disagrees with the final report**: the report is authoritative and the display is
  corrected when it arrives.
- **The user edits the scenario while it is running**: live status does not overwrite or fight their
  edits, and stale status is not attached to steps they changed.
- **The user navigates away and back mid-run**: the run view shows the current state, not a stale
  snapshot from when it was last visible.
- **A second run is started while one is in flight**: state from the previous run is not mixed into
  the new one.
- **Very long runs / very many scenarios**: the run view stays responsive and live state does not
  grow without bound.

## Requirements _(mandatory)_

### Functional Requirements

**Per-step live status**

- **FR-001**: The system MUST report the status of individual steps while a run is in progress, not
  only after it finishes.
- **FR-002**: A step MUST be distinguishable between at least: not yet run, running, passed, failed,
  skipped, and interrupted.
- **FR-003**: A step MUST be shown as running from the time it starts until it completes.
- **FR-004**: A step's terminal status MUST appear as soon as that step completes, without waiting
  for the rest of the scenario or run.
- **FR-005**: Steps belonging to a `Background` MUST also carry live status and MUST be identifiable
  as background steps.
- **FR-006**: When a run ends, every step that was shown as running MUST resolve to a terminal
  status; none may remain running.

**Currently-executing item**

- **FR-007**: The system MUST identify which scenario(s) are executing at any moment during a run,
  showing each by name and owning feature.
- **FR-008**: The system MUST visually distinguish executing scenarios from completed and
  not-yet-started ones.
- **FR-009**: When execution is parallel, ALL concurrently-executing scenarios MUST be shown as
  running.
- **FR-010**: Each example row of a `Scenario Outline` MUST be tracked as its own executing item.
- **FR-011**: The steps and live statuses of an executing scenario MUST be viewable from the run view
  itself, without requiring that scenario to be open in the editor.
- **FR-012**: When the executing scenario is also open in the editor, the editor MUST reflect the
  same live statuses.
- **FR-013**: The system MUST NOT navigate the user away from what they are editing because a run
  progressed.

**Stuck-run visibility**

- **FR-014**: While a step is executing, the system MUST show how long it has been running.
- **FR-015**: A step that never reports completion MUST continue to be shown as running with an
  increasing elapsed time, and MUST NOT be silently reported as passed.

**Coverage and consistency**

- **FR-016**: Live step status and executing-item highlighting MUST work for every way a run can be
  started from the application — the whole-suite run and the single-spec quick run alike — and no run
  path may silently omit streaming.
- **FR-017**: Live status MUST be reconciled against the final results when the run completes; where
  they differ, the final results are authoritative.
- **FR-018**: Existing behaviour MUST be preserved: incremental log streaming, the aggregate progress
  counters and bar, and the elapsed-run timer all continue to work.

**Robustness**

- **FR-019**: If execution progress information is unavailable or unusable, the run MUST still
  complete and report normally, degrading to the aggregate progress that exists today.
- **FR-020**: Stopping a run MUST mark the step that was executing as interrupted, and MUST NOT mark
  unreached steps as failed.
- **FR-021**: A run that crashes or dies MUST settle into a terminal state, leaving nothing shown as
  running.
- **FR-022**: Starting a new run MUST clear the previous run's live state; state from two runs MUST
  never be mixed.
- **FR-023**: Live state MUST NOT overwrite or interfere with edits the user makes while a run is in
  progress.
- **FR-024**: The run view MUST remain responsive for the largest run size stated in SC-006, and live
  state MUST NOT grow without bound during a long run.

### Key Entities

- **Step Execution**: The live state of one step within one executing scenario. Attributes: which
  step it refers to (its position within the scenario, and whether it belongs to the background), its
  current status, when it started, and how long it has been running or took.
- **Scenario Execution**: The live state of one scenario, or of one `Scenario Outline` example row.
  Attributes: scenario name, owning feature, current status, its step executions, start time,
  duration, and attempt number if it was retried.
- **Run Progress**: The live state of the run as a whole. Attributes: the set of scenario executions,
  which are currently running, the aggregate counters that already exist today, and whether progress
  information is available at all. Transient — it belongs to the run in flight and is discarded when
  a new run starts.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: While a scenario is executing, an author can tell which step is currently running
  without reading the log, within 5 seconds of looking at the screen.
- **SC-002**: A step's status appears as running within 1 second of that step starting, and its
  terminal status within 1 second of it completing.
- **SC-003**: When a run finishes, 100% of steps show a terminal status and none remain marked
  running — verified across a passing run, a failing run, a stopped run, and a crashed run.
- **SC-004**: Live per-step outcomes match the final report for 100% of executed steps, verified
  against a fixture suite with known results.
- **SC-005**: During a parallel run of at least 4 concurrent scenarios, every executing scenario is
  shown as running at the same time.
- **SC-006**: In a run of 200 scenarios, the run view continues to update and respond to input
  throughout, and memory used by live state does not grow in proportion to log volume.
- **SC-007**: Given a scenario with one deliberately slow step, an author identifies that step as the
  cause of a stalled run within 15 seconds, without opening the log.
- **SC-008**: Every way of starting a run from the application produces live per-step status —
  verified by exercising each run entry point.
- **SC-009**: When execution progress is unavailable, 100% of runs still complete and report their
  results, with no step left showing running.

## Assumptions

- **Live status appears in the run view, and in the editor when it happens to show the running
  scenario.** The run view can show the executing scenario's steps (FR-011) so step-level detail is
  always reachable; the editor mirrors status when relevant (FR-012). An always-expanded live tree of
  every scenario's steps is not implied.
- **No auto-navigation.** The app never moves the user's editor to follow the run (FR-013); following
  along is something the user chooses, not something that happens to them.
- **The final report remains authoritative.** Live status is a progress indicator, not a new source
  of truth; any disagreement is resolved in favour of the report (FR-017).
- **Retries show the latest attempt**, with the fact of a retry made evident. Full per-attempt
  history is not retained.
- **Live state is transient.** It is not persisted across app restarts and is not written to the
  workspace; reports already cover the durable case.
- **Reuse of the existing log channel is expected**, per the issue. This feature adds execution
  progress; it does not introduce a second logging mechanism, and it must not regress the streaming
  that already works.
- **"Step" means a step as authored in the feature file** — the same steps shown in the editor — not
  internal framework operations.
- **Aggregate progress stays.** The existing counters, progress bar, and elapsed timer are
  complementary to per-step status and are explicitly preserved (FR-018).

## Out of Scope

- **Debugging controls** — pausing a run, stepping through, breakpoints, or resuming. This feature
  observes execution; it does not control it beyond the existing stop.
- **Persisting step-level timings** or building historical trend analysis across runs.
- **Live progress for runs started outside the application** (e.g. from a terminal or CI).
- **Changing what the final report contains**, or replacing it as the source of truth.
- **Per-step screenshots, traces, or artifacts surfaced live**; existing report/trace handling is
  unchanged.
- **Reworking the run configuration or filtering UI**; this feature only adds live progress to runs
  that are already startable.
