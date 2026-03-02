# Research: Improve Workspace Detection & File Safety

**Feature**: 001-workspace-detection
**Date**: 2026-03-02

## R1: Safe script merging in package.json

**Decision**: Use explicit key-existence check instead of spread operator

**Rationale**: The spread operator `{ ...existing, ...new }` silently overwrites keys. For the "never overwrite" requirement (FR-006), we need explicit control. Iterating over expected scripts and skipping existing keys is the simplest correct approach.

**Alternatives considered**:

- Reverse spread `{ ...expectedScripts, ...packageJson.scripts }`: Works but is implicit — a reader might not realize the order matters. Also overwrites in the opposite direction which could mask intent.
- `Object.assign` with guard: Same issue as spread, just different syntax.
- Explicit loop with `hasOwnProperty` check: **Chosen** — most readable and testable.

## R2: isomorphic-git mocking strategy for expanded tests

**Decision**: Continue using `vi.mock('isomorphic-git')` at module level with per-test mock configuration

**Rationale**: The existing pattern in `GitWorkspaceService.test.ts` already mocks the entire isomorphic-git module. Each test configures `gitMock.<method>.mockResolvedValue(...)` for its specific scenario. This scales well to the ~15 new test cases needed.

**Alternatives considered**:

- Real git repo in temp dirs: Violates Constitution Principle III (Test Isolation). Rejected.
- Custom wrapper around isomorphic-git: Over-engineering per Principle VI. The direct mock is sufficient.
- Snapshot-based testing: Not appropriate for behavioral tests. We need to verify specific method calls and arguments.

## R3: memfs coverage for filesystem edge cases

**Decision**: Use memfs `vol.fromJSON()` to set up edge-case filesystem states

**Rationale**: memfs supports all the edge cases we need to test: empty files, malformed content, directories with special characters, nested structures. The existing test suite already uses this pattern extensively.

**Alternatives considered**:

- Real temp directories: Slower, less reproducible, harder to set up edge cases like permission errors.
- Custom filesystem mock: Unnecessary when memfs already provides complete mock coverage.

## R4: .git as file (submodule) detection

**Decision**: The `ensureGitRepo` method uses `fs.access(gitPath)` which succeeds for both files and directories. This means submodule `.git` files (which point to the actual git directory) are already handled correctly — the method skips initialization when any `.git` entry exists.

**Rationale**: No code change needed. A test should verify this behavior.

**Alternatives considered**:

- Check if `.git` is a directory vs file: Unnecessary complexity. The existence check is sufficient for the "don't reinitialize" behavior.

## R5: Workspace paths with spaces and special characters

**Decision**: No code changes needed. Node.js `path.join()` and `fs` APIs handle paths with spaces natively. The only risk is in string interpolation for glob patterns, which uses template literals (safe).

**Rationale**: Verified by reading `detectStepPaths`, `detectFeaturesDir`, and `ensurePlaywrightConfig` — all use `path.join()` or `path.relative()` which handle special characters correctly.

**Alternatives considered**:

- Path quoting/escaping utility: Unnecessary — Node.js APIs don't need shell escaping.

## Summary

| Research Item         | Code Change Needed        | Test Change Needed |
| --------------------- | ------------------------- | ------------------ |
| R1: Script merging    | Yes (WorkspaceService.ts) | Yes (new tests)    |
| R2: Git mocking       | No                        | Yes (new tests)    |
| R3: memfs edge cases  | No                        | Yes (new tests)    |
| R4: .git as file      | No                        | Yes (new test)     |
| R5: Paths with spaces | No                        | Yes (new test)     |
