# Implementation Plan: Flexible Test Runner (UI Refactor)

**Branch**: `002-flexible-test-runner` | **Date**: 2026-03-03 | **Spec**: `specs/002-flexible-test-runner/spec.md`
**Input**: Feature specification from `/specs/002-flexible-test-runner/spec.md` (updated 2026-03-03)

**Note**: This is a **refactoring plan** for an already-implemented feature. The backend services and IPC channels are complete. This plan covers frontend UI restructuring based on clarifications from Session 2026-03-03.

## Summary

Refactor the flexible test runner's frontend to:

1. Make the run view a **dedicated top-level view** accessible via a sidebar button, fully detached from view/edit mode
2. Replace cumulative AND filters with **exclusive tab-based filters** (Features/Folders/Tags — one active at a time) plus a persistent name search
3. Add a **hierarchical folder tree** with cascading checkbox selection
4. Move run actions to a **top toolbar** so tab content uses full remaining height
5. Make results **replace the tab area** when running/completed

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x
**Storage**: JSON file via SettingsService (`~/.config/SuiSui/settings.json`), in-memory Pinia state
**Testing**: Vitest 2.x with FakeCommandRunner
**Target Platform**: Desktop (Electron)
**Project Type**: Desktop application (Electron + Nuxt)
**Performance Goals**: Filter updates < 1s, run initiation < 2 clicks
**Constraints**: No Node.js modules in renderer, all IPC typed via shared package
**Scale/Scope**: Workspaces with up to ~100 feature files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle               | Status | Notes                                                                                                              |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| I. Process Isolation    | PASS   | No changes to process boundary. All new code is renderer-side Vue components.                                      |
| II. Typed IPC Contracts | PASS   | No new IPC channels. Only shared type `RunConfiguration` gets a new field (`activeFilterTab`).                     |
| III. Test Isolation     | PASS   | Backend untouched. No new CLI calls.                                                                               |
| IV. Service Pattern     | PASS   | No backend service changes.                                                                                        |
| V. Shared Package SSoT  | PASS   | `RunConfiguration` type updated in shared package.                                                                 |
| VI. Simplicity (YAGNI)  | PASS   | PrimeVue Tree component handles folder tree natively. Exclusive tabs simplify filter logic (removes AND pipeline). |

## What Changes vs What Stays

### Unchanged (backend — already implemented)

- `apps/desktop/electron/services/RunnerService.ts` — `getWorkspaceTests()`, `runBatch()`, `buildGrepPattern()`
- `apps/desktop/electron/ipc/handlers.ts` — IPC handlers for batch run and workspace tests
- `apps/desktop/electron/preload.ts` — IPC bridge methods
- `apps/desktop/electron/__tests__/RunnerService.test.ts` — 22 backend tests
- `packages/shared/src/ipc/channels.ts` — IPC channel constants
- `packages/shared/src/ipc/api.ts` — API signatures

### Modified (shared types)

- `packages/shared/src/types/runner.ts` — Add `activeFilterTab` to `RunConfiguration`
- `packages/shared/src/types/settings.ts` — Update `DEFAULT_RUN_CONFIGURATION`

### Major Refactor (frontend)

- `apps/desktop/app/pages/index.vue` — Extract run view from mode toggle, add sidebar run button, new top-level view switching
- `apps/desktop/app/components/RunConfigPanel.vue` — Complete rewrite: top toolbar + exclusive tab layout + folder tree
- `apps/desktop/app/components/RunResultsPanel.vue` — Minor: add "Back to Filters" navigation
- `apps/desktop/app/stores/runner.ts` — Rewrite `matchedTests` for exclusive tab model, add `activeFilterTab`, first-entry auto-select logic

## Project Structure

### Documentation (this feature)

```text
specs/002-flexible-test-runner/
├── plan.md              # This file (refactored plan)
├── research.md          # Phase 0 output (updated)
├── data-model.md        # Phase 1 output (updated)
├── quickstart.md        # Phase 1 output (updated)
├── contracts/           # Phase 1 output (unchanged)
│   └── ipc-contracts.md
└── tasks.md             # Phase 2 output (to be regenerated)
```

### Source Code (affected files)

```text
packages/shared/src/
├── types/
│   ├── runner.ts          # Add activeFilterTab to RunConfiguration
│   └── settings.ts        # Update DEFAULT_RUN_CONFIGURATION
└── ipc/                   # No changes

apps/desktop/
├── app/
│   ├── pages/
│   │   └── index.vue      # Refactor: dedicated run view, sidebar button
│   ├── components/
│   │   ├── RunConfigPanel.vue   # Rewrite: toolbar + exclusive tabs + folder tree
│   │   └── RunResultsPanel.vue  # Minor: back-to-filters button
│   └── stores/
│       └── runner.ts      # Refactor: exclusive tab filter, auto-select
└── electron/              # No changes
```

**Structure Decision**: Existing monorepo structure preserved. No new files — only modifications to existing components. The run view is implemented as a view state within `index.vue` (not a separate Nuxt page) to maintain the single-page Electron app pattern.

## Architecture: Run View Layout

```
┌──────────────────────────────────────────────────────────┐
│ Header: SuiSui BDD Test Builder          [Help] [Change] │
├──────────┬───────────────────────────────────────────────┤
│          │ TOP TOOLBAR                                    │
│ Sidebar  │ [Base URL: ____] [Sequential|Parallel]        │
│          │ 12 scenarios / 4 features  [Headless] [UI]    │
│ [Features│─────────────────────────────────────────────── │
│  Tree]   │ [Features] [Folders] [Tags]   [Name: ____]   │
│          │─────────────────────────────────────────────── │
│          │                                                │
│ ──────── │  Tab Content (full remaining height)           │
│ [▶ Run]  │  ☑ login.feature (3 scenarios)                │
│          │  ☑ checkout.feature (2 scenarios)              │
│          │  ☐ admin.feature (4 scenarios)                 │
│          │                                                │
├──────────┴───────────────────────────────────────────────┤
│ Status: /path/to/workspace                               │
└──────────────────────────────────────────────────────────┘
```

When running/results:

```
┌──────────────────────────────────────────────────────────┐
│ TOP TOOLBAR                                              │
│ [Base URL: ____] [Sequential|Parallel]  [■ Stop]         │
│──────────────────────────────────────────────────────────│
│ ✓ 10 passed  ✗ 2 failed  - 1 skipped    3.2s           │
│──────────────────────────────────────────────────────────│
│ ▸ ✓ login.feature      3 passed · 1.2s                  │
│ ▾ ✗ checkout.feature   1 passed, 1 failed · 2.0s        │
│   ✓ Add to cart         0.8s                             │
│   ✗ Complete checkout   1.2s                             │
│     Error: Element not found...                          │
│                                                          │
│ [← Back to Filters]              [Show Logs] [Clear]     │
└──────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Exclusive Filter Tabs (not cumulative)

**Current**: `matchedTests` applies ALL filters: folders AND features AND tags AND name.
**New**: Only the **active tab's** filter applies + name filter (AND). Each tab remembers its selection independently.

```typescript
// New RunConfiguration shape
interface RunConfiguration {
  activeFilterTab: 'features' | 'folders' | 'tags' // NEW
  selectedFeatures: string[] // remembered when switching away
  selectedFolders: string[] // remembered when switching away
  selectedTags: string[] // remembered when switching away
  nameFilter: string // always active (AND with tab)
  executionMode: 'sequential' | 'parallel'
  baseUrl: string
}
```

### 2. Sidebar Run Button

Add a dedicated run button in the sidebar (below the feature tree area). Clicking it switches `index.vue` from editor view to run view. The view/edit mode toggle is only visible in editor view; it's hidden in run view.

### 3. Folder Tree with Cascade Selection

Use PrimeVue's `Tree` component with `selectionMode="checkbox"`. The folder hierarchy is derived from `WorkspaceTestInfo.folders` by splitting paths and building a tree structure. Parent selection cascades to children; unchecking a child updates parent to partial state.

### 4. First-Entry Auto-Select

A session-scoped flag (`hasEnteredRunView`) in the runner store tracks whether the user has entered the run view. On first entry:

- If a feature file is currently being viewed (`scenarioStore.currentFeaturePath`), auto-select just that feature
- Otherwise, leave `selectedFeatures` empty (= all selected)

On subsequent entries, the flag is already set, so the stored selection is preserved.

### 5. Results Replace Tab Content

A `showResults` state in the store (or local to the run view). When `isRunning` or `batchResult` is non-null, the results panel replaces the filter tabs. A "Back to Filters" button resets this to show filters again (keeps the result available but not visible).

## Post-Design Constitution Re-Check

| Principle               | Status | Notes                                                                                  |
| ----------------------- | ------ | -------------------------------------------------------------------------------------- |
| I. Process Isolation    | PASS   | All changes are renderer-side Vue/Pinia code.                                          |
| II. Typed IPC Contracts | PASS   | `RunConfiguration` type change requires shared package rebuild.                        |
| III. Test Isolation     | PASS   | No backend changes.                                                                    |
| IV. Service Pattern     | PASS   | No backend changes.                                                                    |
| V. Shared Package SSoT  | PASS   | `activeFilterTab` added to shared `RunConfiguration` type.                             |
| VI. Simplicity (YAGNI)  | PASS   | PrimeVue Tree avoids custom tree implementation. Exclusive tabs simplify filter logic. |
