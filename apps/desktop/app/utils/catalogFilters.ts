/**
 * Pure filtering + severity helpers for the step catalog UI (feature
 * 006-step-catalog, US3). Kept framework-free so it can be unit-tested without
 * mounting a component.
 */
import type { CatalogStep, DiagnosticSeverity } from '@suisui/shared'

export interface CatalogFilter {
  keyword?: string
  text?: string
  category?: string
  tag?: string
  parameterType?: string
  precision?: string
}

/** Filter catalog steps by keyword, free text, category, tag, type, precision. */
export function filterCatalogSteps(steps: CatalogStep[], filter: CatalogFilter): CatalogStep[] {
  const text = filter.text?.toLowerCase().trim()
  return steps.filter((step) => {
    if (filter.keyword && step.keyword !== filter.keyword) return false
    if (text && !step.pattern.source.toLowerCase().includes(text)) return false
    if (filter.category && step.category !== filter.category) return false
    if (filter.tag && !step.tags.includes(filter.tag)) return false
    if (filter.parameterType && !step.parameters.some((p) => p.type === filter.parameterType)) {
      return false
    }
    if (filter.precision && step.precision !== filter.precision) return false
    return true
  })
}

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = { info: 0, warning: 1, error: 2 }

/** Highest diagnostic severity on a step, or null when it has none. */
export function stepMaxSeverity(step: CatalogStep): DiagnosticSeverity | null {
  let max: DiagnosticSeverity | null = null
  for (const d of step.diagnostics) {
    if (max === null || SEVERITY_RANK[d.severity] > SEVERITY_RANK[max]) max = d.severity
  }
  return max
}

/** A short "file:line" source label for display. */
export function stepSourceLabel(step: CatalogStep): string {
  return `${step.source.file}:${step.source.line}`
}
