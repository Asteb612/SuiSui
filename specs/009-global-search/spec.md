# Feature Specification: Global Search Across Feature Files and Scenarios

**Feature Branch**: `009-global-search`  
**Created**: 2026-07-28  
**Status**: Draft  
**Input**: GitHub issue [#88](https://github.com/Asteb612/SuiSui/issues/88) — "Global search across all scenarios and steps"

> **Problem**: Navigation is tree-only. There is no way to search scenario names across the whole workspace.
>
> **Proposal**: A global search box that finds feature files and scenarios — by name or by tag — across the whole workspace.

**Deviation from issue #88**: the issue's acceptance criteria include searching **step text**. Step-text
search has been deliberately excluded from this feature (see Clarifications and Out of Scope). Search
covers feature-file names, scenario names, and tags only. Note this when closing the issue.

## Clarifications

### Session 2026-07-28

- Q: Where does the search live and what shortcut opens it? → A: A text search box in the top header, opened/focused with Ctrl+K (Cmd+K on macOS).
- Q: How is the searchable content kept current across all feature files? → A: A searchable index is built when the workspace opens and kept in sync by file-change watching plus unsaved in-app edits; queries are evaluated against the index, never by re-reading the workspace per keystroke.
- Q: How should Scenario Outlines and their Examples values be searched? → A: Moot — step-text search is out of scope. Search matches feature-file names, scenario names, and tags only; a Scenario Outline is searchable by its own name and tags exactly like any other scenario, and its Examples values are not indexed.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Find a feature file or scenario by name (Priority: P1)

A test author working in a workspace with dozens of feature files remembers that a scenario is
called something like "checkout with expired card", but not which feature file it lives in. They
press Ctrl+K, type a few words, and immediately see a ranked list of matching feature files and
scenarios with enough surrounding context (feature name, file location) to tell the candidates
apart. Selecting a result opens that feature and reveals the scenario, ready to edit.

**Why this priority**: This is the core pain in the issue — the tree is the only way to navigate, so
finding anything requires manually expanding folders and files. Name search removes that friction
and is a viable standalone MVP.

**Independent Test**: Open a workspace containing several feature files, type part of a known
scenario name into the header search box, confirm the scenario appears in results with its parent
feature, select it, and confirm the app navigates to that scenario.

**Acceptance Scenarios**:

1. **Given** a workspace with multiple feature files, **When** the author types text matching a
   scenario name, **Then** matching scenarios are listed with their parent feature and file
   location, and the matched portion of the text is visually highlighted.
2. **Given** search results are shown, **When** the author selects a scenario result, **Then** the
   app navigates to that feature, selects that scenario, and the results panel closes.
3. **Given** the author types text matching a feature file's name, **When** results render, **Then**
   matching feature files appear as their own result type, distinguishable from scenario results.
4. **Given** the author types text that matches nothing, **When** results render, **Then** an
   explicit "no results" state is shown rather than an empty panel.
5. **Given** results are shown, **When** the author presses the down/up arrow keys and Enter,
   **Then** the highlighted result changes and Enter navigates to it — without touching the mouse.
6. **Given** a `Scenario Outline`, **When** its name matches the query, **Then** it is returned as a
   single scenario result like any other scenario.

---

### User Story 2 - Narrow results by tag and result type (Priority: P2)

An author working with a large suite wants to find everything carrying a tag (e.g. `@smoke`), or to
restrict results to a single kind of item. They can search tags directly by typing the tag text, and
can filter the result list down to only feature files or only scenarios.

**Why this priority**: Tag search is how authors slice a suite by intent (smoke, regression, wip),
and the type filter keeps large result lists workable. Both are refinements on the P1 shell rather
than prerequisites for it.

**Independent Test**: Tag several scenarios, search for the tag text, confirm only tagged items are
returned; then toggle the result-type filter and confirm the list narrows accordingly.

**Acceptance Scenarios**:

1. **Given** feature files and scenarios carrying tags, **When** the author searches for a tag's
   text, **Then** the items carrying that tag are returned and the matching tag is shown on the
   result.
2. **Given** a tag written with its leading `@`, **When** the author types the tag with or without
   the `@`, **Then** the same items are returned either way.
3. **Given** a mixed result list, **When** the author restricts results to a single type, **Then**
   only results of that type remain, and the counts per type are visible.
4. **Given** a filter is active, **When** the author clears the query and searches again, **Then**
   the filter resets to the default (all types) so the next search is not silently narrowed.

---

### Edge Cases

- **Empty or whitespace-only query**: no search runs; the results panel stays closed or shows
  guidance instead of listing every item in the workspace.
- **Very short query (1 character)**: matching is allowed but results are capped and the user is
  told results are truncated, rather than the app rendering thousands of rows.
- **No workspace open**: the search input is unavailable with an explanation instead of searching
  nothing.
- **Very large workspace**: results are capped at a maximum count with an explicit "showing first N
  of M" indicator; the app never stops responding while typing.
- **Unsaved edits in the currently open feature**: search reflects the in-app current state of the
  open feature — including a renamed scenario or an edited tag not yet saved — rather than only the
  last-saved file contents.
- **Scenario with no name** (empty or whitespace title): it is not matchable by name but is still
  reachable via its tags and its parent feature, and is never rendered as a blank result row.
- **Malformed or unparseable feature file**: the file is skipped without failing the whole search,
  and the affected file is surfaced so the author knows coverage was incomplete. Its file name
  remains matchable even when its contents could not be parsed.
- **Feature files added, renamed, or deleted outside the app**: the next search reflects the change
  rather than serving stale content.
- **Search used while the index is still building**: the input accepts typing and the panel reports
  indexing progress, then results appear once ready — never a premature "no results".
- **Workspace closed or switched while results are shown**: results for the previous workspace are
  discarded rather than left selectable.
- **Bulk external change** (e.g. a branch switch rewriting many feature files at once): the index
  converges to the new content without requiring an app restart.
- **Result target no longer exists** (file deleted between search and selection): selecting it shows
  a clear message rather than an error state or a blank editor.
- **Duplicate names** (same scenario name in several features): each occurrence is listed separately
  and disambiguated by feature and file location.
- **Non-ASCII / accented text and mixed case**: matching is case-insensitive and accent-insensitive
  so "Connexion" matches "connexion".
- **Special characters in the query** (e.g. `@`, `"`, `|`, regex-like characters): treated as literal
  text to match, never as an error or an unintended pattern.
- **Rapid typing**: only the results for the latest query are displayed; earlier in-flight searches
  never overwrite newer results.
- **Shortcut pressed while a modal dialog or text field is active**: the shortcut does not hijack
  typing there.

## Requirements _(mandatory)_

### Functional Requirements

**Entry point and interaction**

- **FR-001**: The application MUST provide a global search text input in the top header, visible and
  usable from anywhere in the main workspace view, independent of the current tree selection.
- **FR-002**: Users MUST be able to focus the header search input with Ctrl+K (Cmd+K on macOS), with
  the shortcut suppressed while focus is inside another text input or an open modal dialog.
- **FR-003**: Users MUST be able to dismiss the results panel with the Escape key, returning focus to
  where they were before invoking search.
- **FR-004**: Users MUST be able to move through results and activate one entirely by keyboard
  (arrow keys to move, Enter to activate) as well as by mouse.
- **FR-005**: The search MUST update results as the user types, without requiring a submit action.

**Search coverage**

- **FR-006**: Search MUST match against feature-file names, feature names, scenario names, and tags
  (on both features and scenarios), across every feature file in the current workspace's BDD folder
  — not only the currently open file.
- **FR-007**: Search MUST NOT match against step text; steps are not indexed and never appear as
  results.
- **FR-008**: A `Scenario Outline` MUST be searchable by its own name and tags as a single scenario;
  its `Examples` table values MUST NOT be indexed and MUST NOT produce per-row results.
- **FR-009**: Tag matching MUST succeed whether or not the user types the leading `@`.
- **FR-010**: Matching MUST be case-insensitive and accent-insensitive, and MUST treat the query as
  literal text (no pattern or regular-expression interpretation).
- **FR-011**: Matching MUST support multi-word queries where all words must be present in the target
  item, in any order (so "expired checkout" matches "Checkout with an expired card").

**Index freshness**

- **FR-012**: Search results MUST reflect unsaved in-app modifications to the currently open feature,
  and MUST reflect feature files added, changed, or removed since the app started.
- **FR-013**: The system MUST build a searchable index of the workspace's feature content when a
  workspace is opened, and MUST evaluate queries against that index rather than re-reading feature
  files on each query.
- **FR-014**: The system MUST keep the index current without user action: feature files created,
  modified, renamed, or deleted — whether by the app or by an external tool — MUST be reflected in
  subsequent search results, and unsaved in-app edits to the open feature MUST take precedence over
  that feature's last-saved indexed content.
- **FR-015**: While the index is still being built, the search input MUST remain usable and
  communicate that indexing is in progress rather than silently reporting no matches.

**Results**

- **FR-016**: Each result MUST identify its type (feature file or scenario) and show enough context
  to disambiguate it: the owning feature name for scenarios, and the file location.
- **FR-017**: Each result MUST visually highlight the portion of its text that matched the query.
- **FR-018**: When a result matched via a tag rather than its name, the matching tag MUST be shown on
  that result so the reason for the match is evident.
- **FR-019**: Results MUST be ordered so that the most relevant appear first, with whole-word or
  start-of-text matches ranked above other partial matches.
- **FR-020**: The result list MUST be capped at a maximum number of displayed results, and MUST
  state when results were truncated, including the total number of matches found.
- **FR-021**: The system MUST show an explicit empty state when a non-empty query yields no matches.
- **FR-022**: The system MUST group or label results by type and show a per-type match count.
- **FR-023**: Users MUST be able to restrict the result list to a single result type; the restriction
  MUST reset when the query is cleared.

**Navigation**

- **FR-024**: Activating a feature-file result MUST open that feature file in the editor.
- **FR-025**: Activating a scenario result MUST open its feature, select that scenario, and bring it
  into view.
- **FR-026**: Activating any result MUST close the results panel and place focus in the destination
  content.
- **FR-027**: If the target of a result no longer exists when activated, the system MUST show a
  clear, non-fatal message and leave the user's current work untouched.

**Robustness and performance**

- **FR-028**: A feature file that cannot be parsed MUST be skipped without aborting the search, and
  the system MUST surface that one or more files could not be searched.
- **FR-029**: Only the results of the most recent query MUST be displayed; superseded searches MUST
  not overwrite newer results.
- **FR-030**: Searching MUST NOT block interaction with the application, including on the largest
  workspace size stated in SC-002.
- **FR-031**: When no workspace is open, the search input MUST be unavailable and MUST communicate
  why, rather than returning an empty result set.

### Key Entities

- **Search Query**: The user's literal text, plus the active result-type restriction. Transient; not
  persisted between sessions.
- **Search Result**: A single match. Attributes: result type (feature file / scenario), display text,
  matched ranges within that text, which field matched (name or tag), relevance rank, and the context
  needed to display it (feature name, tags, file location).
- **Result Target**: The addressable location a result points at — the feature file, and for scenario
  results the scenario within it.
- **Search Index**: The collection of feature files, feature names, scenario names, and tags derived
  from the workspace's feature files that queries are evaluated against. Built when the workspace
  opens, scoped to one workspace, held for the session (not persisted), and kept current with respect
  to file changes and unsaved in-app edits. Carries a build state (building / ready) and the set of
  files that could not be parsed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An author who knows part of a scenario's name can reach that scenario in under 10
  seconds, from anywhere in the app, without expanding the tree.
- **SC-002**: In a workspace of 200 feature files containing 2,000 scenarios, results appear within
  300 ms of the last keystroke, and the interface never stops responding to input while typing.
- **SC-003**: Search finds 100% of items whose feature-file name, feature name, scenario name, or tag
  contains the query words, across every feature file in the workspace — verified against a fixture
  workspace with known expected matches, including scenario outlines and duplicate names.
- **SC-004**: 100% of activated results land the user on the exact matched item (correct feature file,
  and for scenario results the correct scenario in view).
- **SC-005**: The entire find-and-navigate flow — focus, type, choose, activate — is completable using
  only the keyboard.
- **SC-006**: A workspace containing at least one unparseable feature file still returns complete
  results for all other files, and the author is told which file was skipped.
- **SC-007**: In usability testing, 90% of authors locate a target scenario on their first search
  attempt without needing to reformulate the query.
- **SC-008**: For the workspace size in SC-002, search becomes fully usable within 5 seconds of the
  workspace opening, and opening a workspace is not blocked while that preparation happens.
- **SC-009**: A feature file changed on disk by an external tool is reflected in search results
  within 2 seconds of the change, with no user action.

## Assumptions

- **Scope is names and tags only**: search matches feature-file names, feature names, scenario names,
  and tags. Step text is explicitly excluded (see Clarifications and Out of Scope) — this is a
  deliberate narrowing of issue #88.
- **Scope is the current workspace's BDD folder**: search covers the feature files the app already
  discovers for the tree (per the existing BDD subfolder detection); it does not search step
  definition source files, run results, or files outside the workspace.
- **Read-only**: search navigates to content; it does not offer replace, bulk edit, or delete.
- **No persistence**: the query, filters, and search history are not persisted across app restarts.
- **Substring/word matching, not fuzzy**: all query words must actually be present. Typo-tolerant
  fuzzy matching is deliberately excluded to keep results predictable; it can be added later without
  changing the result or navigation model.
- **Single input, all types at once**: one query searches all item types simultaneously; there is no
  separate mode per type, only a filter applied to results.
- **Tags are matched as text**: a tag is matched by the same substring/word rules as a name, with the
  leading `@` optional. There is no field-scoped query syntax (see Out of Scope).
- **Result cap default**: 100 displayed results, with the true total reported alongside.
- **Shortcut choice**: Ctrl/Cmd+K (see Clarifications). It is scoped to the main window and yields
  when another text input or a modal dialog has focus. Ctrl/Cmd+F is deliberately left free for a
  future find-within-the-open-feature affordance.
- **Existing feature-file interpretation is reused**: the app already reads and interprets `.feature`
  content; this feature adds no new authoring formats.
- **Freshness model**: an index is built on workspace open and kept in sync automatically (see
  Clarifications); the user is never required to manually trigger a re-index. The index is
  session-scoped and rebuilt on workspace open rather than persisted to disk, so there is no
  stale-cache-across-restarts failure mode to invalidate.

## Out of Scope

- **Searching step text** — including step arguments, `Background` steps, and `Examples` table values.
  Deliberately excluded; the index and result model are designed so it can be added later as an
  additional result type without reshaping navigation. This is a known deviation from issue #88.
- Search-and-replace or any mutation of feature content from the results list.
- Searching step definition implementation files, test run history, or logs.
- Fuzzy/typo-tolerant matching and query-language operators (boolean, field-scoped syntax such as
  `tag:@smoke`, quoted phrases).
- Persisted search history or saved searches.
- Cross-workspace search.
