# Contract: Recorded Action → BDD Step Mapping

**Feature**: 007-native-recorder | **Phase**: 1
`StepMatcherService` (main) maps a `RecordedAction` to an existing catalog step, **deterministically first**. Reuses `StepCatalogService.findMatchingSteps(text, keyword)` and shared `resolvePattern`/`matchStep`. Each emitted `RecordedAction` carries a primary `match` + `matchAlternatives[]`.

## Stage 1 — bundled generic-step map (no AI)

A static, SuiSui-authored table `GENERIC_STEP_RECORDER_MAP` (in `apps/desktop/electron/services/recorder/genericStepRecorderMap.ts`) maps each **bundled** generic step to a recorder action + arg roles. The matcher resolves the map entry against the actually-installed catalog step of the same pattern/keyword (so it degrades to a gap if the workspace lacks that step).

| RecordedActionType | Generic step pattern (keyword)                                                                   | `targetArg` ← label | `valueArg` ← value          |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------- | --------------------------- |
| `navigate`         | `I am on the {string} page` (Given)                                                              | —                   | URL/path                    |
| `click`            | `I click on {string}` (When)                                                                     | element label       | —                           |
| `fill`             | `I fill {string} with {string}` (When)                                                           | field label         | value _(or secret ref)_     |
| `select`           | `I select {string} from {string}` (When)                                                         | option / dropdown   | option                      |
| `check`            | `I check {string}` (When) **★ new**                                                              | element label       | —                           |
| `uncheck`          | `I uncheck {string}` (When) **★ new**                                                            | element label       | —                           |
| `press`            | `I press {string}` (When) **★ new**                                                              | key (+modifiers)    | —                           |
| `upload`           | `I upload {string} to {string}` (When) **★ new**                                                 | file name / field   | file name                   |
| `assertVisible`    | `I should see {string}` (Then)                                                                   | text/element        | —                           |
| `assertHidden`     | `I should not see {string}` (Then)                                                               | text/element        | —                           |
| `assertText`       | `the element {string} should contain the text {string}` (Then) **★ new**                         | element             | expected text               |
| `assertValue`      | `the field {string} should have the value {string}` (Then) **★ new**                             | field               | expected value              |
| `assertChecked`    | `the checkbox {string} should be checked` (Then) **★ new**                                       | checkbox            | —                           |
| `assertEnabled`    | `the element {string} should be enabled` (Then) **★ new**                                        | element             | —                           |
| `assertCount`      | `there should be {int} {string} elements` (Then) **★ new**                                       | element description | count                       |
| `assertUrl`        | `the URL should contain {string}` (Then) _(+ `the URL should be {string}` for equals)_           | —                   | URL fragment / full URL     |
| `assertTitle`      | `the page title should contain {string}` (Then) **★ new** _(+ `…should be {string}` for equals)_ | —                   | title fragment / full title |

**Full assertion set ships in the MVP** (2026-07-24 clarification): all rows above are recorded in the first release. **★ new** = added to the bundled `generic.steps.ts` template in this feature (D8). All assertion steps use genuine `expect` (FR-029). Steps absent from the current workspace → the action becomes a **gap** (FR-018a), never a raw-Playwright fallback. Assertion targets are chosen via SuiSui's own picker (D13), so an assertion can target an element the user never interacted with.

### Arg filling

- `targetArg` is filled from the **selected locator rendered as a semantic, runnable selector** (`locatorToPageSelector` — e.g. `[data-testid="login-submit"]`, `role=button[name="Sign in"]`, `text=Welcome`), which the bundled generic steps pass to `page.click`/`page.fill`/etc. This keeps the generated `.feature` both runnable (SC-005) and reasonably declarative, while the **human-readable label** (locator §7) is shown on the action card (FR-013). _(A future refinement can make generic steps resolve a bare human label so the `.feature` reads `I click on "Sign in"`.)_
- `valueArg` is filled from `action.value`; when `secret`, it is filled from `secretRef` (a Test Profile name or `<UPPER_SNAKE>`), never the literal (FR-026).
- Args are shaped as the shared `StepArg[]` and validated against the catalog step's parameter schema (types/enum/table). A missing required arg ⇒ `status:'needs-review'` + `STEP_MISSING_ARGUMENTS` (FR "generated step has missing arguments").

### Confidence (deterministic)

```text
exact map entry present AND catalog step found AND all args resolved   → 1.0  (status 'matched')
map entry found but an arg is missing/ambiguous                         → 0.6 (status 'needs-review')
no map entry / no catalog step for this action                          → gap (status 'gap')
```

## Stage 2 — project metadata (deferred seam)

Custom project steps may opt in via `@suisui-action <type>` / `@suisui-target <arg>` JSDoc, read by extending feature 006's TypeScript analyzer and surfaced as an optional `recorder?: StepRecorderMetadata` on `CatalogStep`. When present, it participates like a generic-map entry with `source:'project-metadata'`. **Not in the MVP**; the `MatchSource` seam and optional `recorder?` field reserve space so it adds without rework.

## Stage 3 — optional AI (US6, behind `recorderAiEnabled`)

Only when deterministic confidence is low (gap or `needs-review`) **and** AI is enabled + a provider configured:

- **Input** (secrets excluded): action type, element label, top locator candidates, current URL, page title, keyword category, the candidate catalog step summaries, and optionally step source (only if the user allowed it), plus neighboring actions.
- **Output** — strict JSON, validated:

```json
{
  "definitionId": "step_4ce7289bfda1",
  "arguments": { "field": "Email" },
  "confidence": 0.87,
  "reason": "..."
}
```

- **Validation** (always): `definitionId` MUST exist in the catalog; `arguments` MUST satisfy that step's parameter schema; otherwise the suggestion is discarded (`AI_INVALID_RESPONSE`) and the deterministic result stands (FR-016).
- **Confidence gates**: `>=0.90` preselect (still requires user confirm to insert); `0.65–0.89` show as a recommendation (not preselected); `<0.65` keep the generic/gap result. Never auto-accepted, never auto-inserted (FR-016/FR-031).
- Grouping (fill+fill+click → `I am logged in as "…"`) and approval-based locator repair (#103) follow the same "propose → user inspects → user confirms" rule.

## Alternatives & selection

`StepMatcherService` returns the best match as `match` and up to N (default 5) ranked alternatives as `matchAlternatives`, so `StepMatchSelector.vue` lets the user switch without another IPC call. Choosing an alternative sets `match.source = 'user'` in the store. `definitionLocation` on the match powers US5 "Open implementation".

## Determinism & testing

- Stage 1 is a pure function of `(RecordedAction, catalog snapshot, GENERIC_STEP_RECORDER_MAP)` — unit-tested with fixture actions + a fake catalog: each action type → expected pattern + args; missing step → gap; missing arg → needs-review.
- AI validation is unit-tested with canned JSON (valid, unknown-id, schema-mismatch, low-confidence) via `FakeAIProvider` — no network.
