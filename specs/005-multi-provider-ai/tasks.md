---
description: 'Task list for Multi-provider AI integration'
---

# Tasks: Multi-provider AI integration

**Input**: Design documents from `/specs/005-multi-provider-ai/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED. Justified by Constitution Principle III (Test Isolation — NON-NEGOTIABLE) and spec FR-016 (AI behavior MUST be fully testable without a real model). Tests use `FakeAIProvider` / `FakeCommandRunner` — never a real model, CLI, or network.

**Organization**: Tasks are grouped by user story (US1–US5) for independent implementation and testing.

> **Amendments (Session 2026-06-19 clarifications)**: T001–T057 were generated and largely implemented against the original **3-provider, no-detection-gating** spec. Two clarifications changed scope: (1) **detection-gated provider selection** on the settings page + `status(target)` probe-on-open (FR-020/FR-021); (2) a **fourth provider type — the OpenAI Codex CLI** (FR-001/FR-006/FR-019). Completed tasks are left `[x]` (they were correct for their time); the delta is captured as new **amendment tasks T058–T069** appended to the relevant phases. Do these before `/speckit.implement` finishes US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1–US5)
- All paths are absolute from repo root `/home/arthur/Workspace/SuiSui/`

## Path Conventions

- Shared types/contracts: `packages/shared/src/`
- Main process: `apps/desktop/electron/`
- Renderer: `apps/desktop/app/`
- Tests: `apps/desktop/electron/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependencies and confirm the build pipeline.

- [x] T001 Add main-process AI dependencies to `apps/desktop/package.json`: `ai`, `ollama-ai-provider-v2`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`, `zod`; then run `pnpm install`
- [x] T002 Verify these packages are imported ONLY under `apps/desktop/electron/` (never in `app/`) — add an eslint note/comment guard in `apps/desktop/electron/services/ai/` once created (Constitution Principle I)
- [x] T003 Confirm baseline: run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test` is green before starting

**Checkpoint**: Dependencies installed, build green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, IPC contracts, the provider seam, credentials, and the AIService skeleton — everything every user story depends on. Maps to epic sub-issue #1.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

### Shared types & IPC contracts (`@suisui/shared`)

- [x] T004 Create `packages/shared/src/types/ai.ts` with all entities from data-model.md: `AIProviderType`, `AIProviderConfig`, `AIProviderStatus`, `AIRequestContext`, `AIGenerationRequest`, `AIStreamChunk`, `AIStreamDone`, `AIStreamError`, `AIGenerationResult`
- [x] T005 Export `./types/ai` from `packages/shared/src/index.ts`
- [x] T006 Add `AI_*` channels to `packages/shared/src/ipc/channels.ts` per contracts/ipc-api.md (`AI_CONFIG_GET/SET`, `AI_KEY_SET/CLEAR`, `AI_STATUS`, `AI_START`, `AI_CANCEL`, `AI_CHUNK`, `AI_DONE`, `AI_ERROR`)
- [x] T007 Add the `ai` method group to `ElectronAPI` in `packages/shared/src/ipc/api.ts` per contracts/ipc-api.md (invoke methods + `onChunk`/`onDone`/`onError` returning unsubscribe fns)
- [x] T008 Add `aiProvider?: AIProviderConfig` to `AppSettings` and a default `{ type: null, model: null, baseUrl: null, hasApiKey: false }` to `DEFAULT_SETTINGS` in `packages/shared/src/types/settings.ts`
- [x] T009 Run `pnpm --filter @suisui/shared build` (Shared Package Rebuild Rule)

### Provider seam, fake, credentials, service skeleton (main process)

- [x] T010 [P] Create `apps/desktop/electron/services/ai/IAIProvider.ts` defining `IAIProvider` (`status()`, `stream(req)`) and `AIStreamRequest` per contracts/iai-provider.md
- [x] T011 [P] Create `apps/desktop/electron/services/ai/FakeAIProvider.ts` implementing `IAIProvider` (scripted chunks, configurable `status()`, simulate abort/error)
- [x] T012 [P] Create `apps/desktop/electron/services/ai/AICredentialsService.ts` (singleton + DI) using Electron `safeStorage`, modeled on `GitCredentialsService` — `setKey`/`getKey`(main-only)/`clearKey`; returns `null` if unavailable
- [x] T013 Create `apps/desktop/electron/services/ai/AIService.ts` skeleton (singleton-factory + constructor DI of `IAIProvider`); reads `AIProviderConfig` via `SettingsService`, selects provider, exposes `status()` and `stream(req)`; uses `createLogger('AIService')`
- [x] T014 Export AI services from `apps/desktop/electron/services/index.ts`

### IPC plumbing & renderer store skeleton

- [x] T015 Register AI invoke handlers in `apps/desktop/electron/ipc/handlers.ts` (`AI_CONFIG_GET/SET`, `AI_KEY_SET/CLEAR`, `AI_STATUS`) delegating to `getAIService()`/`getAICredentialsService()`; add test-mode branch backed by `FakeAIProvider`/no-op credentials (mirror existing `GIT_CRED_*`)
- [x] T016 Implement the streaming handler in `apps/desktop/electron/ipc/handlers.ts`: `AI_START` records an `AbortController` in `Map<requestId, AbortController>`, returns `{ accepted: true }`, drives `getAIService().stream(req)` async, sends `AI_CHUNK/AI_DONE/AI_ERROR` via `webContents.send` (coalesce ~16–50ms, guard `isDestroyed()`, delete controller in `finally`); `AI_CANCEL` aborts
- [x] T017 Add `ai` bindings to `apps/desktop/electron/preload.ts`: invoke wrappers + `onChunk/onDone/onError` that strip the Electron `event` arg and return an unsubscribe (`removeListener`) function
- [x] T018 [P] Create `apps/desktop/app/stores/ai.ts` Pinia store skeleton: state (`config`, `status`, `streamingDraft`, `isStreaming`), actions `loadConfig`/`saveConfig`/`refreshStatus` via `useApi().ai`
- [x] T019 [P] Write `apps/desktop/electron/__tests__/AICredentialsService.test.ts` (encrypt/store/clear; never exposes key) and `apps/desktop/electron/__tests__/AIService.test.ts` (provider selection + `stream` via `FakeAIProvider`)
- [x] T020 Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test`

### Amendments — detection-gating + 4th provider type (FR-020/FR-021, Session 2026-06-19)

- [x] T058 [P] Amend `packages/shared/src/types/ai.ts`: add `'openai-codex-cli'` to `AIProviderType` (now 4 values: `'ollama' | 'openai-compatible' | 'openai-codex-cli' | 'claude-subscription'`) and add `AIStatusTarget { type: AIProviderType; baseUrl?: string | null }`; export both from `packages/shared/src/index.ts`
- [x] T059 Amend the `status` method signature to `status(target?: AIStatusTarget): Promise<AIProviderStatus>` in `packages/shared/src/ipc/api.ts` and update the `AI_STATUS` comment in `packages/shared/src/ipc/channels.ts` per contracts/ipc-api.md; then run `pnpm --filter @suisui/shared build`
- [x] T060 Amend `apps/desktop/electron/services/ai/AIService.ts` `status(target?)`: when `target` is supplied, build a **transient** provider for `target.type`/`target.baseUrl` and return its `status()` **without mutating** persisted `AIProviderConfig`; when omitted, probe the currently-configured provider (FR-021)
- [x] T061 Amend the `AI_STATUS` handler in `apps/desktop/electron/ipc/handlers.ts` to forward the optional `AIStatusTarget` to `getAIService().status(target)` (test-mode branch honored)
- [x] T062 [P] Amend `apps/desktop/app/stores/ai.ts`: track per-provider detection status (e.g. `detection: Partial<Record<AIProviderType, AIProviderStatus>>`) with `detectAll()` / `detect(type, baseUrl?)` actions calling `useApi().ai.status(target)`; run `detectAll()` for the auto-detectable providers when settings open; no background polling (FR-021)

**Checkpoint**: Contracts + seam + plumbing exist and are tested with fakes. User stories can now begin. (Amendments T058–T062 extend the foundation for detection-gating + the 4th provider.)

---

## Phase 3: User Story 1 - Configure an AI provider (Priority: P1) 🎯 MVP

**Goal**: User selects a provider type on the settings page (local Ollama / BYOK OpenAI-compatible / **OpenAI Codex CLI** / Claude CLI), stores any key encrypted, and verifies the connection. Auto-detectable providers (Ollama, Codex CLI, Claude CLI) are selectable only when detected; BYOK is always selectable (FR-020/FR-021). Maps to epic sub-issues #2 + #3.

**Independent Test**: Configure each provider type, run "test connection", get a clear success/failure; confirm undetected auto-detectable providers are shown disabled with a reason; confirm no provider configured → app behaves as today.

### Concrete providers

- [x] T021 [P] [US1] Create `apps/desktop/electron/services/ai/VercelAIProvider.ts` implementing `IAIProvider` for Ollama (`createOllama`) and OpenAI-compatible (`createOpenAICompatible`); `stream()` wraps `streamText({ model, prompt, abortSignal })` yielding `textStream`; reads key from `AICredentialsService` (key stays main-side)
- [x] T022 [P] [US1] Implement Ollama detection in `VercelAIProvider.ts` `status()`: `GET {baseUrl}/api/tags` with `AbortSignal.timeout(1500)`, return `available`/`models`/`detail` (`running`/`installed-not-running`/`not-installed`) per research Decision 5
- [x] T023 [P] [US1] Create `apps/desktop/electron/services/ai/ClaudeSubscriptionProvider.ts` implementing `IAIProvider` via `@anthropic-ai/claude-agent-sdk` `query({ includePartialMessages: true, options: { env: <sanitized: no ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/USE_BEDROCK/VERTEX/FOUNDRY>, abortController } })`; accumulate `text_delta`; `status()` checks CLI availability/login (best-effort) per research Decision 3
- [x] T024 [US1] Wire provider selection in `AIService.ts`: map `AIProviderConfig.type` → the right provider instance (allow DI override for tests)

### Tests for providers

- [x] T025 [P] [US1] Create `apps/desktop/electron/__tests__/ai-providers.test.ts`: `VercelAIProvider` via AI SDK `ai/test` mocks (`MockLanguageModelV2` + `simulateReadableStream`) and Ollama detection via mocked `fetch`; `ClaudeSubscriptionProvider` env-sanitization + streaming via `FakeCommandRunner`/mock — assert `ANTHROPIC_API_KEY` is never present in the effective env (FR-006)

### Settings UI

- [x] T026 [US1] Create `apps/desktop/app/components/AiSettingsDialog.vue` (PrimeVue Dialog, `<script setup lang="ts">`): provider-type select; conditional fields (Ollama baseUrl + model dropdown from `status().models`; BYOK baseUrl/model/key input; subscription info); "Test connection" button calling `useAiStore().refreshStatus`; save via `useAiStore().saveConfig`; key submitted via `api.ai.setKey` (write-only)
- [x] T027 [US1] Implement `saveConfig`, `setKey`, `clearKey`, `refreshStatus` actions fully in `apps/desktop/app/stores/ai.ts`; ensure renderer only ever sees `hasApiKey: boolean`, never the key value
- [x] T028 [US1] Add an "AI settings" entry point (gear/menu) in `apps/desktop/app/pages/index.vue` opening `AiSettingsDialog.vue`
- [x] T029 [US1] Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test && pnpm lint:fix`

### Amendments — OpenAI Codex CLI provider + detection-gated UI (Session 2026-06-19)

- [x] T063 [P] [US1] Create `apps/desktop/electron/services/ai/OpenAiCodexProvider.ts` implementing `IAIProvider`: drive `codex exec --json` via the existing `CommandRunner` with a **sanitized env** (omit `OPENAI_API_KEY` and `CODEX_API_KEY`); accumulate assistant text from JSONL `item.completed` events where `item.type === 'agent_message'`; cancel = kill the child process; `status()` via `codex --version` (installed?) + `codex login status` (logged in?), best-effort, per research Decision 3b
- [x] T064 [US1] Wire `'openai-codex-cli'` into `apps/desktop/electron/services/ai/AIService.ts` provider selection (all 4 types) and into the `status(target)` transient-provider map (depends on T060, T063)
- [x] T065 [P] [US1] Add `OpenAiCodexProvider` cases to `apps/desktop/electron/__tests__/ai-providers.test.ts` via `FakeCommandRunner`: assert `OPENAI_API_KEY` and `CODEX_API_KEY` are **never** present in the effective env (FR-006), `agent_message` delta accumulation, and kill-on-cancel
- [x] T066 [US1] Amend `apps/desktop/app/components/AiSettingsDialog.vue` for detection-gated selection (FR-020/FR-021): on open call `useAiStore().detectAll()`; render auto-detectable providers that are not detected as **disabled with the `reason`** + a "re-detect" button; add the **OpenAI Codex CLI** option (4 providers total); keep BYOK always selectable and verified on save
- [x] T067 [P] [US1] Add detection-gating tests: in `apps/desktop/electron/__tests__/AIService.test.ts` assert `status(target)` probes a provider **without persisting** config (config unchanged after call); add a renderer/store guard asserting undetected auto-detectable providers are non-activatable while BYOK stays selectable
- [x] T068 [US1] Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test && pnpm lint:fix`

**Checkpoint**: A user can configure + verify any of the four providers; auto-detectable ones are detection-gated; key stored encrypted; no provider = unchanged app. US1 independently shippable (MVP).

---

## Phase 4: User Story 2 - Generate a scenario from natural language (Priority: P1)

**Goal**: User describes intent → assistant streams a Gherkin draft reusing existing steps → validated → accept/edit/discard. Maps to epic sub-issue #4.

**Independent Test**: With a provider configured, enter a description, receive a streamed validated draft, insert it.

- [x] T030 [US2] Implement the `kind: 'scenario'` use case in `AIService.ts`: build the prompt from `AIRequestContext.steps` (instruct reuse of existing steps), return the stream
- [ ] T031 [P] [US2] Create `apps/desktop/app/components/AiGenerationDialog.vue`: description textarea, "Generate" button, live streamed draft area (subscribe via `api.ai.onChunk`, unsubscribe on `onUnmounted`), Cancel button (`api.ai.cancel`), and Accept/Edit/Discard footer
- [x] T032 [US2] Add streaming-draft state + `generate(kind, input)` / `cancel()` actions to `apps/desktop/app/stores/ai.ts`: generate a `requestId`, gather context via `useStepsStore`/`useScenarioStore`, call `api.ai.start`, accumulate chunks, handle done/error/incomplete
- [ ] T033 [US2] On stream completion for `scenario`: run the draft through validation via `useApi().validate.scenario` (after `parseGherkin`), store `validation` on the result, and surface issues before acceptance (FR-008/FR-013)
- [ ] T034 [US2] Implement Accept (insert via `scenarioStore.parseGherkin`/`addStep`), Edit, and Discard (no change) in `AiGenerationDialog.vue`; block Accept until validated
- [ ] T035 [US2] Add the "Generate with AI" entry point to the scenario builder in `apps/desktop/app/pages/index.vue`, disabled when `config.type === null` (FR-014)
- [ ] T036 [P] [US2] Add tests in `apps/desktop/electron/__tests__/AIService.test.ts` for the scenario use case (prompt includes existing steps; stream assembles draft) using `FakeAIProvider`
- [ ] T037 [US2] Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test`

**Checkpoint**: NL → validated, inserted scenario draft works end-to-end with streaming.

---

## Phase 5: User Story 3 - Match intent to an existing step (Priority: P2)

**Goal**: User types an action → assistant proposes the best-matching existing step, or "no good match". Maps to epic sub-issue #5.

**Independent Test**: Provide a phrase → best-matching step returned (or none).

- [ ] T038 [US3] Implement the `kind: 'step-match'` use case in `AIService.ts`: prompt with the action + existing steps; parse the suggested step id; reconcile with `findBestMatch` from `@suisui/shared`; return `suggestedStep` or `null`
- [ ] T039 [US3] Add a "Suggest step (AI)" affordance to the step-add flow (extend `apps/desktop/app/components/StepAddDialog.vue`) calling `useAiStore()` and showing the proposed match with accept
- [ ] T040 [US3] On accept, add the step via `scenarioStore.addStep`; on `null`, show "no close match"
- [ ] T041 [P] [US3] Add `AIService.test.ts` cases for `step-match` (returns best match; returns null when none) via `FakeAIProvider`
- [ ] T042 [US3] Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test`

**Checkpoint**: Step matching usable; builder unaffected if skipped.

---

## Phase 6: User Story 4 - Auto-fill step arguments (Priority: P2)

**Goal**: For a parameterized step, assistant suggests argument values mapped to parameters; user reviews/edits before applying. Maps to epic sub-issue #6.

**Independent Test**: Select a parameterized step → suggested values appear → accept/edit.

- [ ] T043 [US4] Implement the `kind: 'arg-fill'` use case in `AIService.ts`: prompt with `targetStep` parameters + `scenarioText`; return `suggestedArgs` as `Record<paramName, string>`
- [ ] T044 [US4] Add an "Auto-fill (AI)" action to the step argument editor (the arg-editing component used in the builder, e.g. alongside `TableEditor.vue`/step args) calling `useAiStore()`
- [ ] T045 [US4] Apply suggested values into the step's `args` (review/edit before commit), updating `scenarioStore`
- [ ] T046 [P] [US4] Add `AIService.test.ts` cases for `arg-fill` (values mapped to parameter names) via `FakeAIProvider`
- [ ] T047 [US4] Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test`

**Checkpoint**: Argument auto-fill usable; builder unaffected if skipped.

---

## Phase 7: User Story 5 - Explain a test failure (Priority: P3)

**Goal**: Given failed-test output, assistant returns a plain-language explanation + next steps. Maps to epic sub-issue #7.

**Independent Test**: Feed failed-test output → readable explanation + suggestions.

- [ ] T048 [US5] Implement the `kind: 'failure-explain'` use case in `AIService.ts`: prompt with the failed-test output; return streamed `explanation`
- [ ] T049 [US5] Add an "Explain failure (AI)" entry point to the test-run results UI in `apps/desktop/app/` (the runner results view), streaming the explanation via `useAiStore()`
- [ ] T050 [P] [US5] Add `AIService.test.ts` case for `failure-explain` via `FakeAIProvider`
- [ ] T051 [US5] Run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test`

**Checkpoint**: Failure explanation usable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Graceful degradation, error states, docs. Maps to epic sub-issue #8.

- [ ] T052 [P] Verify all AI entry points are disabled / show "setup required" when `config.type === null`, and that core builder + runner are fully unaffected (FR-014, SC-004) — add a renderer guard test or manual checklist entry
- [ ] T053 [P] Ensure provider errors (unreachable/timeout/malformed/interrupted stream) surface as clear, non-blocking messages and never insert a partial draft (FR-015 + edge cases) across `AiGenerationDialog.vue` and `stores/ai.ts`
- [ ] T054 [P] Confirm cancellation cleans up the `AbortController` map in `handlers.ts` and the renderer unsubscribes listeners on `onUnmounted` (no leaks)
- [ ] T055 [P] Add an AI integration section to docs: update `doc/SERVICES.md` (AIService/providers/credentials), `doc/IPC_TYPES.md` (AI\_\* channels), `doc/FRONTEND.md` (ai store + dialogs); cross-link from `CLAUDE.md`
- [ ] T056 [P] Document the Claude-CLI best-effort caveat + `ANTHROPIC_API_KEY`-must-be-unset footgun and the BYOK-Anthropic fallback in `doc/ARCHITECTURE.md` (security/billing model)
- [ ] T057 Final gate: `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test && pnpm lint:fix`; then run the quickstart.md manual A/B/C/D verification
- [ ] T069 [P] Document the OpenAI Codex CLI provider in `doc/ARCHITECTURE.md`: best-effort caveat, `OPENAI_API_KEY`/`CODEX_API_KEY`-must-be-unset footgun, the `~/.codex/config.toml` `preferred_auth_method` override risk, the message-granular streaming caveat (research Decision 3b), and the BYOK fallback; also verify the detection-gating + "setup required" disabled states (FR-020) for all auto-detectable providers

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → **Foundational (P2)**: blocks everything.
- **US1 (P3)** depends on Foundational. **This is the MVP.**
- **US2 (P4)** depends on Foundational + US1 (needs a configured provider + streaming plumbing, which US1's providers complete). US2 also exercises the streaming handler from T016.
- **US3 (P5)**, **US4 (P6)**, **US5 (P7)** each depend on Foundational + US1 (a working provider). They are independent of each other and of US2 (each adds a new `kind` use case + its own UI entry point) — once US1 is done they can be built in any order / parallel.
- **Polish (P8)** depends on all targeted stories being present.

### Amendment dependencies (Session 2026-06-19)

- **T058** (shared types: 4th `AIProviderType` + `AIStatusTarget`) blocks **T059** (api signature) → **T060** (AIService `status(target)`) → **T061** (handler). T058→T059 require the shared rebuild before dependents typecheck.
- **T062** (store per-provider detection) depends on T059 (typed `status(target)`).
- **T063** (`OpenAiCodexProvider`) is independent and `[P]`; **T064** (wire 4th type into selection + transient-provider map) depends on T058 + T060 + T063.
- **T065** (Codex tests) `[P]` after T063; **T067** (detection-gating tests) after T060/T062.
- **T066** (detection-gated settings UI + 4th option) depends on T062 (store `detectAll`) + T064 (4th provider selectable). **T068** is the US1 gate after the amendments.
- **T069** (Codex docs/degradation) belongs to Polish, after T063/T066.

### Story completion order

`Setup → Foundational → US1 (MVP) → US2 → {US3 | US4 | US5 in any order} → Polish`

### Within-phase parallelism

- Foundational: T010, T011, T012 are `[P]` (different new files); T018, T019 `[P]`. T013→T014 sequential (same/dependent). T006–T008 touch shared files — keep sequential, then T009 builds.
- US1: T021, T022, T023 are `[P]` (separate provider files); T025 `[P]` (test file). T024 depends on T021/T023. UI tasks T026–T028 sequential-ish (store + dialog + page).
- US2: T031 `[P]` (new component) and T036 `[P]` (test) parallel to store/service edits.
- US3/US4/US5: the `[P]` test tasks (T041, T046, T050) parallelize; the three stories themselves can run in parallel across developers after US1.

### Parallel example (after Foundational)

```
# Launch US1 provider work together:
T021 VercelAIProvider.ts   [P]
T022 Ollama detection      [P]  (same file as T021 → actually sequential; do T021 then T022)
T023 ClaudeSubscriptionProvider.ts [P]
T025 ai-providers.test.ts  [P]
```

(Note: T022 edits the file T021 creates — run after T021, not truly parallel.)

---

## Implementation Strategy

- **MVP = Setup + Foundational + US1**: a user can configure and verify a provider; nothing else changes if AI is unconfigured. Ship this first.
- **Next increment = US2**: the headline value (NL → validated scenario) and the full streaming path.
- **Then US3/US4/US5** independently, in priority order, as additional `kind` use cases.
- **Polish** last: degradation, error states, docs, and the subscription-billing safety documentation.
- Every phase ends with the constitution quality gates (`shared build → typecheck → test → lint`). Tests always use fakes — zero real model/CLI/network calls (Principle III, FR-016).

---

## Format validation

All tasks use `- [ ] T### [P?] [US#?] description + file path`. Setup/Foundational/Polish tasks carry no story label; US1–US5 tasks carry their label. Every task names a concrete file path. Total: **69 tasks** (T001–T057 original + T058–T069 amendments for FR-020/FR-021 detection-gating and the OpenAI Codex CLI provider). Foundational amendments T058–T062 carry no story label; US1 amendments T063–T068 carry `[US1]`; T069 is Polish.
