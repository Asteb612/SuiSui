# Quickstart: SuiSui-Native Playwright Recorder

**Feature**: 007-native-recorder | **Date**: 2026-07-24 | **Phase**: 1
Validates the spec's acceptance flow. The MVP (Phases 1–3) covers steps 1–16; assertions (Phase 4), Open-implementation (Phase 5), and AI (Phase 6) complete steps 14 & 19 and the optional layer.

## Prerequisites

- A workspace with Playwright installed (`>=1.49 <1.61`) and step definitions available (a fresh SuiSui workspace ships the bundled generic steps, now including check/uncheck/press/upload).
- The desktop app built (`pnpm build`) for E2E; recorder E2E runs with the **`FakeRecorderAdapter`** (no real browser in CI).

## Happy path (acceptance criteria walkthrough)

1. Open a workspace and select a scenario in **ScenarioBuilder**.
2. Click **Record**. → `window.api.recorder.start({ startUrl: <BASE_URL> })`. A headed browser opens (workspace Playwright, embedded Node child) — **no Playwright Inspector and no Playwright in-page overlay** (SuiSui suppresses it and hosts its own picker/highlight). Status shows _recording_. (FR-001/FR-001a/FR-002)
3. In the browser, navigate to `/login`. → a `recorder:action` "Open '/login'" card appears.
4. Type into the Email field. → "Fill 'arthur@example.com' in the Email field" (typing coalesced into one action).
5. Type into the Password field. → "Fill a protected value in the Password field" — the value is **redacted in the child** and never crosses IPC; the card shows a masked value and a secret reference. (US3/FR-026)
6. Click the button with `data-testid="login-submit"`. → "Click the 'Sign in' button"; its recommended locator is `data-testid="login-submit"` rated **Excellent** with reasons. (US2/FR-010)
7. Each action shows a **matched BDD step** with args filled from the human labels (deterministic; no AI). (US1/FR-014)
8. Change a locator (pick an alternative candidate) or change the matched step (pick an alternative) — both are already on the action, no round-trip. Use **Highlight element** (SuiSui's overlay) to confirm the target; or choose **"pick a different element"** → `recorder.pick({purpose:'retarget', actionId})`, click another element in the live browser, and a `recorder:picked` event re-derives the candidate set. (US2/FR-011/D13)
9. (Phase 4) Switch to **assertion mode** → `recorder.pick({purpose:'assert'})`, click the **Welcome** banner (an element you never interacted with), choose **Visible** → "Verify that 'Welcome' is visible" using a genuine `expect` step. Any full-set check is available (visible/hidden/text/value/checked/enabled/count/URL/title). (US4/FR-027/SC-011/SC-012)
10. Click **Confirm**. Kept, enabled actions insert into the current scenario via the `scenario` store `addStep()` — in order. (FR-019)
11. Export/inspect the scenario: the `.feature` is valid Gherkin; the password appears only as a secret reference / profile name, never a literal. (SC-004)
12. Run the scenario through the existing runner: it passes (steps resolve to real step definitions). (SC-005)
13. (Phase 5) On any step/card, choose **Open implementation** → the step definition file opens at its line (from the catalog's `StepSourceLocation`). (US5)

## Error-path checks (FR-033/FR-034)

| Setup                               | Expectation                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Workspace has no Playwright         | `start` surfaces `PLAYWRIGHT_NOT_INSTALLED` with recovery text; no crash.                          |
| Playwright version 1.62+/1.48-      | `UNSUPPORTED_PLAYWRIGHT` (installed vs `>=1.49 <1.61`).                                            |
| Browser not installed               | `BROWSER_BINARY_MISSING` → "run `npx playwright install`".                                         |
| Close the recorded page mid-session | `TARGET_PAGE_CLOSED` (fatal), captured cards remain.                                               |
| An action matches no workspace step | Card marked **gap**; other actions still insertable; offered to the missing-step stub flow (#100). |

## Test entry points

- **Unit** (`pnpm --filter @suisui/desktop test`):
  - `LocatorService` — candidate generation, scoring, generated-value detection, naming order.
  - `StepMatcherService` — each action type → expected pattern/args; missing step → gap; missing arg → needs-review; AI JSON validation (valid / unknown-id / schema-mismatch / low-confidence) via `FakeAIProvider`.
  - secret detection/redaction; action normalization (`RawPlaywrightAction` → `RecordedAction`); assertion conversion for the **full assertion set**.
  - `RecorderService` against `FakeRecorderAdapter` replaying `e2e/fixtures/recorder/*.ndjson`: start→actions→stop; secret invariant (`value` absent when `secret`); **pick flow** (`pick`→`picked` retarget/assert, `cancelPick`); status/error events.
- **E2E** (`APP_TEST_MODE=1`, `FakeRecorderAdapter`): start/stop a session, record navigation/click/fill from a fixture NDJSON, detect `data-testid`/`data-cy`, prefer role over unstable CSS, protected password, **pick an element for a retarget and for an assertion**, add each full-set assertion, switch locator candidate, switch matching step, insert into a scenario, open a step implementation.
- **Manual/opt-in** (`PlaywrightRecorderAdapter`, real browser, outside CI): drive local fixture pages under `e2e/fixtures/recorder/pages/` to validate the private-API path, **confirm Playwright's overlay is suppressed and SuiSui's picker/highlight work (D13)**, and (re)generate the checked-in NDJSON fixtures.

## Definition of done (MVP = US1–US3)

- Record → readable cards → deterministic step matches → confirm → valid runnable `.feature` (SC-001/SC-002/SC-005).
- Configured unique `data-testid` is always the recommended locator (SC-003).
- Zero cleartext secrets anywhere, including AI payloads (SC-004).
- Full flow works with **no AI provider configured** (SC-007).
- Every enumerated error condition yields a specific, human message; captured actions preserved (SC-008).
- A ≥100-action session loses/reorders nothing (SC-010).
- Playwright's overlay never shows; SuiSui's picker adds assertions on never-interacted elements and re-picks action targets (SC-011).
- All full-set assertion types record and produce genuine `expect` checks (SC-012).
