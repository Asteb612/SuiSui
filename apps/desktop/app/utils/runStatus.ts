import type { ExecutionStatus } from '@suisui/shared'

/**
 * How a live execution status is presented.
 *
 * Status must never be conveyed by colour alone: each one carries a distinct icon
 * and a text label, so it is readable with a colour-vision deficiency and to a
 * screen reader.
 */
export interface StatusPresentation {
  /** PrimeIcons class. */
  icon: string
  /** Human label, used as the accessible name and tooltip. */
  label: string
}

const PRESENTATION: Record<ExecutionStatus, StatusPresentation> = {
  pending: { icon: 'pi pi-circle', label: 'Not run yet' },
  running: { icon: 'pi pi-spin pi-spinner', label: 'Running' },
  passed: { icon: 'pi pi-check-circle', label: 'Passed' },
  failed: { icon: 'pi pi-times-circle', label: 'Failed' },
  skipped: { icon: 'pi pi-minus-circle', label: 'Skipped' },
  interrupted: { icon: 'pi pi-ban', label: 'Interrupted' },
}

export function statusPresentation(status: ExecutionStatus): StatusPresentation {
  return PRESENTATION[status] ?? PRESENTATION.pending
}

/** Format a duration for display beside a step. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
