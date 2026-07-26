import type { StepDefinition } from './step'
import type { ValidationResult } from './validation'

/**
 * The four supported AI provider categories. CLI/subscription usage and API-key
 * usage are distinct, separately-selectable providers (spec FR-001).
 * - `ollama`: a model running locally via Ollama.
 * - `openai-compatible`: a bring-your-own-key OpenAI-compatible API (also a BYOK Anthropic API key).
 * - `openai-codex-cli`: the user's ChatGPT/Codex subscription, driven via the locally-installed `codex` CLI (best-effort, no per-token billing).
 * - `claude-subscription`: the user's Claude subscription, driven via the locally-installed `claude` CLI (best-effort, no per-token billing).
 */
export type AIProviderType = 'ollama' | 'openai-compatible' | 'openai-codex-cli' | 'claude-subscription'

/**
 * Reasoning-effort hint for reasoning-capable providers. Defaults to `medium`.
 * It is forwarded to backends that expose a reasoning-effort control (the Codex
 * CLI via `model_reasoning_effort`); providers without one ignore it.
 */
export type AIReasoningEffort = 'low' | 'medium' | 'high'

/** The valid reasoning-effort values, in ascending order. */
export const AI_REASONING_EFFORTS: readonly AIReasoningEffort[] = ['low', 'medium', 'high']

/** Default reasoning effort applied to every provider. */
export const DEFAULT_AI_REASONING_EFFORT: AIReasoningEffort = 'medium'

/**
 * The set of provider types whose availability can be auto-detected (local service /
 * installed-and-logged-in CLI). Selection of these is gated on detection in the
 * settings UI (spec FR-020); `openai-compatible` (BYOK) is exempt — always selectable,
 * verified on save.
 */
export const AUTO_DETECTABLE_PROVIDER_TYPES: readonly AIProviderType[] = [
  'ollama',
  'openai-codex-cli',
  'claude-subscription',
]

/**
 * The user's chosen provider and its NON-SECRET settings. Persisted via SettingsService.
 * A secret API key is NEVER stored here — only the `hasApiKey` flag crosses to the renderer.
 */
export interface AIProviderConfig {
  type: AIProviderType | null
  model: string | null
  baseUrl: string | null
  hasApiKey: boolean
  /** Reasoning effort for reasoning-capable providers. Absent on pre-existing configs → treated as `medium`. */
  effort?: AIReasoningEffort
}

export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
  type: null,
  model: null,
  baseUrl: null,
  hasApiKey: false,
  effort: DEFAULT_AI_REASONING_EFFORT,
}

/** Result of provider detection / "test connection". */
export interface AIProviderStatus {
  available: boolean
  reason: string | null
  models: string[] | null
  detail: 'running' | 'installed-not-running' | 'not-installed' | null
}

/**
 * Probe a specific provider on the settings page BEFORE any config is committed
 * (spec FR-021). When passed to `ai.status(target)`, the main process builds a
 * transient provider for this target and returns its status WITHOUT persisting a
 * config change. Omitting the target probes the currently-configured provider.
 */
export interface AIStatusTarget {
  type: AIProviderType
  baseUrl?: string | null
}

/** The use case a generation request serves. */
export type AIGenerationKind = 'step-match' | 'arg-fill' | 'failure-explain' | 'failure-fix'

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
