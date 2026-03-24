# Feature Specification: Flexible Test Runner

**Feature Branch**: `002-flexible-test-runner`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Currently the run mode is attached to a single feature file. But i want to change that to be more flexible. So i can chose to run all test or only some. I want to filter them by tags, name, folder, feature. Also i want the ability to run them in parallel or in sequencial."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Run All Tests at Once (Priority: P1)

As a tester, I want to run all tests in my workspace with a single action so I can quickly verify that everything works end-to-end without manually running each feature file one by one.

**Why this priority**: This is the most fundamental change. Without the ability to run beyond a single feature file, no other filtering or execution options matter. This unlocks batch execution as the foundation for all other stories.

**Independent Test**: Can be fully tested by opening a workspace with multiple feature files, switching to the run view, clicking "Run All", and verifying that all features are executed and results are aggregated.

**Acceptance Scenarios**:

1. **Given** a workspace with 5 feature files across multiple folders, **When** the user clicks "Run All" in headless mode, **Then** all 5 feature files are executed and the combined results are displayed.
2. **Given** a workspace with feature files, **When** the user clicks "Run All", **Then** a progress indicator shows which features are running or completed.
3. **Given** a test run of all features is in progress, **When** the user clicks "Stop", **Then** all running tests are terminated and partial results are shown.

---

### User Story 2 - Filter Tests by Feature File (Priority: P1)

As a tester, I want to select one or more specific feature files to run so I can focus my test execution on relevant areas without running the entire suite.

**Why this priority**: Selecting specific features is the most natural and intuitive filter since users already work with individual feature files. It extends the current single-feature behavior to multi-select.

**Independent Test**: Can be tested by selecting 2 out of 5 available features, running them, and confirming only those 2 features execute.

**Acceptance Scenarios**:

1. **Given** a workspace with multiple feature files, **When** the user selects 3 specific feature files and clicks "Run", **Then** only those 3 features are executed.
2. **Given** the user has selected features to run, **When** one feature passes and another fails, **Then** the results clearly indicate the status per feature.
3. **Given** the user is in the run configuration view, **When** they deselect all features, **Then** the "Run" action is disabled.

---

### User Story 3 - Filter Tests by Folder (Priority: P2)

As a tester, I want to run all tests within a specific folder (e.g., `features/auth/`) so I can test an entire functional area at once.

**Why this priority**: Folder-based filtering is the second most natural grouping after individual features since the folder structure typically mirrors functional areas of the application.

**Independent Test**: Can be tested by selecting a folder containing 3 feature files and verifying all 3 are included in the run.

**Acceptance Scenarios**:

1. **Given** a workspace with features organized in folders (`features/auth/`, `features/checkout/`), **When** the user selects the `auth` folder, **Then** all feature files within that folder (including subfolders) are included in the run.
2. **Given** multiple folders are available, **When** the user selects two folders, **Then** all features in both folders are included.
3. **Given** a folder contains no feature files, **When** the user selects it, **Then** the folder is shown as empty and the run action reflects no tests to execute.

---

### User Story 4 - Filter Tests by Tags (Priority: P2)

As a tester, I want to filter tests by Gherkin tags (e.g., `@smoke`, `@regression`, `@auth`) so I can run specific test suites based on tagging conventions.

**Why this priority**: Tag-based filtering is essential for running curated test suites (smoke tests, regression, by component) and is a standard BDD workflow. Tags already exist in the data model but are not yet used for execution filtering.

**Independent Test**: Can be tested by tagging scenarios with `@smoke`, filtering by that tag, and verifying only tagged scenarios execute.

**Acceptance Scenarios**:

1. **Given** scenarios tagged with `@smoke` across multiple feature files, **When** the user filters by the `@smoke` tag and runs, **Then** only scenarios with that tag are executed.
2. **Given** the user selects multiple tags (e.g., `@smoke` and `@auth`), **When** they run, **Then** scenarios matching any of the selected tags are executed (OR logic within tags).
3. **Given** a tag filter is applied, **When** no scenarios match the filter, **Then** the user is informed that no tests match the current filter and the run action is disabled.
4. **Given** a feature file has some tagged and some untagged scenarios, **When** a tag filter is applied, **Then** only the matching scenarios within that feature are executed.

---

### User Story 5 - Filter Tests by Scenario Name (Priority: P3)

As a tester, I want to search and filter scenarios by name so I can quickly find and run specific tests when I know what I'm looking for.

**Why this priority**: Name-based search is useful for targeted debugging and ad-hoc test runs. It extends the current single-scenario grep functionality to work across multiple features.

**Independent Test**: Can be tested by typing a partial scenario name, seeing matching scenarios across all features, and running only the matches.

**Acceptance Scenarios**:

1. **Given** multiple feature files with various scenarios, **When** the user types "login" in the name filter, **Then** all scenarios whose name contains "login" (case-insensitive) are shown as matches.
2. **Given** the user has applied a name filter, **When** they run, **Then** only the matching scenarios are executed.
3. **Given** the user types a search term with no matches, **When** the filter is applied, **Then** a message indicates no matching scenarios and the run action is disabled.

---

### User Story 6 - Exclusive Filter Tabs with Name Search (Priority: P3)

As a tester, I want to filter tests using one structural filter at a time (features, folders, or tags) combined with an optional name search, so I can focus on one filtering approach without confusion from overlapping criteria.

**Why this priority**: Simplifies the filter UX by making structural filters exclusive (tab-based) while keeping the name filter as a persistent cross-tab search. Replaces the previous cumulative AND-across-types model.

**Independent Test**: Can be tested by selecting features in the Features tab, switching to the Tags tab, verifying that the features selection no longer applies, then typing a name filter and verifying it narrows the tag-filtered results.

**Acceptance Scenarios**:

1. **Given** the user has selected features in the Features tab, **When** they switch to the Tags tab and select a tag, **Then** only the tag filter applies (features selection is not combined).
2. **Given** the user has an active tag filter in the Tags tab, **When** they type a name in the name search field, **Then** only scenarios matching both the tag AND the name are included (AND logic between active tab and name filter).
3. **Given** the name filter is active, **When** the user switches between filter tabs, **Then** the name filter persists and applies alongside whichever tab is active.
4. **Given** the active tab filter + name filter result in zero matches, **Then** the user sees a clear message and can adjust filters.

---

### User Story 7 - Choose Parallel or Sequential Execution (Priority: P2)

As a tester, I want to choose between running tests in parallel or sequentially so I can balance speed (parallel) with deterministic debugging (sequential).

**Why this priority**: Parallel execution significantly reduces total run time for large suites, while sequential mode is essential for debugging flaky or interdependent tests. This choice directly impacts day-to-day productivity.

**Independent Test**: Can be tested by running the same set of features first in sequential mode (verifying they run one after another) and then in parallel mode (verifying they start concurrently and total time is reduced).

**Acceptance Scenarios**:

1. **Given** the user selects sequential execution mode, **When** tests run, **Then** features execute one at a time in the order they appear.
2. **Given** the user selects parallel execution mode, **When** tests run, **Then** multiple features execute concurrently.
3. **Given** parallel execution is active, **When** one feature fails, **Then** the remaining features continue to execute (fail-fast is not the default).
4. **Given** the user has not explicitly chosen an execution mode, **Then** sequential execution is used as the default.

---

### Edge Cases

- What happens when the workspace has no feature files? The run configuration should show an empty state with guidance.
- What happens when a selected feature file is deleted from disk mid-configuration? The file should be flagged as missing and excluded from the run.
- What happens when parallel execution is chosen but only one feature matches the filters? The system should proceed normally, effectively running in sequential mode.
- What happens when a filter combination initially has results but features are modified to no longer match? The matched test count should update when the user returns to run configuration.
- What happens when the user tries to start a new run while one is already in progress? The system should prevent concurrent runs and offer to stop the current run first.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support running all tests in the workspace with a single action.
- **FR-002**: System MUST allow selecting one or more specific feature files for execution.
- **FR-003**: System MUST allow filtering features by folder, including all features within subfolders.
- **FR-004**: System MUST allow filtering scenarios by one or more Gherkin tags.
- **FR-005**: System MUST allow filtering scenarios by name using a text search (case-insensitive, partial match).
- **FR-006**: System MUST use exclusive tab-based structural filters (features, folders, or tags — only one active at a time) with OR logic within the active tab (e.g., selecting tags `@smoke` and `@auth` matches scenarios with either tag). The name filter is always available alongside the active tab and applies as AND logic with the active tab's selection.
- **FR-007**: System MUST provide a toggle between parallel and sequential execution modes.
- **FR-008**: System MUST default to sequential execution when no mode is explicitly selected.
- **FR-009**: System MUST display a live count of tests matching the current filter configuration before execution starts.
- **FR-010**: System MUST display per-feature status and results during and after a batch run, with the ability to expand each feature to see individual scenario-level results (pass/fail/skipped per scenario).
- **FR-011**: System MUST allow stopping a batch run in progress, terminating all running tests.
- **FR-012**: System MUST prevent starting a new run while one is already in progress.
- **FR-013**: System MUST disable the run action when no tests match the current filter configuration.
- **FR-014**: System MUST support both headless and UI execution modes for batch runs, consistent with existing single-feature behavior.
- **FR-017**: The run view MUST be a dedicated top-level view, fully detached from the view/edit mode, accessible via a dedicated sidebar button/icon without requiring any feature file to be loaded.
- **FR-019**: The filter UI MUST use a tab-based layout with three exclusive tabs: Features, Folders, and Tags. Only one tab's filter is active at a time. Each tab MUST remember its selection independently so switching tabs does not lose previous selections.
- **FR-020**: The Features tab MUST be the default active tab. On first entry to the run view per session, if the user was viewing a feature file, that feature MUST be auto-selected; otherwise all tests are selected. Subsequent entries MUST preserve the user's manual selection.
- **FR-021**: The Folders tab MUST display folders as a hierarchical tree. Selecting a parent folder MUST cascade checkmarks to all child folders; individual children can be unchecked to exclude specific subfolders.
- **FR-022**: The run view page MUST have a top toolbar containing: base URL input, execution mode toggle, matched test count, and run action buttons (Run Headless, Run UI, Stop). This toolbar is positioned above the filter tabs so the tab content area uses the full remaining page height.
- **FR-023**: When a test run is in progress or completed, the results panel MUST replace the filter tabs area (full remaining page height). The user can navigate back to the filter tabs to reconfigure and run again.
- **FR-018**: System MUST persist the full run configuration (selected filters, execution mode, base URL) between app sessions and restore it on next launch.
- **FR-015**: System MUST aggregate results from all executed features into a single summary view showing total passed, failed, and skipped counts.
- **FR-016**: System MUST display available tags collected from all feature files in the workspace for tag-based filtering.

### Key Entities

- **Run Configuration**: Represents the user's selected filters and execution settings for a test run. Includes selected features, folders, tags, name filter, execution mode (parallel/sequential), and run mode (headless/UI). Persisted between app sessions.
- **Run Session**: An active or completed test execution. Tracks overall status, per-feature results, duration, logs, and errors.
- **Filter**: A single filter criterion (tag, name, folder, or feature selection) that narrows the set of scenarios to execute.
- **Feature Result**: The outcome of executing a single feature file within a batch run, including status, duration, and any errors. Contains individual scenario results.
- **Scenario Result**: The outcome of a single scenario within a feature, including pass/fail/skipped status, duration, and error details if failed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can initiate a full workspace test run with no more than 2 clicks from the run configuration view.
- **SC-002**: Users can configure and apply any structural filter tab (feature, folder, or tag) with optional name search in under 30 seconds.
- **SC-003**: The matched test count updates within 1 second of changing any filter.
- **SC-004**: Parallel execution of a 10-feature suite completes in less than half the time of sequential execution (assuming independent tests).
- **SC-005**: Users can identify which specific feature or scenario failed without leaving the results view.
- **SC-006**: Stopping a running batch terminates all test processes within 3 seconds.

## Clarifications

### Session 2026-03-02

- Q: When a user selects multiple tags, should scenarios matching ANY of the selected tags be included, or only scenarios matching ALL of them? → A: OR within same filter type (match any selected tag). _(Note: cross-type AND logic was superseded in Session 2026-03-03 by exclusive tab model — only one structural filter active at a time, with name filter as AND.)_
- Q: Where should the run configuration UI live in the app? → A: Replace current run mode — the "run" view becomes the run configuration + results view, no longer feature-specific.
- Q: Should the run configuration persist between app sessions? → A: Persist all settings — filters, execution mode, and base URL are saved and restored on next app launch.
- Q: What level of detail should run results show? → A: Both levels — summary shows per-feature status, expandable to see individual scenario results within each feature.
- Q: Which items should be explicitly out of scope? → A: Exclude all — run history log, saved filter presets, CI/CD integration, and retry-failed-only are all out of scope.

### Session 2026-03-03

- Q: How should the name filter behave with the new exclusive tab model? → A: Name filter is always visible alongside the active tab and applies as AND with the active tab's selection.
- Q: How should the user navigate to the dedicated run view? → A: Dedicated sidebar button/icon, separate from the view/edit mode toggle.
- Q: When switching filter tabs, should each tab remember its selection? → A: Yes, each tab remembers its selection independently; only the active tab's filter applies.
- Q: How should parent/child folder selection work in the folder tree? → A: Selecting a parent cascades checkmarks to all children; children can be individually unchecked to exclude specific subfolders.
- Q: Should auto-select of the viewed feature override the user's previous selection on re-entry? → A: Only auto-select on first entry per session; subsequent entries preserve the user's manual selection.
- Q: What controls belong in the top toolbar alongside run buttons? → A: Base URL input, execution mode toggle, matched test count, and run action buttons (full run toolbar).
- Q: Where should results display relative to filter tabs? → A: Results replace the filter tabs area when running/completed; user clicks back to return to filters.

## Out of Scope

- **Run history log**: No persistent record of past run sessions or historical results.
- **Saved filter presets**: No ability to save, name, or recall filter configurations as reusable presets.
- **CI/CD integration**: No headless CLI mode, pipeline triggers, or external reporting hooks for continuous integration.
- **Retry failed only**: No built-in action to re-run only the scenarios that failed in the previous run.

## Assumptions

- Tags follow standard Gherkin tag format (prefixed with `@`).
- The existing Playwright and bddgen CLI tools support the filtering and parallel execution capabilities needed (Playwright natively supports `--grep` for name filtering, `--workers` for parallelism, and tag filtering via annotations).
- Folder structure follows the convention of feature files stored under a `features/` root directory.
- The UI execution mode (Playwright inspector) is available only for sequential single-feature runs, as the interactive inspector does not support parallel multi-feature execution.
- Users are expected to manage their own tagging conventions; the system does not enforce or suggest tag naming rules.
- The "Run All" action includes all feature files in the workspace, not just those currently visible or selected in the sidebar.
