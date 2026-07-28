import type {
  ExecutionStatus,
  LiveRunState,
  RunProgressEvent,
  ScenarioExecution,
  StepExecution,
} from '../types/run-progress'

/** How a run finished, which decides what in-flight work becomes. */
export type RunOutcome = 'completed' | 'stopped'

const TERMINAL: readonly ExecutionStatus[] = ['passed', 'failed', 'skipped', 'interrupted']

function isTerminal(status: ExecutionStatus): boolean {
  return TERMINAL.includes(status)
}

function blankScenario(testId: string): ScenarioExecution {
  return {
    testId,
    relativePath: '',
    title: '',
    status: 'running',
    steps: {},
    attempt: 0,
  }
}

/**
 * Should this step event be trusted?
 *
 * Step→editor mapping is by ordinal, because playwright-bdd reports step
 * locations against the GENERATED spec rather than the .feature file. The title
 * is the cross-check: if it disagrees with the authored step at that index, the
 * ordinal has drifted and applying the status would paint the wrong step. Better
 * to show nothing, which degrades to the behaviour that predates this feature.
 *
 * With no authored list available we cannot verify, and the reporter's own count
 * is the best information there is — so the event is applied.
 */
function titleMatches(authored: string[] | undefined, index: number, title: string): boolean {
  if (!authored) return true
  const expected = authored[index]
  if (expected === undefined) return false
  return expected.trim() === title.trim()
}

/**
 * Apply one progress event to live run state, returning new state.
 *
 * Pure: no I/O, no store, no clock. `authoredSteps` is the scenario's steps as
 * written in the feature file, used only to verify ordinals.
 */
export function applyProgressEvent(
  state: LiveRunState,
  event: RunProgressEvent,
  authoredSteps?: string[],
): LiveRunState {
  const next: LiveRunState = { ...state, available: true }

  switch (event.type) {
    case 'runStart':
      return next

    case 'runEnd':
      return next

    case 'testStart': {
      const existing = state.scenarios[event.testId]
      const scenario: ScenarioExecution = {
        ...(existing ?? blankScenario(event.testId)),
        testId: event.testId,
        relativePath: event.relativePath,
        title: event.title,
        status: 'running',
        attempt: event.attempt,
        startedAt: event.at,
        // A retry re-runs from the first step; carrying the previous attempt's
        // step statuses would show steps as passed before they have run again.
        steps: existing && existing.attempt !== event.attempt ? {} : (existing?.steps ?? {}),
      }
      return {
        ...next,
        scenarios: { ...state.scenarios, [event.testId]: scenario },
        running: state.running.includes(event.testId)
          ? state.running
          : [...state.running, event.testId],
      }
    }

    case 'testEnd': {
      const existing = state.scenarios[event.testId] ?? blankScenario(event.testId)
      return {
        ...next,
        scenarios: {
          ...state.scenarios,
          [event.testId]: {
            ...existing,
            status: event.status,
            durationMs: event.durationMs,
          },
        },
        running: state.running.filter((id) => id !== event.testId),
      }
    }

    case 'stepStart':
    case 'stepEnd': {
      if (!titleMatches(authoredSteps, event.index, event.title)) return next

      const existing = state.scenarios[event.testId] ?? blankScenario(event.testId)
      const previous = existing.steps[event.index]

      const step: StepExecution =
        event.type === 'stepStart'
          ? {
              ...(previous ?? {}),
              index: event.index,
              title: event.title,
              status: 'running',
              startedAt: event.at,
            }
          : {
              ...(previous ?? { index: event.index, title: event.title }),
              index: event.index,
              title: event.title,
              status: event.status,
              durationMs: event.durationMs,
              ...(event.error === undefined ? {} : { error: event.error }),
            }

      return {
        ...next,
        scenarios: {
          ...state.scenarios,
          [event.testId]: {
            ...existing,
            steps: { ...existing.steps, [event.index]: step },
          },
        },
        running: state.running.includes(event.testId)
          ? state.running
          : [...state.running, event.testId],
      }
    }

    default:
      return next
  }
}

/**
 * Settle live state at the end of a run.
 *
 * Nothing may be left showing `running`: a stopped or crashed run must not leave
 * a step spinning forever. In-flight work becomes `interrupted` rather than
 * `failed` — the user stopped it, they did not break it. Steps never reached are
 * left absent, so they render as pending/not-run rather than as failures.
 */
export function reconcileLiveRun(state: LiveRunState, outcome: RunOutcome): LiveRunState {
  const settled: ExecutionStatus = outcome === 'stopped' ? 'interrupted' : 'skipped'

  const scenarios: Record<string, ScenarioExecution> = {}
  for (const [testId, scenario] of Object.entries(state.scenarios)) {
    const steps: Record<number, StepExecution> = {}
    for (const [index, step] of Object.entries(scenario.steps)) {
      steps[Number(index)] = isTerminal(step.status) ? step : { ...step, status: settled }
    }
    scenarios[testId] = {
      ...scenario,
      status: isTerminal(scenario.status) ? scenario.status : settled,
      steps,
    }
  }

  return { ...state, scenarios, running: [], reconciled: true }
}
