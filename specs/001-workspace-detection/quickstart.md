# Quickstart: Improve Workspace Detection & File Safety

**Feature**: 001-workspace-detection
**Date**: 2026-03-02

## Prerequisites

- Node.js 21.x
- pnpm 10.x
- Repository cloned with `pnpm install` completed

## Files to Modify

### 1. Code fix (1 file)

```
apps/desktop/electron/services/WorkspaceService.ts
```

**What to change**: In `ensurePackageJsonScripts()`, change the script merge logic to only add scripts whose names don't already exist in the user's package.json.

### 2. Test expansion (2 files)

```
apps/desktop/electron/__tests__/WorkspaceService.test.ts
apps/desktop/electron/__tests__/GitWorkspaceService.test.ts
```

**What to add**: New `describe` blocks covering file preservation edge cases, detection variants, and git operation scenarios per the gap analysis in plan.md.

## Development Workflow

```bash
# Run unit tests in watch mode while developing
pnpm test

# Run specific test file
pnpm test -- WorkspaceService.test.ts
pnpm test -- GitWorkspaceService.test.ts

# Run all quality checks before committing
pnpm lint:fix
pnpm typecheck
pnpm test
```

## Key Testing Patterns

### WorkspaceService tests (memfs)

```typescript
// Set up filesystem state
vol.fromJSON({
  [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test', scripts: { test: 'jest' } }),
  [`${workspacePath}/features/.gitkeep`]: '',
  [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
})

// Execute service method
await service.set(workspacePath)

// Verify file was not overwritten
const content = await vol.promises.readFile(filePath, 'utf-8')
expect(String(content)).toBe(originalContent)
```

### GitWorkspaceService tests (mocked isomorphic-git)

```typescript
// Configure mock for specific scenario
gitMock.currentBranch.mockResolvedValue('main')
gitMock.listRemotes.mockResolvedValue([{ remote: 'origin', url: 'https://...' }])
gitMock.resolveRef.mockResolvedValue('abc123')

// Execute service method
const result = await service.getStatus(dir)

// Verify behavior
expect(result.branch).toBe('main')
expect(gitMock.statusMatrix).toHaveBeenCalledWith(expect.objectContaining({ dir }))
```

## Acceptance Criteria Verification

After implementation, verify:

1. `pnpm test` — all tests pass (including new ones)
2. `pnpm typecheck` — no TypeScript errors
3. `pnpm lint:fix` — no lint issues
4. Manual check: open a project with existing `"test": "jest"` script → SuiSui should NOT overwrite it
