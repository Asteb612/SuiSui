# Data Model: BDD Subfolder Detection

## Entities

### WorkspaceInfo (Modified)

Represents the active SuiSui workspace.

| Field           | Type    | Required | Description                                                                          |
| --------------- | ------- | -------- | ------------------------------------------------------------------------------------ |
| path            | string  | Yes      | Absolute path to the BDD workspace (where features/ lives)                           |
| name            | string  | Yes      | Display name (basename of path)                                                      |
| isValid         | boolean | Yes      | Whether validation passed                                                            |
| hasPackageJson  | boolean | Yes      | package.json exists at path                                                          |
| hasFeaturesDir  | boolean | Yes      | features/ directory exists at path                                                   |
| hasCucumberJson | boolean | Yes      | cucumber.json exists at path                                                         |
| gitRoot         | string  | No       | Git repository root, if different from path. When absent, path is also the git root. |

**New field**: `gitRoot` — only populated when the BDD workspace is a subfolder of the git repository.

### BddDetectionResult (New)

Result of scanning a cloned repo for BDD workspace locations.

| Field      | Type     | Required | Description                                   |
| ---------- | -------- | -------- | --------------------------------------------- |
| candidates | string[] | Yes      | Absolute paths of detected BDD subdirectories |

**Behavior**:

- Empty array: no BDD structure found in subfolders (use repo root)
- Single entry: auto-select that path
- Multiple entries: show selection dialog

## Relationships

```
Clone Path (git root)
  ├── .app/workspace.json    (git metadata)
  ├── .app/credentials.enc   (per-workspace token from feature 003)
  └── e2e/                   (detected BDD workspace)
      ├── features/
      ├── cucumber.json
      └── package.json

WorkspaceInfo.path = "<clone-path>/e2e"
WorkspaceInfo.gitRoot = "<clone-path>"
```

## Path Resolution Rules

| Operation            | Path Used                             |
| -------------------- | ------------------------------------- |
| Git clone            | Clone target (always repo root)       |
| Git pull/push/commit | `workspace.gitRoot ?? workspace.path` |
| Git status           | `workspace.gitRoot ?? workspace.path` |
| Feature listing      | `workspace.path`                      |
| Step export          | `workspace.path`                      |
| Test execution       | `workspace.path`                      |
| Workspace validation | `workspace.path`                      |
| Credential storage   | `workspace.path`                      |
