# Contract: `IAIProvider` (main-process provider abstraction)

**Feature**: 005-multi-provider-ai

The internal seam every provider implements, mirroring `ICommandRunner`. Lives in the main process (`apps/desktop/electron/services/ai/`). Enables `FakeAIProvider` for tests (Constitution Principle III, IV).

```ts
export interface AIStreamRequest {
  kind: 'scenario' | 'step-match' | 'arg-fill' | 'failure-explain'
  input: string
  context: AIRequestContext
  signal?: AbortSignal // cancellation (maps to provider abortSignal / interrupt)
}

export interface IAIProvider {
  /** Detect availability / "test connection" + (for Ollama) list models. */
  status(): Promise<AIProviderStatus>

  /** Stream incremental text deltas for a request. Throws AbortError on cancel. */
  stream(req: AIStreamRequest): AsyncIterable<string>
}
```

## Implementations

| Class                        | Backs                              | Key behavior                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VercelAIProvider`           | Ollama (A) + OpenAI-compatible (B) | Wraps `streamText({ model, prompt, abortSignal })`; yields `result.textStream`. Reads key from `AICredentialsService` (B) — key stays main-side.                                                                             |
| `ClaudeSubscriptionProvider` | Claude subscription (C)            | Wraps `@anthropic-ai/claude-agent-sdk` `query({ includePartialMessages: true, options: { env: <sanitized, no ANTHROPIC_API_KEY>, abortController } })`. Accumulates `text_delta`. **Best-effort** (see research Decision 3). |
| `FakeAIProvider`             | tests                              | Yields scripted chunks; can simulate abort/error; configurable `status()`. No real model/CLI/network.                                                                                                                        |

## Contract rules

- **R1 — No secrets out**: neither method returns or accepts a secret value that is exposed to the renderer; keys are read internally (FR-002).
- **R2 — Cancellable**: `stream()` MUST honor `signal` and reject with an abort error promptly; the underlying provider call is aborted (FR-015).
- **R3 — Subscription billing safety**: `ClaudeSubscriptionProvider` MUST run with `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` absent from the effective environment so it never silently bills the API (FR-006), and MUST NOT depend on `-p`/`--print` one-shot mode (FR-019).
- **R4 — Draft only**: providers return raw text; correctness is enforced downstream by `ValidationService` (FR-013). Providers never accept/insert into a scenario.
- **R5 — Failure surfacing**: unreachable/timeout/malformed → thrown error with a human-readable message; no partial result is treated as success (FR-015).
