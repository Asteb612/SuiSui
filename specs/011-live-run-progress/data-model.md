# Phase 1 Data Model: Live Run Progress

**Feature**: 011-live-run-progress | **Date**: 2026-07-28

Serializable types cross the IPC bridge and belong in `packages/shared/src/types/run-progress.ts`
(Principle V). The reporter's wire format is documented here too, since it is the contract between a
file running inside the workspace's Playwright and the app's parser.

---

## Shared types (`@suisui/shared`)

### Statuses

```ts
/** Live status of a single step or scenario. */
export type ExecutionStatus =
  | 'pending'      // not yet run
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'      // not executed (e.g. after a failure, or filtered out)
  | 'interrupted'  // the run was stopped, or died, while this was executing
```

`interrupted` is distinct from `failed` on purpose: FR-020 forbids reporting a stopped run's
in-flight step as a failure, and a user who stops a run must not come back to a red step they never
caused.

### `StepExecution`

```ts
export interface StepExecution {
  /** Position among the scenario's steps, background steps first — matches editor order. */
  index: number
  /** Step text WITH keyword, as reported (`Given I am on the "/login" page`). */
  title: string
  status: ExecutionStatus
  /** Epoch ms when it started running; undefined while pending. */
  startedAt?: number
  /** Milliseconds taken; undefined until it reaches a terminal status. */
  durationMs?: number
  /** First error message, when failed. */
  error?: string
}
```

### `ScenarioExecution`

```ts
export interface ScenarioExecution {
  /** Reporter-assigned stable id for this test. The key everything is bucketed by. */
  testId: string
  /** Feature file relative to the features directory (from `extractFeatureRelativePath`). */
  relativePath: string
  /** Scenario title as reported. For a Scenario Outline this identifies the example row. */
  title: string
  status: ExecutionStatus
  /** Steps seen so far, by index. Sparse until the scenario finishes. */
  steps: Record<number, StepExecution>
  startedAt?: number
  durationMs?: number
  /** 0 for the first attempt; ≥1 after a retry (FR: retries show the latest attempt). */
  attempt: number
}
```

`steps` is a map rather than an array because steps arrive as they execute, so an array would need
padding and would blur "not yet started" with "index not yet seen". The **full** step list (for
FR-002's `pending` steps) is not stored here — it comes from the feature file (research Decision 5)
and is merged for display.

### `LiveRunState`

```ts
export interface LiveRunState {
  /** Scenario executions keyed by testId. */
  scenarios: Record<string, ScenarioExecution>
  /** testIds currently executing — a SET, because parallel runs have several. */
  running: string[]
  /**
   * False until the first progress event arrives. Drives the decision to fall
   * back to today's aggregate-counter display (FR-019).
   */
  available: boolean
  /** True once the run has ended and live state has been reconciled with the report. */
  reconciled: boolean
}
```

### `RunProgressEvent`

The discriminated union pushed to the renderer:

```ts
export type RunProgressEvent =
  | { type: 'runStart'; totalTests?: number }
  | {
      type: 'testStart'
      testId: string
      relativePath: string
      title: string
      attempt: number
      at: number
    }
  | { type: 'stepStart'; testId: string; index: number; title: string; at: number }
  | {
      type: 'stepEnd'
      testId: string
      index: number
      title: string
      status: 'passed' | 'failed' | 'skipped'
      durationMs: number
      error?: string
      at: number
    }
  | {
      type: 'testEnd'
      testId: string
      status: ExecutionStatus
      durationMs: number
      at: number
    }
  | { type: 'runEnd'; at: number }
```

Every step event carries **both** `index` and `title`. The title is not decoration: it is what lets
the consumer verify the ordinal it matched and refuse the update on mismatch (research Decision 3).

---

## Reporter wire format (workspace → main process)

One line per event on stdout:

```text
@@SUISUI_PROGRESS@@{"type":"stepStart","testId":"a1b2","index":2,"title":"When I click \"Login\"","at":1730000000123}
```

| Rule | Reason |
| --- | --- |
| One complete JSON object per line, prefixed by the sentinel | The existing handler already emits only complete lines, so a line can never arrive split |
| Sentinel lines are **removed** from the stream before it reaches the log panel | Otherwise the readable run log becomes a wall of JSON (regresses FR-018) |
| A line that is not valid JSON after the sentinel is **skipped** | A malformed event must not abort a run (FR-019) |
| Only steps with `category === 'test.step'` are reported | Excludes hooks, fixtures, and `expect` calls, which are not authored Gherkin steps |
| The reporter never throws out of a callback | A reporter exception must not fail the user's tests (research Decision 7) |

---

## Relationships

```text
Run
 └──< ScenarioExecution (keyed by testId)          ← one per test, incl. each Scenario Outline row
        └──< StepExecution (keyed by step index)   ← background steps first, then scenario steps

Feature file ──parsed──> full step list ──merged with──> StepExecution
                                                        └─> what the UI renders
                                                            (pending steps come from the left side)

Playwright test.file ──extractFeatureRelativePath──> ScenarioExecution.relativePath
```

Display merges two sources: the authored step list (all steps, in order) and the live executions
(status for those that have run). A step present in the authored list with no execution is `pending`.

---

## Validation rules

| Rule | Source | Enforcement point |
| --- | --- | --- |
| A `stepEnd` whose `title` disagrees with the authored step at `index` is **dropped**, not applied | research Decision 3 | Reducer / display merge — mislabelling is worse than showing nothing |
| An event for an unknown `testId` creates its scenario entry rather than being discarded | Robustness | Reducer (events may arrive before `testStart` under interleaving) |
| Only `category === 'test.step'` steps produce events | Data model above | Reporter |
| When the run ends, every `running` step and scenario is forced to a terminal status | FR-006, SC-003 | Reconciliation at `runEnd` |
| Final report results override live statuses where they differ | FR-017 | Reconciliation |
| Starting a run clears all live state | FR-022 | Store, on run start |
| Live state size is bounded by scenario/step count, never by log volume | FR-024, SC-006 | Reducer stores no log text |
| Sentinel lines never appear in the user-visible log | FR-018 | Main process, before forwarding |
| `interrupted` is used for a stopped/crashed run, never `failed` | FR-020 | Reconciliation |

---

## State transitions

**Per step**

```text
pending ──stepStart──> running ──stepEnd(passed)──> passed
                              ├──stepEnd(failed)──> failed
                              └──stepEnd(skipped)─> skipped
                              
running ──run stopped / died──> interrupted        (reconciliation, FR-020/FR-021)
pending ──run ended without ever starting──> skipped
```

**Per scenario**

```text
pending ──testStart──> running ──testEnd──> passed | failed | skipped
                              └──run stopped / died──> interrupted
```

**Live run state**

```text
                 run started
   (empty) ─────────────────────> collecting  (available=false)
                                      │ first progress event
                                      v
                                  collecting  (available=true)
                                      │ runEnd + final report
                                      v
                                  reconciled  (reconciled=true)

   new run started ──> back to (empty)        (FR-022)
```

`available` is what FR-019 hangs on: if it is still false when the run ends, the UI simply shows
today's aggregate counters and nothing is broken.

---

## Extension points (deliberately unbuilt)

- **Per-step artifacts** (screenshots, traces): `StepExecution` gains optional attachment
  references; no other type changes.
- **Per-attempt history**: `ScenarioExecution.attempt` becomes a list of attempts. The current model
  keeps only the latest, per the spec's Assumptions.
- **Persisting timings for trend analysis**: would need a durable store; nothing here assumes state
  is in-memory beyond the fact that it is discarded on the next run.
