# Feature Specification: Improve Workspace Detection & File Safety

**Feature Branch**: `001-workspace-detection`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "I currently work on the workspace management with git. The feature is mostly finished but I want to improve the tests and also improve the workspace detection. It must be more flexible and not overwrite existing files if they exist."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Safe Workspace Activation on Existing Projects (Priority: P1)

As a user with an existing BDD project (with custom configurations, step files, and a package.json), when I open the project in SuiSui, none of my existing files should be modified or overwritten. SuiSui should detect and respect what's already there.

**Why this priority**: Data safety is the highest priority. Users will lose trust if SuiSui silently overwrites their custom configurations, step definitions, or package.json settings. This is foundational to adoption.

**Independent Test**: Can be fully tested by opening a pre-configured project and verifying every existing file remains unchanged. Delivers confidence that SuiSui is safe to use on real projects.

**Acceptance Scenarios**:

1. **Given** a workspace with an existing `package.json` containing custom scripts, **When** I activate the workspace via `set()`, **Then** SuiSui adds its required scripts without removing or altering any existing custom scripts
2. **Given** a workspace with an existing custom `playwright.config.ts` (not managed by SuiSui), **When** I activate the workspace, **Then** the config file is left untouched
3. **Given** a workspace with an existing `generic.steps.ts` that the user has customized, **When** I activate or initialize the workspace, **Then** the file is preserved as-is
4. **Given** a workspace with an existing `cucumber.json`, **When** I initialize the workspace, **Then** the existing `cucumber.json` is not overwritten
5. **Given** a workspace with an existing `.gitignore`, **When** git is initialized, **Then** the existing `.gitignore` is preserved

---

### User Story 2 - Flexible Workspace Detection (Priority: P2)

As a user with a non-standard project structure (e.g., features in `specs/`, `tests/features/`, or `e2e/features/`), when I open the project in SuiSui, it should automatically detect my feature directory and step file locations without requiring manual configuration.

**Why this priority**: Flexibility in detection directly impacts whether SuiSui works out of the box for diverse real-world projects. Without this, users with non-default setups would have a broken experience.

**Independent Test**: Can be tested by opening projects with various directory structures and verifying SuiSui correctly detects feature directories, step paths, and configuration files without user intervention.

**Acceptance Scenarios**:

1. **Given** a workspace with features in `specs/` configured via `cucumber.json`, **When** I activate the workspace, **Then** SuiSui detects `specs/` as the features directory
2. **Given** a workspace with features in `tests/features/` configured via `playwright.config.ts`, **When** I activate the workspace, **Then** SuiSui detects `tests/features/` as the features directory
3. **Given** a workspace with step files spread across multiple directories (`steps/`, `tests/e2e/`, `features/steps/`), **When** I activate the workspace, **Then** all step directories are discovered and included in the generated config
4. **Given** a workspace with a `playwright.config.js` (JavaScript, not TypeScript), **When** I activate the workspace, **Then** SuiSui detects the config and skips creating a `.ts` version
5. **Given** a workspace with no configuration files but a `features/` directory, **When** I activate the workspace, **Then** SuiSui falls back to `features/` as default

---

### User Story 3 - Comprehensive Test Coverage for Workspace & Git Services (Priority: P2)

As a developer maintaining SuiSui, I need comprehensive and reliable test coverage for workspace detection, file safety, and git integration so that regressions are caught early and refactoring is safe.

**Why this priority**: The existing test suite covers many scenarios but has gaps around git operations, edge cases in detection, error handling, and the interaction between `init()` and `set()`. Stronger tests protect the file safety guarantees from Story 1.

**Independent Test**: Can be validated by running the test suite and verifying all edge cases pass, coverage metrics improve, and no false positives exist.

**Acceptance Scenarios**:

1. **Given** the WorkspaceService test suite, **When** I run tests, **Then** all file preservation scenarios (package.json, playwright.config, cucumber.json, generic.steps.ts, .gitignore) are covered for both `init()` and `set()` flows
2. **Given** the GitWorkspaceService test suite, **When** I run tests, **Then** clone, pull, status, and commit operations are tested with proper mocks (no real git CLI calls)
3. **Given** edge cases like malformed configs, permission errors, or empty directories, **When** I run tests, **Then** the service handles them gracefully without crashing
4. **Given** the workspace detection logic, **When** I run tests, **Then** all config format variations (`.ts`, `.js`, `.mjs`, `.cjs`, nested in `tests/`) are covered

---

### User Story 4 - Graceful Partial Workspace Setup (Priority: P3)

As a user with a partially configured project (e.g., has `package.json` but no `cucumber.json`, or has features but no config files), when I initialize the workspace, SuiSui should fill in only the missing pieces without touching what already exists.

**Why this priority**: Many real projects start with some but not all BDD tooling configured. SuiSui should augment, not replace. This is important but lower priority since most users either have a fully configured project or start fresh.

**Independent Test**: Can be tested by creating projects with various combinations of missing files and verifying only the missing files are created while existing ones are untouched.

**Acceptance Scenarios**:

1. **Given** a workspace with `package.json` and `features/` but no `cucumber.json`, **When** I initialize, **Then** only `cucumber.json` is created; `package.json` and `features/` are untouched
2. **Given** a workspace with `features/` but no `package.json`, **When** I initialize, **Then** `package.json` is created with defaults; `features/` is untouched
3. **Given** a completely empty directory, **When** I initialize, **Then** all required files and directories are created from scratch
4. **Given** a workspace where initialization fails midway (e.g., disk full), **When** the error occurs, **Then** the workspace is not marked as valid, and no partial state is persisted to settings

---

### Edge Cases

- What happens when `playwright.config.ts` exists but contains syntax errors or is empty?
- What happens when `cucumber.json` exists but contains invalid JSON?
- What happens when the features directory path in config points to a non-existent directory?
- What happens when step files exist in deeply nested directories (beyond depth 4)?
- What happens when the workspace path contains spaces or special characters?
- What happens when multiple config files exist (e.g., both `playwright.config.ts` and `playwright.config.js`)?
- What happens when `.git` exists as a file (submodule gitdir pointer) rather than a directory?

## Clarifications

### Session 2026-03-02

- Q: When the user already has a script with the same name as a SuiSui-managed script (e.g., `"test": "jest"`), should SuiSui overwrite it? → A: Never overwrite. Only add scripts that don't already exist; the user's existing scripts are always preserved.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST NOT overwrite any existing user file during workspace activation (`set()`) or initialization (`init()`)
- **FR-002**: System MUST detect feature directories from Playwright config files in all supported formats (`.ts`, `.js`, `.mjs`, `.cjs`) including configs nested in `tests/`
- **FR-003**: System MUST detect feature directories from `cucumber.json` when no Playwright config is found
- **FR-004**: System MUST fall back to `features/` as the default directory when no configuration is found
- **FR-005**: System MUST discover step files (`*.steps.ts`, `*.steps.js`) recursively up to a reasonable depth and collapse them into root-level glob patterns
- **FR-006**: System MUST preserve existing `package.json` content and only add scripts whose names do not already exist; existing scripts (even with the same name as SuiSui defaults like `test`) are never overwritten
- **FR-007**: System MUST distinguish between SuiSui-managed configs (marked with "managed by SuiSui" comment) and user-created configs, only updating the former
- **FR-008**: System MUST handle malformed configuration files (invalid JSON, empty files, syntax errors) gracefully by falling back to defaults without crashing
- **FR-009**: System MUST preserve existing `.gitignore` content when initializing a git repository
- **FR-010**: System MUST skip default step file creation when any Playwright or Cucumber configuration already exists in the workspace
- **FR-011**: System MUST handle workspace paths with spaces and special characters correctly
- **FR-012**: System MUST provide clear error messages when workspace validation fails, indicating exactly which required files or directories are missing

### Key Entities

- **Workspace**: A directory containing a BDD test project with `package.json`, a features directory, and `cucumber.json`. Identified by its absolute path.
- **WorkspaceValidation**: The result of checking a workspace's integrity, containing validity status and a list of specific errors.
- **Features Directory**: The directory containing `.feature` files. Detected from config files or defaulting to `features/`.
- **Step Paths**: Glob patterns pointing to step definition files. Discovered by scanning the workspace filesystem.
- **Config Files**: Playwright config and cucumber.json that define project structure. Can exist in multiple formats and locations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Opening an existing project in SuiSui preserves 100% of pre-existing files (no byte-level changes to any file that existed before activation)
- **SC-002**: Workspace detection correctly identifies the features directory in at least 5 different project structure variations (default `features/`, `specs/`, `tests/features/`, nested configs, no config)
- **SC-003**: Test suite covers all file preservation scenarios for both `init()` and `set()` flows with zero false positives
- **SC-004**: All edge cases (malformed configs, missing directories, partial setups) are handled without application crashes or unhandled exceptions
- **SC-005**: The test suite for WorkspaceService and GitWorkspaceService achieves full coverage of public methods and critical private methods
- **SC-006**: Partial workspace initialization correctly creates only the missing files, verified by tests with at least 4 different starting states
