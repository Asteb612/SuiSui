# Research: Flexible Test Runner

**Feature**: 002-flexible-test-runner
**Date**: 2026-03-02

## Decision 1: Execution Strategy for Batch Runs

**Decision**: Use a single bddgen + playwright invocation per batch run, leveraging Playwright's native filtering capabilities.

**Rationale**: The current implementation runs bddgen then playwright per feature. For batch execution, we can run bddgen once (generating all features) and then run a single `npx playwright test` with filters. This avoids orchestrating multiple processes and lets Playwright handle parallelism natively via `--workers`.

**Alternatives considered**:

- _Multiple sequential RunnerService.run() calls_: Simpler conceptually but loses native Playwright parallelism, requires manual orchestration, and produces separate reports instead of one aggregated report.
- _Multiple bddgen + playwright pairs in parallel_: Complex process management, multiple reports to merge, harder to stop cleanly.

## Decision 2: Tag Filtering Mechanism

**Decision**: Use Playwright's `--grep` for tag filtering at runtime, not bddgen's `--tags` for generation-time filtering.

**Rationale**: Since Playwright 1.42, playwright-bdd maps Gherkin tags to native Playwright tags, which are included in the `--grep` match string. Using `--grep "@smoke"` at runtime means we generate all specs once and filter at execution time. This is faster for repeated runs with different tag filters (no re-generation needed) and aligns with the name filter mechanism (also `--grep`).

**Alternatives considered**:

- _bddgen `--tags` flag_: Filters at generation time (only matching scenarios get spec files). Pros: fewer spec files generated. Cons: requires re-running bddgen every time tag filter changes, uses Cucumber tag expression syntax (different from --grep regex), adds latency to filter changes.

## Decision 3: Feature/Folder Filtering Mechanism

**Decision**: Pass generated spec file paths as positional arguments to `npx playwright test`. Convert feature paths to their `.features-gen/` equivalents.

**Rationale**: Playwright accepts multiple file path patterns as positional arguments (treated as regex against file paths). The existing code already maps `features/auth/login.feature` → `.features-gen/features/auth/login.feature.spec.js`. For folder filtering, we pass the folder path which Playwright regex-matches against all generated specs in that directory.

**Alternatives considered**:

- _Modify playwright.config.ts testMatch_: Requires dynamic config modification, fragile.
- _Use FEATURE env var with multiple values_: The FEATURE env var is a workspace convention, not a standard — may not support multiple values.

## Decision 4: Combining Filters

**Decision**: Combine file path args (feature/folder) with `--grep` (tags + name). Playwright applies both: first file path matching narrows the spec files, then `--grep` narrows within those files.

**Rationale**: This maps naturally to the spec's AND-across-filter-types requirement. File/folder selection narrows the file set, tag/name grep narrows the scenario set. Within tags, OR logic is achieved via regex alternation (`@smoke|@auth`). Within name search, it's a single regex pattern.

**Alternatives considered**:

- _Client-side pre-filtering then passing exact scenario list_: Over-engineered, duplicates Playwright's work, fragile if scenario names change.

## Decision 5: Parallel vs Sequential Execution

**Decision**: Use Playwright's `--workers` flag. Sequential = `--workers=1`. Parallel = default (50% CPU cores) or unset.

**Rationale**: Playwright handles worker management, process isolation, and failure handling natively. No need to build custom orchestration. The `--workers=1` flag ensures deterministic sequential execution for debugging.

**Alternatives considered**:

- _Custom parallel orchestration (multiple playwright processes)_: Unnecessary complexity, loses unified reporting, harder to stop.

## Decision 6: Results Parsing for Feature/Scenario Granularity

**Decision**: Parse Playwright's JSON reporter output for per-feature and per-scenario results. Add `--reporter=json` to the playwright command alongside the default reporter.

**Rationale**: Playwright's JSON reporter produces structured output with test results organized by file and test name. Since playwright-bdd maps features to describe blocks and scenarios to test names, we can reconstruct the feature→scenario hierarchy from the JSON output. This gives us pass/fail/skipped per scenario without custom parsing.

**Alternatives considered**:

- _Parse stdout/stderr text output_: Fragile, format can change between versions, difficult to extract structured data.
- _Use Playwright HTML report and parse it_: Over-complex, HTML is for humans not machines.
- _Custom Playwright reporter plugin_: Over-engineered for current needs; JSON reporter already provides what we need.

## Decision 7: Run Configuration Persistence

**Decision**: Extend the existing `AppSettings` type in `packages/shared/src/types/settings.ts` with a `runConfiguration` field. Persist via the existing SettingsService.

**Rationale**: The SettingsService already handles JSON file persistence at `~/.config/SuiSui/settings.json` with typed IPC channels (`SETTINGS_GET`, `SETTINGS_SET`). Adding a nested `runConfiguration` object follows the established pattern and requires no new infrastructure.

**Alternatives considered**:

- _Separate config file_: Unnecessary file proliferation, different persistence pattern.
- _localStorage in renderer_: Violates process isolation principle; settings belong in main process.
- _New SettingsService for runner_: Violates YAGNI; existing service handles this.

## Decision 8: Tag Collection from Workspace

**Decision**: Collect tags by scanning all parsed feature/scenario data already loaded by the workspace store. No new IPC channel needed for initial implementation — compute tags client-side from existing data.

**Rationale**: The workspace store already loads all feature files and the scenario store parses Gherkin including tags. A computed property can aggregate all unique tags across features. This avoids a new IPC round-trip and keeps the logic simple. If performance becomes an issue with large workspaces, a backend service can be added later.

**Alternatives considered**:

- _New IPC channel `runner:getTags`_: Adds IPC complexity for data already available in the renderer. Violates YAGNI.
- _Backend tag scanning service_: Over-engineered when features are already parsed client-side.

**Update**: After further analysis, the workspace store only loads feature metadata (path, name) but does NOT parse Gherkin for all features upfront — it only parses the currently selected feature. Therefore, we DO need a backend service to scan all feature files and extract tags/scenario names. A new IPC channel `RUNNER_GET_WORKSPACE_TESTS` will collect all features with their scenarios and tags in one call, which the run configuration view needs to compute filters and display the matched test count.

---

## UI Refactor Decisions (2026-03-03)

The following decisions were added during the UI refactoring phase, based on clarifications about dedicated run view, exclusive filter tabs, and layout changes.

## Decision 9: Exclusive Filter Tabs (replacing cumulative AND)

**Decision**: Replace the cumulative AND filter model (folders AND features AND tags AND name) with exclusive tab-based structural filters. Only the active tab's filter applies, combined AND with the persistent name search.

**Rationale**: The user found cumulative filters confusing — applying folder + feature + tag simultaneously was hard to reason about. Exclusive tabs (Features | Folders | Tags) provide a simpler mental model: pick one structural filter approach, optionally narrow by name. Each tab remembers its selection independently so switching tabs doesn't lose work.

**Alternatives considered**:

- _Keep cumulative AND model_: Rejected by user as too complex for the UX. Power users rarely need cross-type filtering.
- _Reset selections when switching tabs_: Rejected — losing selections causes frustration.

**Impact on backend**: None. The `runBatch()` still receives the same `BatchRunOptions`. The frontend computes which filter to send based on the active tab.

## Decision 10: Dedicated Run View via Sidebar Button

**Decision**: Make the run view a top-level view accessible via a dedicated sidebar button, fully detached from the view/edit mode toggle.

**Rationale**: The run view operates at workspace scope (all features), while view/edit mode operates at feature-file scope. Coupling them forced users to load a feature file before accessing run mode. A dedicated sidebar entry makes the run view a first-class navigation destination.

**Alternatives considered**:

- _Keep run as third mode in mode toggle, but always available_: Still ties run to the mode concept; confusing when run doesn't operate on the selected feature.
- _Separate Nuxt page (/run)_: Over-engineered for a single-page Electron app. The existing index.vue pattern of conditional rendering is simpler.

## Decision 11: Folder Tree Component

**Decision**: Use PrimeVue's `Tree` component with `selectionMode="checkbox"` for the hierarchical folder tree with cascading selection.

**Rationale**: PrimeVue Tree handles checkbox cascade (parent → children), partial selection state, expand/collapse, and keyboard navigation out of the box. Building a custom tree would violate YAGNI.

**Alternatives considered**:

- _Custom recursive component_: Significant effort to implement cascade checkboxes, partial state, keyboard nav. PrimeVue provides this for free.
- _Flat folder list (current implementation)_: Doesn't show hierarchy, can't select parent to include all children.

## Decision 12: Results Replace Tab Area

**Decision**: When tests are running or results are available, the results panel replaces the filter tabs area (below the toolbar). User navigates "Back to Filters" to reconfigure.

**Rationale**: Maximizes vertical space for results. The toolbar (with matched count and run buttons) stays visible, providing context. Users don't need to see filter configuration while reviewing results.

**Alternatives considered**:

- _Results below tabs (both visible)_: Wastes space — tabs not useful during a run.
- _Side-by-side split_: Too cramped on smaller screens.

## Decision 13: First-Entry Auto-Select

**Decision**: On first entry to the run view per app session, auto-select the currently viewed feature file (if any). On subsequent entries, preserve the user's manual selection.

**Rationale**: Provides a smooth transition from "I'm looking at this feature" to "I want to run this feature." But after the user customizes their selection, we respect their choices. A session-scoped flag (`hasEnteredRunView`) tracks first vs subsequent entries.

**Alternatives considered**:

- _Always auto-select_: Frustrating — overrides deliberate user configuration.
- _Never auto-select_: Misses the convenience of "run what I'm looking at."
- _Auto-select from persisted config_: Persisted config may be stale if features were deleted.
