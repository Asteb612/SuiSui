# Phase 1 Data Model: Global Search

**Feature**: 009-global-search | **Date**: 2026-07-28

All types below are **serializable** (they cross the IPC bridge) and therefore belong in
`packages/shared/src/types/search.ts` per Principle V. The internal index row is main-process-only and
is documented here but does not cross IPC.

---

## Shared types (`@suisui/shared`)

### `SearchResultType`

```ts
export type SearchResultType = 'feature' | 'scenario'
```

Two values only. Step search is out of scope; a `'step'` member is the intended extension point
(see "Extension points" below), deliberately not added now (Principle VI).

### `MatchedField`

```ts
export type MatchedField = 'name' | 'tag'
```

Why the match happened. Drives FR-018 — a result matched via a tag must show which tag.

### `MatchRange`

```ts
export interface MatchRange {
  /** Inclusive start offset into the displayed text. */
  start: number
  /** Exclusive end offset. */
  end: number
}
```

Offsets index the **original** (non-normalized) display text, so the renderer can highlight without
re-running matching. Accent-stripping must therefore preserve length — see Validation rules.

### `SearchResult`

```ts
export interface SearchResult {
  /** Stable identity: `${relativePath}` for features, `${relativePath}#${scenarioIndex}` for scenarios. */
  id: string
  type: SearchResultType
  /** Text to display as the result's title: feature name or scenario name. */
  text: string
  /** Ranges within `text` that matched. Empty when matchedField === 'tag'. */
  ranges: MatchRange[]
  matchedField: MatchedField
  /** The tag that matched, without the leading '@'. Present only when matchedField === 'tag'. */
  matchedTag?: string
  /** Feature file path relative to the features directory — the navigation target. */
  relativePath: string
  /** Owning feature's declared name. For type 'feature' this equals `text` unless the file has no Feature: line. */
  featureName: string
  /** Index of the scenario within its feature. Present only for type 'scenario'. */
  scenarioIndex?: number
  /** Tags carried by this item, for display. Without leading '@'. */
  tags: string[]
  /** Relevance score; higher sorts first. See Ranking. */
  score: number
}
```

### `SearchResponse`

```ts
export interface SearchResponse {
  /** Echoes the request's id so the caller can discard stale responses (FR-029). */
  requestId: number
  /** Results after ranking and truncation. At most MAX_RESULTS entries. */
  results: SearchResult[]
  /** Total matches before truncation, for the "showing first N of M" indicator (FR-020). */
  totalMatches: number
  /** True when totalMatches > results.length. */
  truncated: boolean
  /** Index state at the time the query was answered (FR-015). */
  status: SearchIndexState
}

export const MAX_SEARCH_RESULTS = 100
```

### `SearchIndexStatus`

```ts
export type SearchIndexState = 'idle' | 'building' | 'ready'

export interface SearchIndexStatus {
  state: SearchIndexState
  /** Number of feature files successfully indexed. */
  fileCount: number
  /** Number of scenarios indexed across all files. */
  scenarioCount: number
  /**
   * Relative paths of files that could not be parsed (FR-028, SC-006).
   * These files remain searchable by file name.
   */
  unparsedFiles: string[]
}
```

`state` transitions: `idle` → `building` (workspace opened) → `ready`. A workspace change returns to
`building`; closing the workspace returns to `idle` and clears counts. Incremental updates from the
watcher do **not** flip `ready` back to `building` — they are fast enough that surfacing them would
only flicker the UI.

### `FeatureOutline` (parser output)

```ts
export interface FeatureOutline {
  /** From the `Feature:` line. Empty string when absent. */
  name: string
  /** Feature-level tags, without leading '@'. */
  tags: string[]
  scenarios: ScenarioOutline[]
  /** True when at least one line could not be interpreted (FR-028). */
  hasParseErrors: boolean
}

export interface ScenarioOutline {
  /** From the `Scenario:` / `Scenario Outline:` line. May be empty. */
  name: string
  tags: string[]
  /** True for `Scenario Outline:`. Display-only; does not change search behavior (FR-008). */
  isOutline: boolean
}
```

Note the name collision hazard: `ScenarioOutline` here means "the outline (summary) of a scenario",
whereas Gherkin's `Scenario Outline` is a parameterized scenario. The `isOutline` flag distinguishes
the latter. If this proves confusing in review, rename to `ScenarioSummary` — the behavior is unaffected.

---

## Main-process internal model (not serialized)

### `SearchIndexRow`

```ts
interface SearchIndexRow {
  type: SearchResultType
  text: string // original display text
  normalizedText: string // lowercased, accent-stripped, length-preserving
  tags: string[] // original, without '@'
  normalizedTags: string[]
  relativePath: string
  featureName: string
  scenarioIndex?: number
}
```

Normalization is precomputed at index time (Decision 2) — this is the field that keeps per-keystroke
cost negligible.

### `SearchIndex`

```ts
interface SearchIndex {
  rows: SearchIndexRow[]
  /** relativePath → the row range contributed by that file, for incremental single-file updates. */
  byFile: Map<string, SearchIndexRow[]>
  status: SearchIndexStatus
}
```

`byFile` exists so a watcher event for one file replaces only that file's rows rather than triggering
a full rebuild (Decision 4).

---

## Relationships

```text
Workspace (1) ──< FeatureFile (N)
                    │
                    ├── produces 1 SearchIndexRow  (type: 'feature')
                    └──< Scenario (N)
                            └── produces 1 SearchIndexRow (type: 'scenario')

SearchIndexRow ──(matched by query)──> SearchResult ──(activated)──> navigation target
                                                                     (relativePath [, scenarioIndex])
```

A single row can produce **at most one** `SearchResult` per query: if both the name and a tag match,
the name match wins (higher score, and `matchedField: 'name'`). This is what keeps FR-022's per-type
counts equal to the number of distinct matched items.

---

## Validation rules

Derived from the functional requirements:

| Rule                                                                              | Source                                                      | Enforcement point                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query is trimmed; empty/whitespace-only query returns no results and runs no scan | Edge case, FR-021                                           | Renderer store guard **and** service guard (defense at the IPC boundary, Principle VI)                                                                              |
| Query is matched literally — never compiled as a regex                            | FR-010                                                      | `matcher.ts` uses `includes()` on normalized strings only                                                                                                           |
| Matching is case-insensitive and accent-insensitive                               | FR-010                                                      | `normalize()`: `NFD` decomposition + strip combining marks + `toLowerCase()`. **Must preserve length** so `MatchRange` offsets stay valid against the original text |
| All query tokens must be present, order-independent                               | FR-011                                                      | Split on whitespace; every token must match; ranges are the union of per-token hits                                                                                 |
| Tag matching ignores a leading `@` on either side                                 | FR-009                                                      | Strip `@` from both the indexed tag and the query token before comparing                                                                                            |
| Results capped at `MAX_SEARCH_RESULTS` (100), with true total reported            | FR-020                                                      | Service truncates **after** sorting; `totalMatches` counted before truncation                                                                                       |
| Result-type filter resets when the query is cleared                               | FR-023                                                      | Renderer store — the filter is UI state and never crosses IPC                                                                                                       |
| `relativePath` never escapes the features directory                               | Security, existing `FeatureService.validatePath` convention | Service builds rows from its own scan; renderer-supplied paths are never trusted for navigation                                                                     |
| Scenario with an empty name is not name-matchable but stays tag-matchable         | Edge case                                                   | Row is still created; `matchText()` returns no match for empty text                                                                                                 |
| A file that fails to parse still contributes its feature row (by file name)       | FR-028, SC-006                                              | Indexer catches per-file, records in `unparsedFiles`, emits a name-only row                                                                                         |

---

## State transitions

**Index lifecycle**

```text
                 workspace opened / changed
   idle ─────────────────────────────────────> building
    ^                                             │
    │ workspace closed                            │ scan complete
    │                                             v
    └──────────────────────────────────────────  ready
                                                  │  ^
                        watcher event (debounced) │  │ incremental update applied
                                                  └──┘
```

**Query lifecycle (renderer)**

```text
typing ──debounce 120ms──> dispatch(requestId = ++n) ──> awaiting
                                                            │
                    response.requestId === n ───────────────┼──> render
                    response.requestId <  n ───────────────-┘    (discard — FR-029)
```

---

## Ranking

Score ladder, computed in `matchText()` so main-process and renderer-overlay results are directly
comparable when merged (Decision 6/7):

| Condition                                                 | Score      |
| --------------------------------------------------------- | ---------- |
| Normalized text equals the full query                     | 100        |
| Text starts with the query                                | 80         |
| All tokens match on word boundaries                       | 60         |
| All tokens match as substrings                            | 40         |
| Tag match (any of the above, on a tag rather than a name) | above − 25 |

Type weighting: `feature` rows get +5 so a feature and a scenario matching equally well put the
feature first (it is the broader target).

Ties break on shorter `text` first, then `relativePath` ascending, then `scenarioIndex` ascending —
fully deterministic, which the E2E order assertion depends on.

---

## Extension points (deliberately unbuilt)

Recorded so the follow-up for step search does not require reshaping this model:

- `SearchResultType` gains `'step'`; `SearchResult` gains an optional `stepIndex`. No other shared
  type changes, and the IPC contract is unchanged.
- `ScenarioOutline` gains `steps: string[]`, producing additional `SearchIndexRow`s from the same scan.
- Navigation gains "scroll to step index", building on the existing "select scenario" path.

Nothing in the current design blocks this; equally, nothing in the current design implements it.
