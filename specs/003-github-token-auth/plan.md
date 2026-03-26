# Implementation Plan: GitHub Token-Only Authentication

**Branch**: `003-github-token-auth` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-github-token-auth/spec.md`

## Summary

Replace the broken username/password git authentication with GitHub Personal Access Token (PAT) only. Tokens are validated on the frontend (prefix check: `ghp_` or `github_pat_`), stored encrypted per-workspace in `.app/credentials.enc`, and passed to isomorphic-git as `x-access-token`. The change touches shared types, the credential service, IPC signatures, two Vue components, and their tests.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x, isomorphic-git
**Storage**: Encrypted files via Electron `safeStorage` at `<workspace>/.app/credentials.enc`
**Testing**: Vitest 2.x with FakeCommandRunner, memfs for filesystem mocks
**Target Platform**: Desktop (Linux, macOS, Windows) via Electron
**Project Type**: Desktop application (Electron + Nuxt)
**Performance Goals**: N/A (no performance-sensitive changes)
**Constraints**: Token validation is frontend-only; no network round-trips for format checks
**Scale/Scope**: ~13 files modified/created

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle               | Status | Notes                                                                                                                                       |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Process Isolation    | Pass   | Token validation in shared package (usable by both processes). Credential storage in main process only. Renderer accesses via `window.api`. |
| II. Typed IPC Contracts | Pass   | All IPC signature changes defined in shared package. All 5 touchpoints identified in quickstart.                                            |
| III. Test Isolation     | Pass   | Tests use mocked `safeStorage` and in-memory filesystem. No real git or network calls.                                                      |
| IV. Service Pattern     | Pass   | GitCredentialsService keeps singleton + DI pattern. Accepts workspacePath parameter.                                                        |
| V. Shared Package SSoT  | Pass   | `GitCredentials`, `GitWorkspaceParams`, `TokenValidationResult`, and `validateGitHubToken` all defined in `@suisui/shared`.                 |
| VI. Simplicity (YAGNI)  | Pass   | Reuses existing GitCredentialsService with path parameter instead of creating new service. No migration logic. No backward compat shims.    |

**Post-Phase-1 re-check**: All principles still pass. Per-workspace storage follows the existing `.app/` pattern used by WorkspaceMeta.

## Project Structure

### Documentation (this feature)

```text
specs/003-github-token-auth/
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
│   └── gitWorkspace.ts          # Modified: GitCredentials, GitWorkspaceParams
├── validation/
│   └── gitToken.ts              # New: validateGitHubToken()
├── __tests__/
│   └── validateGitHubToken.test.ts  # New: validation tests
└── index.ts                     # Modified: export validation utility

apps/desktop/
├── electron/
│   ├── services/
│   │   ├── GitCredentialsService.ts   # Modified: per-workspace storage
│   │   └── GitWorkspaceService.ts     # Modified: simplify buildAuth()
│   ├── ipc/
│   │   └── handlers.ts               # Modified: credential handler signatures
│   ├── preload.ts                     # Modified: credential API signatures
│   └── __tests__/
│       └── GitCredentialsService.test.ts  # Modified: per-workspace + token
├── app/
│   ├── components/
│   │   ├── GitClone.vue               # Modified: token field + validation
│   │   └── GitPanel.vue               # Modified: auth dialog token field
│   └── stores/
│       └── gitCredentials.ts          # Modified: pass workspacePath
```

**Structure Decision**: Existing monorepo structure with `packages/shared` + `apps/desktop`. No new directories except `packages/shared/src/validation/` for the token validator.
