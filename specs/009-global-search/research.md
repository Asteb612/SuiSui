# Phase 0 Research: Global Search

**Feature**: 009-global-search | **Date**: 2026-07-28

All `NEEDS CLARIFICATION` items from the Technical Context were resolved. The three product-level
decisions (placement/shortcut, freshness model, step-search scope) were settled during
`/speckit.clarify` and are recorded in `spec.md`. What follows are the technical decisions needed to
implement them.

---

## Decision 1: Where the index lives — main process

**Decision**: `SearchIndexService` in `apps/desktop/electron/services/`, queried by the renderer over IPC.

**Rationale**: The index must cover every `.feature` file in the workspace, not just the open one
(FR-006). That requires recursive directory reads and a file watcher — both `node:fs`, both forbidden
in the renderer by Principle I. `FeatureService` already owns exactly this scan (`list()`/`getTree()`),
so the index sits naturally beside it and can resolve the features directory through
`WorkspaceService.getFeaturesDir()` rather than trusting a renderer-supplied path.

**Alternatives considered**:

- _Index in the renderer, fed by `features.list()` + `features.read()` per file._ Rejected: 200 IPC
  round-trips plus 200 file payloads crossing the bridge on every workspace open, and no way to watch
  for external changes. It also duplicates path validation that `FeatureService` already does.
- _Reuse `StepCatalogService`'s cached-on-disk model._ Rejected: that cache exists because TypeScript
  AST analysis is expensive (seconds). Scanning 200 small text files for names and tags is tens of
  milliseconds — persisting it would add invalidation surface (schema version, mtime+hash, `.app/`
  writes) to save nothing measurable. See Decision 5.

---

## Decision 2: Index data structure — flat array, linear scan

**Decision**: A flat `SearchIndexRow[]` with pre-normalized (lowercased, accent-stripped) text fields,
scanned linearly per query.

**Rationale**: The target scale is ~200 feature rows + ~2,000 scenario rows ≈ 2,200 rows. A linear
pass doing a normalized `includes()` per query token over 2,200 short strings is on the order of a
few hundred microseconds — three orders of magnitude inside the 300 ms budget (SC-002), and dominated
entirely by the IPC round-trip. Principle VI: an inverted index, trigram table, or a fuzzy-search
dependency would all be measurably slower to build and strictly harder to reason about for zero
user-visible gain.

Normalization is done **once at index time**, not per keystroke — that is the only optimization that
actually matters here, since `String.normalize('NFD')` is comparatively expensive.

**Alternatives considered**:

- _Inverted token→rows index._ Rejected: faster asymptotically, irrelevant at n=2,200, and it
  complicates incremental single-file updates (must remove stale postings).
- _A fuzzy-search library (Fuse.js, MiniSearch)._ Rejected twice over: a new runtime dependency
  (Principle VI) and the spec explicitly excludes fuzzy matching to keep results predictable.

---

## Decision 3: Feature parsing — a dedicated outline parser, not `parseGherkin`

**Decision**: A new `parseFeatureOutline(content)` in `@suisui/shared/search/featureOutline.ts` that
extracts only the feature name, feature tags, and each scenario's name and tags. It never throws;
malformed input yields whatever was parsed plus an `errors` flag.

**Rationale**: The renderer's `scenarioStore.parseGherkin()` is a full-fidelity parser: it resolves
steps against step definitions, parses DataTables and Examples, and mutates store state. None of that
is needed to index names and tags, and it cannot run in the main process (it is a Pinia action that
depends on the step catalog). A line-scanner that recognizes `@tags`, `Feature:`, `Scenario:`,
`Scenario Outline:`, and `Background:` is ~60 lines, has no dependencies, and is trivially unit-testable.

Placing it in `@suisui/shared` (rather than in the service) means the renderer can call the same
parser if it ever needs to, and keeps the SSoT rule intact.

**Non-throwing is a requirement, not a nicety**: FR-028 demands that one unparseable file not abort
the search. A line-scanner degrades naturally — an unrecognized line is simply skipped — which
satisfies FR-028 by construction rather than by try/catch.

**Alternatives considered**:

- _Use the official `@cucumber/gherkin` parser._ Rejected: a new runtime dependency for the main
  process, and its strictness is a liability here — it throws on files this feature must degrade over.
- _Extract and share `parseGherkin` from the scenario store._ Rejected: it is coupled to step
  definitions and store mutation; untangling it is a refactor far larger than this feature warrants,
  and would risk regressions in the editor for no search-side benefit.

---

## Decision 4: File watching — `fs.watch` recursive behind an `IFileWatcher` seam

**Decision**: Watch the features directory with Node's built-in `fs.watch(dir, { recursive: true })`,
debounced/coalesced at 250 ms, accessed through an `IFileWatcher` interface with a `NodeFileWatcher`
production implementation and a `FakeFileWatcher` for tests.

**Rationale**: SC-009 requires an external change to surface within 2 seconds with no user action, so
polling or refresh-on-focus is not sufficient. `fs.watch` is built in — adding `chokidar` for this
would violate the no-new-dependency stance when the built-in covers the supported platforms. The seam
exists solely to satisfy Principle III: real watch events are OS-dependent and timing-flaky, so
service tests inject a fake and drive `emit('change', path)` synchronously.

**Reliability handling** (recursive `fs.watch` is well documented as lossy under churn, and only gained
Linux support in Node 20.13):

- Coalesce all events in a 250 ms window into a single update pass, so a branch switch touching 200
  files causes one rescan rather than 200.
- On any watcher `error` event, or if the watched directory disappears, fall back to a single full
  rescan and attempt to re-establish the watch — never crash the service.
- Correctness never depends solely on the watcher: opening a workspace always rebuilds from scratch,
  and in-app writes update the index directly rather than waiting for the watch event.

**Alternatives considered**:

- _`chokidar`._ Rejected for now — a new runtime dependency (Principle VI) for a case the built-in
  handles. The seam makes swapping it in a contained change if real-world reliability demands it.
- _Poll `mtime` on an interval._ Rejected: 200 `stat` calls every second is worse on battery and
  still slower to react than an event.
- _No watcher; rescan on window focus._ Rejected: fails SC-009 outright.

---

## Decision 5: No persisted cache

**Decision**: The index is in-memory and session-scoped; it is rebuilt on every workspace open and
never written to disk.

**Rationale**: Building from scratch is ~200 small file reads — well inside the 5 s budget (SC-008)
and typically far faster. Persisting would buy a fraction of a second on startup at the cost of an
entire class of bugs the `StepCatalogService` cache already has to defend against (schema versioning,
mtime+hash invalidation, `.app/.gitignore` upkeep, stale-cache-after-branch-switch). The spec's
Assumptions section already commits to this, and it removes "stale cache across restarts" as a
possible failure mode entirely.

---

## Decision 6: Unsaved-edit freshness — renderer-side overlay

**Decision**: The main-process index reflects **saved** file content. The renderer's search store
overlays the currently open feature: when `scenarioStore.isDirty`, it discards indexed rows whose
`relativePath` matches `scenarioStore.currentFeaturePath` and re-derives that feature's rows from
live Pinia state, matching them with the same shared `matchText()` used in main.

**Rationale**: This is what makes sharing the matcher worthwhile. The alternative — pushing every
keystroke of the open feature's state to main to keep the index hot — would put editor-rate traffic
across the IPC bridge for a feature that only needs the data at query time. The overlay touches state
the renderer already holds, costs nothing when nothing is dirty, and keeps a single definition of
"what counts as a match" (Principle V).

The exclude-then-re-add ordering matters: excluding by path first prevents a renamed scenario from
appearing under both its old (indexed) and new (live) name.

**Alternatives considered**:

- _Push dirty content to main on every edit._ Rejected: chatty, and duplicates authoritative editor
  state outside the editor.
- _Ignore unsaved edits._ Rejected: violates FR-012, and would show the author results that
  contradict what is on their screen.

---

## Decision 7: Ranking — a small explicit score, computed at match time

**Decision**: Each match gets an integer score from a fixed ladder: exact full-string match > match at
start of text > whole-word match > substring match; feature-name matches and scenario-name matches
rank above tag-only matches; ties break on shorter text first, then alphabetically for stability.

**Rationale**: FR-019 requires whole-word and start-of-text matches to rank above other partial
matches, which needs an explicit score — sort order cannot be derived from the filter predicate alone.
Keeping it a small integer ladder computed inside `matchText()` means the renderer's overlay results
and the main process's indexed results are directly comparable when merged (Decision 6), which they
would not be if ranking lived only in the service.

Deterministic tie-breaking is required for the E2E test to assert a stable result order at all.

**Alternatives considered**:

- _BM25 / TF-IDF relevance._ Rejected: designed for documents of varying length; these are short
  names where term frequency carries no signal. Pure overhead.
- _No ranking, natural file order._ Rejected: fails FR-019 and makes SC-007 (first-attempt success)
  much harder to hit.

---

## Decision 8: Debounce and stale-response handling

**Decision**: Debounce input at 120 ms in the renderer. Every query carries a monotonically increasing
`requestId`; the store discards any response whose id is not the latest.

**Rationale**: FR-029 requires that a superseded search never overwrite newer results. Debouncing
alone does not guarantee this — two in-flight IPC calls can still resolve out of order. The id check
is the actual correctness mechanism; the debounce is the cost optimization. 120 ms sits below the
typing-to-perceived-lag threshold while collapsing most intra-word keystrokes.

---

## Decision 9: Shortcut binding scoped to the renderer

**Decision**: A `keydown` listener on `window` inside `GlobalSearch.vue`, checking
`(e.ctrlKey || e.metaKey) && e.key === 'k'`, and bailing out when the event target is an
input/textarea/contenteditable or a PrimeVue modal is open.

**Rationale**: FR-002 requires the shortcut to yield to other text inputs, which an Electron
`globalShortcut` (OS-wide) or an application-menu accelerator cannot express — both fire regardless of
focus. Scoping it to the renderer keeps the guard where the focus information actually is, and keeps
the shortcut inert when the window is not focused, which is the expected desktop behavior.

**Alternatives considered**:

- _Electron `globalShortcut`._ Rejected: registers OS-wide, hijacking Ctrl+K from every other app.
- _Application menu accelerator._ Rejected: cannot inspect focus to honor the FR-002 exemption.

---

## Resolved risks summary

| Risk                                                    | Mitigation                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Recursive `fs.watch` misses events on Linux under churn | Debounce + coalesce; full rescan on watcher error; rebuild on workspace open; in-app writes update the index directly (Decision 4) |
| Watcher tests are timing-flaky                          | `IFileWatcher` seam + `FakeFileWatcher` drives events synchronously (Decision 4, Complexity Tracking)                              |
| Out-of-order IPC responses overwrite newer results      | Monotonic `requestId` discard, not debounce alone (Decision 8)                                                                     |
| Renamed scenario appears twice during unsaved edits     | Overlay excludes by path before re-adding live rows (Decision 6)                                                                   |
| Unparseable feature file aborts the whole search        | Line-scanner degrades per-line; file still indexed by name; reported via `unparsedFiles` (Decision 3)                              |
