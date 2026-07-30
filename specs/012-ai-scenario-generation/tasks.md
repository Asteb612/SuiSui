# Tasks: AI Scenario Generation from Available Steps

**Input**: Design documents from `/specs/012-ai-scenario-generation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. Test strategy is specified in research.md D9, and the constitution gates
every commit on `pnpm test` (Principle III, non-negotiable).

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5, mapping to the user stories in spec.md

## Path Conventions

Monorepo (per plan.md):

- Shared types: `packages/shared/src/`
- Main process: `apps/desktop/electron/`
- Renderer: `apps/desktop/app/`
- Main tests: `apps/desktop/electron/__tests__/`
- Renderer tests: `apps/desktop/app/__tests__/`

**After ANY change under `packages/shared/`, run `pnpm --filter @suisui/shared build` before
typechecking or testing dependents** (Constitution V).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the baseline is green before touching a shared round-trip used by every feature file.

- [x] T001 Verify baseline is green: run `pnpm --filter @suisui/shared build && pnpm typecheck && pnpm test` from the repo root and record any pre-existing failures so they are not attributed to this feature
- [x] T002 [P] Capture a golden-output fixture for the Gherkin round-trip: add `apps/desktop/app/__tests__/fixtures/round-trip-baseline.feature` containing a representative multi-scenario feature (tags, background, data table, scenario outline with examples) plus the exact current `toGherkin()` output, so later phases can prove byte-identical output

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared type surface every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Add `StepTier` type (`'project' | 'generic'`) to `packages/shared/src/types/step-catalog.ts` (type only — the `CatalogStep.tier` field is added in US2 so this phase leaves the build green)
- [x] T004 [P] Add `'scenario-generate'` to `AIGenerationKind` and add optional `requirementRef?: string | null` to `AIRequestContext` in `packages/shared/src/types/ai.ts`
- [x] T005 Create `packages/shared/src/types/ai-scenario.ts` with `ScenarioDraft`, `DraftStep`, `CoverageGap`, `DroppedStep`, `ScenarioGenerationOutcome` and `DraftApplyMode` per data-model.md §2 (depends on T003 for `StepTier`)
- [x] T006 Export the new types from `packages/shared/src/index.ts`
- [x] T007 Run `pnpm --filter @suisui/shared build` and `pnpm typecheck` to confirm the new type surface compiles across the monorepo

**Checkpoint**: Shared contracts exist and compile. User stories can begin.

---

## Phase 3: User Story 1 - Draft a new scenario from a description (Priority: P1) 🎯 MVP

**Goal**: A tester types a description at scenario-create time and gets a reviewable draft in which every step is a real workspace step.

**Independent Test**: With a configured provider and a known step set, submit a description and confirm every proposed step exists in the workspace, and that discarding leaves the scenario untouched.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they fail before implementing.

- [x] T008 [P] [US1] Write resolution tests in `apps/desktop/app/__tests__/aiScenario.test.ts` covering: valid indices resolve to the catalog step; out-of-range, negative, non-integer and missing `i` produce `DroppedStep` and never a `DraftStep`; malformed JSON and code-fenced JSON; zero resolved steps yields the `empty` outcome; a `text` that does not match the chosen step's pattern still yields a step with every argument in `unresolvedArgs`
- [x] T009 [P] [US1] Write a test in `apps/desktop/app/__tests__/aiScenario.test.ts` asserting that `keyword`, `pattern` and `tier` on a resolved `DraftStep` come from the catalog entry and are NOT read from the model response, even when the response supplies conflicting values (this is the SC-001 guarantee)
- [x] T010 [P] [US1] Write prompt tests in `apps/desktop/electron/__tests__/ai/AIService.scenarioPrompt.test.ts` asserting the numbered list is 0-based and stable, the JSON reply shape is instructed, and the tester's description and current scenario text are included
- [x] T011 [P] [US1] Write store tests in `apps/desktop/app/__tests__/stores/ai.scenario.test.ts` using `FakeAIProvider`-style canned responses: a successful stream produces a `drafted` outcome; a provider error produces `failed`; cancelling mid-stream produces no outcome; a superseded `requestId` is discarded

### Implementation for User Story 1

- [x] T012 [US1] Add `buildScenarioPrompt()` to `apps/desktop/electron/services/ai/AIService.ts` as a fifth branch in `buildPrompt()`, following contracts/model-response.md §Prompt shape (numbered list, JSON-only reply, no-invention instruction)
- [x] T013 [P] [US1] Create `apps/desktop/app/utils/aiScenario.ts` with a pure `parseScenarioResponse(raw, steps)` that strips code fences, parses JSON, validates shape, and returns a `ScenarioGenerationOutcome` — never throwing, never returning a partial draft
- [x] T014 [US1] In `apps/desktop/app/utils/aiScenario.ts`, implement index resolution per contracts/model-response.md §Resolution: build `DraftStep` only from a resolved catalog step, taking `keyword`/`pattern`/`tier` from the catalog entry, and collect rejections into `DroppedStep[]`
- [x] T015 [US1] In `apps/desktop/app/utils/aiScenario.ts`, extract argument values by matching the model's `text` against the resolved step's pattern using the existing `matchStep()`, populating `unresolvedArgs` on mismatch rather than discarding the step
- [x] T016 [US1] Add `generateScenario(input, context)` plus `scenarioOutcome` and `applyMode` state to `apps/desktop/app/stores/ai.ts`, reusing the existing `ai:start`/`onChunk`/`onDone`/`onError` stream, accumulating deltas and parsing only on done
- [x] T017 [US1] In `apps/desktop/app/stores/ai.ts`, discard responses whose `requestId` is not the in-flight one, and clear `scenarioOutcome` on each new generation so drafts never accumulate
- [x] T018 [US1] Create `apps/desktop/app/components/AiScenarioDialog.vue` with a description input, a streaming/progress state, a cancel action, and a review listing the proposed steps with their arguments
- [x] T019 [US1] In `AiScenarioDialog.vue`, validate the candidate scenario before acceptance by calling `window.api.validate.scenario(...)` on the built candidate (never via `scenarioStore.validate()`, which would require mutating the store) and render the issues in the review
- [x] T020 [US1] Add accept / discard / regenerate actions to `AiScenarioDialog.vue`, where accept applies the draft to the scenario store and discard leaves it untouched
- [x] T021 [US1] Add the "describe it instead" entry point to `apps/desktop/app/components/NewScenarioDialog.vue`, rendered only when `aiStore.isConfigured` is true and the workspace has at least one step (FR-001, FR-003)
- [x] T022 [P] [US1] Write component tests in `apps/desktop/app/__tests__/AiScenarioDialog.test.ts` covering: the entry point is absent when AI is unconfigured; discard leaves the store unchanged; cancel mid-stream leaves the store unchanged; regenerate replaces rather than appends the draft

**Checkpoint**: A description produces a reviewable, catalog-only draft that inserts into the builder. Shippable on its own.

---

## Phase 4: User Story 2 - Project steps preferred, generic as fallback (Priority: P1)

**Goal**: Drafts use the team's own steps where they exist, falling back to the provisioned generic steps only where they do not — and the review says which is which.

**Independent Test**: With a project step and a generic step covering the same intent, confirm the project step is chosen; remove the project step and confirm the generic one is used.

### Tests for User Story 2 ⚠️

- [x] T023 [P] [US2] Write tier tests in `apps/desktop/electron/__tests__/StepCatalogService.tier.test.ts`: a step whose `source.file` is the provisioned `<featuresDir>/steps/generic.steps.ts` is `generic`, every other file is `project`, and classification is correct for a custom (non-default) features directory
- [x] T024 [P] [US2] Write a test in `apps/desktop/electron/__tests__/StepCatalogService.tier.test.ts` asserting the tier is re-stamped when a catalog is served from cache, so a changed features directory cannot yield a stale tier
- [x] T025 [P] [US2] Write ordering tests in `apps/desktop/electron/__tests__/ai/AIService.scenarioPrompt.test.ts`: project steps occupy the lowest indices, and the prompt never names the tier (the model must not be able to reason about it directly)
- [x] T026 [P] [US2] Write budget tests in `apps/desktop/app/__tests__/aiScenario.test.ts` (or the step-selection util's test file): a catalog over the 300-step budget drops generic steps before project steps, sets `truncated`, and generation still succeeds with only project steps, only generic steps, or both

### Implementation for User Story 2

- [x] T027 [US2] Add the `tier: StepTier` field to `CatalogStep` in `packages/shared/src/types/step-catalog.ts`, documented as derived-at-load and not part of the cache key
- [x] T028 [US2] Stamp `tier` in `apps/desktop/electron/services/StepCatalogService.ts` after the engine merge and again on every cache read, comparing `source.file` against the provisioned steps path from `WorkspaceService` (do NOT add workspace knowledge to `packages/step-catalog/`)
- [x] T029 [US2] Populate `isGeneric` from `tier` in `packages/shared/src/catalog/adapter.ts` (currently hardcoded `false` at lines 55-62), then run `pnpm --filter @suisui/shared build` — this alone fixes the always-dead "generic" badge in `StepSelector.vue`, `StepAddDialog.vue` and `StepsListDialog.vue`
- [x] T030 [US2] Add step selection and ranking to `apps/desktop/app/utils/aiScenario.ts` (or a sibling util): project steps first ranked by literal relevance to the description using the matcher from `@suisui/shared/search/matcher`, then generic steps, capped at 300, returning a `truncated` flag
- [x] T031 [US2] Wire the selected, ordered step list into `generateScenario()` in `apps/desktop/app/stores/ai.ts` so the renderer decides what is sent and main does not re-filter (contracts/ipc.md rule 1)
- [x] T032 [US2] Render a project/generic badge per proposed step in `apps/desktop/app/components/AiScenarioDialog.vue` (FR-011), and surface the `truncated` notice verbatim when steps were dropped from the prompt (FR-022)

**Checkpoint**: Drafts prefer the team's steps, fall back correctly, and say which tier each step came from.

---

## Phase 5: User Story 3 - Extend or redraft an existing scenario (Priority: P2)

**Goal**: Generation works against a scenario that already has steps, with the tester choosing extend or redraft, and extend as the default.

**Independent Test**: Generate against a non-empty scenario; confirm extend is pre-selected, that accepting an extend loses nothing, and that a redraft requires its own confirmation.

### Tests for User Story 3 ⚠️

- [x] T033 [P] [US3] Write apply tests in `apps/desktop/app/__tests__/stores/scenario.applyDraft.test.ts`: extend appends and every pre-existing step and argument value survives (SC-008); redraft replaces the step list; both leave the store untouched when discarded
- [x] T034 [P] [US3] Write dialog tests in `apps/desktop/app/__tests__/AiScenarioDialog.test.ts`: extend is pre-selected for a non-empty scenario; the mode selector is absent for an empty scenario (FR-028); accepting a redraft requires a confirmation distinct from accepting an extend (FR-027)

### Implementation for User Story 3

- [x] T035 [US3] Add `applyDraft(draft, mode)` to `apps/desktop/app/stores/scenario.ts`, appending for `'extend'` and replacing the active scenario's steps for `'redraft'`, marking the scenario dirty without writing to disk
- [x] T036 [US3] Add the extend/redraft selector to `apps/desktop/app/components/AiScenarioDialog.vue`, defaulting to `'extend'`, held in dialog state and reset per generation (never persisted as a preference)
- [x] T037 [US3] Hide the mode selector in `AiScenarioDialog.vue` when the active scenario has no steps, reducing the flow to plain generation (FR-028)
- [x] T038 [US3] Render the extend review in `AiScenarioDialog.vue`: existing steps shown as context, proposed steps marked as additions, in final order (FR-026)
- [x] T039 [US3] Render the redraft review in `AiScenarioDialog.vue`: current versus proposed, with steps that would be lost explicitly marked (FR-026)
- [x] T040 [US3] Require a separate, explicitly-worded confirmation before applying a redraft in `AiScenarioDialog.vue`, unreachable by a single mis-click from the extend flow (FR-027)
- [x] T041 [US3] Add the generation entry point to the edit-mode toolbar in `apps/desktop/app/components/ScenarioBuilder.vue`, gated on `aiStore.isConfigured`, passing the current scenario text as context

**Checkpoint**: Generation works in edit mode, non-destructively by default.

---

## Phase 6: User Story 4 - Report what the available steps cannot express (Priority: P2)

**Goal**: Uncovered intents are reported as gaps instead of being papered over with invented steps.

**Independent Test**: Submit a description containing one intent no step covers; confirm the covered steps plus an explicit gap, with no invented step in the list.

### Tests for User Story 4 ⚠️

- [x] T042 [P] [US4] Write tests in `apps/desktop/app/__tests__/aiScenario.test.ts`: `gaps` from the response pass through verbatim; a response with gaps and zero resolvable steps yields the `empty` outcome with a reason rather than an empty draft
- [x] T043 [P] [US4] Write tests in `apps/desktop/app/__tests__/AiScenarioDialog.test.ts`: gaps and dropped steps are both rendered; the `empty` and `failed` outcomes each render a distinct, actionable message with a retry (SC-006, FR-021)

### Implementation for User Story 4

- [x] T044 [US4] Render `gaps` in `apps/desktop/app/components/AiScenarioDialog.vue` as a distinct section, clearly separated from the proposed steps so a gap can never be mistaken for one (FR-007)
- [x] T045 [US4] Render `dropped` steps in `AiScenarioDialog.vue` with their rejection reason, so a silently-vanished step is never a mystery (FR-005)
- [x] T046 [US4] Render the `empty` outcome in `AiScenarioDialog.vue` with its reason and no draft, leaving the scenario unchanged (FR-021 second clause)
- [x] T047 [US4] Render the `failed` outcome in `AiScenarioDialog.vue` in plain language with a retry action, and confirm no partial draft is shown (FR-021)

**Checkpoint**: Every attempt ends in an explicit, honest outcome.

---

## Phase 7: User Story 5 - Generate from a requirement or acceptance criteria (Priority: P3)

**Goal**: Requirement-driven input produces one scenario per criterion, and an accepted scenario records where it came from — durably.

**Independent Test**: Paste multi-criterion criteria with a reference; confirm one scenario per criterion, then save, reopen, edit, save again, and confirm the requirement comment survives.

> **⚠️ Highest-risk phase.** T048 and T049 guard a round-trip shared by every feature file the user owns. Write them before T050.

### Tests for User Story 5 ⚠️

- [x] T048 [P] [US5] Write the byte-identical guard in `apps/desktop/app/__tests__/scenarioComments.test.ts`: `toGherkin()` output for the comment-free fixture from T002 is unchanged, character for character. **This is the single most important test in the feature** — it protects every existing user feature file from churn
- [x] T049 [P] [US5] Write round-trip tests in `apps/desktop/app/__tests__/scenarioComments.test.ts`: a scenario with leading comments survives parse → emit → parse unchanged and in position; a hand-written comment survives open → edit → save (**a regression test for behaviour that does not hold today**); comments never appear in `steps`, `tags` or `featureDescription`; order and position are stable across repeated round-trips
- [x] T050 [P] [US5] Write multi-scenario tests in `apps/desktop/app/__tests__/aiScenario.test.ts` and `AiScenarioDialog.test.ts`: several criteria yield several drafts, each keepable or discardable independently (FR-019)

### Implementation for User Story 5

- [x] T051 [US5] Add `comments?: string[]` to `Scenario` in `packages/shared/src/types/feature.ts` per contracts/gherkin-round-trip.md, then run `pnpm --filter @suisui/shared build`
- [x] T052 [US5] Accumulate scenario-leading comment lines in `parseGherkin()` in `apps/desktop/app/stores/scenario.ts`, mirroring the existing `pendingTags` mechanism, storing lines verbatim including the `#` and flushing onto the next scenario
- [x] T053 [US5] Emit `comments` in `toGherkin()` in `apps/desktop/app/stores/scenario.ts` immediately before the scenario's tag line, at the scenario's indentation, emitting nothing when absent or empty
- [x] T054 [US5] Add a requirement-reference input to `apps/desktop/app/components/AiScenarioDialog.vue` and pass it as `context.requirementRef`
- [x] T055 [US5] Prepend `# Requirement: <ref>` to the accepted scenario's `comments` on acceptance in `AiScenarioDialog.vue` (the round-trip stays requirement-agnostic and moves opaque lines)
- [x] T056 [US5] When the target scenario already carries a `# Requirement:` line, show both the existing and the proposed reference in the review rather than silently replacing or duplicating (spec edge case)
- [x] T057 [US5] Extend `buildScenarioPrompt()` in `apps/desktop/electron/services/ai/AIService.ts` to instruct one scenario per criterion for requirement-shaped input, keeping the `scenarios` array contract unchanged
- [x] T058 [US5] Render multiple drafts in `AiScenarioDialog.vue` with independent keep/discard controls per scenario (FR-019)

**Checkpoint**: Requirement-driven generation works and traceability survives a save.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T059 [P] Document the feature in `doc/FRONTEND.md` (`AiScenarioDialog`, the `ai` store additions, the `comments` round-trip) and `doc/SERVICES.md` (`buildScenarioPrompt`, tier stamping in `StepCatalogService`)
- [x] T060 [P] Add a "AI Scenario Generation (feature 012)" section to `CLAUDE.md` capturing the two rules that are easy to break later: step identity comes from the catalog entry the index selects and never from the model's text; and `toGherkin()` regenerates the whole file, so anything not in the model is lost on save
- [x] T061 [P] File a separate issue for the pre-existing CRLF normalisation in `toGherkin()` (every save rewrites CRLF to LF today, independent of this feature) rather than folding it into this work — reference contracts/gherkin-round-trip.md §Known limitation
- [ ] T062 Run the manual verification pass in `quickstart.md` end to end against a real workspace with both project and generic steps — **NOT DONE**: requires a real workspace and a configured AI provider (Ollama or a BYOK key), neither of which is available in this environment. Automated coverage stands in for every behaviour except the actual provider round-trip, which no test exercises by design (Constitution III)
- [x] T063 Run `pnpm --filter @suisui/shared build && pnpm lint:fix && pnpm typecheck && pnpm test` and confirm all constitution quality gates pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational; integrates with US1's util and dialog
- **US3 (Phase 5)**: depends on US1 (needs the dialog and a draft to apply)
- **US4 (Phase 6)**: depends on US1 (renders outcomes the US1 util already produces)
- **US5 (Phase 7)**: depends on US3 (multi-draft review builds on the review UI) and on T002's fixture
- **Polish (Phase 8)**: depends on the stories you intend to ship

### User Story Dependencies

- **US1 (P1)**: independent once Foundational is done — the MVP
- **US2 (P1)**: the tier chain (T027-T029) is fully independent of US1 and can be built in parallel by a second developer; only T030-T032 touch US1 files
- **US3 (P2)**: needs US1's dialog
- **US4 (P2)**: needs US1's outcome types; independent of US2 and US3
- **US5 (P3)**: needs US3; the round-trip work (T048-T053) is independent of everything else and can start any time after Foundational

### Within Each User Story

- Tests first, failing, before implementation
- Types → util/service → store → component → entry point
- For US5 specifically: **T048 and T049 must pass-fail-pass around T051-T053.** Writing them after the change would let silent data loss ship

### Parallel Opportunities

- T003 and T004 (different files) in Foundational
- All US1 test tasks T008-T011 (four different files)
- All US2 test tasks T023-T026
- T027-T029 (US2 tier chain) in parallel with T012-T022 (US1) by different developers
- T048-T050 (US5 round-trip tests) in parallel with any Phase 5 or 6 work
- All Polish tasks marked [P]

---

## Parallel Example: User Story 1

```bash
# All four US1 test files, written together before implementation:
Task: "Resolution tests in apps/desktop/app/__tests__/aiScenario.test.ts"
Task: "Catalog-authority test in apps/desktop/app/__tests__/aiScenario.test.ts"
Task: "Prompt tests in apps/desktop/electron/__tests__/ai/AIService.scenarioPrompt.test.ts"
Task: "Store stream tests in apps/desktop/app/__tests__/stores/ai.scenario.test.ts"

# Then the two independent implementation surfaces:
Task: "buildScenarioPrompt() in apps/desktop/electron/services/ai/AIService.ts"
Task: "parseScenarioResponse() in apps/desktop/app/utils/aiScenario.ts"
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1 → a description produces a catalog-only draft
4. Phase 4: US2 → drafts prefer the team's own steps
5. **STOP and VALIDATE** against a real workspace

US1 alone is demonstrable, but US2 is what makes it usable in a workspace that has outgrown the
starter steps — both are P1 and the pair is the honest MVP.

### Incremental Delivery

1. Setup + Foundational → contracts compile
2. US1 → demo: description → draft (MVP)
3. US2 → demo: project steps win, badges are live (also fixes the dead generic badge)
4. US3 → demo: generation in edit mode, extend by default
5. US4 → demo: gaps and honest failure outcomes
6. US5 → demo: requirement → scenarios, traceability that survives a save

Phases 1-6 ship without ever touching the Gherkin round-trip. If the comment work in US5 proves
larger than expected, everything before it still delivers.

### Parallel Team Strategy

After Foundational:

- Developer A: US1 (Phase 3) → then US3 (Phase 5)
- Developer B: US2 tier chain (T027-T029) → then US4 (Phase 6)
- Developer C: US5 round-trip only (T048-T053), which touches no AI code at all

---

## Notes

- `[P]` = different files, no dependency on incomplete work
- Rebuild `@suisui/shared` after T005/T006, T027, T029 and T051 before typechecking dependents
- No test may reach a real provider or the network (Constitution III) — use `FakeAIProvider` with canned JSON
- Commit after each task or logical group
- **Never read `keyword` or `pattern` from the model response.** They come from the catalog entry the index selects. Breaking this breaks FR-004 and SC-001 no matter what the prompt says
