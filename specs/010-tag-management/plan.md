# Implementation Plan: Tag Management and Tag-Based Browsing/Run View

**Branch**: `010-tag-management` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-tag-management/spec.md`

## Summary

Add a dedicated **Tags** view: every tag in the workspace with a per-scenario count, drill-down to
the scenarios carrying it (distinguishing tags carried directly from tags inherited from the
feature), a one-click run for a tag, and bulk add/remove of a tag across a selection of scenarios.

Technical approach: a main-process `TagService` builds a tag index by scanning `.feature` files with
an **extended `parseFeatureOutline`** — the same parser feature 009 introduced, gaining line
positions so tags can be edited surgically. Bulk edits are **line-level splices** (touch only the tag
line, insert or delete nothing else), then re-parse every modified file to prove nothing was
corrupted. Running by tag **reuses the existing tag-filtered batch run** rather than adding a second
mechanism. Freshness reuses the `IFileWatcher` seam.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20.x (Electron 33 runtime); repo/tests on Node 22  
**Primary Dependencies**: Electron 33.x, Nuxt 4 (Vue 3), Pinia, PrimeVue 4.x — **no new runtime dependency**. Reuses `parseFeatureOutline` + `IFileWatcher` (feature 009) and `RunnerService.runBatch({ tags })` (feature 002).  
**Storage**: None. The tag index is in-memory and session-scoped. Bulk edits write directly to the user's `.feature` files — the only persistent effect, and the main risk this plan manages.  
**Testing**: Vitest 2.x (`memfs` + `FakeFileWatcher` for `TagService`; pure unit tests for the tag splicer and the extended parser); Playwright E2E against a production build with fixture `.feature` files.  
**Target Platform**: Electron desktop (Linux, macOS, Windows)  
**Project Type**: Desktop app — pnpm monorepo (`apps/desktop` + `packages/shared`)  
**Performance Goals**: full tag list within 2 s of opening at 200 files / 2,000 scenarios / 100 tags (SC-002); bulk edit across 20 scenarios in 3+ files as one operation (SC-006)  
**Constraints**: Renderer must not touch `node:fs` (Principle I); no real CLI in tests (Principle III); bulk edits must preserve everything but the tag lines (FR-023) and must never produce an unparseable file (SC-009)  
**Scale/Scope**: ~200 feature files, ~2,000 scenarios, ~100 distinct tags; 2 new IPC channels + 1 push; 1 new main-process service; 1 new Pinia store; 1 new view + 2 components

No `NEEDS CLARIFICATION` items remain. The spec's open decisions (scenario-level-only bulk editing, case-sensitive tags, per-scenario counting, no undo) are recorded as Assumptions with reasoning.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                   | Assessment                                                                                                                                                                                                                                                                   | Status                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **I. Process Isolation**    | Scanning and writing `.feature` files needs `fs`, so `TagService` lives in `electron/services/`. The renderer reaches it only via `window.api.tags.*`. The unsaved-edit overlay reads Pinia state the renderer already holds — no `node:*` under `app/`.                     | ✅ Pass                       |
| **II. Typed IPC Contracts** | `tags:getIndex`, `tags:applyBulk` (invoke) and `tags:indexChanged` (push) declared in `channels.ts`, signatures in `api.ts`, handlers in `handlers.ts`, bindings in `preload.ts`, then shared rebuild. The push channel follows the established unsubscribe-returning shape. | ✅ Pass                       |
| **III. Test Isolation**     | No CLI, no network. `TagService` tests use `memfs` + `FakeFileWatcher`. The tag splicer is a pure string function tested directly. Tag runs go through the existing runner, already covered by `FakeCommandRunner` in test mode.                                             | ✅ Pass                       |
| **IV. Service Pattern**     | `TagService` takes optional `IFileWatcher` and `IWorkspaceLocator` via constructor, exposed by `getTagService()`, exported from `electron/services/index.ts`.                                                                                                                | ✅ Pass                       |
| **V. Shared Package SSoT**  | `TagSummary`, `TagUsage`, `TagIndex`, `BulkTagRequest`, `BulkTagResult` live in `packages/shared/src/types/tags.ts`; the tag splicer and tag-name validation live in `packages/shared/src/tags/`. Rebuild before dependent lint/typecheck/test.                              | ✅ Pass                       |
| **VI. Simplicity (YAGNI)**  | Reuses the 009 parser instead of writing a third one, reuses `runBatch({ tags })` instead of a parallel run path, reuses `IFileWatcher`. No undo stack, no rename/merge, no tag expressions. Line-splice editing rather than parse-and-regenerate.                           | ⚠️ Pass with one tracked item |

**Gate result: PASS**, with one tracked dependency (below) that is a **sequencing** risk, not a design violation.

### Post-Phase-1 re-check

Re-evaluated after `data-model.md` and `contracts/`: no principle moved. Two simplifications were
found during design and applied:

- **A `tags:runTag` channel was dropped.** Running a tag needs no new channel — the renderer sets the
  existing runner config (`activeFilterTab: 'tags'`, `selectedTags: [tag]`) and calls the existing
  `runner.runBatch`. Adding a channel would have duplicated a working path (Principle VI), and it is
  exactly the duplication the spec's checklist flagged for confirmation here.
- **No separate "preview" channel.** The preview required by FR-019 is computed from the index the
  renderer already holds, so it costs no round-trip and cannot disagree with what is on screen.

## Project Structure

### Documentation (this feature)

```text
specs/010-tag-management/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-tags.md      # Phase 1 output — IPC contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   └── tags.ts                       # NEW — TagSummary, TagUsage, TagIndex, BulkTag*, TagWriteOutcome
├── search/
│   └── featureOutline.ts             # EDIT (from 009) — add line positions; keep it non-throwing
├── tags/
│   ├── tagSplice.ts                  # NEW — pure add/remove of a tag on one scenario's lines
│   ├── tagName.ts                    # NEW — tag validation + normalization (leading '@')
│   └── index.ts                      # NEW — barrel
├── index.ts                          # EDIT — export types/tags + tags/
└── __tests__/
    ├── tagSplice.test.ts             # NEW
    ├── tagName.test.ts               # NEW
    └── featureOutline.test.ts        # EDIT — position assertions

apps/desktop/electron/
├── services/
│   ├── TagService.ts                 # NEW — index build, incremental update, bulk apply
│   └── index.ts                      # EDIT — export the new service
├── ipc/handlers.ts                   # EDIT — 2 invoke handlers + input validation
├── preload.ts                        # EDIT — tags bindings incl. onIndexChanged
└── __tests__/
    ├── TagService.test.ts            # NEW — memfs + FakeFileWatcher (index/counts/freshness)
    └── TagServiceBulk.test.ts        # NEW — write path + corruption guarantees

apps/desktop/app/
├── components/
│   ├── TagBrowser.vue                # NEW — master/detail: tag list | scenario list
│   └── BulkTagDialog.vue             # NEW — preview + confirm
├── stores/
│   └── tags.ts                       # NEW — index, selection, filter, sort, bulk flow
└── pages/index.vue                   # EDIT — activeView gains 'tags'; header entry point

apps/desktop/e2e/
├── fixtures/workspaces/tags/         # NEW — known counts, inheritance, malformed file
└── tag-management.spec.ts            # NEW
```

**Structure Decision**: Standard SuiSui split. Everything touching `fs` stays in
`electron/services`; serializable contracts and the pure editing logic go to `packages/shared` so the
splicer is unit-testable without a filesystem and the renderer can reuse tag validation for
immediate feedback. No new package — this feature is far too small to warrant one.

## Complexity Tracking

| Violation                                                                                                                                  | Why Needed                                                                                                                                                                                                                                                                                                                                          | Simpler Alternative Rejected Because                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extending `parseFeatureOutline` (feature 009, **not yet merged**) rather than using `parseFeatureMetadata`, which already exists on `main` | `parseFeatureMetadata` **flattens** feature tags into each scenario's tag list, destroying the direct-vs-inherited distinction FR-007 requires, and records no line numbers, which surgical editing requires. `parseFeatureOutline` already keeps feature and scenario tags separate, so only line positions need adding — a small additive change. | A third parser would leave `parseFeatureMetadata`, `parseFeatureOutline`, and a tag parser all scanning the same files with subtly different rules — the exact drift Principle V exists to prevent. Extending `parseFeatureMetadata` instead would change behaviour for the run view, its only current consumer. |

### ⚠️ Sequencing dependency — read before starting

This plan builds on `parseFeatureOutline` and `IFileWatcher`, both introduced by **feature 009
(PR #127), which is open and unmerged**. This branch was cut from `main`, so those files are not
present here yet.

**Recommended order**: merge PR #127 → rebase `010-tag-management` onto `main` → implement. The
parser extension is additive (optional position fields), so 009's search index is unaffected.

**If 009 is delayed or rejected**, the fallback is to move `parseFeatureOutline`, `tagSplice`, and
`IFileWatcher` into this feature and have 009 adopt them afterwards. That is a mechanical change of
ownership, not a redesign — but it must be a deliberate decision, not something discovered
mid-implementation, which is why it is stated here rather than buried in `research.md`.

### Risk note — this is the first feature that writes to many user files at once

Bulk editing modifies a large number of the user's `.feature` files in one action. Three mitigations
are load-bearing and must not be dropped during implementation:

1. **Line-splice, never regenerate.** Parse-and-rewrite would silently reformat comments, blank
   lines, and step wording (violating FR-023). Only the tag line is touched.
2. **Re-parse after write.** Every modified file is re-read and re-parsed; a file that no longer
   parses is reported loudly (SC-009).
3. **Preview and confirm before any write** (FR-019), with per-file outcomes on partial failure
   (FR-024). There is deliberately no undo stack — git is the recovery path (spec Assumptions).
