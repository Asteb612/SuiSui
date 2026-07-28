/**
 * Live run progress (feature 011).
 *
 * A custom Playwright reporter emits events while tests execute; these types are
 * the contract between that reporter, the main process that parses its output,
 * and the renderer that displays it.
 */

/** Live status of a single step or scenario. */
export type ExecutionStatus =
  /** Not yet run. */
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  /** Not executed — e.g. after an earlier failure, or filtered out. */
  | 'skipped'
  /**
   * The run was stopped, or died, while this was executing.
   *
   * Deliberately distinct from `failed`: a user who stops a run must not come
   * back to a red step they never caused.
   */
  | 'interrupted'

/** One step of one executing scenario. */
export interface StepExecution {
  /** Position among the scenario's steps, background first — matches editor order. */
  index: number
  /** Step text WITH keyword, as reported (`Given I am on the "/login" page`). */
  title: string
  status: ExecutionStatus
  /** Epoch ms when it started running; absent while pending. */
  startedAt?: number
  /** Milliseconds taken; absent until it reaches a terminal status. */
  durationMs?: number
  /** First error message, when failed. */
  error?: string
}

/** One executing scenario, or one `Scenario Outline` example row. */
export interface ScenarioExecution {
  /** Reporter-assigned stable id for this test — the key everything is bucketed by. */
  testId: string
  /** Feature file relative to the features directory. */
  relativePath: string
  /** Scenario title as reported. For an outline this identifies the example row. */
  title: string
  status: ExecutionStatus
  /**
   * Steps seen so far, keyed by index. Sparse: a step appears only once it has
   * started, so the full list (including pending steps) comes from the feature
   * file, not from here.
   */
  steps: Record<number, StepExecution>
  startedAt?: number
  durationMs?: number
  /** 0 for the first attempt; >=1 after a retry. Only the latest is kept. */
  attempt: number
}

export interface LiveRunState {
  /** Scenario executions keyed by testId. */
  scenarios: Record<string, ScenarioExecution>
  /**
   * testIds currently executing.
   *
   * A SET, not a single value: parallel runs genuinely have several tests in
   * flight and their events interleave.
   */
  running: string[]
  /**
   * False until the first progress event arrives. When it is still false at the
   * end of a run, the UI falls back to the aggregate counters that predate this
   * feature — a missing reporter must never break anything.
   */
  available: boolean
  /** True once the run ended and live state was reconciled against the report. */
  reconciled: boolean
}

/** Terminal statuses a step can report. */
export type StepEndStatus = 'passed' | 'failed' | 'skipped'

/** Events pushed from the main process to the renderer. */
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
      /**
       * Carried on every step event so the consumer can verify the ordinal it
       * matched. On mismatch the update is DROPPED — a status on the wrong step
       * is worse than no status at all.
       */
      title: string
      status: StepEndStatus
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

/** Prefix marking a structured progress line on the runner's stdout. */
export const PROGRESS_SENTINEL = '@@SUISUI_PROGRESS@@'

export function emptyLiveRunState(): LiveRunState {
  return { scenarios: {}, running: [], available: false, reconciled: false }
}
