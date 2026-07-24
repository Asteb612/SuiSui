# Implementation Plan: Multi-provider AI integration

**Branch**: `005-multi-provider-ai` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-multi-provider-ai/spec.md`

## Summary

Add an **optional** AI assistant to SuiSui that helps users draft and troubleshoot BDD tests, where each user supplies their own AI "quota". The user **selects the active provider on a settings page** from **four provider types** (Session 2026-06-19 clarifications): a local Ollama model, a bring-your-own-key OpenAI-compatible API (serves OpenAI and Anthropic via their OpenAI-compatible endpoints), the **OpenAI Codex CLI** (subscription session), and the **Claude CLI** (subscription session). CLI usage and API-key usage are **separate, separately-selectable providers**. The three auto-detectable providers (Ollama, Codex CLI, Claude CLI) are **selectable only when detected** — undetected ones are shown disabled with a human-readable reason and a re-detect action; the BYOK API provider is always selectable and verified on save (FR-020/FR-021).

All AI runs in the **Electron main process** (credentials never reach the renderer) behind a project-owned `IAIProvider` interface (mirroring `ICommandRunner`), with a `FakeAIProvider` so tests never touch a real model/CLI. Output **streams** incrementally to the renderer over an IPC event channel. The LLM is a **draft generator** only — generated Gherkin is run back through the existing `ValidationService` before it can be accepted. With no provider configured, the core builder/runner is fully unaffected.

Technical approach (from Phase 0 research):

- Providers A/B via the Vercel AI SDK (`ai`) + `ollama-ai-provider-v2` / `@ai-sdk/openai-compatible`.
- Provider C (Claude CLI) via `@anthropic-ai/claude-agent-sdk` with a sanitized env (no `ANTHROPIC_API_KEY`) and a streaming-capable invocation — **best-effort**.
- Provider D (OpenAI Codex CLI) by driving the locally-installed `codex` CLI in non-interactive streaming mode with a sanitized env (no `OPENAI_API_KEY`) so it uses the ChatGPT/Codex subscription session, never per-token API billing — **best-effort**; mirrors provider C. Both CLI providers share a common subprocess pattern (research Decision 3/3b).
- Streaming via `ai:start` (invoke) + `ai:chunk`/`ai:done`/`ai:error` (`webContents.send`) + `ai:cancel` (invoke), with per-`requestId` `AbortController`.
- **Detection on open**: `ai:status` accepts an optional _probe target_ `{ type, baseUrl }` so the settings page can detect each auto-detectable provider **without persisting a config change** (FR-021); omitting the target probes the configured provider (test-connection). No background polling.
- Encrypted key storage reuses the `GitCredentialsService` `safeStorage` pattern; config persists on `AppSettings` via `SettingsService`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x; new (main-process only): `ai` (v6), `ollama-ai-provider-v2`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`; the OpenAI Codex CLI is driven as a subprocess (via the existing `CommandRunner` / a thin SDK if available — see research Decision 3b), no always-on HTTP dependency. (`zod` was planned for structured output but removed in Polish — all four use cases assemble results in the renderer via existing utilities; see analysis finding U1.)
**Storage**: Encrypted API key via Electron `safeStorage` (file under `.app/`, reusing `GitCredentialsService` pattern); provider config persisted in `AppSettings` JSON via `SettingsService`; in-memory Pinia state in renderer
**Testing**: Vitest 2.x with `FakeAIProvider` (own `IAIProvider`) + `FakeCommandRunner`; AI SDK `ai/test` mocks confined to targeted provider tests
**Target Platform**: Electron desktop (Linux/macOS/Windows)
**Project Type**: Desktop app (Electron main + Nuxt renderer + shared package)
**Performance Goals**: Streamed output visible incrementally (time-to-first-token gated by provider); UI stays responsive — coalesce chunks ~16–50ms, batch renderer updates; settings-open detection probes the three auto-detectable providers with a short timeout (~1500ms) so the page is usable quickly (SC-001 <3 min)
**Constraints**: Credentials never cross to renderer; tests never call a real model/CLI/network; each CLI provider must not bill its API (no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in its effective env) and must not depend on one-shot headless mode; detection probes MUST NOT persist a config change
**Scale/Scope**: Single active global provider; one-at-a-time generation per request id; 4 provider types; 4 use cases (scenario gen, step match, arg-fill, failure explain)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Notes                                                                                                                                                                                                         |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Process Isolation                 | ✅ PASS | All AI + secrets live in `electron/`; renderer only via `window.api`. Streaming uses `contextBridge`-exposed subscriptions; no Node modules in `app/`.                                                        |
| II. Typed IPC Contracts              | ✅ PASS | New `AI_*` channels + `ai` `ElectronAPI` group defined in `@suisui/shared`; the fourth `AIProviderType` and the `status` probe-target arg are typed. All 5 touchpoints updated together.                      |
| III. Test Isolation (NON-NEGOTIABLE) | ✅ PASS | `FakeAIProvider` + `FakeCommandRunner`; both CLI providers are subprocesses faked via `FakeCommandRunner`. Test-mode handlers like existing `GIT_CRED_*`. Zero real model/CLI/network calls.                  |
| IV. Service Pattern                  | ✅ PASS | `AIService` + `AICredentialsService` as singleton-factory + constructor DI of `IAIProvider`. The two CLI providers share a common subprocess pattern without premature abstraction.                           |
| V. Shared Package SSoT               | ✅ PASS | New `types/ai.ts` exported from shared index; rebuild after changes.                                                                                                                                          |
| VI. Simplicity (YAGNI)               | ✅ PASS | Global single-provider config; no multi-key/per-workspace. The fourth provider is a direct user requirement, not speculative; it reuses the CLI/subprocess + sanitized-env pattern already needed for Claude. |

**Result**: PASS — no violations, Complexity Tracking not required.

**Re-check after Phase 1 design**: PASS — adding the Codex CLI provider introduces no new architectural seam (it is another `IAIProvider` subprocess implementation) and no new IPC channel (only a fourth enum value). The streaming event channel and the `status()` probe-target overload remain the only deviations, both justified. Typed contracts preserved.

## Project Structure

### Documentation (this feature)

```text
specs/005-multi-provider-ai/
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions (incl. Decision 3b: Codex CLI)
├── data-model.md        # Phase 1 — entities & types (4 provider types)
├── quickstart.md        # Phase 1 — build/verify/manual steps (A/B/C/D)
├── contracts/
│   ├── iai-provider.md  # IAIProvider seam + implementations (incl. OpenAiCodexProvider)
│   └── ipc-api.md       # IPC channels & ElectronAPI additions
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 — created by /speckit.tasks (NOT here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/ai.ts                      # NEW: AIProviderType (4 values), Config/Status, AIStatusTarget, AIGenerationRequest/Result, stream events
├── ipc/channels.ts                  # EDIT: AI_* channels
├── ipc/api.ts                       # EDIT: ElectronAPI.ai group (status accepts optional probe target)
└── index.ts                         # EDIT: export types/ai

apps/desktop/electron/
├── services/ai/
│   ├── IAIProvider.ts               # NEW: interface
│   ├── VercelAIProvider.ts          # NEW: Ollama + OpenAI-compatible
│   ├── ClaudeSubscriptionProvider.ts# NEW: claude-agent-sdk (best-effort)
│   ├── OpenAiCodexProvider.ts       # NEW: codex CLI subprocess, sanitized env (best-effort)
│   ├── FakeAIProvider.ts            # NEW: tests
│   ├── AIService.ts                 # NEW: singleton + DI; use cases; status(target) builds a transient provider to probe without persisting
│   └── AICredentialsService.ts      # NEW: safeStorage key (GitCredentials pattern)
├── services/index.ts                # EDIT: export ai services
├── ipc/handlers.ts                  # EDIT: AI_* handlers + stream loop + test-mode
└── preload.ts                       # EDIT: ai bindings + onChunk/onDone/onError unsubscribe

apps/desktop/app/
├── stores/ai.ts                     # NEW: Pinia store (config, per-provider detection status, streaming draft state)
├── components/AiSettingsDialog.vue  # NEW: detection-gated select (4 providers), key entry, detect-on-open/re-detect/test
├── components/AiGenerationDialog.vue# NEW: NL input, streamed draft, validate, accept/discard
└── pages/index.vue (+ builder)      # EDIT: AI entry points (disabled when unconfigured)

apps/desktop/electron/__tests__/
├── AIService.test.ts                # NEW (incl. status(target) probe-without-persist; provider selection across 4 types)
├── AICredentialsService.test.ts     # NEW
└── ai-providers.test.ts             # NEW: VercelAIProvider via ai/test mocks; both CLI providers via FakeCommandRunner (assert no API key in effective env)
```

**Structure Decision**: Follows the existing monorepo layout exactly — shared types in `@suisui/shared`, business logic in `electron/services/` (new `ai/` subfolder), IPC in the standard handlers/preload pair, renderer in `app/` (store + PrimeVue dialogs). The two CLI providers are sibling `IAIProvider` implementations; a shared private helper for env-sanitization + delta accumulation is acceptable but no public abstraction is introduced (Principle VI). No new top-level structure.

## Phasing (maps to epic sub-issues #59)

The epic defines 8 dependency-ordered sub-issues; the plan preserves that ordering for `/speckit.tasks`:

1. **Contracts + provider abstraction + config/credentials plumbing** (types/ai.ts incl. 4 `AIProviderType` values + `AIStatusTarget`, IPC channels with the `status` probe-target overload, `IAIProvider`, `AICredentialsService`, `AIService` skeleton, `FakeAIProvider`) — no UI. (US1 foundation)
2. **Concrete providers** — `VercelAIProvider` (Ollama + OpenAI-compatible) + `ClaudeSubscriptionProvider` + `OpenAiCodexProvider`. (US1)
3. **Settings UI** — `AiSettingsDialog.vue`: detection-gated select across all four providers (auto-detect on open + manual re-detect; undetected = disabled-with-reason; BYOK always selectable), encrypted key, test connection. (US1 complete — FR-020/FR-021)
4. **NL → Gherkin generation** + streaming wiring + validate-before-insert. (US2)
5. **Intent → existing-step matching**. (US3)
6. **Argument auto-fill**. (US4)
7. **Playwright failure explanation**. (US5)
8. **Docs + graceful-degradation polish** (disabled entry points, error states, CLI best-effort + billing-safety caveats for both Claude and Codex).

## Complexity Tracking

No constitutional violations — section intentionally empty.
