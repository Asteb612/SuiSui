# Quickstart: Tag Management (010)

**Feature**: 010-tag-management | **Branch**: `010-tag-management`

How to build, run, and verify this feature. Read `plan.md` for the design and
`contracts/ipc-tags.md` for the IPC surface.

---

## ⚠️ Before you start

This feature builds on `parseFeatureOutline` and `IFileWatcher` from **feature 009 (PR #127)**, which
is **not yet merged**. This branch was cut from `main`, so those files are not here.

```bash
# Recommended: land 009 first, then rebase
git checkout main && git pull
git checkout 010-tag-management && git rebase main
ls packages/shared/src/search/featureOutline.ts   # must exist before step 2 below
```

If 009 is not going to land, see the fallback in `plan.md` — it is a deliberate decision, not
something to improvise mid-implementation.

---

## Build order

```bash
pnpm --filter @suisui/shared build   # after ANY change under packages/shared/
pnpm typecheck
pnpm lint:fix
pnpm test
```

---

## Implementation order

Ordered so the dangerous part (writing to user files) lands last, on top of an index that is already
proven correct.

1. **Shared types** — `packages/shared/src/types/tags.ts`, exported from `src/index.ts`. Rebuild.
2. **Parser extension** — add `line`, `tagLine`, `featureTagLine` to `parseFeatureOutline`. Additive
   and optional; 009's search index must keep passing untouched.
3. **Tag name rules** — `packages/shared/src/tags/tagName.ts`. Pure, unit-test first.
4. **Splicer** — `packages/shared/src/tags/tagSplice.ts`. Pure, no `fs`. Unit-test exhaustively
   _before_ anything calls it — this is the function that can destroy a user's suite.
5. **TagService (read path)** — index build, counts, usages, freshness via `FakeFileWatcher`.
6. **IPC (read only)** — `tags:getIndex` + `tags:indexChanged`, all five touchpoints. Rebuild shared.
7. **Store + browser UI** — `app/stores/tags.ts`, `TagBrowser.vue`, `activeView: 'tags'`. **US1 is
   now shippable.**
8. **Run by tag** — wire to the existing runner config + `runBatch`. **US2 done.**
9. **TagService (write path)** — `applyBulk`, bottom-up per file, re-parse verification.
10. **`tags:applyBulk` + `BulkTagDialog.vue`** — preview, confirm, per-file outcomes. **US3 done.**
11. **E2E** — `apps/desktop/e2e/tag-management.spec.ts` against a production build.

---

## Manual verification

```bash
pnpm dev
```

Open a workspace with tagged features, then:

| Check                                          | Expected                                               | Requirement            |
| ---------------------------------------------- | ------------------------------------------------------ | ---------------------- |
| Open the Tags view                             | Every tag listed once, with a scenario count           | FR-001, FR-002         |
| Tag declared at feature level                  | Counted for every scenario in that feature             | FR-003                 |
| Tag on both a feature and one of its scenarios | That scenario counted **once**                         | FR-003                 |
| Sort toggle                                    | Switches between count-descending and alphabetical     | FR-004                 |
| Type in the tag filter                         | List narrows                                           | FR-005                 |
| Select a tag                                   | Exactly its scenarios, each showing feature + file     | FR-006                 |
| A scenario with an inherited tag               | Labelled as inherited, not direct                      | FR-007                 |
| Select a scenario                              | Opens the feature, selects that scenario               | FR-008                 |
| Workspace with no tags                         | Explicit empty state                                   | FR-009                 |
| Edit a tag in the editor, don't save           | Tag view reflects the unsaved state                    | FR-010                 |
| Edit a `.feature` externally                   | Counts update within a couple of seconds               | FR-011                 |
| Add a malformed `.feature`                     | Other tags still shown; bad file reported              | FR-012                 |
| Run a tag                                      | Runs exactly that tag's scenarios, normal run UI       | FR-013, FR-014, FR-015 |
| Run a tag with 0 scenarios                     | Refused, with a reason                                 | FR-016                 |
| Bulk add across 2 files                        | Preview shows counts; after confirm, only tags changed | FR-017, FR-019, FR-023 |
| Bulk add where one already has the tag         | No duplicate tag                                       | FR-020                 |
| Bulk remove an inherited tag                   | Refused for that scenario, explained                   | FR-021                 |
| Enter `bad tag!` as a tag name                 | Refused before any write                               | FR-022                 |
| Bulk edit a file open with unsaved changes     | Warned before writing                                  | FR-025                 |
| After any bulk edit                            | Counts update with no manual refresh                   | FR-026                 |

**After every bulk edit, `git diff` the workspace.** The diff must contain _only_ tag lines. That one
habit catches FR-023 regressions faster than any assertion.

---

## Test fixtures

`apps/desktop/e2e/fixtures/workspaces/tags/` must cover the cases SC-003 names:

- A feature-level tag over several scenarios (inheritance)
- The **same tag on a feature and on one of its own scenarios** (dedup — counted once)
- A feature with a tag and **zero scenarios** (`orphaned: true`, count 0)
- Tags differing only by case (`@Smoke` / `@smoke`) — must stay distinct
- A tag whose name is a **prefix of another** (`@smoke` / `@smoke-test`) — removing one must not
  touch the other
- Scenarios with **no tag line at all** (the insert path) and with **several tags on one line** (the
  edit path)
- A scenario with an empty name but tags present
- One intentionally malformed file
- At least one file with **CRLF** line endings

---

## Splicer test checklist

This is the highest-risk function in the feature. Cover at minimum:

- Add when no tag line exists → line inserted, indentation matches the scenario keyword
- Add when a tag line exists → appended to it, existing tags untouched
- Add a tag already present → no change, `changed: false`
- Remove the only tag on a line → line deleted, `lineDelta: -1`
- Remove one of several tags → others and their order preserved
- Remove a tag not present → no change
- **Prefix safety**: removing `@smoke` leaves `@smoke-test` intact
- CRLF files keep CRLF endings
- Tabs vs spaces indentation preserved
- A `#` comment on the same line is not swallowed
- Every line other than the tag line is byte-identical afterwards

---

## Gotchas

- **Apply edits bottom-up within each file.** Inserting a tag line for scenario 3 shifts every
  recorded line position below it. Top-down application silently tags the wrong scenarios — this is
  the single most likely way to ship a corrupting bug.
- **Re-parse after writing.** SC-009 is not optional; there is no undo.
- **Wire `WORKSPACE_GET`, not just `WORKSPACE_SET`.** A workspace restored from settings never goes
  through `SET`, so wiring only `SET` yields an index that is silently empty for the entire session.
  (This exact bug shipped in feature 009 and was only caught in real use.)
- **Rebuild `@suisui/shared`** after every change there.
- **Do not import `node:fs` in `app/`.** The unsaved-edit overlay reads Pinia state only.
- **Tags are case-sensitive.** Do not lowercase them anywhere — not for keying, sorting, or matching.
- **Do not reuse `scenarioStore.toGherkin()`** to write tag changes. It regenerates the whole file
  and will drop comments and reformat steps.
