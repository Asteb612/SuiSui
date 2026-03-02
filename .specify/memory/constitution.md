<!-- Sync Impact Report
Version change: N/A → 1.0.0 (initial creation)
Modified principles: N/A (all new)
Added sections:
  - Core Principles (6 principles: Process Isolation, Typed IPC Contracts,
    Test Isolation, Service Pattern, Shared Package SSoT, Simplicity)
  - Technology Stack Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: None (initial creation)
Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ No update needed
    (Constitution Check section is generic, filled per-feature)
  - .specify/templates/spec-template.md: ✅ No update needed
    (requirements structure compatible with all principles)
  - .specify/templates/tasks-template.md: ✅ No update needed
    (test-first references align with Principle III)
  - .specify/templates/agent-file-template.md: ✅ No update needed
    (generic structure, no constitution-specific references)
Follow-up TODOs: None
-->

# SuiSui Constitution

## Core Principles

### I. Process Isolation

The application MUST maintain strict separation between Electron's
main process and renderer process.

- The main process (`electron/`) runs in Node.js with full system
  access. It handles business logic, CLI execution, and file system
  operations.
- The renderer process (`app/`) runs in a Chromium sandbox. It MUST
  NOT import or access Node.js modules directly.
- All communication between processes MUST go through the preload
  script's `contextBridge` API, exposed as `window.api`.
- Context isolation MUST remain enabled. Node integration MUST remain
  disabled in the renderer.

**Rationale**: Electron's security model depends on process isolation.
Violating this boundary exposes the user's system to renderer-side
vulnerabilities (XSS, dependency supply-chain attacks).

### II. Typed IPC Contracts

All inter-process communication MUST be defined as typed contracts in
the shared package (`@suisui/shared`).

- Every IPC channel MUST be declared in
  `packages/shared/src/ipc/channels.ts` with a SCREAMING_SNAKE_CASE
  constant.
- Every IPC method signature MUST be defined in
  `packages/shared/src/ipc/api.ts`.
- Handlers in `electron/ipc/handlers.ts` and preload bindings in
  `electron/preload.ts` MUST match the shared contract exactly.
- Untyped or ad-hoc IPC channels are prohibited.

**Rationale**: Typed contracts catch interface mismatches at compile
time rather than runtime, preventing silent failures across the
process boundary.

### III. Test Isolation (NON-NEGOTIABLE)

Tests MUST NEVER execute real CLI tools (`bddgen`, `playwright`,
`git`) or make real network calls.

- All service tests MUST use `FakeCommandRunner` for command
  execution.
- File system tests SHOULD use `memfs` or equivalent in-memory mocks
  when possible.
- E2E tests run in `APP_TEST_MODE=1`, which activates
  `FakeCommandRunner` for all CLI execution. Only file system
  operations for fixture `.feature` files remain real.
- Test suites MUST be independent: no shared mutable state between
  test cases.

**Rationale**: Real CLI execution makes tests slow,
non-deterministic, and environment-dependent. Fake runners ensure
millisecond-level feedback and reproducibility across all machines.

### IV. Service Pattern (Singleton + Dependency Injection)

All backend services MUST follow the singleton factory pattern with
constructor-based dependency injection.

- Each service class accepts optional dependencies (e.g.,
  `ICommandRunner`) via its constructor, falling back to production
  defaults.
- A module-level factory function (e.g., `getWorkspaceService()`)
  provides lazy singleton access.
- Services MUST NOT instantiate other services internally without
  allowing injection overrides.
- Service files MUST be placed in `electron/services/` and exported
  from `electron/services/index.ts`.

**Rationale**: This pattern enables test isolation (Principle III)
while keeping production code simple and avoiding service locator
complexity.

### V. Shared Package as Single Source of Truth

The `@suisui/shared` package is the sole owner of types, interfaces,
and IPC contracts shared between processes.

- All shared types MUST be defined in `packages/shared/src/types/`
  and exported from `packages/shared/src/index.ts`.
- After any modification to the shared package,
  `pnpm --filter @suisui/shared build` MUST be run before dependent
  code can consume the changes.
- The main process and renderer MUST import shared types from
  `@suisui/shared`, never from each other's source directories.

**Rationale**: A single shared package prevents type drift between
processes and provides a clear compilation boundary.

### VI. Simplicity (YAGNI)

All code changes MUST solve the current problem with the minimum
viable complexity.

- Do not add features, abstractions, or configuration beyond what is
  directly requested or clearly necessary.
- Three similar lines of code are preferred over a premature
  abstraction.
- Error handling and validation SHOULD only be added at system
  boundaries (user input, external APIs, IPC channels), not for
  impossible internal states.
- Backward-compatibility shims, feature flags, and unused re-exports
  MUST NOT be introduced speculatively.

**Rationale**: Over-engineering increases maintenance burden and
obscures intent. The codebase is easier to extend when existing code
is straightforward.

## Technology Stack Constraints

The following technology choices are fixed for the project's current
major version and MUST NOT be replaced without a constitutional
amendment.

| Layer                | Technology          | Minimum Version |
| -------------------- | ------------------- | --------------- |
| Desktop Framework    | Electron            | 33.x            |
| Frontend Framework   | Nuxt 4 (Vue 3)      | Nuxt 3.15+      |
| State Management     | Pinia               | Latest          |
| UI Component Library | PrimeVue            | 4.x             |
| Unit Testing         | Vitest              | 2.x             |
| E2E Testing          | Playwright          | 1.58+           |
| Package Manager      | pnpm                | 10.x            |
| Runtime              | Node.js             | 21.x            |
| Language             | TypeScript (strict) | 5.x             |

Additional constraints:

- Vue components MUST use Composition API with
  `<script setup lang="ts">`.
- The `any` type is prohibited in production code; use `unknown` for
  truly unknown types.
- PascalCase for components and service classes; camelCase with
  `use`/`get` prefix for stores and factories; SCREAMING_SNAKE_CASE
  for IPC channels and constants.

## Development Workflow & Quality Gates

### Pre-Commit Quality Gates

Before any commit, the following checks MUST pass:

1. **Lint**: `pnpm lint:fix` — no unresolved lint errors.
2. **Type check**: `pnpm typecheck` — zero TypeScript errors across
   the monorepo.
3. **Unit tests**: `pnpm test` — all tests pass; no skipped tests
   without documented justification.

### Shared Package Rebuild Rule

Any modification to files under `packages/shared/` MUST be followed
by `pnpm --filter @suisui/shared build` before running lint,
typecheck, or tests on dependent packages.

### IPC Change Checklist

Adding or modifying an IPC channel requires updates to all five
touchpoints (see Principle II):

1. `packages/shared/src/ipc/channels.ts`
2. `packages/shared/src/ipc/api.ts`
3. `apps/desktop/electron/ipc/handlers.ts`
4. `apps/desktop/electron/preload.ts`
5. Shared package rebuild

Omitting any step is a blocking defect.

### E2E Test Requirement

E2E tests MUST run against a production build (`pnpm build` before
`pnpm test:e2e`). Running E2E tests against the dev server is not a
valid substitute.

## Governance

This constitution is the highest-authority document for SuiSui
development practices. It supersedes all other guidance when conflicts
arise.

### Amendment Procedure

1. Propose the change with rationale in a pull request modifying this
   file.
2. The amendment MUST include a Sync Impact Report (HTML comment at
   the top of this file) listing affected templates and downstream
   documents.
3. Version MUST be incremented following semantic versioning:
   - **MAJOR**: Principle removal, redefinition, or backward-
     incompatible governance change.
   - **MINOR**: New principle or section added, or material expansion
     of existing guidance.
   - **PATCH**: Clarifications, wording fixes, non-semantic
     refinements.
4. All dependent templates (plan, spec, tasks) MUST be reviewed and
   updated if the amendment changes their referenced constraints.

### Compliance

- All pull requests and code reviews MUST verify compliance with
  these principles.
- Violations MUST be resolved before merge.
- Complexity beyond what Principle VI allows MUST be justified in a
  Complexity Tracking table (see plan template).
- Use `CLAUDE.md` for runtime development guidance that
  operationalizes these principles.

**Version**: 1.0.0 | **Ratified**: 2025-06-13 | **Last Amended**: 2026-03-02
