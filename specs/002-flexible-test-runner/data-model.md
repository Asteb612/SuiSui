# Data Model: Flexible Test Runner

**Feature**: 002-flexible-test-runner
**Date**: 2026-03-02

## Entities

### RunConfiguration (persisted in AppSettings)

Represents the user's saved filter and execution settings.

| Field            | Type                                | Description                                                           |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------- |
| activeFilterTab  | `'features' \| 'folders' \| 'tags'` | Which structural filter tab is active (defaults to `'features'`)      |
| selectedFeatures | `string[]`                          | Relative paths of explicitly selected feature files (empty = all)     |
| selectedFolders  | `string[]`                          | Relative folder paths to include (empty = all)                        |
| selectedTags     | `string[]`                          | Gherkin tags to filter by, without `@` prefix (empty = no tag filter) |
| nameFilter       | `string`                            | Partial scenario name search string (empty = no name filter)          |
| executionMode    | `'sequential' \| 'parallel'`        | How to run tests; defaults to `'sequential'`                          |
| baseUrl          | `string`                            | Base URL for test execution (migrated from existing `baseUrl` field)  |

**Persistence**: Stored as `runConfiguration` field in `AppSettings` via SettingsService.

**Validation rules**:

- `activeFilterTab` defaults to `'features'` if not set
- `selectedFeatures` paths must be valid relative paths under the workspace `features/` directory
- `selectedTags` entries must be non-empty strings (no `@` prefix, stored without it)
- `executionMode` defaults to `'sequential'` if not set
- Each tab's selection (selectedFeatures, selectedFolders, selectedTags) is remembered independently; only the active tab's selection is used for filtering

### WorkspaceTestInfo

A snapshot of all testable content in the workspace, collected by the backend. Used by the frontend to compute filter matches and display available options.

| Field    | Type                | Description                                                      |
| -------- | ------------------- | ---------------------------------------------------------------- |
| features | `FeatureTestInfo[]` | All feature files with their scenarios and tags                  |
| allTags  | `string[]`          | Deduplicated, sorted list of all tags found across the workspace |
| folders  | `string[]`          | Unique folder paths containing feature files                     |

### FeatureTestInfo

Summary of a single feature file's testable content.

| Field        | Type                 | Description                                                             |
| ------------ | -------------------- | ----------------------------------------------------------------------- |
| relativePath | `string`             | Relative path from workspace root (e.g., `features/auth/login.feature`) |
| name         | `string`             | Feature name from Gherkin                                               |
| tags         | `string[]`           | Feature-level tags (without `@` prefix)                                 |
| folder       | `string`             | Parent folder relative path (e.g., `features/auth`)                     |
| scenarios    | `ScenarioTestInfo[]` | Scenarios in this feature                                               |

### ScenarioTestInfo

Summary of a single scenario's testable metadata.

| Field | Type       | Description                                                          |
| ----- | ---------- | -------------------------------------------------------------------- |
| name  | `string`   | Scenario name                                                        |
| tags  | `string[]` | Scenario-level tags plus inherited feature tags (without `@` prefix) |

### BatchRunResult (extends existing RunResult concept)

Result of a batch test execution.

| Field          | Type                  | Description                                                                    |
| -------------- | --------------------- | ------------------------------------------------------------------------------ |
| status         | `RunStatus`           | Overall batch status: `'idle' \| 'running' \| 'passed' \| 'failed' \| 'error'` |
| featureResults | `FeatureRunResult[]`  | Per-feature breakdown                                                          |
| summary        | `RunSummary`          | Aggregate counts                                                               |
| duration       | `number`              | Total execution time in ms                                                     |
| stdout         | `string`              | Raw stdout from Playwright                                                     |
| stderr         | `string`              | Raw stderr from Playwright                                                     |
| reportPath     | `string \| undefined` | Path to HTML report if generated                                               |
| errors         | `RunError[]`          | Parsed errors (bddgen or playwright)                                           |

### FeatureRunResult

Result of executing a single feature within a batch.

| Field           | Type                                | Description                |
| --------------- | ----------------------------------- | -------------------------- |
| relativePath    | `string`                            | Feature file relative path |
| name            | `string`                            | Feature name               |
| status          | `'passed' \| 'failed' \| 'skipped'` | Feature-level status       |
| duration        | `number`                            | Execution time in ms       |
| scenarioResults | `ScenarioRunResult[]`               | Per-scenario breakdown     |

### ScenarioRunResult

Result of a single scenario execution.

| Field    | Type                                | Description             |
| -------- | ----------------------------------- | ----------------------- |
| name     | `string`                            | Scenario name           |
| status   | `'passed' \| 'failed' \| 'skipped'` | Scenario outcome        |
| duration | `number`                            | Execution time in ms    |
| error    | `string \| undefined`               | Error message if failed |

### RunSummary

Aggregated counts for display.

| Field    | Type     | Description                  |
| -------- | -------- | ---------------------------- |
| total    | `number` | Total scenarios executed     |
| passed   | `number` | Scenarios that passed        |
| failed   | `number` | Scenarios that failed        |
| skipped  | `number` | Scenarios that were skipped  |
| features | `number` | Total feature files executed |

## State Transitions

### Run Session Lifecycle

```
idle → running → passed | failed | error
                    ↓
                  idle (after user clears or starts new run)

User triggers stop:
running → idle (partial results preserved until cleared)
```

### Filter Application (computed, not persisted as state)

```
RunConfiguration + WorkspaceTestInfo → matchedFeatures[] + matchedScenarioCount

Filter pipeline (exclusive tab model):
1. Start with all features from WorkspaceTestInfo
2. Apply ONLY the active tab's filter:
   - If activeFilterTab === 'features' AND selectedFeatures non-empty:
     Keep features whose path matches any selected feature (OR)
   - If activeFilterTab === 'folders' AND selectedFolders non-empty:
     Keep features whose folder matches any selected folder (OR, including subfolders)
   - If activeFilterTab === 'tags' AND selectedTags non-empty:
     Keep scenarios whose tags include any selected tag (OR within tags)
3. If nameFilter non-empty: keep scenarios whose name contains the filter (case-insensitive)
   (AND with active tab filter — name filter always applies)
4. Only ONE structural filter (step 2) is active at a time; other tabs' selections are remembered but not applied
```

## Relationship to Existing Types

| Existing Type | Change                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `RunOptions`  | Extended with batch fields: `featurePaths?: string[]`, `tags?: string[]`, `nameFilter?: string`, `executionMode?: 'sequential' \| 'parallel'` |
| `RunResult`   | Retained for backward compat in single-run scenarios; `BatchRunResult` used for batch runs                                                    |
| `AppSettings` | New field: `runConfiguration: RunConfiguration`                                                                                               |
| `RunStatus`   | No change — reused as-is                                                                                                                      |
| `RunError`    | No change — reused as-is                                                                                                                      |
