# Embedded Node.js + npm Runtime System

## Overview

Build a cross-platform system that ships a bundled portable Node.js distribution and uses it to transparently install workspace dependencies on first run.

## Architecture

```
Packaged App
├── resources/
│   ├── nodejs/                    # Bundled Node.js (NEW)
│   │   ├── linux-x64/
│   │   ├── darwin-x64/
│   │   ├── darwin-arm64/
│   │   └── win32-x64/
│   └── [existing: playwright-browsers, node_modules]

User Cache Directory                # Extracted at runtime
├── Windows: %LOCALAPPDATA%/SuiSui
├── macOS: ~/Library/Caches/SuiSui
└── Linux: ~/.cache/suisui
    ├── nodejs-v22.x.x/            # Extracted runtime
    └── runtime-info.json          # Version tracking
```

## Implementation Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Create shared types for node and dependency | Completed |
| 2 | Add IPC channels for node and deps | Completed |
| 3 | Update shared package API interface | Completed |
| 4 | Export new types from shared package | Completed |
| 5 | Create NodeService | Completed |
| 6 | Create DependencyService | Completed |
| 7 | Create download-nodejs.js build script | Completed |
| 8 | Update package.json with build config | Completed |
| 9 | Add IPC handlers for node and deps | Completed |
| 10 | Update preload.ts with new APIs | Completed |
| 11 | Export new services from index | Completed |
| 12 | Integrate dependency check in RunnerService | Completed |
| 13 | Update .gitignore for nodejs-runtime | Completed |
| 14 | Create NodeService tests | Completed |
| 15 | Create DependencyService tests | Completed |
| 16 | Rebuild shared package | Completed |

## Phase 1: Shared Types

### File: `packages/shared/src/types/node.ts` (new)
```typescript
export interface NodeRuntimeInfo {
  version: string
  extractedAt: string
  platform: NodeJS.Platform
  arch: string
  path: string
}

export interface NodeExtractionResult {
  success: boolean
  runtimeInfo?: NodeRuntimeInfo
  error?: string
}
```

### File: `packages/shared/src/types/dependency.ts` (new)
```typescript
export interface InstallState {
  lockfileHash: string      // SHA-256 of package-lock.json
  installedAt: string
  nodeVersion: string
  npmVersion: string
}

export interface DependencyStatus {
  needsInstall: boolean
  reason?: 'missing' | 'lockfile_changed'
  lastInstallState?: InstallState
}

export interface DependencyInstallResult {
  success: boolean
  duration: number
  stdout: string
  stderr: string
  error?: string
}
```

### File: `packages/shared/src/ipc/channels.ts` (modify)
- Add: `NODE_ENSURE_RUNTIME`, `NODE_GET_INFO`
- Add: `DEPS_CHECK_STATUS`, `DEPS_INSTALL`

## Phase 2: NodeService

### File: `apps/desktop/electron/services/NodeService.ts` (new)

Responsibilities:
- Get cache directory path (platform-specific)
- Get bundled runtime path (dev vs packaged)
- Extract runtime on first launch
- Track version in `runtime-info.json`
- Return paths to `node` and `npm` binaries

Key methods:
```typescript
export interface INodeService {
  ensureRuntime(): Promise<NodeExtractionResult>
  getRuntimeInfo(): Promise<NodeRuntimeInfo | null>
  getNodePath(): Promise<string | null>
  getNpmPath(): Promise<string | null>
  verifyRuntime(): Promise<boolean>
}
```

Cache directory logic:
- Windows: `process.env.LOCALAPPDATA/SuiSui`
- macOS: `~/Library/Caches/SuiSui`
- Linux: `$XDG_CACHE_HOME/suisui` or `~/.cache/suisui`

## Phase 3: DependencyService

### File: `apps/desktop/electron/services/DependencyService.ts` (new)

Responsibilities:
- Check if `node_modules/` exists
- Hash `package-lock.json` and compare with stored state
- Run `npm ci` or `npm install` using embedded Node
- Store state in `.suisui/install-state.json`

Install detection:
1. `node_modules/` missing → install
2. No `.suisui/install-state.json` → install
3. `package-lock.json` hash differs from stored → install
4. Otherwise → skip

npm execution:
```typescript
const env = {
  npm_config_fund: 'false',
  npm_config_audit: 'false',
  npm_config_update_notifier: 'false',
  PATH: path.dirname(nodePath) + path.delimiter + process.env.PATH
}

// Use npm ci if package-lock.json exists, else npm install
await commandRunner.exec(nodePath, [npmPath, hasLockfile ? 'ci' : 'install'], {
  cwd: workspacePath,
  env,
  timeout: 300000  // 5 min
})
```

## Phase 4: Build Script

### File: `apps/desktop/scripts/download-nodejs.js` (new)

Downloads Node.js v22 LTS binaries from nodejs.org:
- `node-v22.x.x-linux-x64.tar.xz`
- `node-v22.x.x-darwin-x64.tar.gz`
- `node-v22.x.x-darwin-arm64.tar.gz`
- `node-v22.x.x-win-x64.zip`

Extracts to `apps/desktop/nodejs-runtime/{platform}-{arch}/`

Options:
- `--current-only`: Only download for current platform (dev builds)
- No flag: Download all platforms (CI/release builds)

## Phase 5: Build Configuration

### File: `apps/desktop/package.json` (modify)

Add to scripts:
```json
"prebuild:nodejs": "node scripts/download-nodejs.js --current-only",
"prebuild:nodejs:all": "node scripts/download-nodejs.js"
```

Add to `build.extraResources`:
```json
{
  "from": "nodejs-runtime/${os}-${arch}",
  "to": "nodejs/${os}-${arch}",
  "filter": ["**/*"]
}
```

### File: `.gitignore` (modify)
- Add: `apps/desktop/nodejs-runtime/`

## Phase 6: IPC Handlers

### File: `apps/desktop/electron/ipc/handlers.ts` (modify)

Add handlers for:
- `NODE_ENSURE_RUNTIME` → `getNodeService().ensureRuntime()`
- `NODE_GET_INFO` → `getNodeService().getRuntimeInfo()`
- `DEPS_CHECK_STATUS` → `getDependencyService().checkStatus(workspacePath)`
- `DEPS_INSTALL` → `getDependencyService().install(workspacePath)`

### File: `apps/desktop/electron/preload.ts` (modify)

Expose new APIs:
```typescript
node: {
  ensureRuntime: () => ipcRenderer.invoke(IPC_CHANNELS.NODE_ENSURE_RUNTIME),
  getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.NODE_GET_INFO)
},
deps: {
  checkStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DEPS_CHECK_STATUS),
  install: () => ipcRenderer.invoke(IPC_CHANNELS.DEPS_INSTALL)
}
```

## Phase 7: Integration

### File: `apps/desktop/electron/services/RunnerService.ts` (modify)

Before running tests, check and install deps:
```typescript
async run(options: RunOptions): Promise<RunResult> {
  // ... existing validation

  const depService = getDependencyService()
  const status = await depService.checkStatus(workspacePath)

  if (status.needsInstall) {
    const result = await depService.install(workspacePath)
    if (!result.success) {
      return { status: 'error', stderr: result.error }
    }
  }

  // ... continue with test execution
}
```

## Phase 8: Tests

### File: `apps/desktop/electron/__tests__/NodeService.test.ts` (new)
- Test cache directory resolution for each platform
- Test extraction logic with memfs
- Test version tracking

### File: `apps/desktop/electron/__tests__/DependencyService.test.ts` (new)
- Test install detection (missing node_modules, lockfile changed)
- Test npm ci vs npm install selection
- Use FakeCommandRunner + FakeNodeService

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `packages/shared/src/types/node.ts` | NodeRuntimeInfo, NodeExtractionResult types |
| `packages/shared/src/types/dependency.ts` | InstallState, DependencyStatus types |
| `apps/desktop/electron/services/NodeService.ts` | Runtime extraction and path resolution |
| `apps/desktop/electron/services/DependencyService.ts` | npm install management |
| `apps/desktop/scripts/download-nodejs.js` | Build-time Node.js download |
| `apps/desktop/electron/__tests__/NodeService.test.ts` | Unit tests |
| `apps/desktop/electron/__tests__/DependencyService.test.ts` | Unit tests |

### Modified Files
| File | Changes |
|------|---------|
| `packages/shared/src/ipc/channels.ts` | Add NODE_* and DEPS_* channels |
| `packages/shared/src/ipc/api.ts` | Add node and deps API interfaces |
| `packages/shared/src/index.ts` | Export new types |
| `apps/desktop/package.json` | Add build scripts and extraResources |
| `apps/desktop/electron/ipc/handlers.ts` | Add IPC handlers |
| `apps/desktop/electron/preload.ts` | Expose new APIs |
| `apps/desktop/electron/services/index.ts` | Export new services |
| `apps/desktop/electron/services/RunnerService.ts` | Integrate dependency check |
| `.gitignore` | Add nodejs-runtime/ |

## Verification

1. **Build test**: Run `node scripts/download-nodejs.js --current-only` and verify Node.js extracted to `nodejs-runtime/`
2. **Unit tests**: Run `pnpm test` to verify NodeService and DependencyService
3. **Integration test**:
   - Create a fresh workspace with `npm init -y`
   - Open in SuiSui
   - Verify `node_modules/` is created automatically
   - Verify `.suisui/install-state.json` contains lockfile hash
4. **Packaged app test**: Build with `pnpm dist`, run packaged app, verify embedded Node works
