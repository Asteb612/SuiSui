# Feature Specification: Multi-provider AI integration

**Feature Branch**: `005-multi-provider-ai`  
**Created**: 2026-06-18  
**Status**: Draft  
**Input**: User description: "Multi-provider AI integration (local Ollama + BYOK + Claude subscription) — https://github.com/Asteb612/SuiSui/issues/59"

## Clarifications

### Session 2026-06-18

- Q: Should the subscription provider use streaming, and is streaming in scope for the first pass? → A: Streaming is in-scope for **all** providers (subscription + API + local) from the first pass. This also de-risks the planned restriction of the Claude `-p` (headless/print) CLI mode to a different plan, since the subscription path can rely on a streaming CLI invocation rather than one-shot headless mode.

## User Scenarios & Testing _(mandatory)_

SuiSui currently has no AI assistance. This feature adds an optional AI assistant that helps users author and troubleshoot BDD tests faster, while letting each user bring their own source of AI "quota": local hardware they already own, their own API account, or an existing AI subscription — so no central billing is required. AI output is always treated as a **draft**: generated Gherkin is run back through the existing validation before it is accepted, so correctness never depends on the model being right.

### User Story 1 - Configure an AI provider (Priority: P1)

A user opens AI settings and chooses how they want to power the assistant: a model running locally on their own machine, their own API account/key, or their existing AI subscription. They confirm the connection works before relying on it. Any secret they enter is stored securely on their machine and never exposed to the rest of the app's interface.

**Why this priority**: Nothing else in this feature works without a configured provider. This is the foundational, independently shippable slice — a user can configure and verify a provider even before any generation use case exists.

**Independent Test**: Configure each provider type, run "test connection", and confirm a clear success/failure result. Confirm that with no provider configured, the app behaves exactly as it does today.

**Acceptance Scenarios**:

1. **Given** no provider is configured, **When** the user opens AI settings and selects the local-model option, **Then** the app detects whether a local model service is available and reports its status.
2. **Given** the user selects the bring-your-own-key option and enters a key, **When** they save, **Then** the key is stored encrypted on their machine and is not readable from the renderer/UI layer.
3. **Given** any provider is configured, **When** the user clicks "test connection", **Then** the app reports a clear success or a human-readable failure reason within a reasonable time.
4. **Given** the user selects the subscription option, **When** the assistant runs, **Then** it uses the subscription session and does not consume per-token API billing.

---

### User Story 2 - Generate a scenario from natural language (Priority: P1)

A user describes what they want to test in plain language and the assistant drafts a Gherkin scenario using the workspace's existing step definitions where possible. The draft is validated before insertion; the user reviews and accepts, edits, or discards it.

**Why this priority**: This is the headline value of the feature — turning intent into a working scenario draft — and is the most visible payoff of having configured a provider.

**Independent Test**: With a provider configured, enter a description, receive a validated Gherkin draft, and insert it into the scenario builder.

**Acceptance Scenarios**:

1. **Given** a configured provider and a workspace with step definitions, **When** the user enters a description and requests generation, **Then** the assistant returns a Gherkin scenario draft that reuses existing steps where they match.
2. **Given** a generated draft, **When** it is produced, **Then** it is run through validation and any validation problems are surfaced to the user before acceptance.
3. **Given** a generated draft, **When** the user accepts it, **Then** it is inserted into the current scenario; **When** the user discards it, **Then** the builder is unchanged.

---

### User Story 3 - Match intent to an existing step (Priority: P2)

While building a scenario, a user types what they mean and the assistant suggests the closest matching existing step definition, reducing duplicate or near-duplicate steps.

**Why this priority**: Improves authoring quality and reuse, but the builder remains fully usable without it.

**Independent Test**: Provide a phrase and confirm the assistant ranks/returns the best-matching existing step, or indicates none is close enough.

**Acceptance Scenarios**:

1. **Given** a set of existing steps, **When** the user describes an action, **Then** the assistant proposes the best-matching step (or indicates no good match).
2. **Given** a proposed match, **When** the user accepts it, **Then** the step is added to the scenario.

---

### User Story 4 - Auto-fill step arguments (Priority: P2)

For a step that takes arguments, the user asks the assistant to suggest argument values from context (e.g., the scenario description), and reviews them before they are applied.

**Why this priority**: Convenience that speeds up authoring; not required for a usable builder.

**Independent Test**: Select a parameterized step, request auto-fill, and confirm suggested values appear for review and can be accepted or edited.

**Acceptance Scenarios**:

1. **Given** a parameterized step, **When** the user requests argument suggestions, **Then** the assistant returns proposed values mapped to the step's parameters.
2. **Given** suggested values, **When** the user edits or accepts them, **Then** the step reflects the chosen values.

---

### User Story 5 - Explain a test failure (Priority: P3)

After a Playwright/BDD test fails, the user asks the assistant to explain the failure in plain language and suggest likely causes or next steps.

**Why this priority**: A helpful troubleshooting aid layered on top of an already-working test runner; lowest priority because it depends on existing run output.

**Independent Test**: Provide a failed-test output and confirm the assistant returns a readable explanation and suggested next steps.

**Acceptance Scenarios**:

1. **Given** a failed test with output, **When** the user requests an explanation, **Then** the assistant returns a plain-language summary of the likely cause and suggested next steps.

---

### Edge Cases

- **No provider configured**: All AI entry points are disabled (or clearly indicate setup is required) and the core builder/runner is fully unaffected.
- **Provider unreachable or times out**: The user sees a clear, non-blocking error and can retry; no partial/garbled draft is inserted.
- **Subscription path with a stray API key in the environment**: The system must ensure the subscription is used rather than silently falling back to (and billing) an API key.
- **Generated Gherkin fails validation**: Validation problems are shown; the invalid draft is not silently accepted.
- **Model returns malformed or empty output**: Treated as a generation failure with a clear message, not a crash.
- **Local model service not installed/running**: Detection reports it as unavailable with guidance, rather than failing opaquely.
- **Long-running generation**: The user can tell the request is in progress and the UI remains responsive; partial output is streamed as it arrives.
- **Streaming interrupted mid-response**: A draft built from an incomplete stream is treated as a generation failure (or clearly marked incomplete) and is still subject to validation before acceptance — no partial draft is silently accepted.
- **Subscription headless mode restricted/unavailable**: The subscription provider relies on a streaming-capable invocation and reports a clear, actionable status if the assistant cannot be driven, rather than failing opaquely.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let users choose among three AI provider types: a locally-run model, a bring-your-own-key API account, and an existing AI subscription.
- **FR-002**: System MUST keep all AI credentials and secrets in the secure backend and MUST NOT expose secret values to the renderer/UI layer.
- **FR-003**: System MUST store any user-supplied API key encrypted on the local machine.
- **FR-004**: System MUST provide a "test connection" action that reports a clear success or human-readable failure for the configured provider.
- **FR-005**: System MUST detect whether a local model service is available and report its status to the user.
- **FR-006**: When the subscription provider is selected, system MUST use the subscription session and MUST NOT consume per-token API billing, even if an API key is present in the environment.
- **FR-007**: System MUST generate a Gherkin scenario draft from a natural-language description, reusing existing workspace step definitions where they match.
- **FR-008**: System MUST validate every generated Gherkin draft using the existing validation before it is accepted, and surface any validation problems to the user.
- **FR-009**: System MUST allow the user to review, accept, edit, or discard any AI-generated draft before it changes the scenario.
- **FR-010**: System MUST suggest the best-matching existing step for a user-described action, or indicate when no good match exists.
- **FR-011**: System MUST suggest argument values for a parameterized step and allow the user to review/edit them before they are applied.
- **FR-012**: System MUST produce a plain-language explanation and suggested next steps for a failed test given its output.
- **FR-013**: System MUST treat the AI as a draft generator only; no AI output may bypass existing validation/correctness checks.
- **FR-014**: When no provider is configured, system MUST disable AI entry points and leave the core builder and test runner fully functional.
- **FR-015**: System MUST surface provider errors (unreachable, timeout, malformed output) as clear, non-blocking messages without inserting partial results.
- **FR-016**: AI behavior MUST be fully testable without contacting a real model (a test substitute MUST stand in for any provider).
- **FR-017**: System MUST persist the user's AI provider configuration across application restarts.
- **FR-018**: System MUST stream AI responses incrementally for all provider types, so the user sees output as it is produced rather than only after completion.
- **FR-019**: The subscription provider MUST use a streaming-capable invocation of the locally-installed assistant rather than depending on a one-shot headless/print mode, so it remains functional if that headless mode is later restricted to a different subscription plan.

### Key Entities _(include if feature involves data)_

- **AI Provider Configuration**: The user's chosen provider type and its non-secret settings (e.g., selected model, endpoint/host for a local model). Persisted across restarts.
- **AI Credential**: A user-supplied secret (e.g., API key) stored encrypted on the local machine, never exposed to the UI layer.
- **Generation Request**: A user intent (natural-language description, target step, or failed-test output) plus relevant workspace context (existing steps) sent to the assistant.
- **Generation Result**: The draft produced by the assistant (Gherkin scenario, suggested step, suggested arguments, or failure explanation), along with its validation status.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can configure and verify any one of the three provider types in under 3 minutes, ending with a clear success/failure result.
- **SC-002**: A user can turn a one-sentence description into a validated, inserted scenario draft in under 1 minute (excluding model response time outside the app's control).
- **SC-003**: 100% of AI-generated Gherkin is run through validation before it can be accepted; no invalid draft is inserted without the user being shown the problems.
- **SC-004**: With no provider configured, 100% of existing builder and test-runner functionality remains available and unchanged.
- **SC-005**: User-supplied secrets are never present in the renderer layer in any state (verifiable by inspection) and are stored encrypted at rest.
- **SC-006**: When the subscription provider is selected, no per-token API charges are incurred, including when an API key exists in the environment.
- **SC-007**: All AI use cases pass automated tests using a model substitute, with zero calls to a real model during the test suite.

## Assumptions

- AI assistance is an **optional** enhancement; the application remains fully usable without it (consistent with graceful-degradation goals in the source epic).
- Configuration is **global** (one active provider for the app), not per-workspace or multi-key, in this first pass.
- Responses are **streamed** incrementally for all provider types (see FR-018). The subscription path uses a streaming-capable CLI invocation rather than a one-shot headless/print mode, to avoid breakage if that headless mode is restricted to another plan (see FR-019).
- The supported provider categories are: a local model service, an OpenAI-compatible bring-your-own-key API, and an AI subscription accessed via a locally-installed assistant — matching the categories named in the source epic.
- Generation uses the workspace's existing step definitions as context so drafts prefer reuse over inventing new steps.

## Out of Scope (first pass)

- Multi-key or per-workspace AI configuration (global configuration only initially).
- Centralized/hosted billing or quota management on behalf of users (each user supplies their own quota source).
