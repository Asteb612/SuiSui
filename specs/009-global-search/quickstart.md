# Quickstart: Global Search (009)

**Feature**: 009-global-search | **Branch**: `009-global-search`

How to build, run, and verify this feature. Read `plan.md` for the design and
`contracts/ipc-search.md` for the IPC surface.

---

## Build order

The shared package must be built before anything that consumes it — this feature adds types **and**
logic there, so skipping the rebuild produces confusing type errors in both processes.

```bash
pnpm --filter @suisui/shared build   # after ANY change under packages/shared/
pnpm typecheck
pnpm lint:fix
pnpm test
```

---

## Implementation order

Each step is independently verifiable; do them in this order so tests exist before the wiring that
depends on them.

1. **Shared types** — `packages/shared/src/types/search.ts`, exported from `src/index.ts`. Rebuild.
2. **Matcher** — `packages/shared/src/search/matcher.ts` (`normalize`, `tokenize`, `matchText`).
   Pure functions, no I/O. Unit-test first; this is where accent handling and the score ladder live.
3. **Outline parser** — `packages/shared/src/search/featureOutline.ts`. Must never throw. Unit-test
   with a malformed fixture as a first-class case, not an afterthought.
4. **File watcher seam** — `electron/services/FileWatcher.ts`: `IFileWatcher` + `NodeFileWatcher`.
   `FakeFileWatcher` goes in `electron/__tests__/fakes/`.
5. **SearchIndexService** — `electron/services/SearchIndexService.ts`. Test with `memfs` +
   `FakeFileWatcher`. Export from `electron/services/index.ts`.
6. **IPC** — all five touchpoints from `contracts/ipc-search.md` in one commit, plus the
   rebuild-on-workspace-change wiring. Rebuild shared.
7. **Pinia store** — `app/stores/search.ts`: query, debounce, `requestId` discard, type filter,
   unsaved-edit overlay.
8. **Component** — `app/components/GlobalSearch.vue`, mounted in the `<header>` of
   `app/pages/index.vue`.
9. **E2E** — `apps/desktop/e2e/global-search.spec.ts` against a production build.

---

## Manual verification

```bash
pnpm dev
```

Open a workspace with several `.feature` files, then:

| Check                                                       | Expected                                                                 | Requirement            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| Press `Ctrl+K` (`Cmd+K` on macOS) anywhere in the app       | Header search input takes focus                                          | FR-002                 |
| Press `Ctrl+K` while typing in the scenario name field      | Nothing happens — the shortcut yields                                    | FR-002                 |
| Type part of a scenario name                                | Results appear as you type, grouped by type, matched text highlighted    | FR-005, FR-017, FR-022 |
| Arrow down, then Enter                                      | Feature opens, scenario is selected, panel closes                        | FR-004, FR-025, FR-026 |
| Press `Escape`                                              | Panel closes, focus returns to where it was                              | FR-003                 |
| Type a tag with and without `@`                             | Same results either way; matching tag shown on the result                | FR-009, FR-018         |
| Type gibberish                                              | Explicit "no results" state, not a blank panel                           | FR-021                 |
| Rename a scenario, do **not** save, search for the new name | It is found; the old name is not                                         | FR-012                 |
| Edit a `.feature` file in an external editor                | Change appears in results within ~2 s, no user action                    | FR-014, SC-009         |
| Search immediately after opening a large workspace          | Input is usable, panel reports indexing — never a premature "no results" | FR-015                 |
| Add a deliberately malformed `.feature` file                | Other files still return results; the bad file is reported               | FR-028, SC-006         |

---

## Test fixtures

E2E needs a fixture workspace with known expected matches, covering the cases SC-003 calls out:

- A plain `Scenario:` and a `Scenario Outline:` (the outline must return as **one** result — its
  `Examples` values must not be searchable, FR-008).
- The **same scenario name in two different feature files**, to verify both are listed and
  disambiguated by feature/path.
- Feature-level tags and scenario-level tags, at least one shared between files.
- A scenario with an empty name (tag-matchable, never a blank result row).
- One intentionally malformed file.
- Accented text (e.g. `Connexion`) to verify accent-insensitive matching.

---

## Performance sanity check

SC-002 targets 200 files / 2,000 scenarios. Generate a synthetic workspace rather than eyeballing it:

```bash
# scratch script — generate 200 feature files with 10 scenarios each
```

Measure keystroke → rendered results. Expected: dominated by the IPC round-trip, not the scan. If the
scan itself is measurable, verify normalization is precomputed at index time and not being re-run per
query (Decision 2 in `research.md`) — that is the single most likely regression.

---

## Gotchas

- **Rebuild `@suisui/shared`** after every change there. Half of "impossible" type errors in this
  feature will be a stale `dist/`.
- **Vitest inlines `@suisui/*`** — the shared ESM dist is bundler-style and breaks vitest otherwise.
  This is already configured; do not remove it when adding the new test files.
- **`MatchRange` offsets index the original text**, so normalization must preserve length. Stripping
  combining marks after `NFD` does; anything that collapses characters (e.g. `ß` → `ss`) does not, and
  will produce off-by-N highlight bugs that only appear with non-ASCII input.
- **Do not import `node:fs` in `app/`.** The renderer's freshness overlay reads Pinia state only.
- **Unsubscribe from `onIndexStatus`** in `onUnmounted`, or listeners accumulate across workspace
  switches.
