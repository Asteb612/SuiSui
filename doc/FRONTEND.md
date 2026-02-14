# SuiSui Frontend Documentation

## Overview

The frontend is a Nuxt 4 (Vue 3) single-page application running in Electron's renderer process. Located in `apps/desktop/app/`.

## Technology Stack

| Technology | Version | Purpose                  |
| ---------- | ------- | ------------------------ |
| Nuxt       | 3.15.0  | Framework (SSR disabled) |
| Vue        | 3.5.0   | Reactive UI framework    |
| Pinia      | Latest  | State management         |
| PrimeVue   | 4.2.0   | UI component library     |
| PrimeFlex  | Latest  | CSS utility framework    |
| PrimeIcons | Latest  | Icon library             |

## Directory Structure

```
apps/desktop/app/
├── components/              # Vue SFC components
│   ├── BackgroundSection.vue    # Background steps editor
│   ├── ExamplesEditor.vue       # Scenario Outline examples
│   ├── FeatureList.vue          # Simple feature list
│   ├── FeatureTree.vue          # Tree-based feature browser
│   ├── GitPanel.vue             # Git operations panel
│   ├── GithubConnect.vue        # GitHub auth & clone dialog
│   ├── NewScenarioDialog.vue    # Create scenario dialog
│   ├── ScenarioBuilder.vue      # Main scenario editor
│   ├── StepAddDialog.vue        # Add step dialog
│   ├── StepRow.vue              # Individual step display
│   ├── StepSelector.vue         # Step definition browser
│   ├── TableEditor.vue          # DataTable argument editor
│   ├── TagsEditor.vue           # Tag management
│   ├── TreeNodeItem.vue         # Recursive tree node
│   └── ValidationPanel.vue      # Validation & runner
├── pages/                   # Nuxt pages
│   └── index.vue            # Main application page
├── stores/                  # Pinia stores
│   ├── workspace.ts
│   ├── steps.ts
│   ├── scenario.ts
│   ├── runner.ts
│   ├── git.ts
│   ├── github.ts            # GitHub auth state
│   └── gitWorkspace.ts      # Git workspace operations
├── composables/             # Vue composables
│   ├── useApi.ts            # Electron API access
│   ├── useDragDrop.ts       # Drag and drop logic
│   ├── useFeatureTree.ts    # Tree state management
│   └── useThrottle.ts       # Function throttling
├── utils/                   # Utility functions
│   ├── stepPatternFormatter.ts  # Pattern formatting
│   └── tableUtils.ts            # Table operations
├── layouts/                 # Layout components
│   └── default.vue
├── assets/                  # Static assets
│   └── css/
├── types/                   # TypeScript definitions
└── app.vue                  # Root component
```

## Application Layout

The main page (`pages/index.vue`) uses a three-column layout when a workspace is loaded. When no workspace is selected, a welcome screen is shown with three options:

1. **Create New Workspace** — Initialize a new bddgen project with git
2. **Open Existing Workspace** — Select an existing directory
3. **Clone from GitHub** — Authenticate with GitHub and clone a repository

The header "Change Workspace" button opens a dropdown menu with "Open Local Workspace" and "Clone from GitHub" options.

**Three-column layout:**

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

**Purpose:** Git operations interface. Adapts UI based on whether a remote is configured.

**Features:**

- Current branch display
- Modified/untracked file counts
- Status indicators (color-coded)
- Pull button (only shown when remote exists)
- Commit message input dialog
- Commit button (local-only) or Commit & Push button (with remote)
- Loading states for operations
- Connected GitHub user display (avatar, login, disconnect button)

**Store Dependencies:**

- `useGitStore` - git status and operations
- `useGithubStore` - GitHub connection state

---

### GithubConnect.vue

**Purpose:** Multi-step dialog for GitHub authentication and repository cloning.

**Steps:**

1. **Auth** — Two tabs:
   - **Personal Access Token** — Input field + validate button
   - **Device Flow** — Shows device code + verification URL for browser auth
2. **Select Repo** — Searchable list of user's GitHub repositories
3. **Clone** — Directory picker, branch input, progress bar

**Features:**

- All elements have `data-testid` attributes for E2E testing
- Clone progress display
- Error handling at each step
- Accessible from welcome screen and "Change Workspace" menu

**Store Dependencies:**

- `useGithubStore` - GitHub auth and repo listing
- `useGitWorkspaceStore` - clone operations
- `useWorkspaceStore` - directory selection

**Events:**
| Event | Payload | Description |
|-------|---------|-------------|
| `cloned` | `string` (path) | Emitted after successful clone |
| `update:visible` | `boolean` | Dialog visibility |

---

### FeatureTree.vue

**Purpose:** Hierarchical tree view of feature files with folder structure.

**Features:**

- Tree-based navigation of features and folders
- Expand/collapse folders
- Context menu for file operations
- Create new features and folders
- Rename and delete operations
- Visual selection state

**Store Dependencies:**

- `useWorkspaceStore` - feature file list
- `useScenarioStore` - for loading selected feature
- `useStepsStore` - for step matching on import

---

### BackgroundSection.vue

**Purpose:** Displays and edits Background steps that run before each scenario.

**Features:**

- Add/remove background steps
- Step reordering via drag and drop
- Inline argument editing
- Keyword display (Given/And)
- Collapse/expand functionality

**Store Dependencies:**

- `useScenarioStore` - background steps data

---

### StepRow.vue

**Purpose:** Individual step display with keyword, pattern, and arguments.

**Features:**

- Keyword badge (Given/When/Then/And/But)
- Pattern text with argument placeholders
- Inline argument input fields
- Enum argument dropdown selectors
- Delete and reorder controls
- Drag handle for reordering
- Validation error highlighting

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `step` | `ScenarioStep` | The step data |
| `index` | `number` | Step position |
| `isBackground` | `boolean` | If in background section |

**Events:**
| Event | Payload | Description |
|-------|---------|-------------|
| `update` | `Partial<ScenarioStep>` | Step data changed |
| `remove` | - | Delete requested |
| `move-up` | - | Move up requested |
| `move-down` | - | Move down requested |

---

### StepAddDialog.vue

**Purpose:** Dialog for adding steps with pattern selection.

**Features:**

- Step pattern search/filter
- Keyword category tabs
- Pattern preview with placeholders
- Argument pre-fill options

**Store Dependencies:**

- `useStepsStore` - available step definitions
- `useScenarioStore` - for adding steps

---

### ExamplesEditor.vue

**Purpose:** Edit Examples table for Scenario Outlines.

**Features:**

- Dynamic column management
- Add/remove columns and rows
- Inline cell editing
- Column header editing
- Auto-detect placeholders from steps

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `examples` | `Examples` | The examples data |
| `placeholders` | `string[]` | Detected `<placeholder>` names |

---

### TableEditor.vue

**Purpose:** Generic data table editor for step DataTable arguments.

**Features:**

- Dynamic column/row management
- Inline cell editing
- Column reordering
- CSV-like paste support

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `columns` | `string[]` | Column headers |
| `rows` | `string[][]` | Table data |

---

### TagsEditor.vue

**Purpose:** Edit tags for features and scenarios.

**Features:**

- Add/remove tags with @ prefix
- Tag suggestions from existing tags
- Keyboard navigation
- Inline editing

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `tags` | `string[]` | Current tags |

---

### TreeNodeItem.vue

**Purpose:** Recursive tree node component for FeatureTree.

**Features:**

- Folder/file icon display
- Expand/collapse toggle
- Selection highlighting
- Context menu integration
- Drag and drop support

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `node` | `TreeNode` | The tree node data |
| `level` | `number` | Nesting depth |
| `selected` | `boolean` | Selection state |

---

### NewScenarioDialog.vue

**Purpose:** Dialog for creating new scenarios.

**Features:**

- Scenario name input
- Template selection (empty, outline, etc.)
- Tag pre-fill option

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
| `selectDirectory()` | Open directory dialog, return path only |
| `setWorkspacePath(path)` | Set workspace by path, load features |
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
  featureName: string;                    // Feature title
  featureDescription: string;             // Feature description
  scenarios: Scenario[];                  // Array of scenarios
  activeScenarioIndex: number;            // Currently selected scenario
  background: ScenarioStep[];             // Background steps
  validation: ValidationResult | null;
  isDirty: boolean;
  currentFeaturePath: string | null;
}
```

**Scenario Structure:**

```typescript
interface Scenario {
  name: string
  tags: string[]
  steps: ScenarioStep[]
  examples?: Examples // For Scenario Outlines
}

interface Examples {
  columns: string[]
  rows: Record<string, string>[]
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `setFeatureName(name)` | Update feature name |
| `setFeatureDescription(desc)` | Update feature description |
| `setScenarioName(name)` | Update active scenario name |
| `addScenario()` | Add new empty scenario |
| `removeScenario(index)` | Remove scenario at index |
| `setActiveScenario(index)` | Switch active scenario |
| `addStep(keyword, pattern, args)` | Add step with auto-generated ID |
| `updateStep(stepId, updates)` | Modify step properties |
| `updateStepArg(stepId, argName, value)` | Update single argument |
| `removeStep(stepId)` | Delete step |
| `moveStep(fromIndex, toIndex)` | Reorder steps |
| `addBackgroundStep(step)` | Add background step |
| `removeBackgroundStep(stepId)` | Remove background step |
| `moveBackgroundStep(from, to)` | Reorder background |
| `setExamples(examples)` | Set scenario outline examples |
| `addExampleRow(row)` | Add row to examples table |
| `removeExampleRow(index)` | Remove example row |
| `validate()` | Call IPC validation |
| `save(featurePath)` | Convert to Gherkin and write |
| `loadFromFeature(path, stepDefs)` | Parse Gherkin with step matching |
| `toGherkin()` | Convert to Gherkin syntax |
| `parseGherkin(content, stepDefs)` | Parse Gherkin content |
| `clear()` | Reset all state |

**Getters:**
| Getter | Type | Description |
|--------|------|-------------|
| `activeScenario` | Scenario | Currently selected scenario |
| `hasSteps` | boolean | Whether active scenario has steps |
| `hasBackground` | boolean | Whether background has steps |
| `isValid` | boolean | Validation passed |
| `errors` | ValidationIssue[] | Error-level issues |
| `warnings` | ValidationIssue[] | Warning-level issues |
| `placeholders` | string[] | Detected `<placeholder>` names |

**Step Pattern Matching:**
When parsing Gherkin, the store matches step text against step definitions:

- Supports Cucumber expressions: `{string}`, `{int}`, `{float}`, `{any}`
- Supports regex enum patterns: `(option1|option2|option3)`
- Extracts argument values from matched text
- Falls back to simple pattern if no match found

**Gherkin Conversion:**
The store handles bidirectional conversion between the internal `Scenario` object and Gherkin text format:

- `toGherkin()` - Serialize scenario to `.feature` file content
- `parseGherkin()` - Parse `.feature` content into scenario object
- Supports Background, Scenario, Scenario Outline, and Examples

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
  status: GitStatusResult | null
  isLoading: boolean
  isPulling: boolean
  isPushing: boolean
  error: string | null
  lastMessage: string | null
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

### useGithubStore

**Location:** `stores/github.ts`

**State:**

```typescript
{
  user: GithubUser | null
  isConnected: boolean
  isLoading: boolean
  error: string | null
  repos: GithubRepo[]
  token: string | null  // In-memory only (not persisted in store)
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `connect(token)` | Validate PAT, save token, fetch user info |
| `connectViaDeviceFlow()` | Start device flow OAuth, return codes |
| `pollDeviceFlow(deviceCode)` | Poll for device flow completion |
| `disconnect()` | Delete token, clear state |
| `loadRepos()` | Fetch user's GitHub repositories |
| `restoreSession()` | Restore saved token on app startup |

**Getters:**
| Getter | Type | Description |
|--------|------|-------------|
| `isConnected` | boolean | Whether GitHub is authenticated |

---

### useGitWorkspaceStore

**Location:** `stores/gitWorkspace.ts`

**State:**

```typescript
{
  metadata: WorkspaceMetadata | null
  isCloning: boolean
  isPulling: boolean
  isCommitting: boolean
  status: WorkspaceStatusResult | null
  error: string | null
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `cloneOrOpen(params)` | Clone or open a GitHub repository |
| `pull()` | Pull latest changes from remote |
| `refreshStatus()` | Get workspace file status |
| `commitAndPush(options)` | Stage, commit, and push changes |
| `clear()` | Reset all state |

---

## Composables

### useApi

**Location:** `composables/useApi.ts`

**Purpose:** Type-safe access to Electron API from renderer.

**Usage:**

```typescript
// Strict - throws if API unavailable
const api = useApi()
const workspace = await api.workspace.get()

// Safe - returns null if unavailable
const api = useApiSafe()
if (api) {
  const workspace = await api.workspace.get()
}
```

**Implementation:**

```typescript
export function useApi(): ElectronAPI {
  if (!window.api) {
    throw new Error('Electron API not available')
  }
  return window.api
}

export function useApiSafe(): ElectronAPI | null {
  return window.api ?? null
}
```

---

### useDragDrop

**Location:** `composables/useDragDrop.ts`

**Purpose:** Reusable drag and drop functionality for step reordering.

**Features:**

- Drag state management
- Drop zone detection
- Position calculation
- Animation support

**Usage:**

```typescript
const { isDragging, draggedItem, dropIndex, startDrag, endDrag, handleDragOver, handleDrop } =
  useDragDrop<ScenarioStep>()
```

**Return Values:**
| Value | Type | Description |
|-------|------|-------------|
| `isDragging` | `Ref<boolean>` | Whether drag is active |
| `draggedItem` | `Ref<T \| null>` | Current dragged item |
| `dropIndex` | `Ref<number>` | Target drop position |
| `startDrag` | `(item, index) => void` | Begin drag operation |
| `endDrag` | `() => void` | End drag operation |
| `handleDragOver` | `(event, index) => void` | Handle drag over event |
| `handleDrop` | `(callback) => void` | Handle drop with callback |

---

### useFeatureTree

**Location:** `composables/useFeatureTree.ts`

**Purpose:** Manages feature tree state and operations.

**Features:**

- Tree node expansion state
- Selection management
- File/folder operations
- Path resolution

**Usage:**

```typescript
const {
  expandedNodes,
  selectedNode,
  toggleExpand,
  selectNode,
  createFeature,
  createFolder,
  renameNode,
  deleteNode,
} = useFeatureTree()
```

**Return Values:**
| Value | Type | Description |
|-------|------|-------------|
| `expandedNodes` | `Ref<Set<string>>` | Expanded node paths |
| `selectedNode` | `Ref<TreeNode \| null>` | Currently selected node |
| `toggleExpand` | `(path) => void` | Toggle node expansion |
| `selectNode` | `(node) => void` | Select a node |
| `createFeature` | `(parentPath, name) => Promise` | Create new feature |
| `createFolder` | `(parentPath, name) => Promise` | Create new folder |
| `renameNode` | `(node, newName) => Promise` | Rename file/folder |
| `deleteNode` | `(node) => Promise` | Delete file/folder |

---

### useThrottle

**Location:** `composables/useThrottle.ts`

**Purpose:** Throttle function execution for performance optimization.

**Features:**

- Configurable delay
- Leading/trailing edge options
- Cancel functionality

**Usage:**

```typescript
const throttledFn = useThrottle((value: string) => {
  // Expensive operation
  search(value)
}, 300)

// Call throttled function
throttledFn('search term')

// Cancel pending execution
throttledFn.cancel()
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fn` | `Function` | required | Function to throttle |
| `delay` | `number` | `100` | Throttle delay in ms |
| `options.leading` | `boolean` | `true` | Execute on leading edge |
| `options.trailing` | `boolean` | `true` | Execute on trailing edge |

---

## Nuxt Configuration

Key settings in `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  ssr: false, // Client-only (required for Electron)
  compatibilityDate: '2024-01-01',
  devtools: { enabled: true },

  modules: [
    '@primevue/nuxt-module', // UI components
    '@pinia/nuxt', // State management
  ],

  typescript: {
    strict: true,
    typeCheck: true,
  },

  primevue: {
    // PrimeVue configuration
  },
})
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
