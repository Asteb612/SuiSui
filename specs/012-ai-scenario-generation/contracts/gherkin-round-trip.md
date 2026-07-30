# Contract: Gherkin round-trip with scenario comments

**Feature**: 012-ai-scenario-generation

Extends `parseGherkin()` / `toGherkin()` in `apps/desktop/app/stores/scenario.ts`. This is the
riskiest change in the feature: the round-trip is shared by every feature file the user owns.

## The defect being fixed

`toGherkin()` (line 458) regenerates the whole file from the in-memory model, and that model has
no comment concept. `parseGherkin()` mentions `#` exactly once (line 725) — to _exclude_ comments
from the feature description. **A comment above a scenario is therefore deleted the first time the
tester saves, today, before this feature.** FR-029 to FR-031 cannot hold without changing this.

## Parse

Comment lines accumulate into a pending buffer and attach to the next scenario, mirroring the
existing `pendingTags` mechanism (lines 662-672).

```gherkin
  # Requirement: https://github.com/Asteb612/SuiSui/issues/102
  # Reviewed by QA 2026-07-30
  @checkout @smoke
  Scenario: Customer checks out
```

→ `{ comments: ['# Requirement: https://…/102', '# Reviewed by QA 2026-07-30'],
     tags: ['checkout', 'smoke'], name: 'Customer checks out', steps: [...] }`

Rules:

1. A line whose trimmed form starts with `#` is a comment line.
2. Comment lines are stored **verbatim, including `#`**, trimmed of surrounding whitespace only.
3. The buffer flushes onto the next scenario and is cleared — the same lifecycle as `pendingTags`.
4. A comment is never a step, a tag, or a description line (FR-033). The existing description
   branch already excludes `#`; no other branch may claim it.
5. Comments not followed by a scenario (trailing at end of file, or above `Feature:`) are
   **dropped**, as they are today. Scope is scenario-leading comments only.

## Emit

Comments are written immediately before the scenario's tag line:

```
  # Requirement: …
  @checkout @smoke
  Scenario: Customer checks out
```

Rules:

1. Emitted verbatim, in stored order, at the scenario's indentation.
2. `comments` absent or empty → **nothing emitted**. Output for a comment-free feature file is
   byte-identical to today's.
3. `toGherkin()` never synthesises, reformats, deduplicates or reorders a comment.

## Requirement reference

Written by the _dialog_ on acceptance, as `# Requirement: <ref>` prepended to `comments`.
The round-trip has no knowledge of requirements — it moves opaque lines. That is what keeps
FR-032 (free-form values, URLs) true without any escaping logic.

If the scenario already carries a `# Requirement:` line, the review shows the existing one and the
proposed one; it is never silently replaced or duplicated (spec edge case).

## Invariants — the round-trip tests

| Invariant                                                         | Why it matters                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `parse(emit(s)) ≡ s` for a scenario with comments                 | FR-030                                                                            |
| A hand-written comment survives open → edit → save                | FR-031. **Fails today** — this is a regression test for new behaviour             |
| A comment-free file emits byte-identical output to today          | Protects every existing user file from churn. The single most important test here |
| Comments never appear in `steps`, `tags`, or `featureDescription` | FR-033                                                                            |
| Comment order and position are stable across N round-trips        | No drift on repeated saves                                                        |

## Known limitation, not fixed here

`toGherkin()` joins lines with `'\n'`, so **saving normalises CRLF to LF** — true today, for every
feature file, independent of this feature. The spec lists a CRLF edge case; this contract does not
satisfy it and does not pretend to. Fixing it means changing how all saves write line endings.
Recommend a separate issue rather than smuggling it into this feature.
