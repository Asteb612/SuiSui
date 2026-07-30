# Contract: Model response

**Feature**: 012-ai-scenario-generation

The one place where an external system's output becomes scenario content. Treated as untrusted.

## Prompt shape (main → provider)

Built by `AIService.buildScenarioPrompt()`, a fifth branch in the existing `buildPrompt()` dispatch.

```
You assemble a BDD scenario using ONLY the numbered steps below.
You may not invent, reword, or paraphrase a step.

Reply with ONLY a JSON object, no prose and no code fences:
{"scenarios":[{"name":string,"tags":string[],"steps":[{"i":number,"text":string}]}],"gaps":string[]}

- "i" is the number of a step from the list. Never use a number that is not in the list.
- "text" is that step with its arguments filled in.
- "gaps" lists anything the request asks for that no listed step can express.
  Put it in "gaps" rather than inventing a step.
- Prefer a lower-numbered step when two steps express the same thing.

Available steps:
[0] Given I am on the {string} page
[1] Given I am logged in as {string}
...

Request: <the tester's description or requirement>
Scenario so far: <current scenario, or (none)>
```

**Project steps occupy the lowest indices** (D1, D4). "Prefer a lower-numbered step" is therefore
how FR-009 is expressed to the model — the tier is never named in the prompt, so a model that
ignores the instruction still cannot produce a step that is not real.

## Resolution (the enforcement point)

Applied to the accumulated response after `ai:done`. **Every FR-004/FR-005 guarantee lives here**,
not in the prompt.

1. **Extract JSON.** Strip code fences if present; parse. Unparseable → outcome `failed`.
2. **Shape check.** `scenarios` must be an array. Missing or wrong type → `failed`.
3. **Per step, resolve `i`:**
   - not an integer, `< 0`, or `>= list.length` → `DroppedStep{ reason: 'out-of-range' }`
   - otherwise → the catalog step at that index. `keyword`, `pattern` and `tier` are taken
     **from the catalog step**, never from the response.
4. **Extract arguments.** Regex-match `text` against the resolved step's pattern using the existing
   `matchStep()`. On match, populate `args`. On mismatch, keep the step with every argument name in
   `unresolvedArgs` (FR-006) — degrade, never discard.
5. **Gaps** pass through verbatim (FR-007).
6. **Empty result.** Zero resolved steps across all scenarios → outcome `empty` with a reason,
   never a draft with no steps.

## Guarantees

| Guarantee                                          | How it holds                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No invented step reaches a tester (FR-004, SC-001) | Step identity comes from the index, and `DraftStep` is unconstructable without a resolved catalog step |
| Rejections are visible (FR-005)                    | Every rejection produces a `DroppedStep` shown in review                                               |
| A malformed response cannot corrupt a scenario     | Parse failure is an outcome, not a partial draft; the store is untouched                               |
| Prompt injection via step text cannot escalate     | The response only ever selects an index; text influences argument values, which the tester reviews     |
| Every attempt is accounted for (SC-006)            | Steps 1–6 terminate in exactly one of `drafted` / `empty` / `failed`                                   |

## Non-guarantees, stated plainly

- **The model may pick a valid step that is wrong for the intent.** No amount of resolution
  detects this; it is what the review exists for, and it is why nothing is auto-accepted.
- **`gaps` is model-authored prose.** It is a hint about coverage, not a verified claim that no
  step matched.
- **CLI-backed providers are best-effort**, as documented for the existing AI features. A provider
  that cannot follow the JSON contract yields `failed`, which is a correct outcome, not a crash.
