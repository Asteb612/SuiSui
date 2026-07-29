# SuiSui Backend Services Documentation

## Overview

The backend services are located in `apps/desktop/electron/services/` and handle all business logic for the application. Each service follows the singleton pattern with optional dependency injection for testing.

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      IPC Handlers                            │
│                   (electron/ipc/handlers.ts)                 │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐
│ WorkspaceService │  FeatureService │  │ StepService         │
└───────────────┘  └───────────────┘  └───────────────────────┘
        │                                         │
        │                                         ▼
        ▼                              ┌───────────────────────┐
┌───────────────┐                      │ CommandRunner         │
│ SettingsService │                     │ (Real/Fake)          │
└───────────────┘                      └───────────────────────┘
                                                  │
┌───────────────┐  ┌───────────────┐  ┌──────────┴────────────┐
│ ValidationService│ RunnerService │  │ GitService           │
└───────────────┘  └───────────────┘  └───────────────────────┘

┌────────────────────┐  ┌───────────────────────┐
│ GitWorkspaceService │  │ GithubAuthService     │
│ (isomorphic-git)   │  │ (safeStorage)         │
└────────────────────┘  └───────────────────────┘
        │
        ▼
┌────────────────────┐
│ WorkspaceMeta      │
│ (.app/workspace)   │
└────────────────────┘
```

## Services Reference

---

### CommandRunner

**Location:** `electron/services/CommandRunner.ts`

**Purpose:** Abstraction layer for executing system commands. Critical for testing without real bddgen/playwright.

**Interface:**

```typescript
interface ICommandRunner {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}
```

**Implementations:**

- `CommandRunner` - Real implementation using Node.js `spawn()`
- `FakeCommandRunner` - Test implementation with predefined responses

**Key Features:**

- Timeout handling (default 60 seconds)
- Captures stdout/stderr
- Environment variable passing
- Exit code reporting

**Usage:**

```typescript
const runner = getCommandRunner()
const result = await runner.run('npx', ['bddgen', 'export', '--format', 'json'], {
  cwd: workspacePath,
  timeout: 30000,
})
```

---

### WorkspaceService

**Location:** `electron/services/WorkspaceService.ts`

**Purpose:** Manages workspace selection and validation for bddgen projects.

**Methods:**

| Method           | Parameters | Returns                 | Description            |
| ---------------- | ---------- | ----------------------- | ---------------------- |
| `get()`          | -          | `WorkspaceInfo \| null` | Get current workspace  |
| `set(path)`      | `string`   | `void`                  | Set workspace path     |
| `validate(path)` | `string`   | `WorkspaceValidation`   | Validate a path        |
| `select()`       | -          | `WorkspaceInfo \| null` | Open dialog and select |

**Validation Checks:**

1. Directory exists
2. Contains `package.json`
3. Contains `features/` subdirectory

**Integration:**

- Persists workspace path via `SettingsService`
- Tracks recent workspaces (last 10)

---

### FeatureService

**Location:** `electron/services/FeatureService.ts`

**Purpose:** CRUD operations for `.feature` files in the workspace.

**Methods:**

| Method                 | Parameters       | Returns         | Description            |
| ---------------------- | ---------------- | --------------- | ---------------------- |
| `list()`               | -                | `FeatureFile[]` | List all feature files |
| `read(path)`           | `string`         | `string`        | Read feature content   |
| `write(path, content)` | `string, string` | `void`          | Write feature file     |
| `delete(path)`         | `string`         | `void`          | Delete feature file    |

**Security:**

- Path normalization to prevent directory traversal attacks
- All paths are relative to `features/` directory
- Creates parent directories as needed

**Example:**

```typescript
const service = getFeatureService()
const features = await service.list()
// Returns: [{ name: 'login.feature', path: 'login.feature', ... }]

await service.write('auth/login.feature', gherkinContent)
```

---

### StepService

**Location:** `electron/services/StepService.ts`

**Purpose:** Export and cache step definitions from bddgen projects.

**Methods:**

| Method            | Parameters | Returns                    | Description              |
| ----------------- | ---------- | -------------------------- | ------------------------ |
| `export()`        | -          | `StepExportResult`         | Export steps from bddgen |
| `getCached()`     | -          | `StepDefinition[] \| null` | Get cached steps         |
| `getDecorators()` | -          | `DecoratorDefinition[]`    | Get decorator info       |
| `clearCache()`    | -          | `void`                     | Clear step cache         |

**Step Export Flow:**

1. Execute `npx bddgen export --format json`
2. Parse JSON output
3. Extract step definitions with patterns
4. Parse argument types from patterns (e.g., `{string}`, `{int:seconds}`)
5. Generate unique step IDs via hashing
6. Cache results in memory

**Generic Steps:**
The service combines project steps with 10 built-in generic steps from `@suisui/shared`:

- Given: "I am on the {string} page", "I am logged in as {string}"
- When: "I click on {string}", "I fill {string} with {string}", etc.
- Then: "I should see {string}", "the URL should contain {string}", etc.

---

### ValidationService

**Location:** `electron/services/ValidationService.ts`

**Purpose:** Validates scenarios before test execution.

**Methods:**

| Method               | Parameters | Returns            | Description       |
| -------------------- | ---------- | ------------------ | ----------------- |
| `validate(scenario)` | `Scenario` | `ValidationResult` | Validate scenario |

**Validation Rules:**

| Rule                   | Severity | Description                           |
| ---------------------- | -------- | ------------------------------------- |
| Scenario name required | error    | Must have non-empty name              |
| At least one step      | error    | Must have at least one step           |
| Arguments filled       | error    | All args must have values             |
| Type validation        | error    | int/float must be valid numbers       |
| Step pattern match     | warning  | Step should match exported definition |
| Starts with Given      | warning  | Should start with Given step          |
| Has Then assertion     | warning  | Should have Then step for assertions  |
| Ambiguous step match   | warning  | Multiple patterns match same step     |

**Pattern Matching:**
Converts Cucumber expressions and regex patterns to JavaScript RegExp for matching:

| Cucumber Expression | Matches                        | Regex Pattern             |
| ------------------- | ------------------------------ | ------------------------- |
| `{string}`          | `"quoted"`, `'quoted'`, `word` | `("[^"]*"\|'[^']*'\|\S+)` |
| `{int}`             | `123`                          | `(\d+)`                   |
| `{float}`           | `3.14`                         | `(\d+\.?\d*)`             |
| `{any}`             | any word                       | `(.*)`                    |
| `(a\|b\|c)`         | enum values                    | `(a\|b\|c)`               |

```typescript
// Pattern: "I am logged in as {string}"
// Matches: "I am logged in as admin"
// Matches: "I am logged in as "admin""
// Matches: "I am logged in as 'admin'"

// Pattern: "I am logged in as (admin|user|guest)"
// Matches only: admin, user, or guest
```

**Important:** The pattern conversion uses placeholder markers to preserve Cucumber expressions during regex escaping, ensuring special characters in the pattern text are properly handled.

---

### RunnerService

**Location:** `electron/services/RunnerService.ts`

**Purpose:** Execute Playwright tests in headless or UI mode.

**Methods:**

| Method                 | Parameters   | Returns     | Description            |
| ---------------------- | ------------ | ----------- | ---------------------- |
| `runHeadless(options)` | `RunOptions` | `RunResult` | Run tests headlessly   |
| `runUI(options)`       | `RunOptions` | `RunResult` | Run with Playwright UI |
| `stop()`               | -            | `void`      | Stop running tests     |

**Run Options:**

```typescript
interface RunOptions {
  featurePath?: string // Filter by feature file
  scenarioName?: string // Filter by scenario name (--grep)
}
```

**Run Result:**

```typescript
interface RunResult {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'error'
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  reportPath?: string
}
```

**Commands Executed:**

- Headless: `npx playwright test [--grep "scenarioName"]`
- UI: `npx playwright test --ui [--grep "scenarioName"]`

---

### GitService

**Location:** `electron/services/GitService.ts`

**Purpose:** Git repository operations using system `git` binary. Handles both local-only repos and repos with remotes.

**Methods:**

| Method                | Parameters | Returns              | Description           |
| --------------------- | ---------- | -------------------- | --------------------- |
| `status()`            | -          | `GitStatusResult`    | Get repository status |
| `pull()`              | -          | `GitOperationResult` | Pull from remote      |
| `commitPush(message)` | `string`   | `GitOperationResult` | Stage, commit, push   |

**Git Status Result:**

```typescript
interface GitStatusResult {
  status: 'clean' | 'dirty' | 'untracked' | 'error'
  branch: string
  ahead: number
  behind: number
  modified: string[]
  untracked: string[]
  staged: string[]
  hasRemote: boolean // Whether an origin remote is configured
}
```

**Remote Detection:**
The service checks for a remote origin via `git remote get-url origin`. When no remote exists:

- `hasRemote` is `false`
- `ahead`/`behind` are both `0`
- `pull()` returns a success message ("No remote configured")
- `commitPush()` commits locally without attempting to push

**Commit & Push Flow:**

1. `git add -A` - Stages all changes
2. `git commit -m "message"`
3. If remote exists: `git push origin <current-branch>` (push failure is non-fatal)

---

### GitWorkspaceService

**Location:** `electron/services/GitWorkspaceService.ts`

**Purpose:** Pure JavaScript git operations using `isomorphic-git`. Used for GitHub-connected workspaces (clone, pull, push) without requiring system git.

**Methods:**

| Method                          | Parameters                          | Returns                 | Description                       |
| ------------------------------- | ----------------------------------- | ----------------------- | --------------------------------- |
| `cloneOrOpen(params)`           | `GitWorkspaceParams`                | `WorkspaceMetadata`     | Clone repo or open existing       |
| `pull(localPath, token)`        | `string, string`                    | `PullResult`            | Fetch + fast-forward merge        |
| `getStatus(localPath)`          | `string`                            | `WorkspaceStatusResult` | Status matrix with glob filtering |
| `commitAndPush(localPath, ...)` | `string, string, CommitPushOptions` | `CommitPushResult`      | Stage, commit, push               |

**Key Features:**

- Auth via `onAuth` callback: `{ username: 'x-access-token', password: token }`
- All operations wrapped in file-based lock via `WorkspaceMeta`
- Status filtering: only reports files matching `features/**/*.feature`, `**/steps/**/*.{ts,js}`, `playwright/**`
- Error mapping: HTTP 401/403 → `GitAuthError`, 404 → `WorkspaceNotFoundError`

---

### GithubAuthService

**Location:** `electron/services/GithubAuthService.ts`

**Purpose:** GitHub authentication and API operations. Manages token storage using Electron's `safeStorage` API.

**Methods:**

| Method                 | Parameters | Returns                | Description                       |
| ---------------------- | ---------- | ---------------------- | --------------------------------- |
| `saveToken(token)`     | `string`   | `void`                 | Encrypt and store token           |
| `getToken()`           | -          | `string \| null`       | Retrieve stored token             |
| `deleteToken()`        | -          | `void`                 | Delete stored token               |
| `validateToken(token)` | `string`   | `GithubUser`           | Validate token against GitHub API |
| `deviceFlowStart()`    | -          | `DeviceFlowResponse`   | Start device flow OAuth           |
| `deviceFlowPoll(code)` | `string`   | `DeviceFlowPollResult` | Poll for device flow completion   |
| `getUser(token)`       | `string`   | `GithubUser`           | Get authenticated user info       |
| `listRepos(token)`     | `string`   | `GithubRepo[]`         | List user's repositories          |

**Token Storage:**

- Encrypted using `safeStorage.encryptString()` (OS-level encryption via DPAPI/Keychain/libsecret)
- Stored as binary file at `{userData}/github-token.enc`

---

### WorkspaceMeta

**Location:** `electron/services/WorkspaceMeta.ts`

**Purpose:** Manages workspace metadata and file-based locking for git operations.

**Functions:**

| Function                      | Parameters                  | Returns                     | Description                  |
| ----------------------------- | --------------------------- | --------------------------- | ---------------------------- |
| `readMeta(localPath)`         | `string`                    | `WorkspaceMetadata \| null` | Read `.app/workspace.json`   |
| `writeMeta(localPath, meta)`  | `string, WorkspaceMetadata` | `void`                      | Write `.app/workspace.json`  |
| `withWorkspaceLock(path, fn)` | `string, () => T`           | `T`                         | Execute with file-based lock |

**Lock Mechanism:**

- Creates `{localPath}/.app/lock` file with PID
- Stale lock detection (30s timeout)
- Automatic cleanup on completion

---

### SettingsService

**Location:** `electron/services/SettingsService.ts`

**Purpose:** Persistent application settings storage.

**Methods:**

| Method          | Parameters             | Returns       | Description       |
| --------------- | ---------------------- | ------------- | ----------------- |
| `get()`         | -                      | `AppSettings` | Get all settings  |
| `set(settings)` | `Partial<AppSettings>` | `void`        | Update settings   |
| `reset()`       | -                      | `void`        | Reset to defaults |

**Settings Schema:**

```typescript
interface AppSettings {
  workspacePath: string | null
  recentWorkspaces: string[] // Last 10
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  autoSave: boolean
  showLineNumbers: boolean
}
```

**Storage Location:**

- Uses Electron's `app.getPath('userData')`
- Stored as JSON file: `settings.json`

---

## Testing Services

All services support testing via dependency injection:

```typescript
// Production
const stepService = new StepService()

// Testing
const fakeRunner = new FakeCommandRunner()
fakeRunner.setResponse('npx', { code: 0, stdout: '[]', stderr: '' })
const stepService = new StepService(fakeRunner)
```

See [TESTING.md](./TESTING.md) for detailed testing documentation.

## Adding a New Service

1. Create service class in `electron/services/`
2. Implement singleton pattern with getter function
3. Add IPC channels in `@suisui/shared/src/ipc/channels.ts`
4. Add API methods in `@suisui/shared/src/ipc/api.ts`
5. Register handlers in `electron/ipc/handlers.ts`
6. Expose API in `electron/preload.ts`
7. Write unit tests in `electron/__tests__/`

## AI Services (`electron/services/ai/`)

The AI assistant lives entirely in the main process behind the `IAIProvider` seam
(mirroring `ICommandRunner`). Secrets never reach the renderer.

| File                            | Responsibility                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IAIProvider.ts`                | The seam: `status()` (detect / test-connection) + `stream(req)` (async iterable of text deltas).                                                                                                                                                                                                                    |
| `AIService.ts`                  | Singleton + DI. Resolves the active `AIProviderConfig` → concrete provider, builds the per-use-case prompt (`scenario` / `step-match` / `arg-fill` / `failure-explain`), exposes `status(target?)` and `stream(req)`. `status(target)` builds a **transient** provider to probe without persisting config (FR-021). |
| `VercelAIProvider.ts`           | Ollama + OpenAI-compatible (BYOK) via the Vercel AI SDK `streamText`; Ollama detection via `GET /api/tags`.                                                                                                                                                                                                         |
| `ClaudeSubscriptionProvider.ts` | Claude CLI (subscription) via `@anthropic-ai/claude-agent-sdk` with a sanitized env (no `ANTHROPIC_API_KEY`…). Best-effort.                                                                                                                                                                                         |
| `OpenAiCodexProvider.ts`        | Codex CLI via `codex exec --json` with a sanitized env (no `OPENAI_API_KEY`/`CODEX_API_KEY`). Best-effort.                                                                                                                                                                                                          |
| `FakeAIProvider.ts`             | Test double: scripted chunks, configurable status, simulated abort/error. Never touches a real model.                                                                                                                                                                                                               |
| `AICredentialsService.ts`       | Singleton + DI. Encrypts the BYOK API key via Electron `safeStorage` (modeled on `GitCredentialsService`); `getKey()` is main-only.                                                                                                                                                                                 |

**The LLM is a draft generator only** — `AIService` never mutates a scenario;
generated Gherkin is validated by `ValidationService` in the renderer before accept.

**Testing**: provider unit tests use `FakeCommandRunner` / mocked SDKs (`ai/test`); the
two CLI providers additionally have an integration test against **fake-CLI executable
stubs** (`__tests__/fixtures/fake-cli/`) that exercises the real spawn → JSONL-parse →
env-sanitization → kill-on-cancel path (SC-008). See TESTING.md.

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall architecture
- [IPC_TYPES.md](./IPC_TYPES.md) - IPC channels and types
- [TESTING.md](./TESTING.md) - Testing strategies

## StepCatalogService (feature 006-step-catalog)

`electron/services/StepCatalogService.ts` — singleton + DI, delegating to the
`@suisui/step-catalog` engine. Replaces `StepService` (text export) as the
primary step source; the legacy service remains as a fallback.

```ts
class StepCatalogService {
  generate(options?: GenerateCatalogOptions): Promise<StepCatalogResult>
  getCached(): Promise<StepCatalogResult | null> // in-memory, then on-disk cache
  clearCache(): Promise<void> // drops memory + deletes cache file
  getStepById(id: string): CatalogStep | undefined
  findMatchingSteps(text: string, keyword?: CatalogStepKeyword): CatalogStep[]
}
```

- Injectable deps: `generate` (engine), `getWorkspacePath`, `resolveConfigPath`
  — so tests run over in-memory/temp-dir fixtures with no CLI (Constitution III).
- The engine reads step files from the workspace resolved by `WorkspaceService`;
  the renderer never supplies paths.

## Recorder services (`electron/services/recorder/`, feature 007-native-recorder)

Main-process only, singleton + DI (Constitution IV). Serializable types live in
`@suisui/shared/src/types/recorder.ts`.

- **RecorderService** — session lifecycle + child-process management; normalizes
  raw adapter events into `RecordedAction`s pushed over streaming IPC; runs
  locator scoring, deterministic step matching, secret redaction, and the
  optional AI stage. Injectable `adapter` / `matcher` / `locator` / `aiMatcher` /
  `loadCatalogSteps` / `loadLocatorSettings`.
- **IRecorderAdapter** seam — `PlaywrightRecorderAdapter` (real; spawns the
  embedded-Node child driving workspace Playwright) and `FakeRecorderAdapter`
  (tests replay NDJSON; Constitution III).
- **LocatorService** — pure candidate scoring + generated-value detection
  (`contracts/locator-scoring.md`).
- **StepMatcherService** — deterministic recorded-action → generic-step matching
  (`genericStepRecorderMap`).
- **AssertionSuggestionService** — pure before/after page-diff → optional suggestions.
- **RecorderAiMatcher** — flag-gated AI stage; `validateAiSuggestion` (validate +
  confidence gate); `NullRecorderAiMatcher` default (AI off).
- **secretDetection** — sensitive-field classification + `secretReferenceName`.
- **recorderErrors** — `RECORDER_ERROR_INFO` message/recovery catalog (SC-008).
- **EditorService** (`electron/services/EditorService.ts`) — opens a step's
  source at its line (VS Code URL, OS fallback; traversal-guarded).

## Update services (`electron/services/update/`, feature 008-auto-update)

Self-update, deterministic-first and behind a seam (Constitution III).

- **`UpdateService`** — singleton + DI orchestrator. Owns the `UpdateState` machine,
  maps raw adapter events → serializable `@suisui/shared` types, classifies errors,
  persists preferences via a `UpdateSettingsPort` (satisfied by `SettingsService`), and
  enforces "no autonomous install" (`quitAndInstall` runs only from a public method).
  Imports **no** electron/electron-updater, so it is fully unit-testable.
  Key methods: `check()`, `download()`, `quitAndInstall()`, `getState()`,
  `get/setPreferences()`, `init()` (powers "what's new"), `checkOnStartup()`,
  `setEmitter()`.
- **`IUpdaterAdapter`** — the single seam over `electron-updater`
  (`setHandlers`/`checkForUpdates`/`downloadUpdate`/`quitAndInstall`).
- **`ElectronUpdaterAdapter`** — real impl; **lazily** imports `electron-updater`
  (so importing the module never loads it under Vitest). Sets `autoDownload=false`
  (the service decides) and `autoInstallOnAppQuit=true`. Excluded from unit coverage.
- **`FakeUpdaterAdapter`** — scripted test double (`none`/`available`/`error`),
  records `quitAndInstall` calls.
- **`capability.ts`** — pure `computeCapability(platform, isPackaged, appImage)`.
- **`getUpdateService.ts`** — the only place wiring electron + the real adapter +
  `computeCapability`; `setUpdaterAdapter()` lets E2E inject a fake (like `setCommandRunner`).

Wiring: `main.ts` sets the emitter (broadcasts `UpdateState` to all windows) and calls
`init().then(checkOnStartup)`; `handlers.ts` registers the `update:*` invoke handlers
(a `FakeUpdaterAdapter` + dev capability in test mode).

## Search index service (`SearchIndexService`, feature 009-global-search)

Powers the header Ctrl/Cmd+K search over **feature-file names, feature names,
scenario names, and tags**. Step text is deliberately not indexed.

- **`SearchIndexService`** (`electron/services/SearchIndexService.ts`) builds a flat
  in-memory `SearchIndexRow[]` when a workspace opens, scanning `.feature` files with
  `parseFeatureOutline()` from `@suisui/shared` (a names-and-tags line scanner, _not_ a
  Gherkin parser — it never throws, so one malformed file cannot take down the index).
  Normalized text is precomputed at index time; queries are a linear scan, which is
  microseconds at workspace scale (~2,200 rows).
- **Freshness**: a `byFile` map lets a watcher event re-index a single file. Incremental
  updates deliberately do **not** flip `state` back to `'building'` — they complete in
  milliseconds and surfacing them would only flicker the UI.
- **`IFileWatcher`** (`electron/services/FileWatcher.ts`) is the seam over
  `fs.watch(dir, { recursive: true })`, debounced/coalesced at 250 ms. `NodeFileWatcher`
  is the production adapter; `FakeFileWatcher` (in `electron/__tests__/fakes/`) drives
  change events synchronously so freshness tests never sleep (Constitution III).
  Recursive watching is best-effort — correctness never depends on it: workspace open
  rebuilds from scratch, and a watcher error triggers one full rescan rather than a crash.
- **No persistence.** The index is session-scoped and rebuilt on workspace open, so there
  is no stale-cache-across-restarts failure mode (unlike `StepCatalogService`, whose
  on-disk cache exists because AST analysis is expensive).
- **DI**: the constructor takes an optional `IFileWatcher` and an `IWorkspaceLocator`
  (the narrow slice of `WorkspaceService` it needs), per Principle IV.

The workspace root always comes from `WorkspaceService`, never the renderer; results carry
relative paths only.

## Tag service (`TagService`, feature 010-tag-management)

Workspace-wide tag index plus the only bulk write path in the app.

- **Index**: scans `.feature` files with `parseFeatureOutline` and keeps
  feature-level inheritance **explicit** — `parseFeatureMetadata` (used by the run
  view) flattens it and so cannot answer "is this tag removable here?". A scenario
  carrying a tag both directly and by inheritance yields one usage, `origin: 'direct'`.
- **Freshness**: reuses the `IFileWatcher` seam. Wired to `WORKSPACE_GET` as well as
  SET/SELECT/INIT, so a workspace restored from settings is indexed too.
- **`applyBulk`** adds/removes one tag across many scenarios. Three properties make it
  safe enough to ship without an undo stack:
  1. **Line splices only** (`@suisui/shared/tags/tagSplice`) — nothing but the tag line
     changes. Never reuse `scenarioStore.toGherkin()`: it regenerates whole files,
     dropping comments and reformatting steps.
  2. **Bottom-up within each file** — an inserted tag line shifts every position below
     it, so targets are applied in descending `scenarioIndex` order. Top-down would
     silently tag the wrong scenarios.
  3. **Re-parse after write** — every modified file is re-read and re-parsed; one that
     no longer parses is reported `failed` rather than left corrupted.
- **Partial failure** is reported per target (`changed`/`unchanged`/`skipped`/`failed`),
  with **no rollback** — git is the recovery path.
- Content is split on `/\n/`, **not** `/\r?\n/`: the latter consumes `\r`, so rejoining
  would rewrite every line of a CRLF file.

## Live run progress (feature 011-live-run-progress)

Streams per-step execution state out of a running Playwright process so the UI can
show steps going running → passed/failed/skipped while the run is still in flight.

### Reporter provisioning (`RunnerService`)

`provisionProgressReporter(workspacePath)` copies
`electron/assets/suisui-progress-reporter.cjs` to `<workspace>/.app/` before every run
and returns its absolute path, which is appended to the existing
`--reporter=list,json,html` chain.

The reporter runs inside the **workspace's** Playwright, not the app, so it is plain
dependency-free CommonJS with no build step. It is rewritten on every run, so an app
upgrade can never leave a stale copy behind.

**It must never be able to break a test run.** Every callback body is wrapped; a failed
stdout write is swallowed; and if the file cannot be written at all,
`provisionProgressReporter` returns `null`, the reporter is simply omitted from the
chain, and the run proceeds exactly as it did before this feature existed (FR-019).

### The stdout split (`handlers.ts`)

The reporter emits one `@@SUISUI_PROGRESS@@`-prefixed NDJSON line per event. The
`RUNNER_RUN_BATCH` handler runs each complete line through `parseProgressLine`:

- parsed → pushed on `runner:progress` and **`continue`** — it must never reach the log
- otherwise → forwarded to the log unchanged

Only a line **starting** with the sentinel counts, so ordinary test output that merely
mentions it is neither swallowed from the log nor able to forge an event.

### Counting what will run

`ScenarioTestInfo.testCount` is how many **tests** an authored scenario produces: the
number of `Examples` rows for a `Scenario Outline`, 1 for a plain `Scenario`. One outline
stays **one** entry — that is the unit the name and tag filters work on — but Playwright
runs one test per row, so `matchedTests.scenarioCount` sums `testCount` rather than
counting entries. Counting entries under-reported every outline in the workspace.

`parseFeatureMetadata` counts example rows by tracking the current outline: the first
row after `Examples:` is the column header and is not a test, a second `Examples:` block
adds to the same outline, and any other block keyword ends the table — so a step data
table or a `Background` below an outline is not miscounted. Doc strings are skipped
wholesale, since a line in one can look like anything.

The count still covers **Gherkin only**. Plain `*.spec.ts` projects in the same
Playwright config also run, and the filters do not govern them.

### Two kinds of test in one run

A Playwright config can run plain `*.spec.ts` projects alongside the bdd one, and
`test.location.file` for those is an absolute path to the spec. Deriving a feature path
from it produced a mangled relative-looking path (`home/me/project/tests/…/forms`),
which named a file the user has no feature for and made `features:read` throw in the
main process on **every** event.

`testStart` therefore carries two locators:

- `relativePath` — the `.feature`, **empty** when the test is not Gherkin
- `specPath` — the source file relative to Playwright's `rootDir`, set **only** for
  non-Gherkin tests (a Gherkin test's source file is the generated spec, which is
  nowhere to send anyone; its `.feature` is the locator)

Step events are still dropped for non-Gherkin tests: there is no authored Gherkin list
to show them against. The renderer lists them in their own group so a failure there is
visible under the file it is written in.

Two guards cover snapshots written before this: `ensureAuthoredSteps` refuses a path
that is not a `.feature`, and `restoreLastRun` drops scenarios that name neither a
feature nor a source file rather than restoring rows a run today would never produce.

### Step→scenario mapping

playwright-bdd reports step locations against the **generated spec**, not the
`.feature` file, so steps are matched by **ordinal** and verified by **title**. The
title comparison is `stepTitleMatches()`, not equality: a `Scenario Outline` is authored
with `<placeholders>` and reported with them substituted, so equality would silently
drop every step of every outline row. On a genuine mismatch the update is **dropped** —
a status on the wrong step is worse than no status at all.

### Testing without running Playwright

Constitution III forbids launching a real browser. The reporter is instead covered by a
**real capture** of its output, replayed through the real parser and reducer — see
`electron/__tests__/progressReplay.test.ts` and `__tests__/fixtures/README.md`, which
documents how the capture was produced and what it establishes.

E2E uses the same capture: with `APP_TEST_MODE=1` and `TEST_RUN_PROGRESS_FIXTURE` set,
`runBatch` replays the file through the ordinary stdout path instead of spawning
Playwright, so parser, IPC, store and UI are all production code.

## Playwright browser detection (`playwrightBrowsers.ts`)

SuiSui drives the **workspace's** Playwright, so browsers are a per-workspace concern:
two workspaces on different Playwright versions need different browser builds, and
having run tests once elsewhere proves nothing.

Each Playwright version pins an exact browser build revision, so **upgrading Playwright
silently invalidates the installed browsers** — an ordinary npm bump leaves the app
unable to run anything. Without a check, the first sign is Playwright's own
`Executable doesn't exist at …/chromium-1223/chrome-linux64/chrome` in the middle of a
run log, which reads as a broken test rather than a one-command setup step.

`checkBrowsers(workspacePath)` reads the pinned revisions from the workspace's own
`node_modules/playwright-core/browsers.json` and checks whether each build exists under
the Playwright browsers root. It is a pure filesystem check — no subprocess — so it is
cheap enough to run before every run.

`RunnerService.ensureBrowsers()` calls it after the npm dependency install and, when
builds are missing, announces them on the run log and installs them with the
workspace's own Playwright CLI. The download is hundreds of megabytes, hence its own
generous timeout and the up-front message: a run that appears to hang for minutes with
no explanation is worse than a slow one the user understands.

**Two traps, both covered by tests:**

- The on-disk directory name is **not** the manifest name — dashes become underscores,
  so `chromium-headless-shell` lives in `chromium_headless_shell-1223`. Comparing
  against the manifest name reports an installed browser as missing forever and
  re-downloads it before every run.
- `-tip-of-tree` channels appear in the manifest but a plain `playwright install` never
  downloads them, so treating them as required demands an install that never satisfies.

Anything the check cannot determine — no `playwright-core` in the workspace, or
`PLAYWRIGHT_BROWSERS_PATH=0` (Playwright manages the layout itself) — reports
`needsInstall: false` with a reason. A detection gap must never stop someone running
their tests.
