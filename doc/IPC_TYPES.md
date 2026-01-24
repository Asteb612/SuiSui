# SuiSui IPC & Types Documentation

## Overview

The `@suisui/shared` package contains all shared types and IPC contracts between the Electron main process and renderer process. Located in `packages/shared/`.

## Package Structure

```
packages/shared/
├── src/
│   ├── types/           # Type definitions (9 files)
│   │   ├── workspace.ts
│   │   ├── feature.ts
│   │   ├── step.ts
│   │   ├── validation.ts
│   │   ├── runner.ts
│   │   ├── git.ts
│   │   ├── settings.ts
│   │   ├── command.ts
│   │   └── github.ts
│   ├── ipc/             # IPC communication contracts
│   │   ├── channels.ts
│   │   └── api.ts
│   └── index.ts         # Package exports
├── dist/                # Compiled outputs
├── tsconfig.json
└── package.json
```

## Build Configuration

The shared package builds to both ESM and CommonJS formats:

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  }
}
```

---

## IPC Channels

**Location:** `src/ipc/channels.ts`

All IPC channel names as constants:

```typescript
export const IPC_CHANNELS = {
  // Workspace
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_SET: 'workspace:set',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_VALIDATE: 'workspace:validate',

  // Features
  FEATURES_LIST: 'features:list',
  FEATURES_READ: 'features:read',
  FEATURES_WRITE: 'features:write',
  FEATURES_DELETE: 'features:delete',

  // Steps
  STEPS_EXPORT: 'steps:export',
  STEPS_GET_CACHED: 'steps:getCached',
  STEPS_GET_DECORATORS: 'steps:getDecorators',

  // Validation
  VALIDATION_SCENARIO: 'validation:scenario',

  // Runner
  RUNNER_RUN_HEADLESS: 'runner:runHeadless',
  RUNNER_RUN_UI: 'runner:runUI',
  RUNNER_STOP: 'runner:stop',

  // Git
  GIT_STATUS: 'git:status',
  GIT_PULL: 'git:pull',
  GIT_COMMIT_PUSH: 'git:commitPush',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_EXTERNAL: 'app:openExternal',
} as const;
```

---

## ElectronAPI Interface

**Location:** `src/ipc/api.ts`

Defines the complete API exposed to the renderer:

```typescript
export interface ElectronAPI {
  // Workspace
  workspace: {
    get(): Promise<WorkspaceInfo | null>;
    set(path: string): Promise<void>;
    select(): Promise<WorkspaceInfo | null>;
    validate(path: string): Promise<WorkspaceValidation>;
  };

  // Features
  features: {
    list(): Promise<FeatureFile[]>;
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    delete(path: string): Promise<void>;
  };

  // Steps
  steps: {
    export(): Promise<StepExportResult>;
    getCached(): Promise<StepDefinition[] | null>;
    getDecorators(): Promise<DecoratorDefinition[]>;
  };

  // Validation
  validation: {
    scenario(scenario: Scenario): Promise<ValidationResult>;
  };

  // Runner
  runner: {
    runHeadless(options?: RunOptions): Promise<RunResult>;
    runUI(options?: RunOptions): Promise<RunResult>;
    stop(): Promise<void>;
  };

  // Git
  git: {
    status(): Promise<GitStatusResult>;
    pull(): Promise<GitOperationResult>;
    commitPush(message: string): Promise<GitOperationResult>;
  };

  // Settings
  settings: {
    get(): Promise<AppSettings>;
    set(settings: Partial<AppSettings>): Promise<void>;
    reset(): Promise<void>;
  };

  // App
  app: {
    getVersion(): Promise<string>;
    openExternal(url: string): Promise<void>;
  };
}

// Global window augmentation
declare global {
  interface Window {
    api: ElectronAPI;
  }
}
```

---

## Type Definitions

### Workspace Types

**Location:** `src/types/workspace.ts`

```typescript
export interface WorkspaceInfo {
  path: string;
  name: string;
  isValid: boolean;
  hasFeaturesDir: boolean;
  hasPackageJson: boolean;
}

export interface WorkspaceValidation {
  isValid: boolean;
  errors: string[];
}
```

---

### Feature Types

**Location:** `src/types/feature.ts`

```typescript
export interface FeatureFile {
  name: string;           // File name (e.g., "login.feature")
  path: string;           // Relative path from features/
  fullPath: string;       // Absolute path
  modifiedAt: number;     // Timestamp
}

export interface Feature {
  name: string;
  description?: string;
  scenarios: Scenario[];
}

export interface Scenario {
  name: string;
  steps: ScenarioStep[];
}

export interface ScenarioStep {
  id: string;                    // Unique ID
  keyword: StepKeyword;          // Given | When | Then | And | But
  pattern: string;               // Step pattern with placeholders
  args: StepArg[];               // Argument values
}

export interface StepArg {
  name: string;
  value: string;
  type: 'string' | 'int' | 'float';
}

export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';
```

---

### Step Types

**Location:** `src/types/step.ts`

```typescript
export interface StepDefinition {
  id: string;                      // Unique hash
  keyword: StepKeyword;
  pattern: string;                 // e.g., "I click on {string}"
  description?: string;
  file?: string;                   // Source file
  line?: number;                   // Source line
  args: StepArgDefinition[];
  decorators?: string[];
}

export interface StepArgDefinition {
  name: string;                    // Extracted from {int:name} or generated
  type: 'string' | 'int' | 'float';
  optional?: boolean;
}

export interface DecoratorDefinition {
  name: string;
  description?: string;
}

export interface StepExportResult {
  steps: StepDefinition[];
  decorators: DecoratorDefinition[];
  exportedAt: number;              // Timestamp
}

// Generic steps included with the app
export interface GenericStep {
  id: string;
  keyword: StepKeyword;
  pattern: string;
  description: string;
  args: StepArgDefinition[];
}

export const GENERIC_STEPS: GenericStep[] = [
  // Given steps
  {
    id: 'generic-given-page',
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    description: 'Navigate to a specific page',
    args: [{ name: 'page', type: 'string' }]
  },
  {
    id: 'generic-given-logged-in',
    keyword: 'Given',
    pattern: 'I am logged in as {string}',
    description: 'Login as a specific user',
    args: [{ name: 'username', type: 'string' }]
  },
  // When steps
  {
    id: 'generic-when-click',
    keyword: 'When',
    pattern: 'I click on {string}',
    description: 'Click on an element',
    args: [{ name: 'element', type: 'string' }]
  },
  {
    id: 'generic-when-fill',
    keyword: 'When',
    pattern: 'I fill {string} with {string}',
    description: 'Fill a form field',
    args: [{ name: 'field', type: 'string' }, { name: 'value', type: 'string' }]
  },
  {
    id: 'generic-when-select',
    keyword: 'When',
    pattern: 'I select {string} from {string}',
    description: 'Select an option from dropdown',
    args: [{ name: 'option', type: 'string' }, { name: 'dropdown', type: 'string' }]
  },
  {
    id: 'generic-when-wait',
    keyword: 'When',
    pattern: 'I wait for {int} seconds',
    description: 'Wait for a duration',
    args: [{ name: 'seconds', type: 'int' }]
  },
  // Then steps
  {
    id: 'generic-then-see',
    keyword: 'Then',
    pattern: 'I should see {string}',
    description: 'Verify text is visible',
    args: [{ name: 'text', type: 'string' }]
  },
  {
    id: 'generic-then-not-see',
    keyword: 'Then',
    pattern: 'I should not see {string}',
    description: 'Verify text is not visible',
    args: [{ name: 'text', type: 'string' }]
  },
  {
    id: 'generic-then-url',
    keyword: 'Then',
    pattern: 'the URL should contain {string}',
    description: 'Verify URL contains text',
    args: [{ name: 'urlPart', type: 'string' }]
  },
  {
    id: 'generic-then-visible',
    keyword: 'Then',
    pattern: 'the element {string} should be visible',
    description: 'Verify element is visible',
    args: [{ name: 'selector', type: 'string' }]
  }
];
```

---

### Validation Types

**Location:** `src/types/validation.ts`

```typescript
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  stepId?: string;          // Related step ID
  field?: string;           // Related field name
}

export interface ValidationResult {
  isValid: boolean;         // No errors (warnings allowed)
  issues: ValidationIssue[];
}
```

---

### Runner Types

**Location:** `src/types/runner.ts`

```typescript
export type RunMode = 'headless' | 'ui';

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error';

export interface RunOptions {
  mode?: RunMode;
  featurePath?: string;      // Filter by feature file
  scenarioName?: string;     // Filter by scenario (--grep)
}

export interface RunResult {
  status: RunStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;          // Milliseconds
  reportPath?: string;       // Path to HTML report
}
```

---

### Git Types

**Location:** `src/types/git.ts`

```typescript
export type GitStatus = 'clean' | 'dirty' | 'untracked' | 'error';

export interface GitStatusResult {
  status: GitStatus;
  branch: string;
  ahead: number;             // Commits ahead of remote
  behind: number;            // Commits behind remote
  modified: string[];        // Modified file paths
  untracked: string[];       // Untracked file paths
  staged: string[];          // Staged file paths
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  error?: string;
}
```

---

### Settings Types

**Location:** `src/types/settings.ts`

```typescript
export interface AppSettings {
  workspacePath: string | null;
  recentWorkspaces: string[];
  theme: 'light' | 'dark' | 'system';
  editorFontSize: number;
  autoSave: boolean;
  showLineNumbers: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workspacePath: null,
  recentWorkspaces: [],
  theme: 'system',
  editorFontSize: 14,
  autoSave: true,
  showLineNumbers: true
};
```

---

### Command Types

**Location:** `src/types/command.ts`

```typescript
export interface CommandResult {
  code: number;              // Exit code
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;              // Working directory
  env?: Record<string, string>;
  timeout?: number;          // Milliseconds (default 60000)
}
```

---

## Adding New Types

1. Create or update type file in `packages/shared/src/types/`
2. Export from `packages/shared/src/index.ts`
3. Run `pnpm build` in shared package
4. Import in desktop app: `import { TypeName } from '@suisui/shared'`

## Adding New IPC Channels

1. Add channel constant in `packages/shared/src/ipc/channels.ts`
2. Add method signature in `packages/shared/src/ipc/api.ts`
3. Implement handler in `apps/desktop/electron/ipc/handlers.ts`
4. Expose in preload: `apps/desktop/electron/preload.ts`
5. Rebuild shared package: `pnpm build`

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall architecture
- [SERVICES.md](./SERVICES.md) - Backend services
- [FRONTEND.md](./FRONTEND.md) - Frontend components
