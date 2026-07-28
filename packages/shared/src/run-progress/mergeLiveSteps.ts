import type { ExecutionStatus, ScenarioExecution, StepExecution } from '../types/run-progress'
import { stepTitleMatches } from './stepTitle'

/** One step as shown in the editor / run view, authored text plus live status. */
export interface LiveStepDisplay {
  /** Position among the scenario's steps, background first. */
  index: number
  /** Step text as AUTHORED (with keyword). Never replaced by the reported text. */
  title: string
  status: ExecutionStatus
  /** True for steps contributed by the feature's `Background`. */
  isBackground: boolean
  startedAt?: number
  durationMs?: number
  error?: string
}

/** The authored steps of a scenario, in reported order: background first. */
export interface AuthoredSteps {
  /** Full step titles (`Given I am logged in`), background steps first. */
  titles: string[]
  /** How many leading entries of `titles` come from the feature's Background. */
  backgroundCount: number
}

/**
 * Combine the authored step list with what actually executed.
 *
 * The authored list is the spine — it is the only source of steps that have not
 * run yet, because the reporter emits nothing for them. Two rules matter:
 *
 * **Mismatched titles are dropped.** If the execution recorded at an index does not
 * correspond to the authored step there, the ordinal has drifted and applying the
 * status would paint the wrong step. Showing nothing degrades to the behaviour that
 * predates this feature; showing the wrong thing actively misleads.
 *
 * **Unreported steps of a finished scenario are `skipped`, not `pending`.** A real
 * capture confirms Playwright emits NO events at all for the steps after a failure —
 * there is no skip event to consume. So the tail of a scenario that has stopped
 * running never ran, and saying "pending" would imply it is still coming.
 */
export function mergeLiveSteps(
  authored: AuthoredSteps,
  execution: ScenarioExecution | undefined,
): LiveStepDisplay[] {
  const scenarioFinished =
    execution !== undefined && execution.status !== 'running' && execution.status !== 'pending'

  return authored.titles.map((title, index) => {
    const base: LiveStepDisplay = {
      index,
      title,
      status: 'pending',
      isBackground: index < authored.backgroundCount,
    }

    const step: StepExecution | undefined = execution?.steps[index]

    if (!step || !stepTitleMatches(title, step.title)) {
      // Never ran, or the ordinal drifted. A finished scenario means it will not run.
      return scenarioFinished ? { ...base, status: 'skipped' } : base
    }

    return {
      ...base,
      status: step.status,
      ...(step.startedAt === undefined ? {} : { startedAt: step.startedAt }),
      ...(step.durationMs === undefined ? {} : { durationMs: step.durationMs }),
      ...(step.error === undefined ? {} : { error: step.error }),
    }
  })
}
