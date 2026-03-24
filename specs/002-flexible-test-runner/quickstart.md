# Quickstart: Flexible Test Runner (UI Refactor)

**Feature**: 002-flexible-test-runner
**Date**: 2026-03-03

## Overview

This is a **UI refactoring** of the already-implemented flexible test runner. The backend (RunnerService, IPC channels) is complete and unchanged. This quickstart covers the frontend restructuring: dedicated run view, exclusive filter tabs, folder tree, and layout changes.

## What's Already Implemented (No Changes Needed)

- `packages/shared/src/ipc/channels.ts` — RUNNER_RUN_BATCH, RUNNER_GET_WORKSPACE_TESTS
- `packages/shared/src/ipc/api.ts` — runBatch(), getWorkspaceTests() signatures
- `apps/desktop/electron/services/RunnerService.ts` — getWorkspaceTests(), runBatch(), buildGrepPattern()
- `apps/desktop/electron/ipc/handlers.ts` — IPC handlers
- `apps/desktop/electron/preload.ts` — IPC bridge methods
- `apps/desktop/electron/__tests__/RunnerService.test.ts` — 22 backend tests

## Implementation Order

### Layer 1: Shared Type Update

1. Add `activeFilterTab: 'features' | 'folders' | 'tags'` to `RunConfiguration` in `packages/shared/src/types/runner.ts`
2. Update `DEFAULT_RUN_CONFIGURATION` in `packages/shared/src/types/settings.ts` with `activeFilterTab: 'features'`
3. Rebuild: `pnpm --filter @suisui/shared build`

### Layer 2: Runner Store Refactor

4. Update `matchedTests` getter in `apps/desktop/app/stores/runner.ts`:
   - Replace cumulative filter pipeline with exclusive tab model
   - Only apply the active tab's filter (features OR folders OR tags)
   - Name filter always applies as AND
   - Each tab's selection array stays populated but is only used when that tab is active

5. Add first-entry auto-select logic:
   - New session-scoped flag `hasEnteredRunView: boolean` (not persisted)
   - On first entry: if `scenarioStore.currentFeaturePath` exists, set `selectedFeatures` to just that path
   - On subsequent entries: preserve existing selection

6. Add `showResults` state:
   - Boolean flag tracking whether to show results or filters
   - Set to `true` when `runBatch()` starts
   - Set to `false` when user clicks "Back to Filters"

### Layer 3: Page Layout Refactor

7. Refactor `apps/desktop/app/pages/index.vue`:
   - Add `activeView: 'editor' | 'runner'` state (replaces run from mode toggle)
   - Remove 'run' from mode toggle options (keep only read/edit)
   - Add sidebar "Run" button below the feature tree
   - When `activeView === 'runner'`: hide sidebar feature tree, hide mode toggle, show RunConfigPanel/RunResultsPanel
   - When `activeView === 'editor'`: show existing read/edit behavior
   - Load workspace tests when entering runner view (existing `loadWorkspaceTests()`)

### Layer 4: RunConfigPanel Rewrite

8. Rewrite `apps/desktop/app/components/RunConfigPanel.vue`:

   **Top Toolbar** (always visible):
   - Base URL input
   - Execution mode toggle (Sequential | Parallel)
   - Matched test count display
   - Run Headless / Run UI buttons (or Stop when running)

   **Tab Bar**:
   - Three tabs: Features | Folders | Tags
   - Active tab highlighted, binds to `config.activeFilterTab`
   - Name filter input (always visible, below or beside tabs)

   **Tab Content** (fills remaining height):
   - **Features tab**: Checkbox list of feature files with select-all/deselect-all. Shows feature name + scenario count.
   - **Folders tab**: PrimeVue Tree with `selectionMode="checkbox"`. Hierarchical structure built from `WorkspaceTestInfo.folders`. Parent cascade + child uncheck support.
   - **Tags tab**: Tag toggle buttons (pill style, like current implementation).

9. Empty state and edge cases:
   - No tests match: informational message in tab content area
   - No feature files in workspace: guidance message
   - Loading state: spinner while workspace tests are being fetched

### Layer 5: RunResultsPanel Update

10. Update `apps/desktop/app/components/RunResultsPanel.vue`:
    - Add "Back to Filters" button that sets `showResults = false`
    - Keep existing results display (summary bar, expandable features, scenario details, logs)
    - Results use full remaining height below toolbar

### Layer 6: Persistence & Polish

11. Persist `activeFilterTab` as part of RunConfiguration (existing persistence mechanism handles this automatically since it persists the full config object)

12. Ensure debounced config persistence captures tab changes

## Key Technical Decisions

- **Exclusive tab model**: Only one structural filter active at a time. Simplifies UX and filter pipeline.
- **PrimeVue Tree for folders**: Built-in checkbox cascade, partial selection, keyboard nav.
- **Session-scoped auto-select**: First entry auto-selects viewed feature; subsequent entries preserve manual selection.
- **Results replace tabs**: Maximizes vertical space for results. "Back to Filters" button to return.
- **No new IPC channels**: All backend is reused as-is. Only `RunConfiguration` type gets a new field.

## Testing Strategy

- **Runner store `matchedTests`**: Unit test the exclusive tab filter logic — given active tab + selection + name filter, assert correct matched features/scenarios.
- **Folder tree builder**: Unit test the function that converts flat folder paths to hierarchical tree nodes.
- **Auto-select logic**: Unit test first-entry vs subsequent-entry behavior.
- **Components**: Visual verification via dev mode. E2E tests for tab switching, filter application, and run initiation.
