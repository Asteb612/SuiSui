# Research: BDD Subfolder Detection

## Decision 1: Where to put the subfolder scanning logic

**Decision**: Add a `detectBddWorkspace(clonePath: string)` method to `WorkspaceService`. It scans first-level subdirectories and returns the detected BDD path(s).

**Rationale**: WorkspaceService already owns workspace validation and detection logic (`validate()`, `detectFeaturesDir()`). Adding detection here keeps it cohesive. The method is called from the clone flow before `set()`.

**Alternatives considered**:

- **New BddDetectionService**: Violates YAGNI (Constitution Principle VI). This is a single method, not a service.
- **Put in GitWorkspaceService**: Wrong responsibility — git service handles git operations, not BDD structure detection.

## Decision 2: How to store the git root vs BDD workspace path

**Decision**: Add an optional `gitRoot` field to `WorkspaceInfo`. When present, it indicates the git repository root differs from the workspace path. Git operations use `gitRoot`; BDD operations use `path`.

**Rationale**: Minimal change to the existing data model. When `gitRoot` is absent or equal to `path`, behavior is identical to current. The workspace `path` field continues to point to the BDD directory (where features/, cucumber.json, package.json live). Only git-specific operations (pull, push, commit, status) need to check for `gitRoot`.

**Alternatives considered**:

- **Add `bddWorkspacePath` field and keep `path` as git root**: Would require changing every consumer of `workspace.path` throughout the app. Much larger blast radius.
- **Store in WorkspaceMetadata (.app/workspace.json)**: This is git workspace metadata, not SuiSui workspace metadata. Mixing concerns.
- **Store in SettingsService**: Settings are global. This is per-workspace information.

## Decision 3: How to handle the clone → detect → set flow

**Decision**: After `cloneOrOpen()` succeeds, before calling `workspaceStore.setWorkspacePath()`, run detection on the clone path. If BDD is found in a subfolder, pass the subfolder path to `setWorkspacePath()` and store the clone path as `gitRoot`. If multiple found, show selection dialog. If none found, use clone path as both.

**Rationale**: The detection happens in the frontend (index.vue's `handleGitCloned`) because the selection dialog (multiple results) is a UI concern. The backend provides the detection method via IPC.

**Alternatives considered**:

- **Auto-detect in WorkspaceService.set()**: Would require the backend to trigger UI (selection dialog) which violates process isolation (Constitution Principle I).
- **Detect during clone**: Too early — clone may still be in progress, and detection is a workspace concern, not a git concern.

## Decision 4: What constitutes a BDD workspace indicator

**Decision**: A first-level subdirectory is a BDD workspace candidate if it contains `features/` (directory) OR `cucumber.json` (file). Either one is sufficient.

**Rationale**: Matches the existing validation logic in `WorkspaceService.validate()`. A workspace with only `cucumber.json` will get `features/` created by the initialization flow. A workspace with only `features/` will get `cucumber.json` created by `ensureCucumberJson()`.

**Alternatives considered**:

- **Require both**: Too strict — new projects may have only one.
- **Also check for package.json**: Would miss valid BDD subdirectories that don't have their own package.json yet.

## Decision 5: Directories to skip during scanning

**Decision**: Skip hidden directories (starting with `.`), `node_modules`, `dist`, `build`, `.git`, `.app`, `coverage`, `out`, `tmp`, `temp`.

**Rationale**: These are universally non-project directories. Scanning them would be slow (especially `node_modules`) and never produce valid results.
