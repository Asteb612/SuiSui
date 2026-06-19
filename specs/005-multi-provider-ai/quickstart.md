# Quickstart: Multi-provider AI integration

**Feature**: 005-multi-provider-ai

How to build, verify, and manually exercise the feature. Aligned with the Constitution's quality gates.

## Build & verify (automated)

```bash
# 1. Rebuild shared package after any type/IPC change (REQUIRED)
pnpm --filter @suisui/shared build

# 2. Type check the whole monorepo (zero errors)
pnpm typecheck

# 3. Unit tests — AIService, AICredentialsService, providers via FakeAIProvider.
#    MUST NOT call a real model, CLI, or network (Constitution Principle III).
pnpm test

# 4. Lint
pnpm lint:fix
```

## New dependencies (main process only)

```
ai                          # Vercel AI SDK (v6 line)
ollama-ai-provider-v2       # Ollama provider for the AI SDK
@ai-sdk/openai-compatible   # BYOK OpenAI-compatible (also BYOK Anthropic API key)
@anthropic-ai/claude-agent-sdk  # Claude CLI (best-effort)
zod                         # structured-output schemas (v4)
# @openai/codex-sdk         # OPTIONAL — OpenAI Codex CLI; preferred path drives `codex exec --json`
                            #            via the existing CommandRunner (env control + clean cancel), see research Decision 3b
```

These are imported only under `apps/desktop/electron/` — never in `app/` (Constitution Principle I). The Codex CLI provider drives the locally-installed `codex` binary as a subprocess (no always-on HTTP dependency).

## Manual verification (`pnpm dev`)

### A. Ollama (local)

1. Settings → AI. On open, the app auto-detects the auto-detectable providers (Ollama, Claude subscription). If Ollama is not running, **Local model (Ollama)** is shown **disabled with a reason** (e.g. `installed-not-running`) and a re-detect action; **Bring your own key** stays selectable (FR-020/FR-021).
2. Start Ollama, click **re-detect** → the option becomes selectable without restarting the app. Select **Local model (Ollama)**; the model dropdown lists installed models from `/api/tags`.
3. "Test connection" → success.
4. Generate a scenario from a description → streamed draft appears incrementally → validated → insert.

### B. BYOK OpenAI-compatible

1. Settings → AI → **Bring your own key**; enter base URL + API key; save.
2. Confirm the key is **not** present anywhere in the renderer (inspect `window.api`/Vue state — only `hasApiKey: true` is visible) and is stored encrypted on disk.
3. "Test connection" → success; generate a scenario.

### C. Claude CLI (best-effort)

1. Ensure the local `claude` CLI is installed and logged into a subscription; ensure `ANTHROPIC_API_KEY` is **unset** in the environment and in `~/.claude/settings.json`.
2. Settings → AI. If `claude` is not installed/logged-in, **Claude CLI** is shown disabled with a reason; otherwise select it and "Test connection".
3. Generate a scenario; confirm streamed output and that **no per-token API charge** is incurred.
   - ⚠️ This path is best-effort (see research Decision 3). If the subscription cannot be driven, the app reports a clear status; recommend the BYOK OpenAI-compatible (Anthropic API key) path as the reliable fallback.

### D. OpenAI Codex CLI (best-effort)

1. Ensure the local `codex` CLI is installed and logged into a ChatGPT/Codex subscription; ensure `OPENAI_API_KEY` is **unset** in the environment and in any `~/.codex/` config (see research Decision 3b).
2. Settings → AI. If `codex` is not installed/logged-in, **OpenAI Codex CLI** is shown disabled with a reason; otherwise select it and "Test connection".
3. Generate a scenario; confirm streamed output and that **no per-token API charge** is incurred (subscription session used, not the API key).
   - ⚠️ Best-effort, mirroring the Claude CLI path. If the CLI cannot be driven, the app reports a clear status; recommend the BYOK OpenAI-compatible API key path as the reliable fallback.

### Degradation

- With **no provider configured**, all AI entry points are disabled/marked "setup required" and the core builder + test runner behave exactly as today (spec FR-014, SC-004).
- Cancel an in-flight generation → stream stops promptly, no partial draft inserted.

## Acceptance mapping

| Spec story                        | Verify via                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| US1 configure provider            | Manual A/B/C steps 1–3 + `AICredentialsService` test                                                           |
| FR-020 detection-gated select     | Manual A steps 1–2 (disabled-with-reason; BYOK exempt) + store/UI guard test                                   |
| FR-021 detect on open + re-detect | Manual A steps 1–2 + `AIService.status(target)` probe-without-persist test                                     |
| US2 NL → Gherkin                  | Manual "generate a scenario" + validation-before-insert test                                                   |
| US3 step match                    | Generate with `kind: 'step-match'`; assert best match or "no match"                                            |
| US4 arg-fill                      | Select parameterized step → request suggestions                                                                |
| US5 failure explain               | Feed failed-test output → explanation                                                                          |
| FR-006 no API billing             | Manual C + D step 3 + env-sanitization unit tests (no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in effective env) |
| FR-016 test isolation             | `pnpm test` runs green with zero real-model calls                                                              |
