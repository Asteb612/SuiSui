# Implementation Plan: Improve Workspace Detection & File Safety

**Branch**: `001-workspace-detection` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-workspace-detection/spec.md`

## Summary

Harden the WorkspaceService to never overwrite existing user files (especially same-named package.json scripts), and expand the test suites for both WorkspaceService and GitWorkspaceService to cover all edge cases, detection variants, and file preservation scenarios identified in the spec.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Electron 33.x, isomorphic-git, memfs (testing), Vitest 2.x
**Storage**: Local filesystem (Node.js fs/promises)
**Testing**: Vitest with memfs for filesystem mocking, vi.mock for isomorphic-git
**Target Platform**: Desktop (Electron, cross-platform: Linux, macOS, Windows)
**Project Type**: Desktop application (Electron + Nuxt 4)
**Performance Goals**: N/A — this feature is about correctness and safety, not performance
**Constraints**: Tests MUST NOT call real CLI tools (Constitution Principle III)
**Scale/Scope**: 2 service files modified, 2 test files significantly expanded

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._
_Post-Phase 1 re-check: All PASS (2026-03-02). No new violations from design decisions._

| Principle                            | Status | Notes                                                                                              |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| I. Process Isolation                 | PASS   | All changes are in the main process (`electron/services/`). No renderer changes.                   |
| II. Typed IPC Contracts              | PASS   | No new IPC channels needed. Existing contracts unchanged.                                          |
| III. Test Isolation (NON-NEGOTIABLE) | PASS   | All tests use memfs + mocked isomorphic-git. No real CLI or git calls.                             |
| IV. Service Pattern                  | PASS   | WorkspaceService and GitWorkspaceService already follow singleton + DI pattern. No changes needed. |
| V. Shared Package SSoT               | PASS   | No shared type changes required. Existing types sufficient.                                        |
| VI. Simplicity (YAGNI)               | PASS   | Changes are minimal — one logic fix in `ensurePackageJsonScripts`, rest is test expansion.         |

No violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-workspace-detection/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files to modify)

```text
apps/desktop/electron/
├── services/
│   └── WorkspaceService.ts          # Fix ensurePackageJsonScripts (FR-006)
└── __tests__/
    ├── WorkspaceService.test.ts     # Expand: edge cases, file preservation, detection
    └── GitWorkspaceService.test.ts  # Expand: clone, pull, status, commit, errors
```

**Structure Decision**: No new files needed. All changes happen within existing service and test files. This aligns with Principle VI (Simplicity) — we are improving existing code, not adding new abstractions.

## Complexity Tracking

No violations to justify. All changes are minimal and targeted.

## Gap Analysis

### Code Fix Required

**`ensurePackageJsonScripts` (WorkspaceService.ts:371)**:
Current behavior: `{ ...packageJson.scripts, ...expectedScripts }` — SuiSui scripts overwrite user scripts with the same name (e.g., user's `"test": "jest"` becomes `"test": "bddgen && playwright test"`).
Required behavior (FR-006, Clarification): Only add scripts whose names do NOT already exist. User scripts always win.
Fix: Reverse the spread order to `{ ...expectedScripts, ...packageJson.scripts }` so user scripts take precedence, then filter to only check for missing keys.

### WorkspaceService Test Gaps

| Scenario                                              | `set()` | `init()` | Status  |
| ----------------------------------------------------- | ------- | -------- | ------- |
| Existing same-named scripts preserved in package.json | Missing | Missing  | **NEW** |
| cucumber.json not overwritten                         | N/A     | Missing  | **GAP** |
| .gitignore preserved during git init                  | Missing | Missing  | **GAP** |
| Malformed/empty playwright.config.ts                  | Missing | Missing  | **GAP** |
| Invalid JSON in cucumber.json                         | Covered | Missing  | **GAP** |
| Config path → non-existent directory                  | Missing | Missing  | **GAP** |
| Step files beyond depth 4                             | Missing | N/A      | **GAP** |
| Workspace path with spaces                            | Missing | Missing  | **GAP** |
| Multiple config files (.ts + .js)                     | Covered | Missing  | **GAP** |
| .git as file (submodule gitdir)                       | Missing | Missing  | **GAP** |
| Non-SuiSui config with defineBddConfig                | Covered | N/A      | OK      |

### GitWorkspaceService Test Gaps

| Operation           | Covered Scenarios         | Missing Scenarios                                                                    |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `cloneOrOpen`       | None                      | Clone new repo, open existing, update remote URL, auth error, SSH URL                |
| `pull`              | None                      | Fast-forward, no-op (same oid), diverged (MergeConflictError), no remote, auth error |
| `getStatus`         | Basic (init + untracked)  | Modified files, deleted files, added files, filtered vs full, multiple status types  |
| `commitAndPush`     | Basic (defaults, no push) | With push, specific paths, custom author, staging logic                              |
| Error handling      | None                      | mapHttpError (401/403, 404, SSH), WorkspaceNotFoundError                             |
| `matchesFilterGlob` | None (private helper)     | Feature files, step files, non-matching files                                        |

## Design Decisions

### D1: Script merge strategy

Use a simple filter approach: iterate expected scripts and only add those whose key is NOT already present in `packageJson.scripts`. This is explicit and easy to test, versus relying on spread order.

```typescript
// Before (overwrites):
packageJson.scripts = { ...packageJson.scripts, ...expectedScripts }

// After (preserves):
for (const [name, script] of Object.entries(expectedScripts)) {
  if (!packageJson.scripts[name]) {
    packageJson.scripts[name] = script
  }
}
```

### D2: Test organization

Group new tests under descriptive `describe` blocks within existing test files. Do not create new test files — the existing structure is well-organized and adding more files would fragment related tests.

### D3: GitWorkspaceService test approach

Mock isomorphic-git at the module level (already done in existing tests). Each test scenario configures specific mock return values/rejections. Use real temp directories (via `fs.mkdtemp`) for `.git` marker creation, consistent with existing test pattern.
