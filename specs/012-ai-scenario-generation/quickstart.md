# Quickstart: AI Scenario Generation from Available Steps

**Feature**: 012-ai-scenario-generation

## What this feature does

A tester describes what they want to test; the app proposes a draft scenario built **only** from
steps that already exist in the workspace, preferring the team's own steps over the generic
starter steps. Nothing is applied until the tester accepts.

## Where the code lives

| Layer                 | Path                                                          | Change                                                     |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Shared types          | `packages/shared/src/types/ai-scenario.ts`                    | **New** — draft/gap/outcome types                          |
| Shared types          | `packages/shared/src/types/{ai,feature,step-catalog}.ts`      | Extended (kind, `comments`, `tier`)                        |
| Shared adapter        | `packages/shared/src/catalog/adapter.ts`                      | Populate `isGeneric` from `tier`                           |
| Main — catalog        | `electron/services/StepCatalogService.ts`                     | Stamp `tier` from `source.file`                            |
| Main — AI             | `electron/services/ai/AIService.ts`                           | Fifth prompt branch: `buildScenarioPrompt()`               |
| Renderer — store      | `app/stores/ai.ts`                                            | `generateScenario()`, outcome + apply-mode state           |
| Renderer — resolution | `app/utils/aiScenario.ts`                                     | **New** — parse + index resolution (the enforcement point) |
| Renderer — round-trip | `app/stores/scenario.ts`                                      | Comment parse/emit; extend + redraft apply                 |
| Renderer — UI         | `app/components/AiScenarioDialog.vue`                         | **New** — prompt, review, extend/redraft                   |
| Renderer — entry      | `app/components/NewScenarioDialog.vue`, `ScenarioBuilder.vue` | Entry points, gated on `isConfigured`                      |

## Build order

Types first, because the shared package must be rebuilt before anything downstream compiles:

```bash
# 1. shared types + adapter
pnpm --filter @suisui/shared build

# 2. main process (tier stamping, prompt)
# 3. renderer resolution util  ← highest-value tests live here
# 4. round-trip comments       ← highest-risk change; regression test first
# 5. dialog + entry points

pnpm typecheck && pnpm test
```

## Verifying it by hand

1. `pnpm dev`, open a workspace that has both `features/steps/generic.steps.ts` and at least one
   project step file.
2. Configure a provider in Settings (Ollama is the cheapest local option).
3. **Story 1** — New Scenario → "describe it instead" → type a description → confirm every
   proposed step exists in the step picker and each is badged project or generic.
4. **Story 2** — confirm a project step is chosen where one covers the intent; temporarily rename
   the project step file and confirm the generic equivalent is used instead.
5. **Story 3** — open a scenario with steps, generate, confirm **extend is pre-selected**, accept,
   and confirm no prior step or argument was lost. Repeat with redraft and confirm the separate
   confirmation and the before/after comparison.
6. **Story 4** — describe something no step covers (e.g. "check the confirmation email") and
   confirm it appears as a gap with no invented step in the list.
7. **Story 5** — paste multi-criterion acceptance criteria with a requirement reference; confirm
   one scenario per criterion, then save and check the `.feature` file for the
   `# Requirement: …` line. **Reopen, edit a step, save again, and confirm the comment is still
   there** — this is the behaviour that does not exist today.

## The two things most likely to go wrong

1. **Comment loss on save.** The round-trip drops comments today. If the regression test for a
   hand-written comment is not written _before_ the change, a silent data-loss bug ships. Test
   first: a comment-free feature file must emit byte-identical output to today's.
2. **Trusting the model's step text.** Step identity comes from the index and the catalog entry —
   never from the response's text. If `keyword` or `pattern` is ever read from the model's JSON,
   FR-004 and SC-001 are broken no matter what the prompt says.

## Testing rules

- **No test may reach a provider or the network** (Constitution III). Use `FakeAIProvider` with
  canned JSON.
- The resolution util is pure and synchronous — test it directly with hand-written responses,
  including malformed JSON, fenced JSON, out-of-range indices and pattern mismatches.
