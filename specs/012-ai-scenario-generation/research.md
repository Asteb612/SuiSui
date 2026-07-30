# Phase 0 Research: AI Scenario Generation from Available Steps

**Feature**: 012-ai-scenario-generation
**Date**: 2026-07-30

All Technical Context unknowns are resolved below. No `NEEDS CLARIFICATION` remains.

---

## D1 — How a step is classified project vs generic (FR-008)

**Decision**: `StepCatalogService` (main process) stamps a `tier: 'project' | 'generic'`
onto every `CatalogStep` after the engine's merge, by comparing the step's
`source.file` against the relative path of the step-definition file the app provisions
(`<featuresDir>/steps/generic.steps.ts`, written by `WorkspaceService.ensureDefaultSteps()`).
The legacy adapter then sets the already-existing `StepDefinition.isGeneric` from that tier.

**Rationale**:

- `source.file` is the only authorship signal that exists — `MetadataOrigin`
  (`'suisui' | 'typescript' | 'pattern' | 'runtime'`) is about _how metadata was extracted_,
  not who wrote the step, and reusing it would conflate two unrelated axes.
- The comparison needs the workspace's configured features directory. The catalog **engine**
  (`packages/step-catalog/`) is deliberately workspace-agnostic and must not learn about
  `WorkspaceService`; the service layer already holds both facts.
- `StepDefinition.isGeneric?: boolean` already exists and is hardcoded `false` in
  `packages/shared/src/catalog/adapter.ts:55-62`, while `StepSelector.vue`, `StepAddDialog.vue`
  and `StepsListDialog.vue` already render a "generic" badge from it. Populating it fixes a
  latent bug and gives the renderer the tier for free — no new renderer plumbing.

**Consequences**:

- `tier` is **derived, not authored**. It is recomputed whenever the catalog is loaded,
  including on a cache hit, so a workspace whose features directory changed cannot serve a
  stale tier. It is therefore not part of the cache-invalidation key.
- Matches the spec's stated assumption: a team that edits the provisioned file in place keeps
  those steps classified generic.

**Alternatives considered**:

- _Add `tier` in the catalog engine_: rejected — the engine would need workspace configuration
  it is designed not to have.
- _Heuristic on step wording_ ("looks generic"): rejected — unpredictable and untestable.
- _A new `isProject` field on `StepDefinition`_: rejected — `isGeneric` already exists and is
  already rendered; adding a second field would leave two sources of truth (Principle VI).

---

## D2 — How the model is constrained to real steps (FR-004, FR-005, FR-006)

**Decision**: The model never emits free Gherkin. Available steps are presented as a
**numbered list**, and the model replies with JSON: for each step, the **index** it chose plus
the **resolved step text**. The index selects the catalog step authoritatively; the text is
regex-matched against that step's pattern to extract argument values.

```
Available steps:
[0] Given I am on the {string} page
[1] When I click on {string}
...

Reply: {"scenarios":[{"name":"...","tags":[],"steps":[{"i":0,"text":"I am on the \"login\" page"}]}],"gaps":["..."]}
```

**Rationale**:

- Constraint by construction: an index outside the list is not a step, so FR-004 holds
  structurally rather than by asking the model nicely. An out-of-range or duplicate-of-nothing
  index is dropped and reported (FR-005).
- The text half solves FR-006 for free by reusing the existing `matchStep()` / `findBestMatch()`
  regex machinery. When the text does not match the chosen step's pattern, the step is still
  proposed but every argument is flagged needs-attention — degrade, don't discard.
- Indices are 1-3 tokens; catalog ids are opaque hashes that cost tokens and invite
  transcription errors.

**Alternatives considered**:

- _Verbatim step text only_ (what `reconcileSuggestedStep` does for single-step matching):
  rejected as the sole mechanism — reconciliation becomes fuzzy string matching, and "was this
  invented or just reworded?" stops being decidable. Retained as the _fallback_ within a chosen
  index, which is where fuzziness is harmless.
- _Catalog step ids_: rejected — token cost and hallucination surface, with no gain over indices.
- _Provider-native structured output / tool calling_: rejected — not uniformly available across
  the four providers (Ollama, OpenAI-compatible, Claude CLI, Codex CLI), and the CLI providers
  are documented as best-effort. A JSON contract works everywhere.

---

## D3 — Transport: no new IPC channels

**Decision**: Reuse the existing `ai:start` / `ai:chunk` / `ai:done` / `ai:error` stream. Add two
values to `AIGenerationKind` (`'scenario-generate'`, `'scenario-extend'`) and carry the tier on
the existing `AIRequestContext.steps` via `StepDefinition.isGeneric`. The renderer accumulates
the stream and parses the JSON once on `done`.

**Rationale**:

- The constitution's IPC checklist makes every new channel a five-touchpoint change; this
  feature needs none. `AIGenerationRequest` is already `{ requestId, kind, input, context }`.
- `AIGenerationResult` already declares `gherkin: string | null` and
  `validation: ValidationResult | null` — placeholders left by the closed-but-unbuilt issue #63.
  This feature fills them rather than inventing a parallel result type.
- Cancellation (FR-017) already works via `ai:cancel`.

**Consequences**: the draft is only parseable when the stream completes. Partial JSON is never
rendered as a draft; the UI shows progress, not a half-built scenario.

**Alternatives considered**: a dedicated `ai:generateScenario` request/response channel —
rejected: more surface, loses the existing cancel and error paths, no benefit.

---

## D4 — Large step libraries (FR-022, SC-003)

**Decision**: Cap the steps sent per request at a fixed budget (**300 steps**). Selection order:
all project steps first (ranked by relevance to the description), then generic steps to fill any
remaining room. When anything was dropped, the result carries a `truncated` flag that the review
surfaces verbatim to the tester.

**Rationale**:

- A 500-step workspace at ~15 tokens/step is ~7.5k tokens of prompt — fine. Unbounded catalogs
  are not, and a silently truncated list is exactly the "mysteriously missing step" the spec
  calls out.
- Project-first selection makes the truncation _reinforce_ FR-009 rather than fight it: generic
  steps are what gets dropped under pressure.
- Relevance ranking reuses the literal token matcher from `@suisui/shared/search/matcher`
  (feature 009) — no new matching algorithm, and it is already accent- and case-insensitive.

**Alternatives considered**:

- _Send everything_: rejected — unbounded prompt, provider-dependent failure at the worst moment.
- _Embedding/vector retrieval_: rejected — new runtime dependency and a model round-trip for a
  problem literal matching handles at this scale (Principle VI).
- _Silent truncation_: rejected outright by FR-022.

---

## D5 — Comment preservation in the Gherkin round-trip (FR-029 → FR-031)

**Decision**: Add `comments?: string[]` to the shared `Scenario` type, holding the verbatim
comment lines (including the leading `#`) that precede a scenario. `parseGherkin()` accumulates
them exactly as it already accumulates `pendingTags`; `toGherkin()` emits them immediately before
the scenario's tag line. The requirement link is written as `# Requirement: <reference>`.

**Rationale**:

- This is the prerequisite the spec flags: `toGherkin()` (`app/stores/scenario.ts:458`)
  regenerates the whole file from a model with no comment concept, so any comment above a
  scenario is dropped on the tester's first save. `parseGherkin()` only ever mentions `#` at
  line 725, to _exclude_ comments from the description.
- The `pendingTags` mechanism at `scenario.ts:662-672` is an exact precedent — comments attach
  to the next scenario the same way tags do, so the change is symmetric with existing code
  rather than a new concept.
- Storing lines verbatim means the feature never has to parse or re-serialise a comment's
  content, which keeps FR-032 (free-form values, URLs) trivially true and FR-033 (never
  reinterpreted as a step/tag/description) a matter of not touching the existing branches.

**Scope honesty**:

- Only comments **immediately preceding a scenario** are preserved. Comments elsewhere
  (inside a step list, after the last scenario, above `Feature:`) are still dropped. This is a
  strict improvement over today, and the spec's requirements are all scenario-level — but it is
  a partial fix and must not be described as "comments are preserved".
- **Pre-existing, not fixed here**: `toGherkin()` joins with `'\n'`, so saving any feature file
  normalises CRLF to LF today, before this feature. The spec's CRLF edge case is therefore a
  pre-existing defect in the save path, not a regression this feature introduces. Fixing it means
  changing how every save writes line endings — out of scope, and noted so nobody plans around a
  guarantee that does not exist. Recommend a separate issue.

**Alternatives considered**:

- _A structured `requirement?: string` field on `Scenario`_ rendered as a comment: rejected —
  the tester chose a comment specifically so it is free-form and human-readable; a typed field
  would round-trip only references this feature wrote and would still drop hand-written comments,
  failing FR-031.
- _Preserve the raw source text and splice_: rejected — the tag-management feature (010) uses
  line splicing precisely because it edits many files without a full model, but the scenario
  builder is a full round-trip editor. Two mechanisms in one path would be worse than one.

---

## D6 — Extend vs redraft (FR-024 → FR-028)

**Decision**: A single `AiScenarioDialog.vue` with a mode selector defaulting to **extend**. The
dialog resolves the draft into a candidate step list, then renders:

- **extend** — the existing steps greyed, the proposed steps marked as additions, in final order;
- **redraft** — current versus proposed side by side, with steps that would be lost marked.

Accepting an extend appends via the scenario store's existing step actions. Accepting a redraft
requires a second, explicitly-worded confirmation. The mode selector is hidden when the active
scenario has no steps (FR-028) and the flow reduces to plain generation.

**Rationale**: mode is a per-generation choice, not a persisted preference (spec Assumptions), so
it lives in dialog state and resets each time. Extend being pre-selected makes the
non-destructive outcome the default outcome.

**Alternatives considered**: two separate buttons/dialogs — rejected: duplicates the review UI and
makes a mis-click between them exactly the accident FR-027 exists to prevent.

---

## D7 — Validating a draft before acceptance (FR-015)

**Decision**: The dialog builds the candidate `Scenario` object and calls the existing
`window.api.validate.scenario(...)` on it directly, without touching the store. The returned
`ValidationResult` populates `AIGenerationResult.validation` and is rendered in the review.

**Rationale**: `scenarioStore.validate()` (`app/stores/scenario.ts:407`) validates whatever is
_currently in the store_, which would require mutating the scenario to validate a draft — exactly
what FR-012 forbids. The IPC endpoint underneath it is already candidate-shaped, so calling it
directly needs no new contract.

---

## D8 — Multiple scenarios from one requirement (FR-019)

**Decision**: The JSON contract is a `scenarios` **array** from the start, for every kind of
input. Free-form descriptions are prompted to return exactly one element (spec Assumptions);
requirement input is prompted for one per criterion. The review lists each scenario with its own
keep/discard control.

**Rationale**: one wire shape for both input kinds. Making the single-scenario case a
one-element array costs nothing now and avoids a breaking contract change when User Story 5 lands.

---

## D9 — Testing approach (Constitution III)

**Decision**: `FakeAIProvider` (already present) returns checked-in canned JSON responses; no test
reaches a real provider or the network. Coverage:

- **Prompt assembly** — project steps precede generic; the numbered list is stable and 0-based;
  truncation drops generic before project and sets the flag.
- **Response resolution** — valid indices resolve; out-of-range, negative, non-integer and
  duplicate indices are dropped and reported; malformed JSON and fenced JSON are handled;
  text that does not match the chosen pattern still yields a step with flagged arguments.
- **Round-trip** — a scenario with leading comments survives parse → `toGherkin` → parse
  unchanged and in position; a hand-written comment is preserved (a **regression test for
  behaviour that does not hold today**); a scenario with no comments is byte-identical to today's
  output, guarding every existing feature file against churn.
- **Tier classification** — the provisioned path is generic, everything else project, across
  the default and a custom features directory.
- **Extend/redraft** — extend preserves every prior step and argument; discard and cancel leave
  the store untouched in both modes.

**Rationale**: the highest-risk surfaces are the two places where correctness is enforced rather
than requested — index resolution (FR-004/FR-005) and the round-trip (FR-030/FR-031). The
byte-identical-output test is the one that protects the existing user base from this feature.

---

## Resolved unknowns summary

| Unknown                                | Resolution                                               |
| -------------------------------------- | -------------------------------------------------------- |
| Where tier is computed                 | `StepCatalogService`, from `source.file` (D1)            |
| How the tier reaches the renderer      | Existing `StepDefinition.isGeneric`, currently dead (D1) |
| How "only available steps" is enforced | Numbered indices + post-hoc resolution (D2)              |
| New IPC channels needed                | None — new `AIGenerationKind` values only (D3)           |
| Large-catalog behaviour                | 300-step budget, project-first, `truncated` flag (D4)    |
| Comment persistence                    | `Scenario.comments`, mirroring `pendingTags` (D5)        |
| Extend vs redraft surface              | One dialog, extend default, confirm on redraft (D6)      |
| Draft validation without mutation      | Direct `validate.scenario` IPC call (D7)                 |
| Multi-scenario shape                   | Always an array (D8)                                     |
| Test strategy                          | `FakeAIProvider` + canned JSON, no network (D9)          |
