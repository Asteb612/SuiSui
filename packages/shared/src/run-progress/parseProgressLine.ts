import type { ExecutionStatus, RunProgressEvent, StepEndStatus } from '../types/run-progress'
import { PROGRESS_SENTINEL } from '../types/run-progress'

const STEP_END_STATUSES: readonly string[] = ['passed', 'failed', 'skipped']
const EXECUTION_STATUSES: readonly string[] = [
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
  'interrupted',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Parse one line of runner stdout into a progress event.
 *
 * Returns `null` for anything that is not a well-formed progress line, so
 * ordinary log output flows through untouched. The payload is untrusted input —
 * it comes from a process running the user's own test code — so every field is
 * checked and nothing here ever throws.
 */
export function parseProgressLine(line: string): RunProgressEvent | null {
  const trimmed = line.trimEnd()

  // Only a line that STARTS with the sentinel is ours. Matching mid-line would
  // let ordinary test output forge progress events.
  if (!trimmed.startsWith(PROGRESS_SENTINEL)) return null

  let payload: unknown
  try {
    payload = JSON.parse(trimmed.slice(PROGRESS_SENTINEL.length))
  } catch {
    return null
  }
  if (!isRecord(payload)) return null

  switch (payload.type) {
    case 'runStart': {
      const totalTests = num(payload.totalTests)
      return totalTests === null ? { type: 'runStart' } : { type: 'runStart', totalTests }
    }

    case 'testStart': {
      const testId = str(payload.testId)
      const relativePath = str(payload.relativePath)
      const title = str(payload.title)
      const attempt = num(payload.attempt)
      const at = num(payload.at)
      if (testId === null || relativePath === null || title === null) return null
      if (attempt === null || at === null) return null

      // Optional: an older reporter left in a workspace omits it entirely.
      const specPath = str(payload.specPath)
      return {
        type: 'testStart',
        testId,
        relativePath,
        title,
        attempt,
        at,
        ...(specPath === null ? {} : { specPath }),
      }
    }

    case 'stepStart': {
      const testId = str(payload.testId)
      const title = str(payload.title)
      const index = num(payload.index)
      const at = num(payload.at)
      if (testId === null || title === null || index === null || at === null) return null
      return { type: 'stepStart', testId, index, title, at }
    }

    case 'stepEnd': {
      const testId = str(payload.testId)
      const title = str(payload.title)
      const index = num(payload.index)
      const durationMs = num(payload.durationMs)
      const at = num(payload.at)
      const status = str(payload.status)
      if (testId === null || title === null || index === null) return null
      if (durationMs === null || at === null || status === null) return null
      if (!STEP_END_STATUSES.includes(status)) return null

      const error = str(payload.error)
      return {
        type: 'stepEnd',
        testId,
        index,
        title,
        status: status as StepEndStatus,
        durationMs,
        at,
        ...(error === null ? {} : { error }),
      }
    }

    case 'testEnd': {
      const testId = str(payload.testId)
      const status = str(payload.status)
      const durationMs = num(payload.durationMs)
      const at = num(payload.at)
      if (testId === null || status === null || durationMs === null || at === null) return null
      if (!EXECUTION_STATUSES.includes(status)) return null
      return { type: 'testEnd', testId, status: status as ExecutionStatus, durationMs, at }
    }

    case 'runEnd': {
      const at = num(payload.at)
      return at === null ? null : { type: 'runEnd', at }
    }

    default:
      return null
  }
}
