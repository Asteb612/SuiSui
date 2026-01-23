# MVP Plan (Electron + Nuxt + PrimeVue) with GitHub login, fully local tests and mocked GitHub

## Testing constraints (your requirements)

* Tests must cover **application code + UI only**
* No need to test **bddgen** nor **playwright** (so **command execution must be mocked**)
* GitHub connection included, but **GitHub is mocked** (no real login)

---

# Phase 0 — Technical decisions (½ day)

## Stack

* **Electron** (Node main process)
* **Nuxt** (renderer, SPA) + **PrimeVue**
* **IPC** (renderer ↔ main) via `ipcRenderer.invoke` / `ipcMain.handle`
* Settings + token storage: JSON file + **OS keychain** via `keytar` (recommended)

## GitHub Auth

* **Device Flow** (suited for desktop/headless apps)
* On GitHub side, **Enable Device Flow** in the app configuration (OAuth App or GitHub App)

---

# Phase 1 — Project skeleton (½–1 day)

## 1.1 Simple monorepo

```
apps/
  desktop/
    electron/        (main)
    renderer/        (nuxt + primevue)
packages/
  shared/            (types + IPC contracts)
```

## 1.2 Electron

* `main.ts`: create window + load Nuxt (dev server) or built files
* Enable `contextIsolation: true` + preload

## 1.3 Preload (stable API)

Expose a single object:

```ts
window.api = {
  workspace: { get, set },
  features: { list, read, write },
  steps: { export },
  validate: { scenario },
  runner: { runHeadless, runUI },
  git: { pull, commitPush, status },
  github: { startDeviceFlow, pollDeviceFlow, logout, status }
}
```

---

# Phase 2 — Application core in main process (1 day)

Goal: build testable and mockable services.

## 2.1 CommandRunner service (key abstraction)

This allows not testing bddgen/playwright/git directly.

* `exec(cmd, args, cwd, env)` → `{ code, stdout, stderr }`
* Prod: real `child_process`
* Tests: fake runner returning predefined outputs

## 2.2 WorkspaceService

* Store `workspacePath` in internal settings
* Validate presence of `package.json`, `features/`, etc.

## 2.3 FeatureService

* `list()` → `features/**/*.feature`
* `read(path)` / `write(path, content)`
* Security: relative paths only, whitelist under `features/`

## 2.4 StepService

* `exportSteps()` via `CommandRunner.exec("npx", ["bddgen","export"])`
* Minimal parsing: steps list + patterns
* In-memory cache + “refresh” button

## 2.5 ValidationService (simple, non-blocking)

* Input: scenario JSON (builder) or generated Gherkin
* Checks:

  * required args present
  * ambiguities (multiple patterns match)
  * missing steps (no match)

## 2.6 RunnerService (mockable)

* `runHeadless()` → `npx playwright test ...`
* `runUI()` → `npx playwright test --ui ...`
* MVP: do not parse Playwright results; only status + logs + report paths

## 2.7 GitService

Two modes:

* **Real mode**: `git pull`, `git status`, `git add`, `git commit`, `git push`
* **Mock mode** for tests (via CommandRunner)

---

# Phase 3 — GitHub Auth (Device Flow) in main process (½–1 day)

## 3.1 GithubAuthService

* `startDeviceFlow()` → POST to GitHub → returns `user_code`, `verification_uri`, `device_code`, `interval`
* `pollDeviceFlow(device_code)` → loop/polling controlled by UI

## 3.2 Token storage

* Store `access_token` in OS keychain via `keytar`
* In settings: only `connected=true` + optional user info

## 3.3 Git integration

* Use HTTPS + token (not SSH)
* MVP: token may only be used for API or later git auth integration
* For now: Git local may still rely on system credentials

---

# Phase 4 — Nuxt + PrimeVue UI (single page) (1–2 days)

## Single screen layout

### Left column

* Workspace selector
* Features list
* Buttons “Pull / Commit+Push”

### Center (Builder)

* Scenario name
* Given/When/Then rows:

  * Step dropdown (from `bddgen export`)
  * Auto-generated arg fields
  * Add/remove/reorder buttons
* Gherkin preview (read-only, optional)

### Right column

* Validation (warnings)
* Run Headless / Run UI
* Logs (scrollable area)

## UI flow

1. Select workspace
2. Load steps + features
3. Select feature → load scenario into builder (or “create new”)
4. Save → write `.feature`
5. Run → call runner service

---

# Phase 5 — Tests (100% local, GitHub mocked, no bddgen/playwright) (2–3 days)

Two test levels.

## 5.1 Unit tests (Vitest)

### What to test

* Step parser
* ValidationService
* FeatureService (with temp filesystem)
* GithubAuthService (with fetch mock)
* GitService (with CommandRunner mock)

### How to mock GitHub

* Mock HTTP via `nock` (Node) or equivalent
* Scenarios:

  * startDeviceFlow OK
  * poll: `authorization_pending`
  * poll: success (`access_token`)
  * poll: errors (`slow_down`, `expired_token`)
    No real network calls.

## 5.2 UI tests (Playwright controlling Electron)

Playwright can launch and drive Electron using `_electron.launch`.

### What you test (UI + logic)

* App launches, window visible
* Workspace selection (fixture)
* Features displayed
* Steps displayed (CommandRunner mocked)
* Builder: add step + fill args
* Save: file written (temp fixture)
* Validation warnings displayed
* Run: clicking “Run headless” calls your CommandRunner with correct args (mocked)
* Git: pull/push calls (mocked)

### Test setup

Launch app with env flags:

* `APP_TEST_MODE=1`
* `WORKSPACE_PATH=fixtures/workspace-basic`
* `MOCK_COMMANDS=1`

In test mode, main process uses `FakeCommandRunner`.

---

# Phase 6 — Packaging (after MVP)

* Use `electron-builder` or equivalent
* Ensure `keytar` is bundled correctly (Linux can be sensitive)
* Sign macOS/Windows builds if public distribution

---

## MVP Definition of Done

* Electron app (Win/Linux/macOS) with one Nuxt/PrimeVue page
* Selectable local workspace
* Feature list + step list (export mockable)
* Given/When/Then builder + `.feature` save
* Simple validation (warnings)
* Run headless/UI (mockable commands)
* GitHub Device Flow implemented and **tested via mocks**
* Test suite:

  * unit tests for services
  * UI e2e tests on Electron
