# SuiSui Development Guide

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 20.0.0+ | `node --version` |
| pnpm | 9.0.0+ | `pnpm --version` |
| Git | Latest | `git --version` |

## Getting Started

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd SuiSui

# Install dependencies
pnpm install

# Build shared package (required first time)
pnpm --filter @suisui/shared build
```

### Development Mode

```bash
# Start development (recommended)
pnpm dev

# Or run separately in two terminals:
# Terminal 1: Nuxt dev server
pnpm dev:nuxt

# Terminal 2: Electron (wait for Nuxt to be ready)
pnpm dev:electron
```

The app will open automatically once both processes are ready.

---

## Project Scripts

### Root Level

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development mode (Nuxt + Electron) |
| `pnpm build` | Build for production |
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Run unit tests only |
| `pnpm test:e2e` | Run E2E tests (requires build) |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm format` | Format with Prettier |
| `pnpm typecheck` | Full TypeScript check |

### Desktop App

```bash
cd apps/desktop

# Development
pnpm dev:nuxt          # Start Nuxt dev server
pnpm dev:electron      # Start Electron (needs Nuxt running)

# Testing
pnpm test              # Run unit tests
pnpm test:watch        # Watch mode
pnpm test:e2e          # Run E2E tests

# Build
pnpm build             # Build for production
pnpm build:nuxt        # Build Nuxt only
pnpm build:electron    # Build Electron only
```

### Shared Package

```bash
cd packages/shared

pnpm build             # Build ESM + CJS outputs
pnpm typecheck         # Type check only
```

---

## Development Workflow

### 1. Making Changes

```
┌─────────────────────────────────────────────────────────────────┐
│                    Development Workflow                          │
└─────────────────────────────────────────────────────────────────┘

1. Types/Contracts Changed?
   └─→ Edit packages/shared/src/
   └─→ Run: pnpm --filter @suisui/shared build

2. Backend Service Changed?
   └─→ Edit apps/desktop/electron/services/
   └─→ Hot reload (automatic with dev mode)
   └─→ Write/update tests in electron/__tests__/

3. IPC Channel Added/Changed?
   └─→ Update packages/shared/src/ipc/channels.ts
   └─→ Update packages/shared/src/ipc/api.ts
   └─→ Update apps/desktop/electron/ipc/handlers.ts
   └─→ Update apps/desktop/electron/preload.ts
   └─→ Rebuild shared: pnpm --filter @suisui/shared build

4. Frontend Changed?
   └─→ Edit apps/desktop/app/
   └─→ Hot Module Replacement (automatic)

5. Before Committing
   └─→ Run: pnpm lint:fix
   └─→ Run: pnpm typecheck
   └─→ Run: pnpm test
```

### 2. Adding a New Feature

**Example: Adding a new service**

1. Create service in `electron/services/NewService.ts`:
```typescript
export class NewService {
  constructor(private commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner();
  }

  async doSomething(): Promise<SomeResult> {
    // Implementation
  }
}

let instance: NewService | null = null;
export function getNewService(): NewService {
  if (!instance) instance = new NewService();
  return instance;
}
```

2. Add types in `packages/shared/src/types/`:
```typescript
export interface SomeResult {
  // ...
}
```

3. Add IPC channel:
```typescript
// channels.ts
NEW_DO_SOMETHING: 'new:doSomething',

// api.ts
new: {
  doSomething(): Promise<SomeResult>;
};
```

4. Register handler:
```typescript
// handlers.ts
ipcMain.handle(IPC_CHANNELS.NEW_DO_SOMETHING, async () => {
  return getNewService().doSomething();
});
```

5. Expose in preload:
```typescript
// preload.ts
new: {
  doSomething: () => ipcRenderer.invoke(IPC_CHANNELS.NEW_DO_SOMETHING),
},
```

6. Create Pinia store (if needed):
```typescript
// stores/new.ts
export const useNewStore = defineStore('new', () => {
  const api = useApi();
  // ...
});
```

7. Write tests:
```typescript
// __tests__/NewService.test.ts
describe('NewService', () => {
  it('should do something', async () => {
    const fakeRunner = new FakeCommandRunner();
    const service = new NewService(fakeRunner);
    // ...
  });
});
```

---

## Code Style

### TypeScript

- Strict mode enabled
- Use explicit types for function parameters and returns
- Avoid `any` (configured as warning)
- Use `unknown` for truly unknown types

### Vue Components

- Use `<script setup lang="ts">`
- Use composition API
- Access stores via `useXxxStore()`
- Access API via `useApi()`

### File Organization

```
# Good
electron/services/WorkspaceService.ts
app/stores/workspace.ts
app/components/WorkspaceSelector.vue

# Bad
electron/services/workspace.ts      # Should be PascalCase
app/stores/WorkspaceStore.ts        # Should be camelCase
app/components/workspaceSelector.vue # Should be PascalCase
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Vue Component | PascalCase | `ScenarioBuilder.vue` |
| Pinia Store | camelCase with `use` prefix | `useWorkspaceStore` |
| Service Class | PascalCase | `WorkspaceService` |
| Service Factory | camelCase with `get` prefix | `getWorkspaceService` |
| Type/Interface | PascalCase | `WorkspaceInfo` |
| IPC Channel | SCREAMING_SNAKE_CASE | `WORKSPACE_GET` |
| Constant | SCREAMING_SNAKE_CASE | `DEFAULT_SETTINGS` |

---

## Debugging

### Main Process

```bash
# Start with debugger
pnpm dev:electron --inspect

# Or use VS Code debugger with launch.json
```

### Renderer Process

- Use Chrome DevTools (Ctrl+Shift+I in Electron window)
- Vue DevTools extension works in development mode

### IPC Communication

Add logging in handlers:
```typescript
ipcMain.handle(channel, async (...args) => {
  console.log(`[IPC] ${channel}`, args);
  const result = await handler(...args);
  console.log(`[IPC] ${channel} result:`, result);
  return result;
});
```

---

## Common Issues

### "Module not found: @suisui/shared"

```bash
# Rebuild shared package
pnpm --filter @suisui/shared build
```

### "Cannot find window.api"

The preload script is not loaded. Check:
1. `webPreferences.preload` path in `main.ts`
2. Preload script compiles without errors
3. Context isolation is enabled

### "IPC channel not registered"

1. Handler not registered in `handlers.ts`
2. Handler registration happens after window creation
3. Channel name mismatch between preload and handlers

### TypeScript errors after type changes

```bash
# Clean and rebuild
pnpm --filter @suisui/shared build
pnpm typecheck
```

### E2E tests fail to start

```bash
# Ensure production build exists
pnpm build

# Then run E2E
pnpm test:e2e
```

---

## IDE Setup

### VS Code

Recommended extensions:
- Vue - Official
- TypeScript Vue Plugin (Volar)
- ESLint
- Prettier
- Playwright Test for VS Code

### Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## Hot Reload Behavior

| Change Type | Reload Type | Notes |
|-------------|-------------|-------|
| Vue Component | HMR | Instant |
| Pinia Store | HMR | State preserved |
| CSS | HMR | Instant |
| Electron Main | Full Restart | Automatic |
| Preload Script | Full Restart | Automatic |
| Shared Package | Manual Rebuild | Run `pnpm build` |

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall architecture
- [SERVICES.md](./SERVICES.md) - Backend services
- [TESTING.md](./TESTING.md) - Testing strategies
