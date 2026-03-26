# IPC Contract Changes: BDD Subfolder Detection

## New: `workspace.detectBdd` Method

```typescript
workspace: {
  // ... existing methods ...
  detectBdd: (clonePath: string) => Promise<BddDetectionResult>
}
```

Scans first-level subdirectories of `clonePath` for BDD workspace indicators. Returns detected candidate paths.

## New IPC Channel

```typescript
WORKSPACE_DETECT_BDD: 'workspace:detectBdd'
```

## Modified: `WorkspaceInfo` Type

```typescript
export interface WorkspaceInfo {
  path: string
  name: string
  isValid: boolean
  hasPackageJson: boolean
  hasFeaturesDir: boolean
  hasCucumberJson: boolean
  gitRoot?: string // NEW: git repo root when different from path
}
```

## New: `BddDetectionResult` Type

```typescript
export interface BddDetectionResult {
  candidates: string[]
}
```

## Modified: Git Operation Path Resolution

All git operations that currently use `workspace.path` must check `workspace.gitRoot` first:

```typescript
// Before (in GitPanel.vue, index.vue, etc.)
const workspacePath = workspaceStore.workspace?.path

// After — for git operations only
const gitRoot = workspaceStore.workspace?.gitRoot ?? workspaceStore.workspace?.path
```

Affected IPC calls:

- `gitWorkspace.pull(gitRoot, credentials)`
- `gitWorkspace.status(gitRoot)`
- `gitWorkspace.commitAndPush(gitRoot, credentials, options)`

Feature/BDD operations continue to use `workspace.path` unchanged.
