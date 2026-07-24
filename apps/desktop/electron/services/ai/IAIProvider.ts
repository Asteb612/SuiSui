import type { AIGenerationKind, AIProviderStatus, AIRequestContext } from '@suisui/shared'

/**
 * A single generation request handed to a provider. The provider turns this into
 * a streamed sequence of text deltas. Correctness of the output is NOT the
 * provider's concern — generated Gherkin is validated downstream by ValidationService.
 */
export interface AIStreamRequest {
  kind: AIGenerationKind
  input: string
  context: AIRequestContext
  /** Cancellation — maps to the underlying provider's abortSignal / interrupt(). */
  signal?: AbortSignal
}

/**
 * The internal seam every AI provider implements, mirroring `ICommandRunner`.
 * Lives in the main process; secrets never cross to the renderer.
 */
export interface IAIProvider {
  /** Detect availability / "test connection" and (for Ollama) list models. */
  status(): Promise<AIProviderStatus>

  /** Stream incremental text deltas. Throws an AbortError if `req.signal` aborts. */
  stream(req: AIStreamRequest): AsyncIterable<string>
}
