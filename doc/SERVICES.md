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

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall architecture
- [IPC_TYPES.md](./IPC_TYPES.md) - IPC channels and types
- [TESTING.md](./TESTING.md) - Testing strategies
