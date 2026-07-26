# SuiSui Architecture Documentation

## Overview

**SuiSui** is a desktop application for building Behavior-Driven Development (BDD) tests using a visual interface. It integrates with [bddgen](https://github.com/nicholasgrose/bddgen) and Playwright to enable seamless creation and execution of Gherkin-based tests without manual coding.

**Version:** 0.1.0 (MVP)

## Technology Stack

| Layer              | Technology     | Version |
| ------------------ | -------------- | ------- |
| Desktop Framework  | Electron       | 33.4.11 |
| Frontend Framework | Nuxt 4 (Vue 3) | 3.15.0  |
| State Management   | Pinia          | Latest  |
| UI Components      | PrimeVue       | 4.2.0   |
| Unit Testing       | Vitest         | 2.0.0   |
| E2E Testing        | Playwright     | 1.58.0  |
| Package Manager    | pnpm           | 9.0.0+  |
| Node.js            | Node.js        | 20.0.0+ |

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

## Git & GitHub Integration

SuiSui provides two layers of git integration:

### Local Git (Default)
When a new workspace is initialized, a git repository is automatically created with:
- `git init` via `isomorphic-git` (pure JS, no system git required)
- A `.gitignore` file (excludes `node_modules/`, `dist/`, `.features-gen/`, `test-results/`, `.app/`, etc.)
- An initial commit

This allows users to commit changes locally from day one, even without a remote.

### GitHub Integration
Users can optionally connect to GitHub for remote operations:

1. **Authentication** — Two methods:
   - **Personal Access Token (PAT)** — User provides a token, validated against GitHub API
   - **Device Flow OAuth** — User authorizes via browser using a device code
2. **Clone from GitHub** — Select a repository from the user's GitHub account and clone it locally
3. **Push/Pull** — Sync changes with the remote repository

**Token Storage:** GitHub tokens are encrypted using Electron's `safeStorage` API and stored in `userData/github-token.enc`.

```

┌──────────────────────────────────────────────────────┐
│ GitHub Integration │
│ │
│ ┌─────────────┐ ┌──────────────────┐ │
│ │ GithubAuth │ │ GitWorkspace │ │
│ │ Service │ │ Service │ │
│ │ │ │ (isomorphic-git) │ │
│ │ - saveToken │ │ - cloneOrOpen │ │
│ │ - validate │ │ - pull │ │
│ │ - deviceFlow│ │ - getStatus │ │
│ │ - listRepos │ │ - commitAndPush │ │
│ └─────────────┘ └──────────────────┘ │
│ │ │ │
│ ▼ ▼ │
│ ┌─────────────┐ ┌──────────────────┐ │
│ │ safeStorage │ │ WorkspaceMeta │ │
│ │ (encrypted) │ │ (.app/workspace │ │
│ └─────────────┘ │ .json + lock) │ │
│ └──────────────────┘ │
└──────────────────────────────────────────────────────┘

```

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

| Feature           | Status         | Description                    |
| ----------------- | -------------- | ------------------------------ |
| Context Isolation | ✅ Enabled     | Renderer cannot access Node.js |
| Node Integration  | ❌ Disabled    | No direct Node.js in renderer  |
| Preload Script    | ✅ Required    | Single entry point for API     |
| Path Validation   | ✅ Implemented | Prevents directory traversal   |
| IPC Typing        | ✅ Enforced    | Type-safe communication        |

## Key Design Patterns

### 1. Service Singleton Pattern

Each service uses a factory function for lazy initialization:

```typescript
let instance: WorkspaceService | null = null

export function getWorkspaceService(): WorkspaceService {
  if (!instance) {
    instance = new WorkspaceService()
  }
  return instance
}
```

### 2. Dependency Injection for Testing

Services accept optional dependencies for testability:

```typescript
class StepService {
  constructor(private commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
  }
}
```

### 3. Command Abstraction

Real and fake implementations for CLI command execution:

```typescript
interface ICommandRunner {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}
```

### 4. Typed IPC Communication

All channels and payloads are strongly typed:

```typescript
// Shared package defines contracts
export const IPC_CHANNELS = {
  WORKSPACE_GET: 'workspace:get',
  // ...
} as const
```

## Module Boundaries

| Module              | Responsibility               | Dependencies                     |
| ------------------- | ---------------------------- | -------------------------------- |
| `@suisui/shared`    | Types, interfaces, constants | None                             |
| `electron/services` | Business logic               | `@suisui/shared`, Node.js APIs   |
| `electron/ipc`      | Request handling             | Services, `@suisui/shared`       |
| `app/stores`        | UI state management          | `@suisui/shared`, API composable |
| `app/components`    | UI rendering                 | Stores, PrimeVue                 |

## File Naming Conventions

| Type          | Pattern        | Example                     |
| ------------- | -------------- | --------------------------- |
| Vue Component | PascalCase.vue | `ScenarioBuilder.vue`       |
| Pinia Store   | camelCase.ts   | `useWorkspaceStore.ts`      |
| Service       | PascalCase.ts  | `WorkspaceService.ts`       |
| Types         | camelCase.ts   | `workspace.ts`              |
| Tests         | \*.test.ts     | `ValidationService.test.ts` |
| E2E Tests     | \*.spec.ts     | `app.spec.ts`               |

## AI Assistant (multi-provider) — security & billing model

The optional AI assistant runs **entirely in the main process** behind the
`IAIProvider` seam; credentials never reach the renderer. It is a **draft
generator only** — generated Gherkin is re-run through `ValidationService` before
it can be accepted, so correctness never depends on the model. With no provider
configured, all AI entry points are hidden/disabled and the builder + runner are
unaffected.

**Four provider types** (`AIProviderType`): `ollama` (local), `openai-compatible`
(bring-your-own-key API), `openai-codex-cli`, `claude-subscription`. The three
auto-detectable ones (Ollama + the two CLIs) are **detection-gated** in the settings
UI — selectable only when detected, otherwise shown disabled with a reason and a
re-detect action; the BYOK API provider is always selectable and verified on save.

### CLI subscription providers are best-effort — and must never bill an API

Both CLI providers drive a locally-installed subscription CLI with a **sanitized
environment** so a stray API key can never be silently billed (spec FR-006):

- **Claude CLI** (`claude-subscription`, via `@anthropic-ai/claude-agent-sdk`):
  the effective env strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
  `CLAUDE_CODE_USE_BEDROCK` / `_VERTEX` / `_FOUNDRY`. **Footgun**: if
  `ANTHROPIC_API_KEY` is set in your shell, it would otherwise be billed per-token
  instead of using the subscription — the provider unsets it in the child.
- **OpenAI Codex CLI** (`openai-codex-cli`, via `codex exec --json`): the effective
  env strips `OPENAI_API_KEY` and `CODEX_API_KEY`. **Footgun**: `CODEX_API_KEY` is
  the documented way to _force_ API billing for `codex exec`; both it and
  `OPENAI_API_KEY` are unset in the child. A second risk lives outside the env: the
  `~/.codex/config.toml` `preferred_auth_method` can override auth selection — if a
  user has pinned API-key auth there, detection/streaming may still not use the
  subscription. This is documented as a known limitation.

Both are **best-effort / "may break"** (subscription-based programmatic use is
unofficial and evolving) and use a **streaming** invocation rather than a one-shot
headless mode, so they keep working if headless/print mode is later restricted to a
different plan (FR-019). Codex streaming is **message-granular** in some CLI versions
(a full `agent_message` per turn rather than token deltas), so time-to-first-token
can be coarser than the API providers. The **reliable fallback** for both is the BYOK
`openai-compatible` provider (Anthropic and OpenAI both expose OpenAI-compatible
endpoints), which bills the user's own API account explicitly.

### Graceful degradation

Provider errors (unreachable, timeout, malformed/empty output, interrupted stream)
surface as clear, non-blocking messages and never insert a partial draft; a
user-cancelled generation discards its partial output. Undetected auto-detectable
providers show a "setup required"/disabled state with an actionable reason (FR-020).

## Related Documentation

- [SERVICES.md](./SERVICES.md) - Backend services documentation
- [FRONTEND.md](./FRONTEND.md) - Frontend components and stores
- [IPC_TYPES.md](./IPC_TYPES.md) - IPC channels and shared types
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development workflow
- [TESTING.md](./TESTING.md) - Testing strategies

## Native Step Catalog (feature 006-step-catalog)

The step catalog replaces the text-based `bddgen-export.js` extraction as the
primary source of step metadata. It is a new workspace package,
`@suisui/step-catalog`, that runs **only in the main process**.

- **Static analysis, no execution**: step-definition files are parsed with the
  TypeScript Compiler API (syntactic AST; a lazy Program is reserved for future
  cross-file type resolution). Project/test code is never executed during
  catalog generation, and no undocumented `playwright-bdd` internals are used.
- **Robustness**: each file is analyzed in isolation — one unparseable file
  becomes a `FILE_PARSE_ERROR` diagnostic while every other file is still
  cataloged; a dynamic/unsupported step becomes a partial entry with diagnostics
  rather than aborting the run.
- **Provenance**: metadata is merged by a fixed precedence (defineStep →
  callback types → `step``` fragments → pattern inference → runtime → unknown),
and every step/parameter records `origin`+`precision`. Lower-precedence
  sources never overwrite higher-precedence fields; conflicts emit diagnostics.
- **Security boundary**: only the serialized, versioned `StepCatalogResult`
  crosses IPC; the renderer cannot request arbitrary file access, and the
  workspace root is always taken from `WorkspaceService`.
- **Caching**: results are cached at `<workspace>/.app/cache/step-catalog.json`
  with a fingerprint (file mtime+hash, Playwright config, package config,
  schema+engine version); a git-ignore guard is written under `.app/`.

## SuiSui-Native Recorder (feature 007-native-recorder)

Records browser interactions and converts them into editable, catalog-matched
BDD steps — never exposing Playwright's Inspector window **or its in-page overlay**.

- **Process boundary**: a killable **embedded-Node child** (`electron/scripts/recorder-adapter.js`)
  is the ONLY code touching Playwright's private `context._enableRecorder({ recorderMode:'api' })`.
  It drives the **workspace's** Playwright (version-gated `>=1.49 <1.61` behind a
  capability probe), streams actions as NDJSON, does its own DOM inspection, and
  **redacts secrets at the source** — a password value never leaves the subprocess.
  The renderer only uses `window.api.recorder` + the Pinia store; secrets never reach it.
- **Overlay replacement (research D13)**: the child suppresses Playwright's overlay
  (one CSS rule on the `x-pw-glass` host) and hosts SuiSui's own hover-highlight +
  one-shot element picker plus a floating **assertion toolbar** — the user arms an
  assertion type (visible/hidden/text/value/checked/enabled) and the next element
  they click becomes a matched assertion (text/value are auto-captured), created
  directly on the page. Capture is paused via `__pw_recorderSetMode` while the
  toolbar is used so its clicks are never recorded. The assertion crosses back as a
  `t:'assert'` NDJSON event → `onAssert` → `RecorderService` scores it and emits a
  normal assertion card. These internals are isolated in a single adapter.
- **Pipeline (main)**: `RecorderService` normalizes each raw action, scores
  locators (`LocatorService`), and matches deterministically to a catalog step
  (`StepMatcherService`). AI is an **optional, flag-gated** enrichment that is
  validated and never auto-accepted (never a dependency of basic recording).
- **Testability (Constitution III)**: everything sits behind `IRecorderAdapter`;
  CI replays checked-in NDJSON via `FakeRecorderAdapter` — no real browser/CLI.
  The real `PlaywrightRecorderAdapter` (spawns the embedded-Node child, streams
  its NDJSON) is implemented and validated by a manual/opt-in harness, never CI.
- **Insertion**: confirmed actions insert through the `scenario` store; the
  `.feature` remains the source of truth (recorder metadata is never written to Gherkin).

## Auto-update (feature 008-auto-update)

The app updates itself via **`electron-updater`** (the companion to the existing
`electron-builder`), main-process only (Principle I). Updates are published to
**public GitHub Releases** (stable channel); the release pipeline
(`.github/workflows/desktop-release.yml`) publishes artifacts + `latest*.yml` on tag.

- **Seam**: all `electron-updater` use lives behind `IUpdaterAdapter`
  (`ElectronUpdaterAdapter` real, `FakeUpdaterAdapter` for tests — Principle III).
  `UpdateService` owns a small state machine, never imports electron/electron-updater,
  and is fully unit-tested.
- **Never a forced restart** (FR-011): the service never calls `quitAndInstall`
  autonomously. Downloads happen in the background; the user applies via an explicit
  "Restart & update", and `UpdateBanner` is suppressed while a run/recording is active.
- **Verification** (FR-008): `electron-updater` verifies integrity/authenticity per
  platform; unverifiable/older updates are refused.
- **Capability**: `computeCapability(platform, isPackaged, APPIMAGE)` marks dev and
  Linux non-AppImage (deb) installs **notify-only** — they get a manual-download link
  instead of a failing self-update (FR-016).
- **Platforms**: macOS (DMG/ZIP, **requires signed + notarized** builds), Windows
  (NSIS), Linux **AppImage**. Linux `.deb` = notify-only.
- **State** crosses IPC as the serializable `UpdateState` (see IPC_TYPES.md); preferences
  persist in `AppSettings` via `SettingsService`.
