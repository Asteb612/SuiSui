# Feature Specification: BDD Subfolder Detection

**Feature Branch**: `004-bdd-subfolder-detection`
**Created**: 2026-03-26
**Status**: Draft
**Input**: After git clone, auto-detect BDD workspace in subfolders. When the cloned repo root doesn't have features/ and cucumber.json, scan subdirectories to find where the BDD structure lives. Store the detected BDD workspace path in .app metadata so git operations use the repo root while SuiSui workspace points to the subfolder.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Auto-detect BDD subfolder after clone (Priority: P1)

A user clones a repository where the BDD test structure lives in a subfolder (e.g., `e2e/`). After cloning, the system automatically scans for the BDD workspace and sets the SuiSui workspace to the correct subfolder. The user does not need to manually navigate to the subfolder.

**Why this priority**: This is the core use case — without it, users must manually set the workspace path after every clone of a repo with a nested BDD structure.

**Independent Test**: Clone a repository where `features/` and `cucumber.json` exist only in a subfolder (e.g., `repo/e2e/`). After clone completes, verify the workspace is automatically set to the subfolder path.

**Acceptance Scenarios**:

1. **Given** a repository where `features/` exists at `e2e/features/`, **When** the user clones the repo, **Then** the system detects the BDD workspace at `<clone-path>/e2e` and sets it as the active workspace.
2. **Given** a repository where `cucumber.json` exists at `e2e/cucumber.json`, **When** the user clones the repo, **Then** the system detects the BDD workspace at `<clone-path>/e2e`.
3. **Given** a repository where the BDD structure is at the root (`features/` at repo root), **When** the user clones the repo, **Then** the system sets the workspace to the clone root (current behavior, unchanged).

---

### User Story 2 - Store BDD workspace path separately from git root (Priority: P1)

The system must track two distinct paths: the git repository root (for git operations like pull, push, commit) and the BDD workspace root (for features, steps, and test execution). These are stored in metadata so that switching back to this workspace restores both paths correctly.

**Why this priority**: Without this separation, git operations would fail if pointed at a subfolder, or BDD operations would fail if pointed at the repo root.

**Independent Test**: After cloning a repo with BDD in a subfolder, verify that pull/push operations use the git root while feature listing and test execution use the subfolder.

**Acceptance Scenarios**:

1. **Given** a cloned repo with BDD in `e2e/`, **When** the user performs a git pull, **Then** the pull operates on the repository root (not the `e2e/` subfolder).
2. **Given** a cloned repo with BDD in `e2e/`, **When** the user lists features, **Then** features are loaded from `<clone-path>/e2e/features/`.
3. **Given** the workspace metadata is saved, **When** the user reopens the app, **Then** both the git root and BDD workspace paths are restored correctly.

---

### User Story 3 - Multiple BDD subfolders found (Priority: P2)

When scanning finds multiple potential BDD workspaces in different subfolders, the system presents the options to the user and lets them choose which one to use.

**Why this priority**: While uncommon, monorepos may have multiple test directories. The user should have control over which one to use.

**Independent Test**: Clone a repository with `e2e/features/` and `tests/features/` both present. Verify the user is prompted to choose.

**Acceptance Scenarios**:

1. **Given** a repo with BDD structure in both `e2e/` and `tests/`, **When** the user clones the repo, **Then** a selection dialog appears listing both options.
2. **Given** the selection dialog is shown, **When** the user picks one option, **Then** the workspace is set to the selected subfolder.

---

### User Story 4 - No BDD structure found anywhere (Priority: P3)

When neither the repo root nor any first-level subfolder contains a BDD structure, the system sets the workspace to the repo root and shows the normal workspace initialization flow (which creates `features/` and `cucumber.json`).

**Why this priority**: This is the fallback case and matches current behavior for new projects.

**Independent Test**: Clone a repository with no `features/` or `cucumber.json` anywhere. Verify the workspace defaults to the repo root with the initialization prompt.

**Acceptance Scenarios**:

1. **Given** a repo with no BDD structure at root or in subfolders, **When** the user clones the repo, **Then** the workspace is set to the repo root and the workspace initialization flow begins.

---

### Edge Cases

- What if the BDD structure exists at both the root and a subfolder? The root takes precedence (no scanning needed).
- What if the subfolder contains `cucumber.json` but no `features/` directory? It is still considered a valid BDD workspace (the workspace initialization flow will create `features/`).
- What if the subfolder is deeply nested (e.g., `packages/app/e2e/`)? Only first-level subdirectories are scanned to keep detection fast and predictable.
- What about hidden directories (`.something/`)? Hidden directories are skipped during scanning.
- What about `node_modules/` and other common non-project directories? Known non-project directories (`node_modules`, `.git`, `dist`, `build`, `.app`) are skipped during scanning.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST scan first-level subdirectories for BDD workspace indicators (`features/` directory or `cucumber.json` file) when the cloned repo root does not contain them.
- **FR-002**: System MUST NOT scan if the repo root already contains a valid BDD workspace (root takes precedence).
- **FR-003**: System MUST skip hidden directories and known non-project directories (`node_modules`, `.git`, `dist`, `build`, `.app`) during scanning.
- **FR-004**: System MUST store the BDD workspace path separately from the git repository root in workspace metadata.
- **FR-005**: System MUST use the git repository root for all git operations (clone, pull, push, commit, status).
- **FR-006**: System MUST use the BDD workspace path for all BDD operations (feature listing, step export, test execution, workspace validation).
- **FR-007**: System MUST present a selection dialog when multiple valid BDD subfolders are found.
- **FR-008**: System MUST fall back to the repo root when no BDD structure is found in any subfolder, allowing normal workspace initialization.
- **FR-009**: Scanning MUST only check first-level subdirectories (not recursive) to keep detection fast.

### Key Entities

- **Workspace Metadata** (extended): Now tracks both `gitRoot` (the repository root for git operations) and `bddWorkspacePath` (the directory containing BDD structure). When they are the same, the behavior is identical to current behavior.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users who clone a repo with BDD in a subfolder have their workspace automatically configured without manual path selection.
- **SC-002**: 100% of git operations (pull, push, commit) continue to operate on the repository root regardless of BDD workspace location.
- **SC-003**: Feature listing and test execution correctly target the BDD subfolder when one is detected.
- **SC-004**: Subfolder detection completes within 1 second for repositories with up to 50 first-level directories.
- **SC-005**: Users with BDD at the repo root experience no change in behavior.

### Assumptions

- Only first-level subdirectories are scanned. Deeply nested BDD structures require manual workspace selection.
- A directory is considered a BDD workspace if it contains `features/` or `cucumber.json` (either one is sufficient).
- The git root is always the clone target path. SuiSui does not support git operations on a parent directory of the clone target.
- Per-workspace credential storage (from feature 003) uses the BDD workspace path as the key, not the git root.
