# Implementation Plan: Multi-provider AI integration

**Branch**: `005-multi-provider-ai` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-multi-provider-ai/spec.md`

## Summary

Add an **optional** AI assistant to SuiSui that helps users draft and troubleshoot BDD tests, where each user supplies their own AI "quota": local Ollama, a bring-your-own-key OpenAI-compatible API, or their Claude subscription. All AI runs in the **Electron main process** (credentials never reach the renderer) behind a project-owned `IAIProvider` interface (mirroring `ICommandRunner`), with a `FakeAIProvider` so tests never touch a real model. Output **streams** incrementally to the renderer over an IPC event channel. The LLM is a **draft generator** only — generated Gherkin is run back through the existing `ValidationService` before it can be accepted. With no provider configured, the core builder/runner is fully unaffected.

Technical approach (from Phase 0 research):

- Providers A/B via the Vercel AI SDK (`ai`) + `ollama-ai-provider-v2` / `@ai-sdk/openai-compatible`.
- Provider C via `@anthropic-ai/claude-agent-sdk` with a sanitized env (no `ANTHROPIC_API_KEY`) and a streaming-capable invocation — **best-effort**; BYOK-Anthropic API key is the reliable fallback.
- Streaming via `ai:start` (invoke) + `ai:chunk`/`ai:done`/`ai:error` (`webContents.send`) + `ai:cancel` (invoke), with per-`requestId` `AbortController`.
- Encrypted key storage reuses the `GitCredentialsService` `safeStorage` pattern; config persists on `AppSettings` via `SettingsService`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x; new (main-process only): `ai` (v6), `ollama-ai-provider-v2`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`, `zod` (v4)
**Storage**: Encrypted API key via Electron `safeStorage` (file under `.app/`, reusing `GitCredentialsService` pattern); provider config persisted in `AppSettings` JSON via `SettingsService`; in-memory Pinia state in renderer
**Testing**: Vitest 2.x with `FakeAIProvider` (own `IAIProvider`) + `FakeCommandRunner`; AI SDK `ai/test` mocks confined to targeted provider tests
**Target Platform**: Electron desktop (Linux/macOS/Windows)
**Project Type**: Desktop app (Electron main + Nuxt renderer + shared package)
**Performance Goals**: Streamed output visible incrementally (time-to-first-token gated by provider); UI stays responsive — coalesce chunks ~16–50ms, batch renderer updates
**Constraints**: Credentials never cross to renderer; tests never call a real model/CLI/network; subscription path must not bill the API and must not depend on `-p` headless mode
**Scale/Scope**: Single active global provider; one-at-a-time generation per request id; 4 use cases (scenario gen, step match, arg-fill, failure explain)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Notes                                                                                                                                                               |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Process Isolation                 | ✅ PASS | All AI + secrets live in `electron/`; renderer only via `window.api`. Streaming uses `contextBridge`-exposed subscriptions; no Node modules in `app/`.              |
| II. Typed IPC Contracts              | ✅ PASS | New `AI_*` channels + `ai` `ElectronAPI` group defined in `@suisui/shared`; event-channel methods are still typed. All 5 touchpoints updated together.              |
| III. Test Isolation (NON-NEGOTIABLE) | ✅ PASS | `FakeAIProvider` + `FakeCommandRunner`; test-mode handlers like existing `GIT_CRED_*`. Zero real model/CLI/network calls.                                           |
| IV. Service Pattern                  | ✅ PASS | `AIService` + `AICredentialsService` as singleton-factory + constructor DI of `IAIProvider`.                                                                        |
| V. Shared Package SSoT               | ✅ PASS | New `types/ai.ts` exported from shared index; rebuild after changes.                                                                                                |
| VI. Simplicity (YAGNI)               | ✅ PASS | Global single-provider config; no multi-key/per-workspace; streaming is required by clarification, not speculative. Subscription provider kept minimal/best-effort. |

**Result**: PASS — no violations, Complexity Tracking not required.

**Re-check after Phase 1 design**: PASS — data model, contracts, and structure introduce no new violations; the streaming event channel is the only deviation from pure `invoke` and is justified by FR-018 and Electron's documented main→renderer mechanism, with typed contracts preserved.

## Project Structure

### Documentation (this feature)

```text
specs/005-multi-provider-ai/
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions
├── data-model.md        # Phase 1 — entities & types
├── quickstart.md        # Phase 1 — build/verify/manual steps
├── contracts/
│   ├── iai-provider.md  # IAIProvider seam + implementations
│   └── ipc-api.md       # IPC channels & ElectronAPI additions
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 — created by /speckit.tasks (NOT here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/ai.ts                      # NEW: AIProviderType/Config/Status, AIGenerationRequest/Result, stream events
├── ipc/channels.ts                  # EDIT: AI_* channels
├── ipc/api.ts                       # EDIT: ElectronAPI.ai group
└── index.ts                         # EDIT: export types/ai

apps/desktop/electron/
├── services/ai/
│   ├── IAIProvider.ts               # NEW: interface
│   ├── VercelAIProvider.ts          # NEW: Ollama + OpenAI-compatible
│   ├── ClaudeSubscriptionProvider.ts# NEW: claude-agent-sdk (best-effort)
│   ├── FakeAIProvider.ts            # NEW: tests
│   ├── AIService.ts                 # NEW: singleton + DI; use cases
│   └── AICredentialsService.ts      # NEW: safeStorage key (GitCredentials pattern)
├── services/index.ts                # EDIT: export ai services
├── ipc/handlers.ts                  # EDIT: AI_* handlers + stream loop + test-mode
└── preload.ts                       # EDIT: ai bindings + onChunk/onDone/onError unsubscribe

apps/desktop/app/
├── stores/ai.ts                     # NEW: Pinia store (config, status, streaming draft state)
├── components/AiSettingsDialog.vue  # NEW: provider config, key entry, detect/test
├── components/AiGenerationDialog.vue# NEW: NL input, streamed draft, validate, accept/discard
└── pages/index.vue (+ builder)      # EDIT: AI entry points (disabled when unconfigured)

apps/desktop/electron/__tests__/
├── AIService.test.ts                # NEW
├── AICredentialsService.test.ts     # NEW
└── ai-providers.test.ts             # NEW: VercelAIProvider via ai/test mocks; Claude via FakeCommandRunner
```

**Structure Decision**: Follows the existing monorepo layout exactly — shared types in `@suisui/shared`, business logic in `electron/services/` (new `ai/` subfolder), IPC in the standard handlers/preload pair, renderer in `app/` (store + PrimeVue dialogs). No new top-level structure.

## Phasing (maps to epic sub-issues #59)

The epic defines 8 dependency-ordered sub-issues; the plan preserves that ordering for `/speckit.tasks`:

1. **Contracts + provider abstraction + config/credentials plumbing** (types/ai.ts, IPC channels, `IAIProvider`, `AICredentialsService`, `AIService` skeleton, `FakeAIProvider`) — no UI. (US1 foundation)
2. **Concrete providers** — `VercelAIProvider` (Ollama + OpenAI-compatible) + `ClaudeSubscriptionProvider`. (US1)
3. **Settings UI** — `AiSettingsDialog.vue`, encrypted key, Ollama detect, test connection. (US1 complete)
4. **NL → Gherkin generation** + streaming wiring + validate-before-insert. (US2)
5. **Intent → existing-step matching**. (US3)
6. **Argument auto-fill**. (US4)
7. **Playwright failure explanation**. (US5)
8. **Docs + graceful-degradation polish** (disabled entry points, error states).

## Complexity Tracking

No constitutional violations — section intentionally empty.
