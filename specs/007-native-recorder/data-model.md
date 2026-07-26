# Data Model: SuiSui-Native Playwright Recorder

**Feature**: 007-native-recorder | **Date**: 2026-07-24 | **Phase**: 1
**Source of truth**: all serializable types live in `@suisui/shared/src/types/recorder.ts` (crosses IPC). Adapter/child-internal types stay in `apps/desktop/electron/services/recorder`. Reuses existing shared types: `CatalogStep`/`StepSourceLocation` (feature 006), `StepArg`/`ScenarioStep` (`types/feature.ts`), `AppSettings` (`types/settings.ts`).

---

## 1. Enumerations (shared, serializable)

```ts
export type RecordedActionType =
  | 'navigate'
  | 'click'
  | 'doubleClick'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'press'
  | 'upload'
  // assertions:
  | 'assertVisible'
  | 'assertHidden'
  | 'assertText'
  | 'assertValue'
  | 'assertChecked'
  | 'assertEnabled'
  | 'assertCount'
  | 'assertUrl'
  | 'assertTitle'

// MVP capture set (Phase 1) = navigate, click, fill, select, check, uncheck, press, upload
// MVP assertion set (Phase 4) = assertVisible, assertText, assertUrl
// Remaining types are modeled now (SSoT) but produced in later phases.

export type RecordedActionStatus = 'draft' | 'matched' | 'needs-review' | 'accepted' | 'gap'

export type RecorderStatusPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'picking'
  | 'stopping'
  | 'error'
// 'picking' = recording is temporarily suspended while SuiSui's own element picker is armed (D13)

export type PickPurpose = 'retarget' | 'assert' // why pick mode was entered (D13)

export type LocatorKind =
  | 'testId'
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'name'
  | 'id'
  | 'css'

export type MatchSource = 'deterministic' | 'project-metadata' | 'ai' | 'user'

export type Reliability = 'excellent' | 'good' | 'fair' | 'poor'

export type RecorderErrorCode =
  | 'PLAYWRIGHT_NOT_INSTALLED'
  | 'UNSUPPORTED_PLAYWRIGHT' // version outside >=1.49 <1.61 or missing _enableRecorder
  | 'BROWSER_BINARY_MISSING'
  | 'BROWSER_LAUNCH_FAILED'
  | 'RECORDER_API_CHANGED' // event-shape guard tripped
  | 'TARGET_PAGE_CLOSED'
  | 'WORKSPACE_CHANGED'
  | 'NO_STEP_DEFINITIONS'
  | 'LOCATOR_NOT_UNIQUE'
  | 'LOCATOR_NO_LONGER_MATCHES'
  | 'STEP_MISSING_ARGUMENTS'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'ADAPTER_CRASHED'
```

---

## 2. Locator model (shared)

### LocatorReference — discriminated union (convertible to a Playwright locator)

```ts
export type LocatorReference =
  | { type: 'testId'; attribute: string; value: string }
  | { type: 'role'; role: string; name?: string; exact?: boolean }
  | { type: 'label'; value: string; exact?: boolean }
  | { type: 'placeholder'; value: string; exact?: boolean }
  | { type: 'text'; value: string; exact?: boolean }
  | { type: 'name'; value: string }
  | { type: 'id'; value: string }
  | { type: 'css'; value: string }
```

### LocatorCandidate

| Field             | Type               | Notes                                                                        |
| ----------------- | ------------------ | ---------------------------------------------------------------------------- |
| `locator`         | `LocatorReference` | The candidate.                                                               |
| `score`           | `number`           | 0–100 (D5 scoring).                                                          |
| `reliability`     | `Reliability`      | Bucket derived from score (≥90 excellent, 70–89 good, 40–69 fair, <40 poor). |
| `unique`          | `boolean`          | `matchedElements === 1`.                                                     |
| `matchedElements` | `number`           | From child `querySelectorAll` count.                                         |
| `reasons`         | `string[]`         | Human-readable positives (FR-010).                                           |
| `warnings`        | `string[]`         | e.g. "Contains a value that looks generated" (FR-009).                       |

### ElementFingerprint (durable element description; supports labels + future repair, FR-013)

| Field             | Type                    | Notes                                                   |
| ----------------- | ----------------------- | ------------------------------------------------------- |
| `tagName`         | `string`                | Lowercased.                                             |
| `role?`           | `string`                | Computed ARIA role.                                     |
| `accessibleName?` | `string`                | Computed accessible name.                               |
| `label?`          | `string`                | Associated `<label>` text.                              |
| `placeholder?`    | `string`                |                                                         |
| `testAttributes`  | `Record<string,string>` | All matched `data-*`/test attrs present on the element. |
| `id?` / `name?`   | `string`                |                                                         |
| `ariaLabel?`      | `string`                |                                                         |
| `text?`           | `string`                | Trimmed visible text (bounded length).                  |
| `nearbyText?`     | `string[]`              | For labeling fallback.                                  |
| `inputType?`      | `string`                | e.g. `password`, `checkbox`.                            |
| `autocomplete?`   | `string`                | e.g. `current-password`.                                |

---

## 3. Recorded action (shared)

### RecordedAction

| Field                | Type                   | Notes                                                                                             |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                 | `string`               | Recorder-assigned (`rec-<seq>-<sessionId>`).                                                      |
| `sessionId`          | `string`               | Owning session.                                                                                   |
| `seq`                | `number`               | Monotonic capture order (drives list order; SC-010).                                              |
| `type`               | `RecordedActionType`   | Normalized from Playwright `action.name`.                                                         |
| `pageId`             | `string`               | From `frame.pageGuid` (multi-page support).                                                       |
| `timestamp`          | `number`               | Passed in from the child (`Date.now()` unavailable in workflow scripts, fine in a child process). |
| `label`              | `string`               | Human-readable target/action description (FR-005/FR-013).                                         |
| `value?`             | `string`               | Typed/selected value; **omitted entirely when `secret`**.                                         |
| `secret?`            | `boolean`              | True → value redacted at source (D7).                                                             |
| `secretRef?`         | `string`               | Committable name: profile name or `<UPPER_SNAKE>` (FR-026a).                                      |
| `fingerprint?`       | `ElementFingerprint`   | Present for element-targeted actions (Phase 2+).                                                  |
| `locatorCandidates?` | `LocatorCandidate[]`   | Ranked desc by score (Phase 2).                                                                   |
| `selectedLocator?`   | `LocatorReference`     | User/auto choice (defaults to top candidate).                                                     |
| `match?`             | `StepMatch`            | Primary matched step (Phase 1).                                                                   |
| `matchAlternatives?` | `StepMatch[]`          | Top-N alternatives for the picker (no extra IPC).                                                 |
| `status`             | `RecordedActionStatus` | `draft`→`matched`/`needs-review`/`gap`→`accepted`.                                                |
| `confidence?`        | `number`               | 0–1 (from match).                                                                                 |
| `disabled?`          | `boolean`              | Excluded from insertion (FR-006).                                                                 |
| `rawCode?`           | `string`               | Playwright's generated snippet — advanced/debug only (FR-004), never shown by default.            |

**Validation / rules**

- `secret === true` ⇒ `value` MUST be `undefined` and `secretRef` MUST be set (FR-026). Enforced in the child (redaction) and re-checked in `RecorderService`.
- `status === 'gap'` ⇒ `match` absent; action is not insertable until resolved (FR-018a). Matched actions in the same session stay insertable (SC-004b).
- Ordering is by `seq`; the renderer may reorder for insertion but `seq` is immutable (provenance).
- `type ∈ assert*` are produced by the assertion flow (Phase 4), not the capture stream.

### StepMatch

| Field                 | Type                      | Notes                                                    |
| --------------------- | ------------------------- | -------------------------------------------------------- |
| `definitionId`        | `string`                  | Catalog `CatalogStep.id` (stable, feature 006).          |
| `keyword`             | `'Given'\|'When'\|'Then'` |                                                          |
| `pattern`             | `string`                  | Resolved step pattern source.                            |
| `args`                | `StepArg[]`               | Reuses shared `StepArg`; filled from the action.         |
| `confidence`          | `number`                  | 0–1.                                                     |
| `source`              | `MatchSource`             | `deterministic` \| `project-metadata` \| `ai` \| `user`. |
| `definitionLocation?` | `StepSourceLocation`      | From the catalog (US5 "Open implementation").            |
| `reason?`             | `string`                  | Especially for AI matches (FR-016).                      |

---

## 4. Session, status, errors (shared)

### RecorderStartOptions

| Field              | Type                      | Notes                                                                  |
| ------------------ | ------------------------- | ---------------------------------------------------------------------- |
| `startUrl?`        | `string`                  | Initial navigation; defaults to workspace `BASE_URL` (FR-026b).        |
| `scenarioId?`      | `string`                  | Target scenario for insertion (context only; insertion is a store op). |
| `locatorSettings?` | `RecorderLocatorSettings` | Overrides workspace defaults for this session.                         |

### RecorderSession (returned by `start`)

| Field               | Type     | Notes                                                       |
| ------------------- | -------- | ----------------------------------------------------------- |
| `sessionId`         | `string` | Correlates all events.                                      |
| `playwrightVersion` | `string` | Resolved from the workspace (recorded for reproducibility). |
| `browser`           | `string` | e.g. `chromium`.                                            |
| `startedAt`         | `number` |                                                             |

### RecorderStatus (pushed via `recorder:status`)

| Field         | Type                  | Notes                                          |
| ------------- | --------------------- | ---------------------------------------------- |
| `sessionId`   | `string`              |                                                |
| `phase`       | `RecorderStatusPhase` | idle/starting/recording/paused/stopping/error. |
| `browserUrl?` | `string`              | Current page URL (from navigation signals).    |
| `actionCount` | `number`              | For UI.                                        |

### RecorderError (pushed via `recorder:error`)

| Field        | Type                | Notes                                                            |
| ------------ | ------------------- | ---------------------------------------------------------------- |
| `sessionId?` | `string`            | Absent if start never succeeded.                                 |
| `code`       | `RecorderErrorCode` | Drives the human message + recovery action (FR-033).             |
| `message`    | `string`            | User-safe, plain language.                                       |
| `recovery?`  | `string`            | Suggested next step (e.g. "Install Playwright in your project"). |
| `fatal`      | `boolean`           | True ⇒ session ended; captured actions preserved (FR-034).       |

### RecorderLocatorSettings (persisted in `AppSettings`)

| Field                       | Type       | Default                                                                     |
| --------------------------- | ---------- | --------------------------------------------------------------------------- |
| `preferredTestIdAttributes` | `string[]` | `['data-testid','data-test-id','data-test','data-cy','data-qa','data-e2e']` |
| `allowRoleLocators`         | `boolean`  | `true`                                                                      |
| `allowTextLocators`         | `boolean`  | `true`                                                                      |
| `allowCssFallback`          | `boolean`  | `true`                                                                      |

### LocatorValidationResult (returned by `recorder:validateLocator`)

| Field             | Type      | Notes                   |
| ----------------- | --------- | ----------------------- |
| `unique`          | `boolean` |                         |
| `matchedElements` | `number`  |                         |
| `stillMatches`    | `boolean` | For repair flows (US6). |

### PickedElement (pushed via `recorder:picked` after the user clicks in pick mode, D13)

| Field               | Type                 | Notes                                                                            |
| ------------------- | -------------------- | -------------------------------------------------------------------------------- |
| `sessionId`         | `string`             |                                                                                  |
| `pickId`            | `string`             | Correlates to the `recorder:pick` request that armed the picker.                 |
| `purpose`           | `PickPurpose`        | `retarget` (change an action's target) or `assert` (choose an assertion target). |
| `actionId?`         | `string`             | For `retarget`: which action's target to replace.                                |
| `pageId`            | `string`             | Page the element was picked on.                                                  |
| `fingerprint`       | `ElementFingerprint` | Same shape as an action's target.                                                |
| `locatorCandidates` | `LocatorCandidate[]` | Scored in main from the child's raw candidates.                                  |
| `cancelled?`        | `boolean`            | True if the pick was cancelled (`recorder:cancelPick`) — no element.             |

**Rules**: entering pick mode suspends action recording (status `picking`) so the pick click is **not** captured as an interaction; on `picked` (or `cancelled`) recording resumes (status `recording`). `purpose:'assert'` feeds `AssertionPicker`; `purpose:'retarget'` replaces `RecordedAction.locatorCandidates`/`selectedLocator` for `actionId`.

---

## 5. Settings additions (`AppSettings`, shared)

```ts
// types/settings.ts additions
recorderAiEnabled?: boolean          // default false — gates the US6 AI stage (D12)
recorderLocatorSettings?: RecorderLocatorSettings
```

`recorderAiEnabled === true` **and** `aiProvider.type !== null` are both required to run any AI stage; otherwise the deterministic pipeline runs unchanged (FR-030, SC-007).

---

## 6. Adapter/child-internal types (NOT shared — `apps/desktop`)

These never cross IPC; they model the NDJSON boundary and are validated then discarded/normalized.

```ts
// Raw event decoded from the child's stdout (unknown until validated)
type RawAdapterEvent =
  | { v: 1; t: 'ready'; playwrightVersion: string; browser: string }
  | {
      v: 1
      t: 'actionAdded' | 'actionUpdated'
      seq: number
      pageGuid: string
      action: RawPlaywrightAction
      fingerprint?: RawFingerprint
      candidates?: RawCandidate[]
      secret?: boolean
      code?: string
    }
  | {
      v: 1
      t: 'picked'
      pickId: string
      pageGuid: string
      fingerprint: RawFingerprint
      candidates: RawCandidate[]
    } // user clicked in pick mode
  | { v: 1; t: 'pickCancelled'; pickId: string }
  | { v: 1; t: 'signalAdded'; signal: { name: string; url?: string } }
  | { v: 1; t: 'status'; phase: RecorderStatusPhase; url?: string }
  | {
      v: 1
      t: 'error'
      code: RecorderErrorCode
      message: string
      installed?: string
      supported?: string
    }

// Parent → child commands (NDJSON on stdin)
type AdapterCommand =
  | { cmd: 'stop' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'goto'; url: string }
  | { cmd: 'pick'; pickId: string } // arm SuiSui's one-shot picker (suspends recording → 'picking')
  | { cmd: 'cancelPick'; pickId: string } // disarm the picker, resume recording
  | { cmd: 'highlight'; selector: string }
  | { cmd: 'validate'; selector: string }
```

`RawPlaywrightAction` mirrors the confirmed Playwright fields (`name`, `selector`, `text?`, `key?`, `modifiers?`, `options?`, `files?`, `checked?`, `url?`, `position?`, `button?`, `clickCount?`). `RecorderService`/`LocatorService` map these into the shared `RecordedAction`/`LocatorCandidate` and **drop** raw internal-selector strings from anything that crosses IPC (only `LocatorReference` does).

---

## 7. Relationships & flow

```text
recorder-adapter.js (child, workspace Playwright)
  ──NDJSON──▶ PlaywrightRecorderAdapter (IRecorderAdapter)
                 │  normalize action + validate raw event
                 ▼
             RecorderService (main)
                 ├─ LocatorService: RawFingerprint/candidates → LocatorCandidate[] (scored)
                 ├─ StepMatcherService: RecordedAction → StepMatch(+alternatives)  [uses StepCatalogService]
                 └─ secret re-check
                 ──recorder:action / actionUpdated / status / error──▶ (event.sender.send)
                                                                          ▼
                                                        recorder store (renderer, Pinia)
                                                          user edits: selectLocator / selectStepMatch /
                                                          move / remove / accept
                                                          ──insertAcceptedActionsIntoScenario──▶
                                                                          scenario store.addStep()  ──▶ toGherkin()
```

- `RecordedAction 1..* → 1 StepMatch` (a business step may later group several actions, US6).
- `RecordedAction 1 → 0..* LocatorCandidate`, `1 → 0..1 selectedLocator`.
- `StepMatch → CatalogStep` by `definitionId` (existing catalog is SSoT for step source/args).
- `RecordedAction` never contributes recorder metadata to the `.feature`; only its resolved `keyword/pattern/args` reach `addStep` (FR-021).
