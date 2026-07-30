# Phase 1 Data Model: AI Scenario Generation from Available Steps

**Feature**: 012-ai-scenario-generation
**Date**: 2026-07-30

All shared types live in `packages/shared/src/` (Constitution V) and require
`pnpm --filter @suisui/shared build` before dependents compile.

---

## 1. Changes to existing shared types

### `packages/shared/src/types/step-catalog.ts`

```ts
/** Who authored a step: the team, or the starter file the app provisions. */
export type StepTier = 'project' | 'generic'

export interface CatalogStep {
  // ... existing fields unchanged ...
  /**
   * Authorship tier (FR-008). DERIVED at load time from `source.file`, never
   * authored and never part of the cache key — a cached catalog is re-stamped
   * on read so a changed features directory cannot serve a stale tier.
   */
  tier: StepTier
}
```

### `packages/shared/src/types/step.ts` — no shape change

`StepDefinition.isGeneric?: boolean` already exists. It is currently hardcoded `false` by
`packages/shared/src/catalog/adapter.ts:55-62` while three components already render a badge
from it. The adapter starts setting it from `CatalogStep.tier`, which fixes that latent bug and
carries the tier to the renderer with no new field.

### `packages/shared/src/types/feature.ts`

```ts
export interface Scenario {
  name: string
  tags?: string[]
  steps: ScenarioStep[]
  examples?: ExampleTable
  /**
   * Verbatim comment lines immediately preceding the scenario, INCLUDING the
   * leading `#` (FR-029 → FR-031). Stored raw and never re-parsed, so any text —
   * URLs, ticket titles — round-trips untouched (FR-032, FR-033).
   * Only scenario-leading comments are modelled; comments elsewhere in a feature
   * file are still lost on save, as they are today.
   */
  comments?: string[]
}
```

**Compatibility**: optional, absent on every existing scenario. `toGherkin()` emits nothing when
absent, so output for a comment-free feature file is byte-identical to today's.

### `packages/shared/src/types/ai.ts`

```ts
export type AIGenerationKind =
  'step-match' | 'arg-fill' | 'failure-explain' | 'failure-fix' | 'scenario-generate' // NEW — free-form description (US1) or requirement (US5)

export interface AIRequestContext {
  steps: StepDefinition[] // now carries a populated `isGeneric`
  scenarioText: string | null
  targetStep: StepDefinition | null
  /** NEW — the requirement reference to record, when one was supplied (FR-020). */
  requirementRef?: string | null
}
```

`AIGenerationResult.gherkin` and `.validation` already exist as unused placeholders from the
unbuilt issue #63; this feature populates them rather than adding a parallel result type.

---

## 2. New types

New file `packages/shared/src/types/ai-scenario.ts`, exported from `src/index.ts`.

### `ScenarioDraft` — one proposed, unaccepted scenario

| Field            | Type                       | Notes                                                      |
| ---------------- | -------------------------- | ---------------------------------------------------------- |
| `name`           | `string`                   | Proposed scenario name                                     |
| `tags`           | `string[]`                 | Proposed tags, without `@`                                 |
| `steps`          | `DraftStep[]`              | Ordered; only resolved steps survive here                  |
| `gaps`           | `CoverageGap[]`            | Intents no available step expressed (FR-007)               |
| `dropped`        | `DroppedStep[]`            | Steps the model proposed that resolved to nothing (FR-005) |
| `validation`     | `ValidationResult \| null` | Filled after the pre-accept check (FR-015)                 |
| `requirementRef` | `string \| null`           | Recorded as a comment on acceptance (FR-029)               |

### `DraftStep` — one proposed step

| Field            | Type                  | Notes                                                 |
| ---------------- | --------------------- | ----------------------------------------------------- |
| `catalogStepId`  | `string`              | The real step this resolved to — the FR-004 guarantee |
| `keyword`        | `StepKeyword`         | From the catalog step, not the model                  |
| `pattern`        | `string`              | From the catalog step, not the model                  |
| `tier`           | `StepTier`            | Rendered as project/generic in review (FR-011)        |
| `args`           | `StepArgDefinition[]` | Values extracted by matching the model's text         |
| `unresolvedArgs` | `string[]`            | Argument names needing tester attention (FR-006)      |

**Invariant**: `catalogStepId` always references a step that existed at generation time.
A `DraftStep` cannot be constructed from an unresolvable model response — that path produces a
`DroppedStep` instead. This is what makes SC-001 structural rather than aspirational.

### `CoverageGap`

| Field  | Type     | Notes                                                    |
| ------ | -------- | -------------------------------------------------------- |
| `text` | `string` | The uncovered intent, in the tester's own words (FR-007) |

### `DroppedStep`

| Field    | Type                                               | Notes                   |
| -------- | -------------------------------------------------- | ----------------------- |
| `raw`    | `string`                                           | What the model proposed |
| `reason` | `'unknown-index' \| 'out-of-range' \| 'malformed'` | Why it was rejected     |

### `ScenarioGenerationOutcome` — what one attempt produced (SC-006)

Exactly one of three shapes, so "no feedback" is unrepresentable:

```ts
export type ScenarioGenerationOutcome =
  | { status: 'drafted'; scenarios: ScenarioDraft[]; truncated: boolean }
  | { status: 'empty'; reason: string } // nothing could be assembled
  | { status: 'failed'; message: string } // provider/parse failure (FR-021)
```

`truncated` is `true` when the step budget dropped steps from the prompt (FR-022, D4).

### `DraftApplyMode`

```ts
export type DraftApplyMode = 'extend' | 'redraft' // FR-024; 'extend' is the default
```

---

## 3. Model response contract (provider ↔ main)

Not a persisted type — the JSON shape the model is instructed to emit (D2). Validated on arrival;
anything not matching is a `failed` or `empty` outcome, never a partial draft.

```jsonc
{
  "scenarios": [
    {
      "name": "Customer checks out with two items",
      "tags": ["checkout"],
      "steps": [
        { "i": 0, "text": "I am logged in as \"customer\"" },
        { "i": 4, "text": "I click on \"Checkout\"" },
      ],
    },
  ],
  "gaps": ["verify the confirmation email arrives"],
}
```

- `i` — 0-based index into the numbered step list sent in the prompt. Out of range, negative,
  non-integer or missing → `DroppedStep`, never a step.
- `text` — the step with arguments substituted. Regex-matched against the _chosen_ step's pattern
  to extract `args`; on mismatch the step is kept with every argument in `unresolvedArgs`.
- `gaps` — free text, passed through verbatim.

---

## 4. Renderer state (`app/stores/ai.ts`)

Added to the existing store; no new store.

| Field             | Type                                | Notes                                                      |
| ----------------- | ----------------------------------- | ---------------------------------------------------------- |
| `scenarioOutcome` | `ScenarioGenerationOutcome \| null` | Cleared on regenerate — never accumulates (spec edge case) |
| `applyMode`       | `DraftApplyMode`                    | Per-generation, resets to `'extend'`; not persisted        |

Existing `isStreaming`, `streamingDraft`, `error` and `isConfigured` are reused as-is.

---

## 5. Lifecycle

```
idle
  └─ tester submits description ─────────► streaming
                                              │
        cancel / dialog closed ◄──────────────┤  (FR-017: store untouched)
                                              ▼
                                    stream complete → parse JSON
                                              │
                 ┌────────────────────────────┼────────────────────────────┐
                 ▼                            ▼                            ▼
             'failed'                     'empty'                      'drafted'
          (FR-021, retry)           (reason shown)                  resolve indices
                                                                          │
                                                            validate candidate (FR-015)
                                                                          │
                                                                       review
                                                            ┌─────────────┼─────────────┐
                                                            ▼             ▼             ▼
                                                        discard      regenerate       accept
                                                    (store intact)  (replaces draft)    │
                                                                             ┌──────────┴──────────┐
                                                                             ▼                     ▼
                                                                         extend                redraft
                                                                    (append steps)      (confirm, then replace)
```

**Nothing on this diagram writes to disk.** An accepted draft lands in the scenario store and is
persisted only by the tester's existing save action (FR-014).

---

## 6. Validation rules by requirement

| Rule                                                         | Enforced where                                          | Requirement    |
| ------------------------------------------------------------ | ------------------------------------------------------- | -------------- |
| Every draft step references a real catalog step              | Index resolution; `DraftStep` cannot be built otherwise | FR-004, SC-001 |
| Unresolvable proposals are dropped **and reported**          | `DroppedStep[]` surfaced in review                      | FR-005         |
| Underived arguments are flagged, not invented                | `unresolvedArgs`                                        | FR-006         |
| Project step wins where both cover an intent                 | Prompt ordering + project-first truncation              | FR-009, SC-002 |
| Generation succeeds with only project, only generic, or both | Tier is advisory to ranking, never a filter             | FR-010         |
| Draft never mutates the scenario before accept               | Dialog-local state; store untouched until accept        | FR-012, SC-005 |
| Draft is validated before acceptance                         | `validate.scenario` on the candidate                    | FR-015         |
| Extend loses nothing                                         | Append-only; existing steps never rewritten             | FR-024, SC-008 |
| Redraft is confirmed separately                              | Distinct confirm action                                 | FR-027, SC-009 |
| Requirement comment survives round-trip                      | `Scenario.comments` in parse + emit                     | FR-030, SC-010 |
| Hand-written comments survive                                | Same mechanism, not reference-specific                  | FR-031         |
| Every attempt ends in one of three outcomes                  | `ScenarioGenerationOutcome` union                       | SC-006         |
