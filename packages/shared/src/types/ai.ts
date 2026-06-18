import type { StepDefinition } from './step'
import type { ValidationResult } from './validation'

/**
 * The three supported AI provider categories.
 * - `ollama`: a model running locally via Ollama.
 * - `openai-compatible`: a bring-your-own-key OpenAI-compatible API (also a BYOK Anthropic API key).
 * - `claude-subscription`: the user's Claude subscription, driven via the locally-installed `claude` (best-effort).
 */
export type AIProviderType = 'ollama' | 'openai-compatible' | 'claude-subscription'

/**
 * The user's chosen provider and its NON-SECRET settings. Persisted via SettingsService.
 * A secret API key is NEVER stored here — only the `hasApiKey` flag crosses to the renderer.
 */
export interface AIProviderConfig {
  type: AIProviderType | null
  model: string | null
  baseUrl: string | null
  hasApiKey: boolean
}

export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
  type: null,
  model: null,
  baseUrl: null,
  hasApiKey: false,
}

/** Result of provider detection / "test connection". */
export interface AIProviderStatus {
  available: boolean
  reason: string | null
  models: string[] | null
  detail: 'running' | 'installed-not-running' | 'not-installed' | null
}

/** The use case a generation request serves. */
export type AIGenerationKind = 'scenario' | 'step-match' | 'arg-fill' | 'failure-explain'

/** Workspace context supplied to the model so drafts prefer reuse over invention. */
export interface AIRequestContext {
  steps: StepDefinition[]
  scenarioText: string | null
  targetStep: StepDefinition | null
}

/** A user intent plus workspace context sent to a provider. */
export interface AIGenerationRequest {
  requestId: string
  kind: AIGenerationKind
  input: string
  context: AIRequestContext
}

/** An incremental text fragment streamed main -> renderer. */
export interface AIStreamChunk {
  requestId: string
  delta: string
}

/** Terminal success event for a stream. */
export interface AIStreamDone {
  requestId: string
  finishReason: string
}

/** Terminal error event for a stream. */
export interface AIStreamError {
  requestId: string
  message: string
}

/** The assembled draft plus its validation status (built in the renderer after the stream completes). */
export interface AIGenerationResult {
  kind: AIGenerationKind
  gherkin: string | null
  suggestedStep: StepDefinition | null
  suggestedArgs: Record<string, string> | null
  explanation: string | null
  validation: ValidationResult | null
  incomplete: boolean
}
