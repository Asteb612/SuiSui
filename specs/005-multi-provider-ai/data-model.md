# Phase 1 Data Model: Multi-provider AI integration

**Feature**: 005-multi-provider-ai | **Date**: 2026-06-18

All shared types live in `packages/shared/src/types/ai.ts` and are exported from `packages/shared/src/index.ts` (Constitution Principle V). Secrets are **never** part of any type that crosses the IPC boundary to the renderer (Principle I, spec FR-002).

---

## Entity: AIProviderType

Enumerates the four supported provider categories (spec FR-001). CLI/subscription usage and API-key usage are distinct providers (Session 2026-06-19 clarification).

```ts
type AIProviderType =
  | 'ollama' // local model service
  | 'openai-compatible' // BYOK API key (serves OpenAI + Anthropic via OpenAI-compatible endpoints)
  | 'openai-codex-cli' // OpenAI Codex CLI, subscription session (auto-detectable, no per-token billing)
  | 'claude-subscription' // Claude CLI, subscription session (auto-detectable, no per-token billing)
```

> **User-facing label ↔ enum value** (avoids naming drift with spec FR-001): the spec's **"Claude CLI"** = `'claude-subscription'` and **"OpenAI Codex CLI"** = `'openai-codex-cli'`. Here "subscription" denotes the auth mode (a locally-installed CLI's session, not an API key), not a different product. Keep the enum values as-is; use the "Claude CLI" / "OpenAI Codex CLI" labels in all user-facing UI copy.

The two CLI providers (`openai-codex-cli`, `claude-subscription`) and the local `ollama` provider are **auto-detectable** → detection-gated in the settings UI (FR-020). The `openai-compatible` BYOK provider is **exempt** (always selectable, verified on save).

---

## Entity: AIProviderConfig

The user's chosen provider and its **non-secret** settings. Persisted via `SettingsService` (spec FR-017). No API key here.

| Field       | Type                     | Notes                                                                                          |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `type`      | `AIProviderType \| null` | `null` = no provider configured → AI disabled (FR-014)                                         |
| `model`     | `string \| null`         | Selected model id (e.g. `llama3.2`, a chat model id).                                          |
| `baseUrl`   | `string \| null`         | For `ollama` (default `http://127.0.0.1:11434`) and `openai-compatible`.                       |
| `hasApiKey` | `boolean`                | Derived/non-secret flag indicating a key is stored. Renderer reads this; never the key itself. |

**Validation rules**:

- If `type === 'openai-compatible'`: `baseUrl` required; a stored key is expected (`hasApiKey` true) unless the endpoint is keyless.
- If `type === 'ollama'`: `baseUrl` required (defaulted).
- If `type === 'claude-subscription'`: no `baseUrl`/key required; relies on the locally-installed `claude` CLI.
- If `type === 'openai-codex-cli'`: no `baseUrl`/key required; relies on the locally-installed `codex` CLI (subscription session).

**Persistence**: Added to `AppSettings` as `aiProvider?: AIProviderConfig` with a `DEFAULT_SETTINGS` entry of `{ type: null, model: null, baseUrl: null, hasApiKey: false }`.

---

## Entity: AICredential (main-process only — NEVER crosses to renderer)

A user-supplied secret stored encrypted on disk (spec FR-003). Reuses the `GitCredentialsService` `safeStorage` pattern.

| Field    | Type     | Notes                                              |
| -------- | -------- | -------------------------------------------------- |
| `apiKey` | `string` | Encrypted at rest via `safeStorage.encryptString`. |

**Storage**: encrypted file under the app's user-data / workspace `.app/` directory (consistent with `credentials.enc`). Decrypted only inside the main-process provider; returns `null` if unavailable.

---

## Entity: AIProviderStatus

Result of detection / "test connection" (spec FR-004, FR-005).

| Field       | Type                                                              | Notes                                                                                    |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `available` | `boolean`                                                         | Provider reachable / usable.                                                             |
| `reason`    | `string \| null`                                                  | Human-readable failure reason (e.g. `http 404`, `ECONNREFUSED`, `claude not logged in`). |
| `models`    | `string[] \| null`                                                | For Ollama: list from `/api/tags`.                                                       |
| `detail`    | `'running' \| 'installed-not-running' \| 'not-installed' \| null` | For local-model disambiguation.                                                          |

**Detection-gating (spec FR-020/FR-021)**: the settings UI uses `AIProviderStatus.available` to decide selectability of the **auto-detectable** providers (`ollama`, `claude-subscription`): `available === false` → the option is shown **disabled** with `reason` as the human-readable explanation, never hidden. The `openai-compatible` (BYOK) provider is **exempt** from this gate — it is always selectable and its connection is verified via a `status()` test-connection on save rather than by pre-detection.

---

## Entity: AIStatusTarget (transport — detection probe)

Lets the settings page detect a specific provider **when the page opens, before any config is committed** (spec FR-021), without persisting a config change.

| Field     | Type             | Notes                                                                                        |
| --------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `type`    | `AIProviderType` | Which provider to probe.                                                                     |
| `baseUrl` | `string \| null` | Optional override (e.g. an Ollama host the user typed) used for the probe without saving it. |

`status(target?)`: when `target` is supplied, the main process builds a **transient** provider for that target and returns its `AIProviderStatus` **without mutating** persisted `AIProviderConfig`. When omitted, it probes the currently-configured provider (the "test connection" action, FR-004). Detection runs on settings-page open and on a manual re-detect action; the system does not poll in the background (FR-021).

---

## Entity: AIGenerationRequest

A user intent plus workspace context sent to a provider. The `kind` discriminates the use case.

| Field       | Type                                                            | Notes                                                        |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `requestId` | `string`                                                        | Correlates streamed chunks/cancel (transport).               |
| `kind`      | `'scenario' \| 'step-match' \| 'arg-fill' \| 'failure-explain'` | Use case (US2–US5).                                          |
| `input`     | `string`                                                        | NL description, intent phrase, or failed-test output.        |
| `context`   | `AIRequestContext`                                              | Existing steps + relevant scenario context (FR-007/010/011). |

### AIRequestContext

| Field          | Type                     | Notes                                                          |
| -------------- | ------------------------ | -------------------------------------------------------------- |
| `steps`        | `StepDefinition[]`       | From `window.api.steps.export` — model is told to reuse these. |
| `scenarioText` | `string \| null`         | Current scenario as Gherkin, for arg-fill / matching context.  |
| `targetStep`   | `StepDefinition \| null` | For `arg-fill`: the parameterized step to fill.                |

---

## Entity: AIStreamChunk (transport)

Incremental output streamed main→renderer (spec FR-018).

| Field       | Type     | Notes                                        |
| ----------- | -------- | -------------------------------------------- |
| `requestId` | `string` | Correlation id.                              |
| `delta`     | `string` | Text fragment appended to the running draft. |

Terminal events: `AIStreamDone { requestId, finishReason }` and `AIStreamError { requestId, message }`. An incomplete stream (interrupted) yields a `finishReason` other than success and the draft is marked incomplete (spec edge case).

---

## Entity: AIGenerationResult

The assembled draft plus its validation status (spec FR-008, FR-013). Built in the renderer/store after the stream completes.

| Field           | Type                            | Notes                                                                                                            |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `kind`          | same as request                 | Which use case produced it.                                                                                      |
| `gherkin`       | `string \| null`                | For `scenario` drafts.                                                                                           |
| `suggestedStep` | `StepDefinition \| null`        | For `step-match` (or `null` = no good match, FR-010).                                                            |
| `suggestedArgs` | `Record<string,string> \| null` | For `arg-fill`, mapped to parameter names (FR-011).                                                              |
| `explanation`   | `string \| null`                | For `failure-explain` (FR-012).                                                                                  |
| `validation`    | `ValidationResult \| null`      | For `scenario`: result of running `gherkin` through the existing `ValidationService` before acceptance (FR-008). |
| `incomplete`    | `boolean`                       | True if stream was interrupted.                                                                                  |

**State transitions (scenario draft)**:
`requested → streaming → assembled → validated → (accepted | discarded)`. A draft can only move to `accepted` after `validated`; the user may also `edit` between `validated` and `accepted`. No transition bypasses `validated` (FR-013).

---

## Relationships

- `AIProviderConfig` 1—0..1 `AICredential` (only `openai-compatible` stores a key; `ollama` and the two CLI providers store none).
- `AIGenerationRequest` 1—\* `AIStreamChunk` → 1 `AIGenerationResult`.
- `AIGenerationResult` (kind `scenario`) 1—1 `ValidationResult` (reused from feature 002/validation).
- `AIRequestContext.steps` reuses `StepDefinition` from `@suisui/shared` (no new step type).
