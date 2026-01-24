# SuiSui - Claude Code Instructions

## Project Overview

SuiSui is a BDD Test Builder desktop application built with Electron + Nuxt 4 (Vue 3). It integrates with bddgen and Playwright to enable visual creation and execution of Gherkin-based tests.

## Documentation Reference

**Before making any changes, consult the relevant documentation:**

| Document | When to Read |
|----------|--------------|
| [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) | Understanding overall design, data flow, security model |
| [doc/SERVICES.md](doc/SERVICES.md) | Working with backend services in `electron/services/` |
| [doc/FRONTEND.md](doc/FRONTEND.md) | Working with Vue components in `app/`, Pinia stores |
| [doc/IPC_TYPES.md](doc/IPC_TYPES.md) | Adding/modifying IPC channels, shared types |
| [doc/DEVELOPMENT.md](doc/DEVELOPMENT.md) | Development workflow, scripts, debugging |
| [doc/TESTING.md](doc/TESTING.md) | Writing unit tests, E2E tests |

## Project Structure

```
SuiSui/
├── apps/desktop/              # Main Electron application
│   ├── app/                   # Nuxt 4 Frontend (Vue 3)
│   │   ├── components/        # Vue SFC components
│   │   ├── stores/            # Pinia stores
│   │   ├── composables/       # Vue composables (useApi)
│   │   └── pages/             # Nuxt pages
│   ├── electron/              # Electron Backend
│   │   ├── services/          # Business logic services
│   │   ├── ipc/               # IPC handlers
│   │   ├── __tests__/         # Unit tests
│   │   ├── main.ts            # Electron entry
│   │   └── preload.ts         # Context bridge
│   └── e2e/                   # Playwright E2E tests
├── packages/shared/           # Shared types & IPC contracts
│   └── src/
│       ├── types/             # Type definitions
│       └── ipc/               # Channel names & API interface
└── doc/                       # Technical documentation
```

## Critical Rules

### 1. Process Separation
- **Main Process** (`electron/`): Node.js, full system access
- **Renderer Process** (`app/`): Browser only, no Node.js
- **Bridge**: `preload.ts` exposes typed API via `window.api`

```typescript
// In renderer (app/), access API like this:
const api = useApi();
await api.workspace.get();

// NEVER import Node.js modules in app/
```

### 2. IPC Communication
All main-renderer communication goes through typed IPC channels:

```typescript
// 1. Add channel in packages/shared/src/ipc/channels.ts
FEATURE_NEW: 'feature:new',

// 2. Add signature in packages/shared/src/ipc/api.ts
feature: {
  new(name: string): Promise<FeatureFile>;
};

// 3. Add handler in apps/desktop/electron/ipc/handlers.ts
ipcMain.handle(IPC_CHANNELS.FEATURE_NEW, async (_, name) => {
  return getFeatureService().create(name);
});

// 4. Expose in apps/desktop/electron/preload.ts
feature: {
  new: (name) => ipcRenderer.invoke(IPC_CHANNELS.FEATURE_NEW, name),
},

// 5. Rebuild shared package
// pnpm --filter @suisui/shared build
```

### 3. Service Pattern
Services use singleton + dependency injection for testability:

```typescript
export class WorkspaceService {
  constructor(private commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner();
  }

  async validate(path: string): Promise<WorkspaceValidation> {
    // Implementation
  }
}

let instance: WorkspaceService | null = null;
export function getWorkspaceService(): WorkspaceService {
  if (!instance) instance = new WorkspaceService();
  return instance;
}
```

### 4. Testing Requirements
**CRITICAL: Never call real CLI tools in tests**

```typescript
// Use FakeCommandRunner for all service tests
const fakeRunner = new FakeCommandRunner();
fakeRunner.setResponse('npx', {
  code: 0,
  stdout: JSON.stringify([{ keyword: 'Given', pattern: 'I am logged in' }]),
  stderr: ''
});

const service = new StepService(fakeRunner);
const result = await service.export();
```

### 5. Shared Package Workflow
After modifying `packages/shared/`:
```bash
pnpm --filter @suisui/shared build
```

## Common Tasks

### Add New Backend Service
1. Create `electron/services/NewService.ts` (see pattern above)
2. Add types in `packages/shared/src/types/`
3. Add IPC channels (see IPC Communication above)
4. Write tests in `electron/__tests__/NewService.test.ts`
5. Export from `electron/services/index.ts`

### Add New Frontend Component
1. Create `app/components/MyComponent.vue`
2. Use `<script setup lang="ts">`
3. Access stores via `useXxxStore()`
4. Access API via `useApi()`
5. Use PrimeVue components for UI

### Add New Pinia Store
1. Create `app/stores/myStore.ts`
2. Define state, getters, actions
3. Use `useApi()` for IPC calls
4. Export `useMyStore`

### Add New Type
1. Add/update file in `packages/shared/src/types/`
2. Export from `packages/shared/src/index.ts`
3. Run `pnpm --filter @suisui/shared build`

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development mode |
| `pnpm build` | Production build |
| `pnpm test` | Run unit tests |
| `pnpm test:e2e` | Run E2E tests (requires build) |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm typecheck` | Full type checking |
| `pnpm --filter @suisui/shared build` | Rebuild shared package |

## Code Style

- **TypeScript**: Strict mode, avoid `any`
- **Vue**: Composition API with `<script setup>`
- **Components**: PascalCase (e.g., `ScenarioBuilder.vue`)
- **Stores**: camelCase with `use` prefix (e.g., `useWorkspaceStore`)
- **Services**: PascalCase class + camelCase getter (e.g., `getWorkspaceService`)
- **Types**: PascalCase (e.g., `WorkspaceInfo`)
- **IPC Channels**: SCREAMING_SNAKE_CASE (e.g., `WORKSPACE_GET`)

## Key Patterns

### Validation Service
Returns structured results with severity levels:
```typescript
interface ValidationResult {
  isValid: boolean;  // No errors (warnings allowed)
  issues: ValidationIssue[];
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  stepId?: string;
}
```

### Command Execution
Always go through CommandRunner abstraction:
```typescript
const result = await this.commandRunner.run('npx', ['bddgen', 'export'], {
  cwd: workspacePath,
  timeout: 30000
});
```

### Gherkin Conversion
ScenarioStore handles bidirectional conversion:
- `toGherkin()` - Scenario object → .feature content
- `parseGherkin()` - .feature content → Scenario object

## Generic Steps

The app includes 10 built-in generic steps in `@suisui/shared`:
- Given: "I am on the {string} page", "I am logged in as {string}"
- When: "I click on {string}", "I fill {string} with {string}", etc.
- Then: "I should see {string}", "the URL should contain {string}", etc.

## Do Not

- Import Node.js modules in `app/` directory
- Call real `bddgen` or `playwright` in tests
- Skip `FakeCommandRunner` for service tests
- Mutate Pinia state outside actions
- Use untyped IPC channels
- Skip shared package rebuild after type changes
