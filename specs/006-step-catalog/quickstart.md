# Quickstart: Native Step Catalog for SuiSui

**Feature**: 006-step-catalog | **Phase**: 1

Developer-facing guide for building and validating the step catalog. Assumes Node 22 (repo toolchain), pnpm 10.x.

## Packages & where things live

| Path                                                        | Role                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/step-catalog/`                                    | **New** analysis engine (main-process only). Depends on `@suisui/shared`, `@suisui/step-regex`, `typescript`. |
| `packages/shared/src/types/step-catalog.ts`                 | **New** serializable catalog contract (SSoT).                                                                 |
| `packages/shared/src/catalog/adapter.ts`                    | **New** `catalogStepToStepDefinition()` (Gherkin parity).                                                     |
| `packages/step-regex/src/define.ts`                         | **New** `defineStep()` + metadata (Phase 4).                                                                  |
| `apps/desktop/electron/services/StepCatalogService.ts`      | **New** singleton service (DI).                                                                               |
| `apps/desktop/app/stores/steps.ts` + `components/Step*.vue` | Updated to consume the catalog.                                                                               |

## Golden rule: shared rebuild + IPC 5-touchpoints

After editing anything under `packages/shared/` **or** `packages/step-regex/`:

```bash
pnpm --filter @suisui/step-regex build   # if step-regex changed
pnpm --filter @suisui/shared build        # always after shared changes
```

Adding the catalog IPC touches all five (Constitution II):

1. `packages/shared/src/ipc/channels.ts` — `STEP_CATALOG_*`
2. `packages/shared/src/ipc/api.ts` — `stepCatalog` namespace
3. `apps/desktop/electron/ipc/handlers.ts` — validated handlers
4. `apps/desktop/electron/preload.ts` — `window.api.stepCatalog`
5. Rebuild `@suisui/shared`

See `contracts/ipc-step-catalog.md`.

## Bootstrapping the new package

```bash
# Mirror step-regex's dual-build setup
cp packages/step-regex/tsconfig*.json packages/step-catalog/   # adjust paths
# package.json: name @suisui/step-catalog; deps: @suisui/shared, @suisui/step-regex, typescript
pnpm install                                # link workspace deps
pnpm --filter @suisui/step-catalog build
```

`@suisui/step-catalog` MUST NOT be imported from `apps/desktop/app/` (renderer). Only the Electron main process (`electron/`) imports it.

## Running the engine in isolation (unit tests, no CLI)

Engine tests feed **source strings** to the analyzer — no real `bddgen`/`playwright`/`git` (Constitution III). Example:

```ts
import { analyzeSource } from '@suisui/step-catalog' // test entrypoint over in-memory files

const steps = analyzeSource({
  'tests/steps/login.steps.ts': `
    import { createBdd } from 'playwright-bdd'
    const { Given } = createBdd(test)
    Given('I am logged in', async ({ page }) => {})
  `,
})
// assert keyword/pattern/source location/parameters/precision
```

Run:

```bash
pnpm --filter @suisui/step-catalog test
pnpm --filter @suisui/step-regex test
```

## Validating a story slice end-to-end

1. Build packages: `pnpm --filter @suisui/step-regex build && pnpm --filter @suisui/shared build && pnpm --filter @suisui/step-catalog build`.
2. `pnpm typecheck` (zero errors across monorepo).
3. `pnpm test` (unit).
4. `pnpm build && pnpm test:e2e` (E2E against a production build, `APP_TEST_MODE=1`).

### Story acceptance checks

- **US1 (P1)**: point the app at a fixture project mixing plain/cucumber/regex steps + one dynamic step → all appear with `source.file:line`; the dynamic one carries `DYNAMIC_STEP_PATTERN` and the list is intact. One unparseable file → `FILE_PARSE_ERROR`, other files still cataloged.
- **US2 (P2)**: a step with an enum + int + table → `StepAddDialog` renders select / number / grid(with columns) / text-fallback; generated Gherkin matches the pre-feature golden output (`adapter` parity test).
- **US3 (P3)**: a `step``/`defineStep`step shows`precision: exact`+ named params; a bare regex step shows`partial` + inferred-name warning. Filters (keyword/text/category/tag/type/precision) narrow the list; diagnostics badges render.
- **US4 (P4)**: `defineStep({...})` step shows title/description/category/tags/param labels/examples (exact) and still executes under `playwright-bdd`.
- **US5 (P5)**: regenerate unchanged → cache hit < 500 ms; edit a step file → change reflected; cache lives at `<workspace>/.app/cache/step-catalog.json` and `.app/.gitignore` excludes it.

## Manual smoke (dev)

```bash
pnpm dev
# In the app: open a workspace with step files → open the step picker →
# confirm steps list with source locations, precision markers, correct param controls.
```

## Migration / cleanup (Phase 5)

- Switch `stores/steps.ts` fully to `stepCatalog:*`.
- Remove `apps/desktop/electron/scripts/bddgen-export.js` and the text `parseExportOutput`/subprocess code in `StepService.ts`.
- Remove legacy `STEPS_EXPORT`/`STEPS_GET_CACHED`/`STEPS_GET_DECORATORS` once no renderer caller remains.
- Verify SC-008 (all previously-listed steps still listed) and SC-010 (no text-export dependency) before deleting.

## Docs to update on completion

`doc/ARCHITECTURE.md` (catalog engine + security/no-exec model), `doc/SERVICES.md` (`StepCatalogService`), `doc/IPC_TYPES.md` (`stepCatalog:*`), `doc/FRONTEND.md` (catalog store + picker), and `CLAUDE.md` (replace the step-export description).
