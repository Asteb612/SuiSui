# SuiSui Architecture Documentation

## Overview

**SuiSui** is a desktop application for building Behavior-Driven Development (BDD) tests using a visual interface. It integrates with [bddgen](https://github.com/nicholasgrose/bddgen) and Playwright to enable seamless creation and execution of Gherkin-based tests without manual coding.

**Version:** 0.1.0 (MVP)

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop Framework | Electron | 33.4.11 |
| Frontend Framework | Nuxt 4 (Vue 3) | 3.15.0 |
| State Management | Pinia | Latest |
| UI Components | PrimeVue | 4.2.0 |
| Unit Testing | Vitest | 2.0.0 |
| E2E Testing | Playwright | 1.58.0 |
| Package Manager | pnpm | 9.0.0+ |
| Node.js | Node.js | 20.0.0+ |

## Monorepo Structure

```
SuiSui/
├── apps/
│   └── desktop/              # Main Electron application
│       ├── app/              # Nuxt 4 Renderer (Frontend)
│       ├── electron/         # Electron Main Process (Backend)
│       └── e2e/              # End-to-end tests
├── packages/
│   └── shared/               # Shared types and contracts
├── doc/                      # Technical documentation
├── PROJECT.md                # MVP specification
└── README.md                 # User documentation
```

## Architecture Pattern

SuiSui follows a **layered architecture** with clear separation between the Electron main process (backend) and renderer process (frontend):

```
┌─────────────────────────────────────────────────────────────────┐
│                    Renderer Process (Nuxt 4)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Vue 3        │  │ Pinia        │  │ useApi()             │   │
│  │ Components   │──│ Stores       │──│ Composable           │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                              │                    │
└──────────────────────────────────────────────│────────────────────┘
                                               │ window.api
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Preload Script                              │
│                    (contextBridge API)                            │
└──────────────────────────────────────────────│────────────────────┘
                                               │ IPC Channels
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Main Process (Electron)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ IPC          │  │ Services     │  │ CommandRunner        │   │
│  │ Handlers     │──│ Layer        │──│ Abstraction          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                              │                    │
└──────────────────────────────────────────────│────────────────────┘
                                               │
                                               ▼
                              ┌────────────────────────────┐
                              │ File System / CLI Commands │
                              │ (bddgen, playwright, git)  │
                              └────────────────────────────┘
```

## Data Flow

1. **User Interaction** → Vue 3 Component
2. **Component** → Pinia Store Action
3. **Store Action** → `useApi()` composable
4. **Composable** → `window.api` (exposed via preload)
5. **Preload** → `ipcRenderer.invoke(channel, ...args)`
6. **Main Process** → IPC Handler
7. **Handler** → Service method
8. **Service** → File System / Command Execution
9. **Response** flows back up the chain

## Process Isolation

### Main Process (`electron/`)
- Node.js environment with full system access
- Runs business logic services
- Executes CLI commands (bddgen, playwright, git)
- Manages file system operations
- Handles IPC requests from renderer

### Renderer Process (`app/`)
- Chromium-based browser environment
- No direct Node.js access (security)
- Communicates via IPC only
- Manages UI state with Pinia
- Renders Vue 3 components

### Preload Script (`electron/preload.ts`)
- Bridge between main and renderer
- Uses `contextBridge` for secure API exposure
- Defines `window.api` interface
- Type-safe IPC wrapper

## Security Model

| Feature | Status | Description |
|---------|--------|-------------|
| Context Isolation | ✅ Enabled | Renderer cannot access Node.js |
| Node Integration | ❌ Disabled | No direct Node.js in renderer |
| Preload Script | ✅ Required | Single entry point for API |
| Path Validation | ✅ Implemented | Prevents directory traversal |
| IPC Typing | ✅ Enforced | Type-safe communication |

## Key Design Patterns

### 1. Service Singleton Pattern
Each service uses a factory function for lazy initialization:
```typescript
let instance: WorkspaceService | null = null;

export function getWorkspaceService(): WorkspaceService {
  if (!instance) {
    instance = new WorkspaceService();
  }
  return instance;
}
```

### 2. Dependency Injection for Testing
Services accept optional dependencies for testability:
```typescript
class StepService {
  constructor(private commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner();
  }
}
```

### 3. Command Abstraction
Real and fake implementations for CLI command execution:
```typescript
interface ICommandRunner {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
}
```

### 4. Typed IPC Communication
All channels and payloads are strongly typed:
```typescript
// Shared package defines contracts
export const IPC_CHANNELS = {
  WORKSPACE_GET: 'workspace:get',
  // ...
} as const;
```

## Module Boundaries

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| `@suisui/shared` | Types, interfaces, constants | None |
| `electron/services` | Business logic | `@suisui/shared`, Node.js APIs |
| `electron/ipc` | Request handling | Services, `@suisui/shared` |
| `app/stores` | UI state management | `@suisui/shared`, API composable |
| `app/components` | UI rendering | Stores, PrimeVue |

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Vue Component | PascalCase.vue | `ScenarioBuilder.vue` |
| Pinia Store | camelCase.ts | `useWorkspaceStore.ts` |
| Service | PascalCase.ts | `WorkspaceService.ts` |
| Types | camelCase.ts | `workspace.ts` |
| Tests | *.test.ts | `ValidationService.test.ts` |
| E2E Tests | *.spec.ts | `app.spec.ts` |

## Related Documentation

- [SERVICES.md](./SERVICES.md) - Backend services documentation
- [FRONTEND.md](./FRONTEND.md) - Frontend components and stores
- [IPC_TYPES.md](./IPC_TYPES.md) - IPC channels and shared types
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development workflow
- [TESTING.md](./TESTING.md) - Testing strategies
