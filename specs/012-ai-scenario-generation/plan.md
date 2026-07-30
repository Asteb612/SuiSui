# Implementation Plan: AI Scenario Generation from Available Steps

**Branch**: `012-ai-scenario-generation` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-ai-scenario-generation/spec.md`

## Summary

A tester describes what they want to test; the app proposes a draft scenario assembled
**only** from steps that already exist in the workspace, preferring the team's own steps over
the app-provisioned generic starter steps. The draft is reviewed before it touches anything.

The technical core is that "only available steps" is enforced **after** the model responds, not
requested in the prompt: available steps are sent as a numbered list, the model replies with
indices, and step identity is read from the catalog entry the index selects. A response that
names a step which does not exist is structurally unable to become a step.

This builds issue #63 for real — it is marked closed but was never implemented; the AI layer has
only `step-match | arg-fill | failure-explain | failure-fix` — and adds issue #102's
requirement-driven input on the same pipeline.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20.x (Electron 33 runtime); repo/tests on Node 22
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x — **no new runtime dependency**. Reuses the existing AI provider seam (feature 005), the step catalog (feature 006), and the literal text matcher from global search (feature 009) for step ranking
**Storage**: None new. Drafts are in-memory and discarded; the only persistent effect is the tester's existing save, which now also writes scenario-leading comments
**Testing**: Vitest 2.x with `FakeAIProvider`; no test reaches a provider or the network (Constitution III)
**Target Platform**: Electron desktop (Linux, macOS, Windows)
**Project Type**: Desktop application — Electron main + Nuxt renderer + shared package monorepo
**Performance Goals**: Description → reviewable draft in under 30 s for a workspace of up to 500 steps (SC-003); prompt assembly and index resolution are O(n) over a capped 300-step list and negligible against provider latency
**Constraints**: Step-list budget of 300 steps per request, project-first, with truncation surfaced to the tester (FR-022). Provider latency dominates and is not controllable. CLI-backed providers remain best-effort, as for existing AI features
**Scale/Scope**: ~2 new shared type files, 1 new renderer util, 1 new dialog, edits to 6 existing files. Catalogs of a few hundred to a few thousand steps

## Constitution Check

_GATE: passed before Phase 0. Re-checked after Phase 1 — see bottom._

| Principle                   | Status                    | How                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. Process Isolation**    | PASS                      | Prompt building and all provider I/O stay in `electron/services/ai/`. The renderer holds only dialog state and the pure resolution util. No Node import in `app/`                                                                                                                          |
| **II. Typed IPC Contracts** | PASS                      | **No new channel.** Adds values to `AIGenerationKind` and one optional field to `AIRequestContext`; `channels.ts`, `handlers.ts` and `preload.ts` are untouched. The five-touchpoint checklist does not trigger                                                                            |
| **III. Test Isolation**     | PASS                      | `FakeAIProvider` with canned JSON. The resolution util is pure and synchronous, so its tests need no doubles at all                                                                                                                                                                        |
| **IV. Service Pattern**     | PASS                      | Extends the existing `AIService` and `StepCatalogService` singletons. No new service, so no new factory                                                                                                                                                                                    |
| **V. Shared Package SSoT**  | PASS                      | New types in `packages/shared/src/types/ai-scenario.ts`, exported from `src/index.ts`, with a rebuild before dependents compile                                                                                                                                                            |
| **VI. Simplicity (YAGNI)**  | PASS, with one noted cost | Reuses the dead `StepDefinition.isGeneric` instead of a new field; no new IPC channel; no new store; no embedding/retrieval layer. The one genuine addition — comment support in the round-trip — is a direct consequence of a user decision, sized honestly below rather than smuggled in |

**Post-Phase-1 re-check**: still PASS. Phase 1 removed surface rather than adding it — the
tier reaches the renderer through an existing field, and the transport turned out to need no new
channel at all.

### Note on Principle VI and the round-trip change

Adding `Scenario.comments` is the largest change in this feature that is not strictly about AI.
It is required by FR-029 to FR-031 (the tester chose a comment as the traceability carrier) and
cannot be avoided: `toGherkin()` regenerates the file from a model with no comment concept, so a
comment above a scenario is deleted on the first save **today**. The change is scoped to
scenario-leading comments and is guarded by a byte-identical-output test for comment-free files.
It is a prerequisite for User Story 5 only; Stories 1-4 do not depend on it.

## Project Structure

### Documentation (this feature)

```text
specs/012-ai-scenario-generation/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 — D1..D9 decisions
├── data-model.md                  # Phase 1 — types, lifecycle, validation rules
├── quickstart.md                  # Phase 1 — build order, manual verification
├── checklists/
│   └── requirements.md            # Spec quality checklist (all items pass)
├── contracts/
│   ├── README.md
│   ├── ipc.md                     # No new channels; extended payloads
│   ├── model-response.md          # The untrusted boundary + enforcement
│   └── gherkin-round-trip.md      # Comment parse/emit invariants
└── tasks.md                       # Phase 2 — created by /speckit.tasks, NOT here
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   ├── ai-scenario.ts             # NEW — ScenarioDraft, DraftStep, CoverageGap,
│   │                              #       DroppedStep, ScenarioGenerationOutcome, DraftApplyMode
│   ├── ai.ts                      # + 'scenario-generate' kind, + requirementRef
│   ├── feature.ts                 # + Scenario.comments?: string[]
│   └── step-catalog.ts            # + StepTier, + CatalogStep.tier
├── catalog/adapter.ts             # isGeneric from tier (currently hardcoded false)
└── index.ts                       # export the new types

apps/desktop/electron/
├── services/
│   ├── StepCatalogService.ts      # stamp tier from source.file vs provisioned path
│   └── ai/AIService.ts            # buildScenarioPrompt() — fifth dispatch branch
└── __tests__/
    ├── StepCatalogService.tier.test.ts    # NEW
    └── ai/AIService.scenarioPrompt.test.ts # NEW

apps/desktop/app/
├── utils/
│   └── aiScenario.ts              # NEW — parse + index resolution (enforcement point)
├── stores/
│   ├── ai.ts                      # generateScenario(), outcome + applyMode state
│   └── scenario.ts                # comment parse/emit; applyDraft(extend|redraft)
├── components/
│   ├── AiScenarioDialog.vue       # NEW — prompt, review, extend/redraft, gaps
│   ├── NewScenarioDialog.vue      # entry point (create), gated on isConfigured
│   └── ScenarioBuilder.vue        # entry point (edit), gated on isConfigured
└── __tests__/
    ├── aiScenario.test.ts         # NEW — the highest-value tests in the feature
    ├── scenarioComments.test.ts   # NEW — round-trip regression + byte-identical guard
    └── AiScenarioDialog.test.ts   # NEW
```

**Structure Decision**: The existing monorepo layout is used unchanged — shared types in
`packages/shared`, provider work in `apps/desktop/electron/services/ai/`, UI in
`apps/desktop/app/`. No new package and no new service. The one deliberate placement choice is
that **index resolution lives in the renderer** (`app/utils/aiScenario.ts`), next to the catalog
the picker already holds, rather than in main: it is pure, synchronous, has no Node dependency,
and keeping it renderer-side means the prompt-building main process never has to hold the draft.

## Implementation Phases

Ordered so the riskiest change is guarded before it is made, and so each user story becomes
demonstrable as early as possible.

| #   | Work                                             | Delivers                                                           | Depends on |
| --- | ------------------------------------------------ | ------------------------------------------------------------------ | ---------- |
| 1   | Shared types + adapter `isGeneric`; rebuild      | Tier visible in the picker's badge (fixes a latent bug on its own) | —          |
| 2   | `StepCatalogService` tier stamping + tests       | FR-008                                                             | 1          |
| 3   | `buildScenarioPrompt()` + prompt tests           | Project-first numbered list, FR-009                                | 1, 2       |
| 4   | `app/utils/aiScenario.ts` + tests                | FR-004, FR-005, FR-006, FR-007 — the enforcement point             | 1          |
| 5   | `ai.ts` store `generateScenario()`               | Streaming, cancel, outcome states                                  | 3, 4       |
| 6   | `AiScenarioDialog.vue` + create entry point      | **User Stories 1, 2, 4 shippable**                                 | 5          |
| 7   | `applyDraft()` extend/redraft + edit entry point | **User Story 3**                                                   | 6          |
| 8   | Round-trip comments (regression test first)      | Prerequisite for US5                                               | 1          |
| 9   | Requirement input + multi-scenario review        | **User Story 5**                                                   | 7, 8       |

Phases 1-7 are independently shippable without phases 8-9. If the round-trip change proves
larger than expected, Stories 1-4 still deliver.

## Risks

| Risk                                                               | Mitigation                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Comment support silently drops content from existing feature files | Byte-identical-output test for comment-free files, written before the change (contracts/gherkin-round-trip.md)                                  |
| A model picks a real but wrong step                                | Not detectable by any check — this is what review exists for, and why nothing is auto-accepted. Stated as a non-guarantee rather than mitigated |
| Provider ignores the JSON contract (CLI providers are best-effort) | Parse failure is a first-class `failed` outcome with a retry, never a crash or a partial draft                                                  |
| Truncation hides a step the tester expected                        | `truncated` surfaced verbatim in the review (FR-022); generic steps are dropped before project steps                                            |
| Redraft destroys hand-tuned work                                   | Before/after comparison plus a confirmation distinct from extend (FR-026, FR-027); extend pre-selected                                          |

## Complexity Tracking

No constitution violations require justification. The one item worth recording:

| Item                                         | Why needed                                                                                                                 | Simpler alternative rejected because                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scenario.comments` in the shared round-trip | FR-029→FR-031: the tester chose a feature-file comment as the traceability carrier, and comments are deleted on save today | A typed `requirement` field would round-trip only references this feature wrote, still delete hand-written comments (failing FR-031), and impose escaping that a verbatim line does not need |
