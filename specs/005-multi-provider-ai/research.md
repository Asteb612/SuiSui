# Phase 0 Research: Multi-provider AI integration

**Feature**: 005-multi-provider-ai | **Date**: 2026-06-18

This document resolves the technical unknowns deferred from the spec (provider technologies, streaming transport, testing strategy) and records the decisions that ground `plan.md`.

> Version note: package patch numbers below are point-in-time (mid-2026). Confirm locally with `npm view <pkg> version` before pinning.

---

## Decision 1 — Provider abstraction: own `IAIProvider` interface (not the AI SDK model interface)

**Decision**: Define a thin, project-owned `IAIProvider` interface (a `stream(request, signal): AsyncIterable<chunk>` shape) in the main process and have every provider implement it. Do **not** make the AI SDK's `LanguageModelV2` the abstraction boundary.

**Rationale**:

- The Claude-subscription provider (C) is a CLI subprocess, not an HTTP model — it cannot satisfy the AI SDK model interface. A unified own-interface is required regardless.
- Mirrors the existing `ICommandRunner` + `FakeCommandRunner` pattern (Constitution Principle IV), so `FakeAIProvider` drops in for tests with zero real model/CLI/network calls (Principle III).
- Keeps streaming + cancellation semantics uniform across all three provider categories.

**Alternatives considered**: Implementing/mocking `LanguageModelV2` everywhere — rejected because provider C doesn't fit it and it couples the whole feature to AI SDK internals (whose mock class names churned across v5→v6).

---

## Decision 2 — Providers A & B: Vercel AI SDK (`ai`) in the main process

**Decision**: Use the `ai` package (v6 line) inside the Electron main process for the two HTTP providers:

- **A — Local Ollama**: `ollama-ai-provider-v2` (`createOllama({ baseURL })`).
- **B — BYOK OpenAI-compatible**: `@ai-sdk/openai-compatible` (`createOpenAICompatible({ name, baseURL, apiKey })`).

Use `streamText({ model, prompt, abortSignal })` and consume `result.textStream` (async iterable of deltas). For structured drafts, prefer the v6 `output` option (`Output.object({ schema })`); if pinned to v5, use `streamObject`/`generateObject`. Schemas via Zod 4.

**Rationale**: One unified `streamText`/structured-output interface across both HTTP providers; native `abortSignal` maps onto Node `AbortController`; runs Node-side so credentials never reach the renderer (Constitution Principle I). Ollama can alternatively be reached through its OpenAI-compatible `/v1` endpoint with the same `@ai-sdk/openai-compatible` provider — kept as a fallback if the community Ollama provider lags an SDK major.

**Alternatives considered**: Direct `fetch` to each provider's REST API (more code, re-implements streaming/abort/structured-output); LangChain (heavier, not aligned with YAGNI Principle VI).

**Constraint surfaced**: `generateObject`/`streamObject` are deprecated in v6 in favor of the `output` option — new code should use the `output` route to avoid future removal.

---

## Decision 3 — Provider C: Claude subscription via `@anthropic-ai/claude-agent-sdk` — **best-effort, with sanctioned BYOK-Anthropic fallback**

**Decision**: Implement the subscription provider by driving the locally-installed `claude` via `@anthropic-ai/claude-agent-sdk` `query()` with `includePartialMessages: true` (stream deltas) and a sanitized environment. **Treat it as a best-effort / "may break" provider**, and make the reliable path a BYOK **Anthropic API key** configured through provider B's mechanism.

**Rationale & risk (this is the key planning risk)**:

- Research indicates that, as of mid-2026, using the Agent SDK to bill against a **subscription** (rather than an API key) is **not officially supported** and may be blocked: subscription OAuth tokens were reportedly rejected for SDK/third-party use, and the announced June-2026 billing split was paused (state is unstable).
- This directly validates spec clarification FR-019: the provider MUST use a **streaming-capable invocation** rather than depending on the one-shot `-p`/`--print` headless mode, whose billing treatment is unstable.
- **API-billing footgun (must mitigate)**: the spawned CLI auto-discovers `ANTHROPIC_API_KEY` and silently bills the API. The subscription path MUST run with a curated `options.env` that omits `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` **and** must account for `~/.claude/settings.json` `env` blocks (which `options.env` does not override). Also clear `CLAUDE_CODE_USE_BEDROCK`/`USE_VERTEX`/`USE_FOUNDRY`. → Satisfies spec FR-006.

**Implementation notes**:

- `query({ prompt, options })` returns an `AsyncGenerator<SDKMessage>` plus `interrupt()`. Read `stream_event` messages, accumulate `content_block_delta` where `delta.type === 'text_delta'`. Terminal `result` message carries `subtype` (success/error\_\*) and `total_cost_usd`.
- `pathToClaudeCodeExecutable` must be an **absolute path** if overriding the bundled binary.
- Cancellation via `options.abortController` and/or `Query.interrupt()`.

**Alternatives considered**: Driving `claude -p` directly through the existing `CommandRunner` (its `exec()` already supports streaming via `options.onOutput`) — viable and dependency-light, but `-p` billing treatment is unstable; kept as a possible thin alternative if the Agent SDK proves unusable. Dropping provider C entirely — rejected; it is a named goal of the epic, so it ships as best-effort with clear degradation.

---

## Decision 3b — Provider D: OpenAI Codex CLI — **best-effort, subscription session, sanitized env**

**Decision**: Implement the OpenAI Codex CLI provider by driving the locally-installed `codex` binary in non-interactive streaming mode — either via the official **`@openai/codex-sdk`** (`codex.startThread().runStreamed(prompt)` → async generator of structured events; the SDK is a thin spawn-wrapper over the CLI, structurally identical to `@anthropic-ai/claude-agent-sdk`) or by spawning **`codex exec --json`** through the existing `CommandRunner` and parsing the JSONL event stream. **Treat it as best-effort / "may break"**, mirroring provider C; the reliable fallback is the BYOK OpenAI-compatible API key (provider B). Satisfies spec FR-001(c), FR-006, FR-019.

**Rationale & risk**:

- Codex supports **Sign in with ChatGPT (subscription)** vs **API key (per-token billing)**. `codex exec` reuses saved CLI auth by default, so the subscription path is available without an API key — directly satisfies FR-006/FR-019 (streaming `exec`, not a one-shot that bills).
- **API-billing footgun (must mitigate, parallels Claude)**: an `OPENAI_API_KEY` (or `CODEX_API_KEY`, the documented force-API-billing var) in the environment / a project `.env` can silently route to **paid API billing**. The provider MUST spawn `codex` with a curated env that **omits `OPENAI_API_KEY` and `CODEX_API_KEY`**. Additionally, `~/.codex/config.toml` `preferred_auth_method = "apikey"` can override a sanitized env, and auth lives in `~/.codex/auth.json` — account for these (validate config doesn't force apikey). → FR-006/SC-006.
- Spawning the CLI ourselves (vs the SDK) gives full env control and a clean process-kill cancellation path, and reuses `FakeCommandRunner` for tests (Principle III).

**Implementation notes**:

- **Streaming format**: `codex exec --json` emits JSONL thread events (`thread.started → turn.started → item.completed* → turn.completed`). Accumulate assistant text from **`item.completed` where `item.type === 'agent_message'`** (`item.text`); ignore `reasoning`/`command_execution`/`file_change`/tool events. `turn.completed` carries token usage.
- **Token-granularity caveat**: as of the Sept-2025 `--json` format, `exec` may emit **message-granular** `item.completed`, not token deltas. True incremental deltas (`item.updated` / `agent_message_delta`) live in the lower-level app-server JSON-RPC protocol. **Verify on the installed version**; if `exec --json` doesn't stream deltas, either accept message-granular streaming for this provider or use the app-server interface. This does not violate FR-018 (output is still streamed incrementally per message) but is a known degradation to document.
- **Cancellation**: a clean `abort()` is **not yet shipped** in the SDK (openai/codex#5494). Plan to **kill the child process** on cancel (natural when spawning via `CommandRunner`). Maps `AbortSignal` → process kill.
- **Detection** (Decision 5 analog): `codex --version` (installed?) + `codex login status` (logged in? prints login type / masked key suffix; unauthenticated reports no session); `~/.codex/auth.json` presence as a heuristic.

**Alternatives considered**: the official `@openai/codex-sdk` `runStreamed` (cleaner API, but no abort yet and adds a dependency whose schema is evolving) — kept as an option; spawning `codex exec --json` via the existing `CommandRunner` is preferred for env control + cancellation + test reuse. The community **`ben-vargas/ai-sdk-provider-codex-cli`** (a Vercel-AI-SDK provider that already drives Codex CLI via subprocess on a subscription) is a useful reference since the feature already depends on `ai` v6. Dropping provider D — rejected; it is a direct user requirement (Session 2026-06-19), shipped best-effort with clear degradation.

> Version note: Codex tooling is evolving fast (flag renames `--json`/`--experimental-json`, abort support, delta streaming). Pin `@openai/codex-sdk` / the `codex` version and gate on `codex --version`.

---

## Decision 4 — Streaming transport over Electron IPC: event channel, not `invoke`

**Decision**: Start generation with a single `ipcRenderer.invoke('ai:start', { requestId, ... })` (resolves to "accepted"), then stream incremental chunks main→renderer via `webContents.send('ai:chunk', ...)` consumed through a `contextBridge`-exposed `onChunk(cb): unsubscribe` subscription. Add `ai:done` and `ai:error` events and an `ai:cancel` invoke channel.

**Rationale**:

- `invoke`/`handle` is single request/response and cannot emit intermediate tokens; `webContents.send` + `ipcRenderer.on` is the sanctioned many-events main→renderer mechanism.
- Preload wraps the listener so the Electron `event` object never leaks to the renderer, and returns an unsubscribe function (call on Vue `onUnmounted`) — avoids the well-known listener-leak footgun. Preserves Constitution Principle I.

**Implementation notes**:

- Correlate streams with a `requestId`; keep a `Map<requestId, AbortController>` in main; `ai:cancel` looks up and `.abort()`s. Always delete from the map in `finally`. One controller per requestId.
- Coalesce chunks in main on a ~16–50 ms timer (or N tokens) and batch renderer state updates (e.g. via `requestAnimationFrame`) — `webContents.send` has no backpressure. Guard `webContents.isDestroyed()` before each send.
- Typed contract: the subscription-style methods are added to the `ElectronAPI` surface in `@suisui/shared` so they remain typed (Constitution Principle II) even though they aren't plain `invoke` calls.

**Alternatives considered**: `MessageChannelMain`/`MessagePortMain` (higher throughput, more complexity — defer unless jank observed); polling from renderer (wasteful, laggy).

---

## Decision 5 — Ollama detection

**Decision**: Probe `GET {base}/api/tags` with a short timeout (`AbortSignal.timeout(~1500ms)`); a `200` is both liveness and model inventory. Resolve `base` from `OLLAMA_HOST` (default `http://127.0.0.1:11434`). Use plain `fetch` for detection.

**Rationale**: Zero-dependency, full timeout control, single round-trip yields status + model list (satisfies spec FR-005 and the "detect Ollama + list models" settings need). Disambiguate states: `200` → running; connection refused + `claude`/`ollama` binary present → installed-but-not-running (suggest `ollama serve`); refused + no binary → not installed.

**Alternatives considered**: Official `ollama` npm client for detection — heavier than needed; reserve it (or the AI SDK provider) for generation only.

---

## Decision 6 — Testing strategy

**Decision**: Fake the project's own `IAIProvider` with a `FakeAIProvider` that yields scripted chunks and can simulate abort/error. Use the AI SDK's official mocks (`MockLanguageModelV2` + `simulateReadableStream` from `ai/test`) only in the few targeted tests that exercise the real AI-SDK-backed providers (A/B). For provider C, reuse/extend `FakeCommandRunner` since it is ultimately a subprocess.

**Rationale**: Satisfies Constitution Principle III (NON-NEGOTIABLE: tests never hit a real model/CLI/network). Deterministically covers the IPC streaming, cancellation, abort, and provider-selection logic. `ai/test` mocks are confined to test files (importing them at runtime can crash) and their class names shifted across SDK majors, so own-interface faking is the default.

**Alternatives considered**: Hitting a local Ollama in CI — rejected (non-deterministic, environment-dependent).

---

## Resolved unknowns summary

| Unknown (from spec)                              | Resolution                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local model technology                           | Ollama via `ollama-ai-provider-v2`, detect via `/api/tags`                                                                                                            |
| BYOK API technology                              | `@ai-sdk/openai-compatible` (also serves BYOK Anthropic API key)                                                                                                      |
| Claude CLI technology                            | `@anthropic-ai/claude-agent-sdk` (best-effort) + sanitized env; BYOK-Anthropic is the reliable fallback                                                               |
| OpenAI Codex CLI technology                      | `codex exec --json` via `CommandRunner` (or `@openai/codex-sdk`), sanitized env (no `OPENAI_API_KEY`/`CODEX_API_KEY`), best-effort; cancel = kill child (Decision 3b) |
| Streaming transport (FR-018/019)                 | `invoke` to start + `webContents.send` event channel for chunks + `invoke` to cancel                                                                                  |
| Secret storage                                   | Electron `safeStorage`, reusing the `GitCredentialsService` pattern                                                                                                   |
| Config persistence                               | `SettingsService` + new fields on `AppSettings`                                                                                                                       |
| Test substitute (FR-016)                         | `FakeAIProvider` implementing `IAIProvider`; `FakeCommandRunner` for provider C                                                                                       |
| Time-to-first-token / timeout targets (deferred) | Coalesce 16–50ms; per-request `AbortController` with `AbortSignal.timeout` for deadlines                                                                              |
