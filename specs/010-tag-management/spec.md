# Feature Specification: Tag Management and Tag-Based Browsing/Run View

**Feature Branch**: `010-tag-management`  
**Created**: 2026-07-28  
**Status**: Draft  
**Input**: GitHub issue [#87](https://github.com/Asteb612/SuiSui/issues/87) — "Tag management and tag-based browsing/run view"

> **Problem**: Tags (`@smoke`, `@critical`, etc.) exist per-scenario but there's no way to see or manage them across the whole workspace.
>
> **Proposal**: A dedicated tag browser to view, bulk-edit, and run scenarios by tag.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Browse every tag in the workspace and see what carries it (Priority: P1)

A test author has accumulated tags across dozens of feature files and no longer knows which exist,
how heavily each is used, or whether `@smoke` and `@smoke-test` both crept in. They open the tag
browser and see every tag in the workspace, each with a count of how many scenarios carry it, sorted
so the most-used appear first. Selecting a tag lists exactly the scenarios that carry it, grouped by
feature, and selecting one of those opens it in the editor.

**Why this priority**: This is the core of the issue — tags are currently invisible above the level
of a single scenario. Seeing the full tag vocabulary with counts is the standalone MVP: it makes
inconsistent and orphaned tags obvious, which is the main thing authors cannot do today.

**Independent Test**: Open a workspace whose feature files carry several distinct tags, open the tag
browser, confirm every tag appears with a correct scenario count, select one, confirm exactly the
scenarios carrying it are listed with their owning feature, and select one to open it.

**Acceptance Scenarios**:

1. **Given** a workspace with tagged features and scenarios, **When** the author opens the tag
   browser, **Then** every distinct tag in the workspace is listed exactly once with the number of
   scenarios carrying it.
2. **Given** a feature-level tag, **When** counts are computed, **Then** every scenario in that
   feature counts as carrying the tag, because a feature-level tag applies to all its scenarios.
3. **Given** a tag list, **When** it renders, **Then** tags are ordered by usage count descending so
   the most-used are immediately visible, with a way to switch to alphabetical order.
4. **Given** the author selects a tag, **When** the scenario list renders, **Then** it shows exactly
   the scenarios carrying that tag, each with its owning feature and file location, and indicates
   whether the tag is carried directly by the scenario or inherited from its feature.
5. **Given** a scenario in the list, **When** the author selects it, **Then** the app opens that
   feature and selects that scenario.
6. **Given** a workspace with no tags at all, **When** the tag browser opens, **Then** an explicit
   empty state explains that no tags were found rather than showing a blank panel.

---

### User Story 2 - Run every scenario carrying a tag (Priority: P2)

Before a release the author wants to run just the smoke suite. From the tag browser they select
`@smoke` and start a run covering exactly the scenarios carrying that tag, without hand-picking
features or retyping a filter. The run reports progress and results the same way any other run does.

**Why this priority**: High value and directly requested, but it depends on the browsing view from
P1 to select a tag from. It is deliberately ranked above bulk editing because it only reads content.

**Independent Test**: Tag a known subset of scenarios, trigger a run for that tag from the browser,
and confirm the run covers exactly those scenarios and no others.

**Acceptance Scenarios**:

1. **Given** a selected tag, **When** the author starts a run for it, **Then** a run begins covering
   exactly the scenarios carrying that tag.
2. **Given** a run started from the tag browser, **When** it is underway, **Then** progress and
   results are presented the same way as a run started from anywhere else in the app.
3. **Given** a tag carried by zero scenarios (its last usage was just removed), **When** the author
   tries to run it, **Then** the run is not started and the reason is stated.
4. **Given** a run is already in progress, **When** the author starts a tag run, **Then** the app
   behaves consistently with how it already handles a second run request, rather than silently
   starting a conflicting run.
5. **Given** a tag run finishes, **When** the author returns to the tag browser, **Then** the browser
   still reflects the current workspace state.

---

### User Story 3 - Bulk add or remove a tag across many scenarios (Priority: P3)

The author decides every checkout scenario should be tagged `@critical`, or that the misspelt
`@smoke-test` must go. They select multiple scenarios — from a tag's scenario list — and apply a
single add-or-remove operation across all of them at once, previewing exactly what will change
before committing.

**Why this priority**: The most valuable time-saver but also the only part that **writes to feature
files**, so it carries the most risk. It should land last, on top of a browsing view that already
proves the tag data is correct.

**Independent Test**: Select several scenarios across two different feature files, add a tag, and
confirm the tag appears on exactly those scenarios in the files on disk and nowhere else; then
remove it and confirm the files return to their prior state.

**Acceptance Scenarios**:

1. **Given** several selected scenarios, **When** the author adds a tag, **Then** the tag is added to
   exactly those scenarios and to no others.
2. **Given** several selected scenarios, **When** the author removes a tag, **Then** it is removed
   from exactly those scenarios that carried it directly, and scenarios that did not carry it are
   left untouched.
3. **Given** a bulk operation is about to run, **When** the author confirms, **Then** they are first
   shown how many scenarios in how many files will change, and can cancel.
4. **Given** a selected scenario that already carries the tag being added, **When** the operation
   runs, **Then** it is left unchanged rather than gaining a duplicate tag.
5. **Given** a scenario whose tag is inherited from its feature, **When** the author removes that tag
   from the scenario, **Then** the app explains that the tag comes from the feature and is not
   removable at the scenario level, rather than silently doing nothing.
6. **Given** a bulk operation completes, **When** the author looks at the tag browser, **Then**
   counts and scenario lists reflect the change without a manual refresh.
7. **Given** a bulk operation fails partway (a file cannot be written), **When** it stops, **Then**
   the author is told exactly which scenarios were changed and which were not.
8. **Given** the author enters a tag name, **When** it is not a valid Gherkin tag, **Then** the
   operation is refused with an explanation rather than writing malformed content.

---

### Edge Cases

- **No workspace open**: the tag browser is unavailable with an explanation rather than showing an
  empty tag list.
- **Workspace with no tags**: explicit empty state (see US1 scenario 6).
- **Tag carried only at feature level**: appears in the list, and its scenario count reflects every
  scenario in that feature.
- **Tag on a feature with zero scenarios**: appears with a count of zero and is labelled as such, so
  it is not mistaken for a broken count.
- **Same tag on both a feature and one of its scenarios**: the scenario is counted once, not twice.
- **Tags differing only by case** (`@Smoke` vs `@smoke`): treated as distinct, since Gherkin tags are
  case-sensitive, but surfaced adjacently so the near-duplicate is obvious.
- **Malformed or unparseable feature file**: skipped without failing the whole view, and reported so
  the author knows tag counts are incomplete.
- **Unsaved edits in the open feature**: the browser reflects tags as currently edited in the app,
  not only the last-saved file contents.
- **Feature files changed outside the app**: the browser reflects the change without an app restart.
- **Bulk edit targeting the feature currently open with unsaved changes**: the author is warned
  rather than having their in-editor changes silently overwritten or lost.
- **Bulk edit on a file that is read-only or fails to write**: reported per-file (see US3 scenario 7).
- **A tag's last usage is removed**: the tag disappears from the list, and any view scoped to it
  returns to a sensible state rather than showing a dead selection.
- **Very large tag vocabulary** (hundreds of distinct tags): the list stays usable and responsive,
  with a way to narrow it down.
- **A tag carried by very many scenarios**: the scenario list stays responsive.
- **Selecting scenarios, then the underlying files change**: the operation does not act on stale
  selections; anything that no longer exists is reported rather than silently skipped.

## Requirements _(mandatory)_

### Functional Requirements

**Tag browsing**

- **FR-001**: The application MUST provide a tag browser reachable from the main workspace view that
  lists every distinct tag used anywhere in the current workspace's feature files.
- **FR-002**: Each tag MUST display the number of scenarios that carry it.
- **FR-003**: A tag declared at feature level MUST count as carried by every scenario in that
  feature, and a scenario carrying a tag both directly and by inheritance MUST be counted once.
- **FR-004**: The tag list MUST be ordered by usage count descending by default, and the author MUST
  be able to switch to alphabetical order.
- **FR-005**: The author MUST be able to narrow the tag list by typing part of a tag name.
- **FR-006**: Selecting a tag MUST list exactly the scenarios carrying it, each showing its name, its
  owning feature, and its file location.
- **FR-007**: Each scenario in that list MUST indicate whether the tag is carried directly by the
  scenario or inherited from its feature.
- **FR-008**: Selecting a scenario MUST open its feature and select that scenario in the editor.
- **FR-009**: The browser MUST show an explicit empty state when the workspace contains no tags, and
  MUST be unavailable with an explanation when no workspace is open.

**Freshness**

- **FR-010**: Tag data MUST reflect unsaved in-app modifications to the currently open feature.
- **FR-011**: Tag data MUST reflect feature files added, changed, or removed since the app started,
  without requiring a manual refresh or restart.
- **FR-012**: A feature file that cannot be parsed MUST be skipped without failing the whole view,
  and the system MUST surface that tag data is incomplete and which files were skipped.

**Running by tag**

- **FR-013**: The author MUST be able to start a run for a selected tag directly from the tag
  browser.
- **FR-014**: A tag run MUST cover exactly the scenarios carrying that tag and no others.
- **FR-015**: A tag run MUST report progress and results through the same presentation used by runs
  started elsewhere in the app.
- **FR-016**: The system MUST refuse to start a run for a tag carried by zero scenarios, stating why.

**Bulk tag editing**

- **FR-017**: The author MUST be able to select multiple scenarios and add a tag to all of them in
  one operation.
- **FR-018**: The author MUST be able to select multiple scenarios and remove a tag from all of them
  in one operation.
- **FR-019**: Before applying a bulk operation, the system MUST show how many scenarios in how many
  files will change, and allow the author to cancel.
- **FR-020**: Adding a tag to a scenario that already carries it MUST leave that scenario unchanged;
  no duplicate tags may be produced.
- **FR-021**: Removing a tag that a scenario inherits from its feature MUST be refused for that
  scenario with an explanation, rather than silently succeeding or failing.
- **FR-022**: A tag name entered by the author MUST be validated before use; an invalid tag MUST be
  refused with an explanation and nothing written.
- **FR-023**: A bulk operation MUST NOT alter any part of a feature file other than the tags it is
  changing — scenario order, steps, comments, and formatting MUST be preserved.
- **FR-024**: If a bulk operation cannot complete, the system MUST report which scenarios were
  changed and which were not.
- **FR-025**: The system MUST warn before a bulk operation would modify a feature that has unsaved
  changes open in the editor, rather than discarding those changes.
- **FR-026**: After a bulk operation, tag counts and scenario lists MUST reflect the result without a
  manual refresh.

**Scale**

- **FR-027**: The tag browser MUST stay responsive on the largest workspace size stated in SC-002.

### Key Entities

- **Tag**: A label carried by a feature or a scenario. Attributes: its name (without the leading
  `@`), the number of scenarios carrying it, and whether it is used at feature level, scenario
  level, or both. Tags are case-sensitive.
- **Tag Usage**: The link between a tag and a scenario. Attributes: the owning feature, the scenario,
  the file location, and whether the tag is carried **directly** by the scenario or **inherited**
  from its feature. Inheritance is what makes a usage non-removable at scenario level.
- **Bulk Tag Operation**: A pending change. Attributes: the operation (add or remove), the tag, the
  set of selected scenarios, the computed effect (how many scenarios in how many files actually
  change, and which are skipped and why), and the per-scenario outcome once applied.
- **Tag Index**: The collection of tags and usages derived from the workspace's feature files, kept
  current with respect to file changes and unsaved in-app edits, and carrying the set of files that
  could not be parsed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An author can determine, in under 15 seconds and without opening a single feature file,
  which tags exist in the workspace and how many scenarios carry each.
- **SC-002**: In a workspace of 200 feature files containing 2,000 scenarios and 100 distinct tags,
  the tag browser presents the full tag list within 2 seconds of opening and never stops responding
  to input.
- **SC-003**: Tag counts are correct for 100% of tags — verified against a fixture workspace with
  known expected counts, including feature-level inheritance, a tag on both a feature and its own
  scenario, and a feature with zero scenarios.
- **SC-004**: 100% of scenarios listed for a tag actually carry that tag, and no scenario carrying it
  is missing from the list.
- **SC-005**: A run started from the tag browser executes exactly the scenarios carrying that tag —
  verified by comparing the executed set against the expected set on a fixture workspace.
- **SC-006**: A bulk add or remove across at least 20 scenarios spanning at least 3 feature files
  completes in a single operation and changes only the intended tags: re-reading the files shows no
  difference other than the tag lines.
- **SC-007**: An author can apply a tag to 20 scenarios in under 1 minute, versus editing 20
  scenarios individually.
- **SC-008**: A workspace containing at least one unparseable feature file still shows complete tag
  data for all other files, and the author is told which file was skipped.
- **SC-009**: No bulk operation ever produces a feature file that the application can no longer parse
  — verified by re-reading and re-parsing every modified file after the operation.

## Assumptions

- **Bulk editing applies to scenario-level tags only.** The issue asks for bulk edits "across
  selected scenarios". Feature-level tags are shown (and counted, via inheritance) but are edited on
  the feature itself, not through bulk scenario operations. This keeps the blast radius of a bulk
  write predictable — changing one feature-level tag would silently retag every scenario beneath it.
- **Tags are case-sensitive**, matching Gherkin. `@Smoke` and `@smoke` are two tags. The browser
  surfaces near-duplicates adjacently rather than merging them, because merging would misreport what
  is actually in the files.
- **Counts are per scenario, not per occurrence.** A tag's count answers "how many scenarios would a
  run for this tag execute", which is the question authors actually have.
- **Read-and-navigate plus add/remove only.** Renaming a tag workspace-wide, merging two tags, and
  deleting a tag everywhere are not included (see Out of Scope) — each is a different and larger
  operation than add/remove on an explicit selection.
- **No undo stack.** Bulk operations are guarded by a preview-and-confirm step rather than an undo
  history. The workspace is a git repository in the supported workflow, which is the existing and
  sufficient recovery path; an app-level undo would duplicate it.
- **Runs reuse the existing run presentation.** A tag run is an ordinary run with a tag filter, so it
  reports progress, results, and failures exactly as existing runs do; this feature adds no new
  reporting surface.
- **Existing feature-file interpretation is reused**; this feature introduces no new authoring
  formats and does not change what a tag means.
- **Freshness matches the rest of the app**: tag data is derived from current workspace content and
  updates automatically; the author never triggers a re-scan by hand.

## Out of Scope

- Renaming a tag across the workspace, merging two tags, or deleting a tag from every scenario at
  once. These are workspace-wide rewrites rather than operations on an explicit selection, and each
  needs its own preview and safety story.
- Bulk editing **feature-level** tags (see Assumptions).
- Tag naming conventions, validation policies, or governance (e.g. enforcing an allowed tag list).
- Tag-based reporting, history, or analytics over past runs.
- Tag expressions combining multiple tags (`@smoke and not @slow`) — this feature browses and runs
  one tag at a time.
- Editing tags on step definitions or anything outside `.feature` files.
