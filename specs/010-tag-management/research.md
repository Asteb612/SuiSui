# Phase 0 Research: Tag Management

**Feature**: 010-tag-management | **Date**: 2026-07-28

No `NEEDS CLARIFICATION` items came out of the Technical Context. The product-level decisions
(scenario-level-only bulk editing, case-sensitive tags, per-scenario counting, no undo) were settled
in the spec and are recorded there as Assumptions. What follows are the technical decisions needed to
implement them.

---

## Decision 1: Parser — extend `parseFeatureOutline`, do not add a third scanner

**Decision**: Add optional **line positions** to `parseFeatureOutline` (feature 009) and use it as
the single source of tag data. Do not extend `parseFeatureMetadata`, and do not write a new parser.

**Rationale**: The repo currently has two Gherkin-ish scanners:

| Parser                                                        | Keeps feature/scenario tags separate?                                   | Line positions? | Consumer                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------- | ------------------------------ |
| `electron/utils/gherkinMetadata.ts` → `parseFeatureMetadata`  | **No** — flattens `[...featureTags, ...pendingTags]` into each scenario | No              | Run view (`getWorkspaceTests`) |
| `shared/src/search/featureOutline.ts` → `parseFeatureOutline` | **Yes**                                                                 | No              | Search index (009)             |

FR-007 requires distinguishing a tag carried _directly_ by a scenario from one _inherited_ from its
feature. `parseFeatureMetadata` has already destroyed that distinction by the time it returns, so it
cannot serve this feature without changing behaviour for its only current consumer. `parseFeatureOutline`
already preserves it, so the only gap is line positions — needed because bulk editing must know
_which line_ to splice.

**Alternatives considered**:

- _Extend `parseFeatureMetadata` to stop flattening._ Rejected: it would change `getWorkspaceTests()`
  output, whose consumers (run filters) rely on the flattened form. A behaviour change to shipped
  functionality to serve a new feature is exactly the wrong trade.
- _Write a dedicated tag parser._ Rejected: three scanners over the same file format, drifting
  independently. This is the drift Principle V exists to prevent.
- _Use the official `@cucumber/gherkin` parser._ Rejected: a new runtime dependency, and its AST does
  not expose the raw line text needed for byte-preserving splices — it would push us toward
  parse-and-regenerate, which FR-023 forbids.

**Consequence**: a sequencing dependency on PR #127. Called out prominently in `plan.md` rather than
here, because it affects when work can start, not how it is designed.

---

## Decision 2: Bulk editing — line splice, never parse-and-regenerate

**Decision**: To add or remove a tag on a scenario, operate on the **raw lines** of the file:

- **Add**, scenario already has a tag line directly above → append ` @tag` to that line.
- **Add**, no tag line → insert a new line above the scenario keyword, indented to match it.
- **Remove** → delete the `@tag` token from the tag line; if the line becomes empty, delete the line.
- Everything else in the file is copied through untouched, including the original line ending.

**Rationale**: FR-023 requires that nothing but the tag lines change — scenario order, steps,
comments, blank lines, and formatting must survive. The app already has a `toGherkin()` serializer in
the scenario store, and reusing it would be the obvious shortcut, but it **regenerates the whole
file** from a parsed model: comments are dropped, blank lines normalized, and step text re-rendered
from patterns. Running that across 20 files would produce an enormous, unreviewable diff and would
violate FR-023 on the first comment it encountered.

A line splice is also trivially reversible in review: the diff is one line per change.

**Alternatives considered**:

- _Reuse `scenarioStore.toGherkin()`._ Rejected as above — it is a serializer for a file the user is
  actively editing in a structured view, not a patch tool.
- _Regex replace across the whole file._ Rejected: a tag token can appear in step text, docstrings,
  comments, and `Examples` values. Anchoring on parsed line positions is the only way to be sure the
  right line is edited.

**Critical detail**: the splicer is a **pure function** over `(lines, position, tag)` in
`@suisui/shared`, with no filesystem access. That is what makes the exhaustive edge-case testing
below cheap: indentation styles, CRLF, multiple tags on one line, tag-name prefixes
(`@smoke` must not match `@smoke-test`), and a tag line shared by nothing else.

---

## Decision 3: Verify after write — re-parse every modified file

**Decision**: After writing, re-read and re-parse each modified file. If it no longer parses, or the
expected tag change is not observed, report that file as failed rather than reporting success.

**Rationale**: SC-009 requires that no bulk operation ever produces a file the application can no
longer parse. Given the operation writes to many of the user's files at once and has **no undo**
(spec Assumptions), "we believe the splice was correct" is not good enough — the check is cheap
(a re-read of files we just wrote) relative to the cost of silently corrupting a suite.

This also converts a whole class of splicer bugs from "silent corruption discovered later" into
"operation reported as failed on this file", which is the difference between a bad afternoon and a
lost test suite.

**Alternatives considered**:

- _Trust the splicer, rely on its unit tests._ Rejected: unit tests cover the inputs we thought of;
  the verification pass covers the ones we did not, on the user's real files.
- _Write to a temp file, verify, then swap._ Rejected as over-engineering for this scale — it does
  not remove the need to verify, only changes when the bad content lands, and it complicates the
  partial-failure reporting FR-024 requires.

---

## Decision 4: Partial failure — per-file writes, per-scenario reporting, no rollback

**Decision**: Apply the operation file by file. Report a per-file outcome (`changed`, `skipped` with
reason, `failed` with error). Do **not** attempt to roll back files already written.

**Rationale**: FR-024 requires the user be told exactly what changed and what did not — which is a
_reporting_ requirement, not a transactionality one. A rollback would mean restoring prior content
after a partial failure, which is itself a multi-file write that can fail halfway, leaving a state
harder to reason about than "these 3 files changed, this 1 failed, here is why".

The workspace is a git repository in the supported workflow (spec Assumptions), so the user has a
real, familiar recovery path that is strictly better than a bespoke half-rollback.

**Alternatives considered**:

- _All-or-nothing with rollback._ Rejected as above: adds a failure mode instead of removing one.
- _Stop at the first failure._ Rejected: the user asked for 20 scenarios; failing all 20 because file
  17 is read-only is worse than doing 19 and saying so.

---

## Decision 5: Running by tag — reuse the existing batch run, add no new path

**Decision**: "Run this tag" sets the existing runner config (`activeFilterTab: 'tags'`,
`selectedTags: [tag]`), switches to the runner view, and calls the existing `runner.runBatch`. No new
IPC channel, no new run mechanism.

**Rationale**: `RunnerService.runBatch` already accepts `tags` and builds a grep filter from them, and
the run view already exposes a tag filter tab. The spec's own quality checklist flagged this overlap
and asked that planning confirm US2 does not duplicate it — this is that confirmation. Reusing it
means tag runs inherit progress streaming, results, report handling, and the existing "a run is
already in progress" behaviour (US2 scenario 4) for free.

**Consequence**: US2 is mostly UI wiring, which is why it is cheap despite being ranked P2.

**Alternatives considered**:

- _A dedicated `tags:runTag` channel._ Rejected: a second way to start a run, guaranteed to drift
  from the first, for zero user-visible benefit.

---

## Decision 6: Index location and freshness — main process, `IFileWatcher`, in-memory

**Decision**: `TagService` in `electron/services/`, building an in-memory index on workspace open,
kept fresh with the `IFileWatcher` seam (009). Nothing persisted.

**Rationale**: Identical reasoning to the search index: workspace-wide `fs` access is forbidden in
the renderer (Principle I), and scanning ~200 small files is tens of milliseconds, so a disk cache
would add invalidation surface to save nothing (SC-002 allows 2 s; measured scan cost in 009 was
54 ms for the same corpus). Reusing the seam also means tag freshness is tested the same way search
freshness is — with `FakeFileWatcher`, no sleeps.

**Important interaction**: after a bulk edit the service updates the index **directly** from its own
writes rather than waiting for the watcher, so FR-026 ("counts reflect the change without a manual
refresh") holds deterministically instead of depending on watcher latency.

**Alternatives considered**:

- _Derive tags in the renderer from `runner.getWorkspaceTests()`._ Rejected: that data is flattened
  (Decision 1), has no positions, and the write path needs main-process `fs` anyway.
- _Share one index with the 009 search service._ Rejected for now: the two need different shapes
  (search wants one row per searchable string; tags want usages grouped by tag with positions).
  Sharing the _parser_ captures the real duplication; sharing the _index_ would couple two features
  for little gain.

---

## Decision 7: Unsaved edits — renderer overlay, and a hard guard on bulk writes

**Decision**: Two different treatments for the same underlying fact.

- **Browsing (FR-010)**: the renderer overlays the open feature's tags from Pinia state, exactly as
  the search store does. Read-only, cheap, no IPC.
- **Bulk editing (FR-025)**: if the operation would modify a feature with unsaved changes open in the
  editor, **warn and require an explicit decision** before writing.

**Rationale**: These look like the same requirement but are not. For browsing, showing stale counts
is a minor annoyance. For editing, writing to a file whose in-memory version differs means the user's
next save silently reverts the bulk change — or the bulk change silently discards their edit,
depending on ordering. That is data loss, and it must be surfaced rather than resolved by a heuristic.

**Alternatives considered**:

- _Auto-save the open feature first._ Rejected: saving a user's in-progress work as a side effect of
  a different action is its own surprise.
- _Silently skip dirty files._ Rejected: violates FR-025's intent — the user would be told the
  operation succeeded while some scenarios were untouched.

---

## Decision 8: Tag identity and validation

**Decision**: Tags are compared **case-sensitively** and stored without the leading `@`. A tag name
supplied by the user is validated against `^[\p{L}\p{N}_\-.:]+$` (after stripping one optional
leading `@`); anything else is refused before any write.

**Rationale**: Gherkin tags are case-sensitive, so merging `@Smoke` and `@smoke` would misreport what
is actually in the files (spec Assumptions). Storing without `@` matches how tags are already
represented in `Scenario.tags` and `FeatureTestInfo.tags`, avoiding a conversion layer.

Validation must happen **before** writing (FR-022): a tag containing whitespace would split into two
tags on the next parse, and one containing `#` would truncate the line into a comment. Both produce
files that parse differently from what the user intended, which is precisely the corruption class
Decision 3 exists to catch — better to reject the input than to detect the damage afterwards.

Validation lives in `@suisui/shared` so the dialog can give immediate feedback with the same rule the
service enforces at the boundary.

---

## Resolved risks summary

| Risk                                                         | Mitigation                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk edit reformats or corrupts feature files                | Line-splice only (Decision 2) + re-parse verification (Decision 3) + preview/confirm (FR-019)                                               |
| Prefix collision — removing `@smoke` also hits `@smoke-test` | Token-level, not substring, matching in the splicer; explicit unit test (Decision 2)                                                        |
| Partial failure leaves an unclear state                      | Per-file outcome reporting, no rollback, git as recovery (Decision 4)                                                                       |
| Bulk write silently fights an unsaved editor buffer          | Explicit warning and decision required before writing (Decision 7)                                                                          |
| Invalid tag name produces a file that parses differently     | Validate before write, shared rule for UI and service (Decision 8)                                                                          |
| Three parsers drift apart                                    | Extend the one parser that already preserves inheritance (Decision 1)                                                                       |
| Counts drift from the runner's own tag list                  | Both ultimately derive from the same files; the tag view states inheritance explicitly rather than silently flattening as the run view does |
