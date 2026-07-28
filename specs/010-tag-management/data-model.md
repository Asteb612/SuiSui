# Phase 1 Data Model: Tag Management

**Feature**: 010-tag-management | **Date**: 2026-07-28

Serializable types cross the IPC bridge and belong in `packages/shared/src/types/tags.ts`
(Principle V). The parser extension and the splice input are documented here too, since they define
the contract between the parser and the write path.

---

## Shared types (`@suisui/shared`)

### `TagOrigin`

```ts
export type TagOrigin = 'direct' | 'inherited'
```

`direct` — the tag sits on the scenario's own tag line. `inherited` — it comes from the feature and
applies to every scenario beneath it. This is the distinction FR-007 surfaces and FR-021 enforces:
an inherited tag cannot be removed at scenario level.

### `TagUsage`

```ts
export interface TagUsage {
  /** Stable identity: `${relativePath}#${scenarioIndex}`. */
  id: string
  /** Feature file, relative to the features directory. */
  relativePath: string
  /** Owning feature's declared name (falls back to the file's base name). */
  featureName: string
  /** Position of the scenario within its feature. */
  scenarioIndex: number
  /** Scenario name. May be empty — a scenario with no title is still tag-carrying. */
  scenarioName: string
  origin: TagOrigin
}
```

### `TagSummary`

```ts
export interface TagSummary {
  /** Tag name WITHOUT the leading '@'. Case-sensitive. */
  name: string
  /** Number of DISTINCT scenarios carrying it (direct + inherited, deduplicated). */
  scenarioCount: number
  /** True when at least one feature declares it at feature level. */
  usedAtFeatureLevel: boolean
  /** True when at least one scenario declares it directly. */
  usedAtScenarioLevel: boolean
  /**
   * True when the tag exists only on features that contain no scenarios, so its
   * count is legitimately 0 (edge case: "tag on a feature with zero scenarios").
   */
  orphaned: boolean
}
```

### `TagIndex`

```ts
export type TagIndexState = 'idle' | 'building' | 'ready'

export interface TagIndex {
  state: TagIndexState
  tags: TagSummary[]
  /** Usages keyed by tag name. Only populated for tags with at least one usage. */
  usages: Record<string, TagUsage[]>
  /** Feature files that could not be parsed; their tags are missing from the index (FR-012). */
  unparsedFiles: string[]
  fileCount: number
  scenarioCount: number
}
```

`usages` is shipped with the index rather than fetched per tag: at target scale (2,000 scenarios ×
a handful of tags each) the whole structure is well under a megabyte, and shipping it once removes a
round-trip per tag click _and_ removes any possibility of the detail list disagreeing with the count
next to it.

### Bulk operation types

```ts
export type BulkTagOperation = 'add' | 'remove'

export interface BulkTagRequest {
  operation: BulkTagOperation
  /** Tag name, with or without a leading '@'. Validated at the IPC boundary. */
  tag: string
  /** Target scenarios, identified exactly as `TagUsage.id`. */
  targets: BulkTagTarget[]
}

export interface BulkTagTarget {
  relativePath: string
  scenarioIndex: number
}

export type TagWriteStatus =
  | 'changed'
  | 'unchanged' // add: already had it; remove: did not have it
  | 'skipped' // remove: tag is inherited, not removable here (FR-021)
  | 'failed' // write or verification failed (FR-024)

export interface TagWriteOutcome {
  relativePath: string
  scenarioIndex: number
  scenarioName: string
  status: TagWriteStatus
  /** Present when status is 'skipped' or 'failed'. */
  reason?: string
}

export interface BulkTagResult {
  operation: BulkTagOperation
  tag: string
  outcomes: TagWriteOutcome[]
  /** Convenience counts, derived from `outcomes`. */
  changedCount: number
  filesChanged: number
  failedCount: number
  /** The index after the operation, so the renderer never renders stale counts (FR-026). */
  index: TagIndex
}
```

Returning the fresh `index` inside `BulkTagResult` is deliberate: FR-026 requires counts to reflect
the change without a manual refresh, and coupling it to the result makes that atomic from the
renderer's point of view rather than dependent on a watcher event arriving.

### Preview (renderer-side, not serialized)

```ts
export interface BulkTagPreview {
  willChange: number // scenarios that will actually change
  filesAffected: number
  alreadySatisfied: number // add: already tagged; remove: not tagged
  blocked: number // remove: inherited (FR-021)
}
```

Computed in the store from the index the renderer already holds (see plan.md — no preview channel).
FR-019's "how many scenarios in how many files" maps to `willChange` / `filesAffected`.

---

## Parser extension (`parseFeatureOutline`, from feature 009)

Additive only — every new field is optional, so 009's search index is unaffected.

```ts
export interface ScenarioOutline {
  name: string
  tags: string[]
  isOutline: boolean
  /** NEW: 0-based line index of the `Scenario:` / `Scenario Outline:` line. */
  line?: number
  /** NEW: 0-based line index of the tag line directly above, when one exists. */
  tagLine?: number
}

export interface FeatureOutline {
  name: string
  tags: string[]
  scenarios: ScenarioOutline[]
  hasParseErrors: boolean
  /** NEW: 0-based line index of the feature's own tag line, when one exists. */
  featureTagLine?: number
}
```

`tagLine` is absent when a scenario has no tags — that is exactly the case where the splicer must
**insert** a line rather than edit one.

---

## Splice input (`@suisui/shared/tags/tagSplice.ts`)

Pure function; no filesystem access.

```ts
export interface SpliceRequest {
  lines: string[] // file split on /\r?\n/
  scenarioLine: number // where to insert if there is no tag line
  tagLine?: number // existing tag line, if any
  tag: string // WITHOUT leading '@'
  operation: BulkTagOperation
}

export interface SpliceResult {
  lines: string[]
  changed: boolean
  /** Line delta: +1 when a tag line was inserted, -1 when an emptied one was deleted. */
  lineDelta: number
}
```

`lineDelta` matters because a bulk operation may touch **several scenarios in one file**: after
inserting a line for scenario 3, every recorded position below it has shifted. The service applies
edits **bottom-up within each file** so earlier positions stay valid — see State transitions.

---

## Relationships

```text
Workspace (1) ──< FeatureFile (N)
                    │
                    ├── feature tags ──┐
                    │                  ├──> TagUsage(origin: 'inherited') for EVERY scenario below
                    └──< Scenario (N) ─┘
                            └── scenario tags ──> TagUsage(origin: 'direct')

TagUsage (N) ──grouped by name──> TagSummary.scenarioCount
BulkTagRequest ──applied to──> TagWriteOutcome (1 per target) ──> BulkTagResult
```

A scenario carrying a tag **both** directly and by inheritance yields **one** `TagUsage`, with
`origin: 'direct'` (the more actionable of the two — it is the one that can be removed).

---

## Validation rules

| Rule                                                                                 | Source           | Enforcement point                                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tag names are case-sensitive; `@Smoke` ≠ `@smoke`                                    | Spec Assumptions | Index keying and all comparisons                                                                                           |
| Tags stored without a leading `@`; input accepts either form                         | Decision 8       | `normalizeTagName()` in `@suisui/shared/tags/tagName.ts`                                                                   |
| Tag must match `^[\p{L}\p{N}_\-.:]+$` after stripping one optional `@`               | FR-022           | Shared validator, used by the dialog **and** re-checked at the IPC handler                                                 |
| A scenario carrying a tag directly and by inheritance is counted **once**            | FR-003           | Index build, dedup by `TagUsage.id`                                                                                        |
| A feature-level tag counts for every scenario in that feature                        | FR-003           | Index build                                                                                                                |
| Removing an inherited tag is refused per scenario, with a reason                     | FR-021           | Service, before any write; surfaces as `status: 'skipped'`                                                                 |
| Adding a tag a scenario already carries changes nothing                              | FR-020           | Splicer returns `changed: false`; surfaces as `status: 'unchanged'`                                                        |
| Only the tag line may change in a modified file                                      | FR-023           | Splice-only edit (Decision 2), asserted in tests by diffing all other lines                                                |
| Every modified file must still parse afterwards                                      | SC-009           | Post-write re-parse; failure → `status: 'failed'`                                                                          |
| Targets are relative paths inside the features directory                             | Security         | Service builds paths from its own scan; renderer-supplied paths are matched against indexed usages, never trusted directly |
| A bulk write to a feature with unsaved editor changes requires explicit confirmation | FR-025           | Renderer store, before dispatching the request                                                                             |

---

## State transitions

**Index lifecycle** (mirrors the search index — same seam, same guarantees):

```text
              workspace opened / changed
   idle ──────────────────────────────────> building
    ^                                          │ scan complete
    │ workspace closed                         v
    └───────────────────────────────────────  ready
                                               │  ^
                     watcher event (debounced) │  │
                     bulk edit applied ────────┴──┘  (direct update, not via watcher)
```

**Bulk operation**:

```text
select scenarios
      │
      v
compute preview (renderer, from held index)      ── FR-019
      │
      ├── any target file has unsaved edits? ──> warn, require decision  ── FR-025
      v
dispatch BulkTagRequest
      │
      v
group targets BY FILE
      │
      v
for each file:  sort targets by scenarioIndex DESC   ◄── bottom-up: keeps
      │                                                  positions valid as
      │                                                  lines shift
      ├── per target: classify (unchanged / skipped-inherited) or splice
      ├── write file once, with all its splices applied
      └── re-read + re-parse ──> mismatch? mark that file's targets 'failed'  ── SC-009
      │
      v
rebuild index from disk ──> BulkTagResult{ outcomes, index }   ── FR-024, FR-026
```

The bottom-up ordering is the subtle part: applying edits top-down would invalidate every recorded
line position below the first insertion, silently tagging the wrong scenarios.

---

## Extension points (deliberately unbuilt)

Recorded so the out-of-scope operations do not require reshaping this model:

- **Rename a tag workspace-wide**: `BulkTagOperation` gains `'rename'` with a `newTag` field;
  targets become "all usages of X". The splicer already handles token-level replacement.
- **Delete a tag everywhere**: `'remove'` with targets = every direct usage. Needs a stronger
  preview, not a new model.
- **Tag expressions for running** (`@smoke and not @slow`): belongs to the runner's filter model, not
  here; this feature's `selectedTags` handoff already passes through it.

Nothing in the current design blocks these; equally, none of them is implemented.
