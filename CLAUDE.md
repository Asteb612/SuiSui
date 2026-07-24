# SuiSui - Claude Code Instructions

## Project Overview

SuiSui is a BDD Test Builder desktop application built with Electron + Nuxt 4 (Vue 3). It integrates with bddgen and Playwright to enable visual creation and execution of Gherkin-based tests.

## Documentation Reference

**Before making any changes, consult the relevant documentation:**

| Document                                   | When to Read                                            |
| ------------------------------------------ | ------------------------------------------------------- |
| [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) | Understanding overall design, data flow, security model |
| [doc/SERVICES.md](doc/SERVICES.md)         | Working with backend services in `electron/services/`   |
| [doc/FRONTEND.md](doc/FRONTEND.md)         | Working with Vue components in `app/`, Pinia stores     |
| [doc/IPC_TYPES.md](doc/IPC_TYPES.md)       | Adding/modifying IPC channels, shared types             |
| [doc/DEVELOPMENT.md](doc/DEVELOPMENT.md)   | Development workflow, scripts, debugging                |
| [doc/TESTING.md](doc/TESTING.md)           | Writing unit tests, E2E tests                           |

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
const api = useApi()
await api.workspace.get()

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
    this.commandRunner = commandRunner ?? getCommandRunner()
  }

  async validate(path: string): Promise<WorkspaceValidation> {
    // Implementation
  }
}

let instance: WorkspaceService | null = null
export function getWorkspaceService(): WorkspaceService {
  if (!instance) instance = new WorkspaceService()
  return instance
}
```

### 4. Testing Requirements

**CRITICAL: Never call real CLI tools in tests**

```typescript
// Use FakeCommandRunner for all service tests
const fakeRunner = new FakeCommandRunner()
fakeRunner.setResponse('npx', {
  code: 0,
  stdout: JSON.stringify([{ keyword: 'Given', pattern: 'I am logged in' }]),
  stderr: '',
})

const service = new StepService(fakeRunner)
const result = await service.export()
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

| Command                              | Description                    |
| ------------------------------------ | ------------------------------ |
| `pnpm dev`                           | Start development mode         |
| `pnpm build`                         | Production build               |
| `pnpm test`                          | Run unit tests                 |
| `pnpm test:e2e`                      | Run E2E tests (requires build) |
| `pnpm lint:fix`                      | Fix linting issues             |
| `pnpm typecheck`                     | Full type checking             |
| `pnpm --filter @suisui/shared build` | Rebuild shared package         |

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
  isValid: boolean // No errors (warnings allowed)
  issues: ValidationIssue[]
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  message: string
  stepId?: string
}
```

### Command Execution

Always go through CommandRunner abstraction:

```typescript
const result = await this.commandRunner.run('npx', ['bddgen', 'export'], {
  cwd: workspacePath,
  timeout: 30000,
})
```

### Gherkin Conversion

ScenarioStore handles bidirectional conversion:

- `toGherkin()` - Scenario object → .feature content (including DataTable rows after steps)
- `parseGherkin()` - .feature content → Scenario object (including step DataTables)

### DataTable Arguments

Steps can accept Gherkin DataTables. The pattern declares columns with a `(Col1, Col2):` suffix:

```typescript
// Pattern: 'I fill in the form with the following data (Field, Value):'
// Gherkin output:
//   When I fill in the form with the following data:
//     | Field | Value |
//     | Name  | John  |
```

- Table data is stored as JSON in `StepArg.value`, columns in `StepArg.tableColumns`
- `patternToRegex()` strips the column suffix for matching; `matchStep()` skips capture index for table args
- `resolvePattern()` strips the column suffix for Gherkin text output
- `TableEditor.vue` handles edit mode; read mode shows an inline read-only table
- Table utility functions: `parseTableValue()`, `stringifyTableValue()`, `toGherkinTable()`, `parseGherkinTable()` in `app/utils/tableUtils.ts`

## Default Steps

When a workspace is initialized, the app creates `features/steps/generic.steps.ts` with 11 default step definitions that can be used by bddgen and Playwright:

- Given: "I am on the {string} page", "I am logged in as {string}"
- When: "I click on {string}", "I fill {string} with {string}", "I fill in the form with the following data (Field, Value):", etc.
- Then: "I should see {string}", "the URL should contain {string}", etc.

These are real playwright-bdd step definitions that users can customize or extend.

## Do Not

- Import Node.js modules in `app/` directory
- Call real `bddgen` or `playwright` in tests
- Skip `FakeCommandRunner` for service tests
- Mutate Pinia state outside actions
- Use untyped IPC channels
- Skip shared package rebuild after type changes
- Let AI credentials or the `ai`/provider SDKs reach the renderer (main-process only)

## AI Assistant (multi-provider)

Optional AI assistant (main-process only, behind the `IAIProvider` seam) for drafting
and troubleshooting BDD tests. Four providers: Ollama, BYOK OpenAI-compatible, Claude
CLI, OpenAI Codex CLI. The LLM is a **draft generator only** — output is validated
before accept. See [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) (security/billing model,
CLI best-effort caveats), [doc/SERVICES.md](doc/SERVICES.md) (`electron/services/ai/`),
[doc/IPC_TYPES.md](doc/IPC_TYPES.md) (`AI_*` channels), and
[doc/FRONTEND.md](doc/FRONTEND.md) (`useAiStore` + AI dialogs).

## Native Step Catalog (`@suisui/step-catalog`)

The step picker is populated by a **native, structured step catalog** that
statically analyzes step-definition files with the TypeScript Compiler API
(main-process only, no project-code execution, no `playwright-bdd` internals).
It replaces the fragile "flatten to text then re-parse" `bddgen-export.js` path
as the primary metadata source.

- **Engine** (`packages/step-catalog/`): discovery → per-file AST analysis
  (isolated: one bad file → `FILE_PARSE_ERROR`, others survive) → provenance-aware
  merge → duplicate/ambiguity diagnostics → versioned `StepCatalogResult`.
- **Serializable contract types** live in `@suisui/shared` (`types/step-catalog.ts`) —
  SSoT, since they cross IPC. The engine (which depends on `typescript`) never
  reaches the renderer.
- **Metadata precedence** (never overwrite more precise with less precise):
  explicit `defineStep()` → callback types → `step``` fragments → pattern
inference → runtime → unknown. Every step/param carries `origin`+`precision`
  (exact/inferred/partial/unknown).
- **`@suisui/step-regex`** gained optional `defineStep()` + fragment metadata
  (dependency-free); `step``` still returns a plain string for playwright-bdd.
- **Backward-compat**: `catalogStepToStepDefinition()` (in `@suisui/shared`)
  adapts a `CatalogStep` to the legacy `StepDefinition` so scenario/Gherkin
  output is unchanged. The steps store is catalog-first with a legacy fallback.
- **IPC**: `catalog:generate|getCached|clearCache|getStep` (`STEP_CATALOG_*`),
  validated I/O; workspace root comes from `WorkspaceService`, never the renderer.
- **Cache**: `<workspace>/.app/cache/step-catalog.json`, invalidated by file
  mtime+hash / Playwright config / package config / schema+engine version;
  `.app/.gitignore` is written to keep it out of the user's VCS.

See [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md), [doc/SERVICES.md](doc/SERVICES.md)
(`StepCatalogService`), [doc/IPC_TYPES.md](doc/IPC_TYPES.md) (`catalog:*`), and
[doc/FRONTEND.md](doc/FRONTEND.md) (`useStepsStore` catalog + selector filters).

## SuiSui-Native Recorder (feature 007)

Records a browser session and converts interactions into editable,
catalog-matched BDD steps — **not** the Playwright Inspector window nor its
in-page overlay. Key constraints:

- The **only** code touching Playwright's private `_enableRecorder({recorderMode:'api'})`
  is the embedded-Node child `electron/scripts/recorder-adapter.js` + its
  `PlaywrightRecorderAdapter`, behind the `IRecorderAdapter` seam. It drives the
  **workspace's** Playwright, suppresses Playwright's overlay (`x-pw-glass`), and
  hosts SuiSui's own picker. Version-gated `>=1.49 <1.61` with a capability probe.
- **Secrets are redacted in the child** — a captured value never crosses stdio/IPC
  and is emitted as a committable reference (`<PASSWORD>` / a Test Profile name).
- The pipeline (`RecorderService` → `LocatorService` → `StepMatcherService`) is
  **deterministic-first**; AI (`RecorderAiMatcher`) is behind `AppSettings.recorderAiEnabled`
  (off by default), validated, and never auto-accepted.
- **Tests never launch a real browser** (Constitution III): CI uses
  `FakeRecorderAdapter` replaying checked-in NDJSON; the real adapter has a
  manual/opt-in harness. All serializable types live in
  `@suisui/shared/src/types/recorder.ts`; the renderer uses `window.api.recorder`
  - `useRecorderStore`, inserting via the `scenario` store.

See [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md), [doc/SERVICES.md](doc/SERVICES.md)
(`electron/services/recorder/`), [doc/IPC_TYPES.md](doc/IPC_TYPES.md)
(`recorder:*`), and [doc/FRONTEND.md](doc/FRONTEND.md) (`useRecorderStore` +
recorder components).

## Active Technologies

- TypeScript 5.x (strict) on Node.js 21.x (repo/tests use 22; recorder child uses the app's embedded Node 22.13.1) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x. **No new bundled dependency** — the recorder drives the **workspace's** Playwright (`>=1.49 <1.61` supported) via the app's existing embedded Node; reuses `@suisui/step-catalog` (feature 006), `RunnerService`/`NodeService` infra (feature 002), the AI provider seam (feature 005), and the `safeStorage`/`.app/` pattern (feature 003, via #98 for credentials) (007-native-recorder)
- In-memory session state (main `RecorderService` + renderer `recorder` store). No new persisted store: secrets are redacted (never stored); provenance stays in the renderer/optional `.app/` sidecar (deferred); source locations come from the catalog (007-native-recorder)

- TypeScript 5.x (strict) on Node.js 21.x (repo/tests use 22) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x; **new (main-process/engine only)**: `typescript` (Compiler API, already a dev dep) as a runtime dep of `@suisui/step-catalog`; reuses `@suisui/step-regex` pattern parsers (006-step-catalog)
- In-memory catalog in the service; on-disk JSON cache at `<workspace>/.app/cache/step-catalog.json` (git-ignored via a written `.app/.gitignore`); provider/settings unchanged (006-step-catalog)

- TypeScript 5.x (strict) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x; new (main-process only): `ai` (v6), `ollama-ai-provider-v2`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`; the OpenAI Codex CLI is driven as a subprocess (via the existing `CommandRunner` / a thin SDK if available — see research Decision 3b), no always-on HTTP dependency (005-multi-provider-ai)

- TypeScript 5.x (strict) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x; new (main-process only): `ai` (v6), `ollama-ai-provider-v2`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk` (005-multi-provider-ai)
- Encrypted API key via Electron `safeStorage` (file under `.app/`, reusing `GitCredentialsService` pattern); provider config persisted in `AppSettings` JSON via `SettingsService`; in-memory Pinia state in renderer (005-multi-provider-ai)

- TypeScript 5.x (strict mode) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x, Node.js fs/promises (004-bdd-subfolder-detection)
- In-memory workspace state + SettingsService (persisted) (004-bdd-subfolder-detection)

- TypeScript 5.x (strict mode) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x, isomorphic-git (003-github-token-auth)
- Encrypted files via Electron `safeStorage` at `<workspace>/.app/credentials.enc` (003-github-token-auth)

- TypeScript 5.x (strict mode) + Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x, Playwright, playwright-bdd (bddgen) (002-flexible-test-runner)
- JSON file via SettingsService (`~/.config/SuiSui/settings.json`), in-memory Pinia state (002-flexible-test-runner)

- TypeScript 5.x (strict mode) + Electron 33.x, isomorphic-git, memfs (testing), Vitest 2.x (001-workspace-detection)
- Local filesystem (Node.js fs/promises) (001-workspace-detection)

## Recent Changes

- 001-workspace-detection: Added TypeScript 5.x (strict mode) + Electron 33.x, isomorphic-git, memfs (testing), Vitest 2.x
