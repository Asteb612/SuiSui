import type { CatalogStep, RecordedAction, StepArg, StepMatch } from '@suisui/shared'
import { catalogStepToStepDefinition } from '@suisui/shared'
import { getAIService } from '../ai/AIService'
import { getSettingsService } from '../SettingsService'
import { mapParamType } from './StepMatcherService'

/** Raw suggestion shape an AI matcher returns (before validation). */
export interface RecorderAiSuggestion {
  definitionId: string
  arguments: Record<string, string>
  confidence: number
  reason?: string
}

export interface RecorderAiInput {
  action: RecordedAction
  candidateSteps: CatalogStep[]
}

/**
 * Optional AI matching seam (US6). Behind a feature flag; NEVER a dependency of
 * basic recording. The default production matcher is settings-gated (off by
 * default). Tests inject a fake (Constitution III).
 */
export interface IRecorderAiMatcher {
  isEnabled(): Promise<boolean>
  suggest(input: RecorderAiInput): Promise<RecorderAiSuggestion | null>
}

/** No-op matcher: AI is unavailable/disabled. */
export class NullRecorderAiMatcher implements IRecorderAiMatcher {
  async isEnabled(): Promise<boolean> {
    return false
  }
  async suggest(): Promise<RecorderAiSuggestion | null> {
    return null
  }
}

/**
 * Real matcher: gated on `recorderAiEnabled` + a configured provider. Reuses the
 * feature-005 `step-match` capability to pick an existing step; arguments are
 * left for the user to fill (never auto-accepted), and the confidence is a
 * recommendation-level heuristic.
 */
export class AiRecorderMatcher implements IRecorderAiMatcher {
  async isEnabled(): Promise<boolean> {
    try {
      const settings = await getSettingsService().get()
      if (!settings.recorderAiEnabled) return false
      const config = await getAIService().getConfig()
      return config.type != null
    } catch {
      return false
    }
  }

  async suggest(input: RecorderAiInput): Promise<RecorderAiSuggestion | null> {
    const steps = input.candidateSteps.map(catalogStepToStepDefinition)
    // The label already excludes secret values (redacted upstream, FR-026).
    const description = `${input.action.type}: ${input.action.label}`
    let text = ''
    for await (const delta of getAIService().stream({
      kind: 'step-match',
      input: description,
      context: { steps, scenarioText: null, targetStep: null },
    })) {
      text += delta
    }
    const trimmed = text.trim()
    if (!trimmed || trimmed === 'NONE') return null
    const chosen = input.candidateSteps.find(
      (s) => `${s.keyword} ${s.pattern.source}` === trimmed || s.pattern.source === trimmed
    )
    if (!chosen) return null
    return { definitionId: chosen.id, arguments: {}, confidence: 0.7, reason: 'Suggested by AI' }
  }
}

/**
 * Validate a raw AI suggestion against the real catalog + argument schema and
 * apply the confidence gate (FR-016). Returns a user-facing `StepMatch`
 * (source `'ai'`) or `null` (discard) — never auto-accepted by the caller.
 */
export function validateAiSuggestion(
  suggestion: RecorderAiSuggestion | null,
  catalogSteps: CatalogStep[]
): StepMatch | null {
  if (!suggestion || typeof suggestion.definitionId !== 'string') return null
  if (typeof suggestion.confidence !== 'number' || suggestion.confidence < 0.65) return null

  const step = catalogSteps.find((s) => s.id === suggestion.definitionId)
  if (!step) return null // unknown definition → discard

  const paramNames = new Set(step.parameters.map((p) => p.name))
  const provided = suggestion.arguments ?? {}
  // Reject arguments that don't exist on the step (schema mismatch).
  for (const key of Object.keys(provided)) {
    if (!paramNames.has(key)) return null
  }

  const args: StepArg[] = step.parameters.map((param) => ({
    name: param.name,
    value: provided[param.name] ?? '',
    type: mapParamType(param.type),
    ...(param.enumValues ? { enumValues: param.enumValues } : {}),
    ...(param.tableColumns ? { tableColumns: param.tableColumns } : {}),
  }))

  return {
    definitionId: step.id,
    keyword: step.keyword,
    pattern: step.pattern.source,
    args,
    confidence: suggestion.confidence,
    source: 'ai',
    ...(suggestion.reason ? { reason: suggestion.reason } : {}),
    ...(step.source ? { definitionLocation: step.source } : {}),
  }
}
