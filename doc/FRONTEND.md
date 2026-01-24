# SuiSui Frontend Documentation

## Overview

The frontend is a Nuxt 4 (Vue 3) single-page application running in Electron's renderer process. Located in `apps/desktop/app/`.

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Nuxt | 3.15.0 | Framework (SSR disabled) |
| Vue | 3.5.0 | Reactive UI framework |
| Pinia | Latest | State management |
| PrimeVue | 4.2.0 | UI component library |
| PrimeFlex | Latest | CSS utility framework |
| PrimeIcons | Latest | Icon library |

## Directory Structure

```
apps/desktop/app/
├── components/          # Vue SFC components
│   ├── ScenarioBuilder.vue
│   ├── StepSelector.vue
│   ├── ValidationPanel.vue
│   ├── FeatureList.vue
│   └── GitPanel.vue
├── pages/               # Nuxt pages
│   └── index.vue        # Main application page
├── stores/              # Pinia stores
│   ├── workspace.ts
│   ├── steps.ts
│   ├── scenario.ts
│   ├── runner.ts
│   └── git.ts
├── composables/         # Vue composables
│   └── useApi.ts
├── layouts/             # Layout components
│   └── default.vue
├── assets/              # Static assets
│   └── css/
├── types/               # TypeScript definitions
└── app.vue              # Root component
```

## Application Layout

The main page (`pages/index.vue`) uses a three-column layout:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Header                                   │
│                    (Workspace Selector)                          │
├───────────────┬───────────────────────────┬─────────────────────┤
│               │                           │                      │
│  Feature      │   Scenario Builder        │   Tools Panel        │
│  List         │                           │                      │
│               │   - Scenario Name         │   - Step Selector    │
│  - Features   │   - Step Rows             │   - Validation       │
│  - Selection  │   - Given/When/Then       │   - Runner Controls  │
│               │   - Arguments             │   - Git Panel        │
│               │   - Reorder/Delete        │                      │
│               │                           │                      │
├───────────────┴───────────────────────────┴─────────────────────┤
│                        Status Bar                                │
│                     (Workspace Path)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components Reference

### ScenarioBuilder.vue

**Purpose:** Main scenario editing interface.

**Features:**
- Scenario name input field
- Step rows with keyword display (Given/When/Then/And/But)
- Argument input fields for each step
- Step reordering (move up/down buttons)
- Step deletion
- Inline validation issue display
- Error highlighting on invalid steps

**Props:** None (uses stores directly)

**Events:** None (updates stores directly)

**Store Dependencies:**
- `useScenarioStore` - scenario data and mutations
- `useStepsStore` - step definitions for pattern matching

---

### StepSelector.vue

**Purpose:** Displays available steps for adding to scenario.

**Features:**
- Categorized step display (Given/When/Then)
- Steps from bddgen export (includes generic steps from workspace)
- Clickable step items
- Search/filter functionality

**Store Dependencies:**
- `useStepsStore` - step definitions
- `useScenarioStore` - for adding steps

**Usage:**
```vue
<StepSelector />
<!-- Steps are displayed categorized by keyword -->
<!-- Clicking adds step to scenario -->
```

---

### ValidationPanel.vue

**Purpose:** Shows validation results and test runner controls.

**Features:**
- Validation status (success/errors/warnings)
- Issue list with severity indicators
- Test runner status display (idle/running/passed/failed/error)
- Test duration display
- Run buttons (Headless / UI mode)
- Stop button for running tests
- Clear logs button

**Status Colors:**
| Status | Color |
|--------|-------|
| idle | Gray |
| running | Blue |
| passed | Green |
| failed | Red |
| error | Red |

**Store Dependencies:**
- `useScenarioStore` - validation results
- `useRunnerStore` - runner status and controls

---

### FeatureList.vue

**Purpose:** Lists and manages feature files in workspace.

**Features:**
- Hierarchical feature file display
- Selected feature highlighting
- Click to load feature into builder
- File path display

**Store Dependencies:**
- `useWorkspaceStore` - feature file list
- `useScenarioStore` - for loading selected feature

---

### GitPanel.vue

**Purpose:** Git operations interface.

**Features:**
- Current branch display
- Modified/untracked file counts
- Status indicators (color-coded)
- Pull button
- Commit message input
- Commit & Push button
- Loading states for operations

**Store Dependencies:**
- `useGitStore` - git status and operations

---

## Pinia Stores Reference

### useWorkspaceStore

**Location:** `stores/workspace.ts`

**State:**
```typescript
{
  workspace: WorkspaceInfo | null;
  features: FeatureFile[];
  selectedFeature: FeatureFile | null;
  isLoading: boolean;
  error: string | null;
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `loadWorkspace()` | Fetch current workspace from IPC |
| `selectWorkspace()` | Open dialog, validate, persist |
| `loadFeatures()` | Fetch feature list from workspace |
| `selectFeature(feature)` | Set selected feature |
| `clearWorkspace()` | Reset all state |

**Getters:**
| Getter | Type | Description |
|--------|------|-------------|
| `hasWorkspace` | boolean | Whether workspace is set |
| `featureCount` | number | Number of feature files |

---

### useStepsStore

**Location:** `stores/steps.ts`

**State:**
```typescript
{
  steps: StepDefinition[];
  decorators: DecoratorDefinition[];
  exportedAt: number | null;
  isLoading: boolean;
  error: string | null;
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `exportSteps()` | Export steps from bddgen via IPC |
| `loadCached()` | Load steps from cache |
| `clearSteps()` | Reset state |

**Getters:**
| Getter | Type | Description |
|--------|------|-------------|
| `givenSteps` | StepDefinition[] | Filter by Given keyword |
| `whenSteps` | StepDefinition[] | Filter by When keyword |
| `thenSteps` | StepDefinition[] | Filter by Then keyword |
| `allSteps` | StepDefinition[] | All steps from workspace |
| `stepsByKeyword` | (kw) => StepDefinition[] | Filter function |

---

### useScenarioStore

**Location:** `stores/scenario.ts`

**State:**
```typescript
{
  scenario: Scenario;           // { name, steps[] }
  validation: ValidationResult | null;
  isDirty: boolean;
  currentFeaturePath: string | null;
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `setName(name)` | Update scenario name |
| `addStep(keyword, pattern, args)` | Add step with auto-generated ID |
| `updateStep(stepId, updates)` | Modify step properties |
| `updateStepArg(stepId, argName, value)` | Update single argument |
| `removeStep(stepId)` | Delete step |
| `moveStep(fromIndex, toIndex)` | Reorder steps |
| `validate()` | Call IPC validation |
| `save(featurePath)` | Convert to Gherkin and write |
| `loadFromFeature(featurePath)` | Parse Gherkin and populate |
| `toGherkin()` | Convert scenario to Gherkin syntax |
| `parseGherkin(content)` | Parse Gherkin content |
| `clear()` | Reset all state |

**Getters:**
| Getter | Type | Description |
|--------|------|-------------|
| `hasSteps` | boolean | Whether scenario has steps |
| `isValid` | boolean | Validation passed |
| `errors` | ValidationIssue[] | Error-level issues |
| `warnings` | ValidationIssue[] | Warning-level issues |

**Gherkin Conversion:**
The store handles bidirectional conversion between the internal `Scenario` object and Gherkin text format:
- `toGherkin()` - Serialize scenario to `.feature` file content
- `parseGherkin()` - Parse `.feature` content into scenario object

---

### useRunnerStore

**Location:** `stores/runner.ts`

**State:**
```typescript
{
  status: RunStatus;      // 'idle' | 'running' | 'passed' | 'failed' | 'error'
  lastResult: RunResult | null;
  logs: string[];
  isRunning: boolean;
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `runHeadless(featurePath?, scenarioName?)` | Execute headless tests |
| `runUI(featurePath?, scenarioName?)` | Open Playwright UI |
| `stop()` | Stop running test |
| `clearLogs()` | Reset state |

---

### useGitStore

**Location:** `stores/git.ts`

**State:**
```typescript
{
  status: GitStatusResult | null;
  isLoading: boolean;
  isPulling: boolean;
  isPushing: boolean;
  error: string | null;
  lastMessage: string | null;
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `refreshStatus()` | Fetch git status |
| `pull()` | Execute git pull |
| `commitPush(message)` | Stage, commit, push |

**Getters:**
| Getter | Type | Description |
|--------|------|-------------|
| `hasChanges` | boolean | Dirty or untracked files |
| `branchName` | string | Current branch name |

---

## Composables

### useApi

**Location:** `composables/useApi.ts`

**Purpose:** Type-safe access to Electron API from renderer.

**Usage:**
```typescript
// Strict - throws if API unavailable
const api = useApi();
const workspace = await api.workspace.get();

// Safe - returns null if unavailable
const api = useApiSafe();
if (api) {
  const workspace = await api.workspace.get();
}
```

**Implementation:**
```typescript
export function useApi(): ElectronAPI {
  if (!window.api) {
    throw new Error('Electron API not available');
  }
  return window.api;
}

export function useApiSafe(): ElectronAPI | null {
  return window.api ?? null;
}
```

---

## Nuxt Configuration

Key settings in `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  ssr: false,                    // Client-only (required for Electron)
  compatibilityDate: '2024-01-01',
  devtools: { enabled: true },

  modules: [
    '@primevue/nuxt-module',     // UI components
    '@pinia/nuxt'                // State management
  ],

  typescript: {
    strict: true,
    typeCheck: true
  },

  primevue: {
    // PrimeVue configuration
  }
});
```

---

## Adding New Components

1. Create component in `app/components/`
2. Use PrimeVue components for UI consistency
3. Access stores via `useXxxStore()` composables
4. Access Electron API via `useApi()` composable
5. Follow naming convention: `PascalCase.vue`

## Adding New Stores

1. Create store in `app/stores/`
2. Define state, getters, and actions
3. Add types in `@suisui/shared` if needed
4. Use `useApi()` for IPC calls
5. Follow naming convention: `use{Name}Store`

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall architecture
- [IPC_TYPES.md](./IPC_TYPES.md) - IPC channels and types
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development workflow
