# Implementation Plan: BDD Subfolder Detection

**Branch**: `004-bdd-subfolder-detection` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-bdd-subfolder-detection/spec.md`

## Summary

After cloning a git repository, auto-detect BDD workspace in first-level subdirectories when the repo root doesn't contain `features/` or `cucumber.json`. Store the git root separately from the BDD workspace path so git operations use the repo root while BDD operations use the detected subfolder. Show a selection dialog when multiple candidates are found.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x, Node.js fs/promises
**Storage**: In-memory workspace state + SettingsService (persisted)
**Testing**: Vitest 2.x with memfs for filesystem mocks
**Target Platform**: Desktop (Linux, macOS, Windows) via Electron
**Project Type**: Desktop application (Electron + Nuxt)
**Performance Goals**: Subfolder detection < 1 second for repos with up to 50 first-level directories
**Constraints**: Only scan first-level subdirectories; skip hidden/non-project dirs
**Scale/Scope**: ~11 files modified/created

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle               | Status | Notes                                                                                                                                         |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Process Isolation    | Pass   | Detection runs in main process (fs access). Selection dialog in renderer. Communication via IPC.                                              |
| II. Typed IPC Contracts | Pass   | New `WORKSPACE_DETECT_BDD` channel + `BddDetectionResult` type in shared package. All 5 touchpoints planned.                                  |
| III. Test Isolation     | Pass   | Detection tests use memfs. No real filesystem or git operations.                                                                              |
| IV. Service Pattern     | Pass   | Detection method added to existing WorkspaceService singleton. No new service needed.                                                         |
| V. Shared Package SSoT  | Pass   | `WorkspaceInfo.gitRoot`, `BddDetectionResult` defined in `@suisui/shared`.                                                                    |
| VI. Simplicity (YAGNI)  | Pass   | Single method on existing service. One new Vue component (selection dialog). Optional `gitRoot` field — no changes when git root = workspace. |

**Post-Phase-1 re-check**: All principles still pass.

## Project Structure

### Documentation (this feature)

```text
specs/004-bdd-subfolder-detection/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/           # Phase 1 IPC contract changes
│   └── ipc-api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   └── workspace.ts                 # Modified: add gitRoot?, BddDetectionResult
├── ipc/
│   ├── channels.ts                  # Modified: add WORKSPACE_DETECT_BDD
│   └── api.ts                       # Modified: add detectBdd method
└── index.ts                         # Unchanged (already exports workspace types)

apps/desktop/
├── electron/
│   ├── services/
│   │   └── WorkspaceService.ts      # Modified: add detectBddWorkspace()
│   ├── ipc/
│   │   └── handlers.ts              # Modified: add WORKSPACE_DETECT_BDD handler
│   ├── preload.ts                   # Modified: expose detectBdd
│   └── __tests__/
│       └── WorkspaceService.test.ts # Modified: add detection tests
├── app/
│   ├── components/
│   │   ├── BddFolderSelect.vue      # New: selection dialog for multiple candidates
│   │   ├── GitPanel.vue             # Modified: use gitRoot for git operations
│   │   └── GitClone.vue             # Unchanged
│   ├── pages/
│   │   └── index.vue                # Modified: handleGitCloned runs detection
│   └── stores/
│       └── workspace.ts             # Modified: track gitRoot, add gitRootPath getter
```

**Structure Decision**: Existing monorepo structure. One new component (`BddFolderSelect.vue`). No new services or directories.
