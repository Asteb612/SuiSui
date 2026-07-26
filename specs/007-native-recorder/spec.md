# Feature Specification: SuiSui-Native Playwright Recorder

**Feature Branch**: `007-native-recorder`  
**Created**: 2026-07-24  
**Status**: Draft  
**Related issues**: [#106](https://github.com/Asteb612/SuiSui/issues/106) (in-app recording UX — the enabling UX), [#105](https://github.com/Asteb612/SuiSui/issues/105) (record-and-convert → catalog-mapped scenario). Integrates with [#98](https://github.com/Asteb612/SuiSui/issues/98) (test profiles), [#103](https://github.com/Asteb612/SuiSui/issues/103) (self-healing selectors), [#100](https://github.com/Asteb612/SuiSui/issues/100) (missing-step stub generation), [#99](https://github.com/Asteb612/SuiSui/issues/99)/feature 005 (AI foundation). See **Traceability** below.  
**Input**: User description: "Build a SuiSui-Native Playwright Recorder that captures browser interactions and converts them directly into editable BDD scenario steps, with reliable locator detection, deterministic matching to existing step definitions, sensitive-data protection, assertions, source-location linkage, and an optional AI-assisted layer."

## Overview

SuiSui users currently build BDD scenarios by hand-picking Given/When/Then step definitions from a catalog and filling in each parameter. This is slow and requires the author to already know which steps exist and what they do.

This feature adds a **recorder**: the user drives a real browser, and SuiSui turns each interaction into a readable, editable scenario step matched to an existing step definition. The experience is built for QA analysts and non-developers — it never requires the user to read or understand a raw CSS selector or generated test code. Neither Playwright's separate Inspector window **nor its in-page overlay** (the injected element picker + assertion dialog it draws on the recorded page) is reused: SuiSui **suppresses Playwright's overlay** and provides its **own in-browser element picker** (hover-highlight + click-to-pick) so that choosing/adjusting a selector and defining an expectation both happen through SuiSui's UI. SuiSui owns the recording, review, and editing experience end to end.

The first release is a **deterministic** recorder (no AI required to record). An optional AI-assisted layer sits behind a feature flag and is never a dependency of basic recording.

This feature unifies two tracked issues: **#106** ("Improve in-app Playwright recording UX") — the enabling recording experience (in-app controls, plain-language action list, assertion mode, element picker, reorder/delete) — and **#105** ("Record-and-convert") — turning the captured action log into a catalog-constrained, declarative scenario. Both issues describe the mechanism as sitting _"on top of Playwright codegen/inspector under the hood"_; this spec **supersedes that hint** with a SuiSui-owned adapter over Playwright's internal recording capability, delivering the issues' shared goal (_"no separate raw-code window"_) more directly. It also **refines #105's "AI maps the actions" framing**: mapping is **deterministic-first** against the step catalog, with AI as an optional accelerator for low-confidence cases — so record-and-convert works with no AI configured.

## Clarifications

### Session 2026-07-24

- Q: When Playwright's in-page overlay is suppressed, how does the user target elements in the live browser to set/adjust a selector or define an assertion? → A: **SuiSui provides its own in-browser element picker.** SuiSui injects its own hover-highlight + click-to-pick, fully suppressing Playwright's overlay. From SuiSui the user activates a **pick mode** ("Pick element" / "Add assertion"), then clicks **any** element in the browser — including elements never interacted with (e.g. a result banner) — and SuiSui shows its own selector-candidate and assertion UI. (Playwright's `api` recorder mode does not surface element-pick events, so the picker is SuiSui-owned.)
- Q: Which assertion types must the MVP support? → A: **The full set** — `visible`, `hidden`, `contains text`, `has value`, `is checked`, `is enabled`, `has element count`, `URL contains/equals`, `page title contains/equals` — recorded in the MVP (superseding the earlier visible/text/URL-only MVP subset).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Record a browser session and build a scenario (Priority: P1)

A test author opens an existing scenario, clicks **Record**, and a SuiSui-controlled browser opens. They navigate to a page and perform ordinary interactions (open a URL, click a button, type into fields, choose from a dropdown, tick a checkbox, press a key, upload a file). As they work, SuiSui shows each interaction as a readable action card in an ordered list (for example, _Open "/login"_, _Fill "arthur@example.com" in the Email field_, _Click the "Sign in" button_). Each action is automatically matched to an existing bundled step definition with its arguments filled in. When finished, the author reviews the cards, removes or reorders any they don't want, confirms, and the validated steps are inserted into the current scenario. The resulting `.feature` file is valid and runs through the existing test runner.

**Why this priority**: This is the core value of the feature and a complete, viable MVP on its own — a working recorder that produces runnable scenarios. Every other story enhances this flow.

**Independent Test**: Start a recording against a local fixture page, perform a navigation + a click + a field fill, confirm the actions, and verify that valid scenario steps are inserted into the current scenario and that the generated feature file runs successfully.

**Acceptance Scenarios**:

1. **Given** a workspace is open and a scenario is selected, **When** the user clicks Record, **Then** a SuiSui-controlled browser opens without showing the default Playwright Inspector interface, and the recorder status shows "recording".
2. **Given** the recorder is running, **When** the user navigates to a page and clicks a button, **Then** an ordered "Open …" action card and a "Click …" action card appear with human-readable descriptions.
3. **Given** the recorder is running, **When** the user types into an email field and selects an option from a dropdown, **Then** a "Fill … in the Email field" card and a "Select …" card appear, each matched to a bundled step with arguments populated.
4. **Given** recorded action cards exist, **When** the user reorders and deletes cards and then confirms, **Then** only the kept actions, in the chosen order, are inserted into the current scenario as valid BDD steps.
5. **Given** recorded steps have been inserted, **When** the scenario is exported and executed, **Then** the generated `.feature` file is syntactically valid and runs through the existing runner without step-definition-resolution errors.
6. **Given** the recorder is running, **When** the user clicks Pause and later Resume, **Then** interactions performed while paused are not recorded and interactions after Resume are recorded.
7. **Given** a recorded action has no matching catalog step, **When** the actions are reviewed, **Then** that action is flagged as a **gap** (not silently dropped), the user is offered the missing-step stub flow (#100) to fill it, and the remaining matched actions can still be inserted. _(issue #105: "flag a gap and offer the missing-step stub flow")_

---

### User Story 2 - Reliable, explainable element targeting (Priority: P2)

When the author records an interaction, SuiSui inspects the target element and its useful ancestors and proposes several ways to identify it, each with a reliability score and a plain-language explanation. Test-oriented `data-*` attributes are preferred, followed by accessible role + name, labels, stable IDs, and so on, with CSS/position selectors as a last resort. The recommended target is shown with reasons ("Dedicated testing attribute", "Unique on the current page", "Does not contain a generated value") and any warnings ("Contains a value that looks generated"). The author can accept the recommendation or pick a different candidate, and can highlight the element in the browser to confirm the choice — all without reading a raw selector. Replacing Playwright's overlay, SuiSui also offers its own **in-browser element picker**: from an action the author can activate "pick a different element", then click any element in the live browser, and SuiSui re-derives the candidate set for the newly picked element.

**Why this priority**: Reliable locators are the headline differentiator over hand-written or naively recorded tests. Basic recording (US1) can proceed with a best-guess target, but this story makes recorded tests durable and trustworthy.

**Independent Test**: Record a click on an element that carries a `data-testid` attribute and also generated CSS classes; verify the `data-testid` candidate is recommended with an "Excellent" reliability rating and a reasons list, that a lower-scored generated-class candidate is present but marked with a warning, and that selecting an alternative candidate updates the action.

**Acceptance Scenarios**:

1. **Given** an element has a configured test-id attribute that is unique on the page, **When** it is recorded, **Then** that attribute is the recommended target and is rated as the most reliable candidate.
2. **Given** a candidate selector contains a value that looks generated (UUID, hash, timestamp, long numeric id, framework/CSS-module class), **When** candidates are shown, **Then** that candidate's score is reduced and it carries a warning explaining why.
3. **Given** multiple candidates exist, **When** the user opens the target selector for an action, **Then** each candidate shows its reliability, whether it is unique on the page, and its reasons/warnings.
4. **Given** the workspace configures preferred test attributes, **When** an element carries one of them, **Then** those attributes take precedence over role/label/text candidates.
5. **Given** an action is selected, **When** the user chooses "Highlight element", **Then** the corresponding element is visually highlighted in the controlled browser (via SuiSui's own overlay, not Playwright's).
6. **Given** an action is selected, **When** the user chooses "pick a different element" and clicks another element in the live browser, **Then** SuiSui suppresses Playwright's overlay, uses its own hover-highlight + click-to-pick to capture the new element, and re-derives the candidate set for it.

---

### User Story 3 - Protect credentials and sensitive data (Priority: P2)

While recording a login or any flow with secrets, SuiSui detects password and sensitive fields (for example, password inputs, current/new-password autofill hints, and fields whose names suggest password, token, secret, api-key, or authorization). The captured value is never shown in clear text, never written into a `.feature` file as a literal by default, and never sent to any AI provider. Instead it is represented by a **committable name, not the secret itself**: when the workspace's Test Profiles (#98) capability is available, a recognized login sequence resolves to a named test profile (e.g. `Given I am logged in as "Admin"`); otherwise the value becomes a named secret reference (e.g. `<LOGIN_PASSWORD>`) that the author can rename. Either way the actual secret is resolved at run time (from the encrypted local store in the app, or from environment/CI secrets in CI), so the `.feature` and its git diff contain only the name.

**Why this priority**: The canonical recording flow is a login, which involves a password. Shipping recording that leaks secrets into readable cards or committed feature files would be a real harm, so this protection ships alongside the MVP even though it is not a standalone product on its own. Issues #105 and #106 both make this a hard requirement ("Credentials captured during recording resolve to test profiles (#98), never inline secrets").

**Independent Test**: Record typing into a password field; verify the action card shows a masked/protected indication rather than the typed value, that the inserted step uses a committable name (a test-profile name where profiles exist, otherwise a named secret reference) instead of the literal, and that no representation of the value is included in any AI request payload.

**Acceptance Scenarios**:

1. **Given** the user types into a password field, **When** the action card is shown, **Then** the value is displayed as protected (e.g., "a protected value") and never in clear text.
2. **Given** a sensitive value was recorded, **When** the steps are inserted into a scenario, **Then** the step references a committable name (never the literal value): a test-profile name when Test Profiles (#98) is available, otherwise a named secret reference.
3. **Given** the Test Profiles capability is available, **When** the recorder captures a recognizable login sequence (enter username + password + submit), **Then** it offers to collapse it into a profile-based login step (e.g. `Given I am logged in as "Admin"`) that resolves credentials at run time and commits only the profile name.
4. **Given** the optional AI layer is enabled, **When** an action involving a sensitive value is sent for AI assistance, **Then** the sensitive value is excluded from what is sent.
5. **Given** a secret reference or profile mapping was created, **When** the user edits the action, **Then** the user can rename the secret reference or choose a different profile.

---

### User Story 4 - Record and suggest assertions (Priority: P2)

Beyond interactions, the author enters SuiSui's assertion mode — which **replaces Playwright's assertion overlay**. Using SuiSui's own in-browser element picker, the author points at **any** element in the live browser (including result elements they never interacted with, such as a "Welcome" banner) — or selects a page condition — and chooses a check. The **full assertion set is available in the MVP**: visible, hidden, contains text, has value, is checked, is enabled, has element count, URL contains/equals, page title contains/equals. The assertion becomes a readable "Verify …" step. In addition, after certain interactions SuiSui compares the page before and after and offers **suggested** checks (for example, after a save: "Verify that 'Saved successfully' is visible" or "Verify that the URL contains '/details'"). Suggestions are shown but never added automatically; the author accepts, edits, or rejects each one.

**Why this priority**: Assertions turn a click-through into a real test, and replacing Playwright's assert overlay is a stated goal of this feature. The full assertion set ships in the MVP; the suggestion engine builds on top.

**Independent Test**: In assertion mode, use SuiSui's picker to click a result element the author never interacted with, choose "Visible", and verify a "Verify that '…' is visible" step is produced; repeat for a "has value" check on an input; separately, perform an action that changes the URL and verify a URL-contains suggestion is offered but not added until accepted.

**Acceptance Scenarios**:

1. **Given** assertion mode is active, **When** the user picks an element in the live browser (via SuiSui's picker, not Playwright's overlay) and chooses "Visible", **Then** a "Verify that '…' is visible" action is recorded and can be inserted as a valid step.
   1a. **Given** assertion mode is active, **When** the user picks an element they never interacted with and chooses any of the full-set checks (e.g. "has value", "is checked", "has element count"), **Then** the corresponding "Verify …" step is produced with the value/count argument populated.
2. **Given** an interaction changed the page, **When** SuiSui detects the change, **Then** relevant assertion suggestions are presented as optional and are not added to the scenario unless the user accepts them.
3. **Given** a suggested assertion is presented, **When** the user rejects it, **Then** it is discarded and no step is created.
4. **Given** an assertion is inserted, **When** the scenario runs, **Then** the assertion is evaluated as a genuine check (not merely a wait) and passes/fails according to the page state.

---

### User Story 5 - Open the implementation behind any step (Priority: P3)

For every step shown in SuiSui — whether recorded or hand-picked — the author can choose "Open implementation" to jump directly to the step definition's source file at the correct line, using the configured or system editor. This lets authors and reviewers understand exactly what a step does.

**Why this priority**: A convenience/traceability enhancement that depends on step source locations being available. Valuable but not required for a recorder to produce runnable scenarios.

**Independent Test**: For a recorded step matched to a bundled definition, choose "Open implementation" and verify the correct file opens at the correct line; for two definitions sharing the same pattern in different files, verify each resolves to its own distinct location.

**Acceptance Scenarios**:

1. **Given** a step is matched to a definition with a known source location, **When** the user chooses "Open implementation", **Then** the source file opens at the definition's line.
2. **Given** two step definitions share the same pattern but live at different locations, **When** each is displayed, **Then** they remain distinguishable and each "Open implementation" resolves to its own file and line.
3. **Given** a step definition's source location is unknown, **When** the step is displayed, **Then** the "Open implementation" action is unavailable or clearly disabled rather than opening the wrong file.

---

### User Story 6 - Optional AI-assisted enhancements (Priority: P3)

When enabled via a feature flag and a configured AI provider, an optional layer can: suggest an existing step match when deterministic matching is not confident; propose grouping several low-level actions into a single business-level step (for example, collapsing fill-email + fill-password + click-sign-in into "I log in as …"); suggest assertions; and propose a replacement locator when a previously recorded one no longer matches (the approval-based self-healing of issue #103). Every AI proposal is validated against the real step definition and its argument schema, is shown to the user with its confidence and reasoning, and is never applied silently — the user must confirm before anything is replaced or grouped. Low-confidence suggestions are not preselected.

**Why this priority**: A power-user accelerator layered on top of a fully functional deterministic recorder. It must never be required for basic recording and is explicitly out of the MVP.

**Independent Test**: With the AI layer disabled, verify the full record-to-insert flow still works. With it enabled, present an action the deterministic matcher cannot confidently match and verify an AI suggestion appears with a confidence and reason, is validated against the definition's argument schema, and is only applied after explicit confirmation.

**Acceptance Scenarios**:

1. **Given** the AI feature flag is off, **When** the user records and inserts a scenario, **Then** the entire flow works with no AI provider configured.
2. **Given** the AI layer is on and returns a high-confidence match, **When** it is shown, **Then** it is presented as a preselected recommendation but still requires the user to confirm insertion.
3. **Given** the AI layer returns a low-confidence or schema-invalid match, **When** it is evaluated, **Then** it is not preselected and not silently accepted; the deterministic/generic step or a manual selection is retained.
4. **Given** the AI proposes grouping several actions into one business step, **When** it is shown, **Then** the affected actions are inspectable and nothing is replaced until the user confirms.

---

### Edge Cases

- **Playwright not installed / browser binary missing**: the recorder reports a clear, actionable message (what is missing and how to resolve it) instead of failing silently.
- **Browser launch fails or the target page closes mid-recording**: the session moves to an error/stopped state with a recovery action; already-captured actions are preserved.
- **The private recording capability changes in a future browser-engine version**: recording is isolated so a capability change surfaces as a single, understandable "recorder unavailable" error rather than a crash, and the pinned engine version is respected.
- **The workspace changes or is closed during recording**: the session is stopped safely and the user is informed; partial results are not silently discarded without notice.
- **No step definitions are available**: the recorder still captures actions but tells the user that no matches can be produced until step definitions exist.
- **A chosen locator is not unique or no longer matches**: the action is flagged as "needs review" with an explanation rather than being accepted as-is.
- **A generated step is missing required arguments**: the action is marked as needing review and cannot be inserted until the argument is supplied.
- **AI provider unavailable or returns an invalid/low-confidence response**: recording continues deterministically; the user is informed the assistance was skipped.
- **Sensitive value in an unexpected field** (e.g., a token typed into a text input named "authorization"): the field-name heuristic still masks it and creates a secret reference.
- **Duplicate or ambiguous step matches**: the user is shown the alternatives and can pick the intended one rather than an arbitrary match being chosen.

## Requirements _(mandatory)_

### Functional Requirements

**Recording lifecycle & capture**

- **FR-001**: The system MUST launch a SuiSui-controlled browser from the desktop application when the user starts recording, and MUST NOT display or depend on Playwright's default Inspector window **or its in-page overlay** (the injected element picker + assertion dialog Playwright draws on the recorded page).
- **FR-001a**: The system MUST suppress Playwright's in-page overlay during recording and MUST provide **its own in-browser element picker** — a SuiSui-owned hover-highlight + click-to-pick "pick mode", activatable from the SuiSui UI — used for both (a) selecting/adjusting the target element of an action and (b) choosing the target element of an assertion, including elements the user never interacted with. Element highlighting (FR-011) MUST use this SuiSui overlay, not Playwright's.
- **FR-002**: The system MUST let the user start, pause, resume, and stop a recording, and MUST reflect the current status (idle, starting, recording, paused, stopping, error).
- **FR-003**: The system MUST capture, at minimum, these interaction types in the first release: navigate, click, double-click, fill, select, check, uncheck, key press, and basic file upload.
- **FR-004**: The system MUST represent each captured interaction as a structured, editable action rather than as generated test source code, and MUST NOT require the user to read generated code to use the feature. A code preview MAY exist behind an advanced/optional view.
- **FR-005**: The system MUST present captured actions as an ordered list of readable cards using human-friendly descriptions (e.g., 'Open "/login"', 'Click the "Sign in" button').
- **FR-006**: Each action card MUST support editing, deleting, disabling, reordering, replaying, highlighting the target element, changing the locator, changing the matched step, adding to the scenario, and opening the step implementation.

**Element targeting (locators)**

- **FR-007**: For each recorded target, the system MUST generate multiple candidate ways to identify the element by inspecting the element and its useful ancestors, including (at minimum) test-oriented data attributes, id, name, role, accessible name, label, placeholder, and visible text.
- **FR-008**: The system MUST rank candidates by a reliability score that prefers configured test-id attributes and other test-oriented data attributes over role/label/id/name/placeholder/text, and ranks CSS-class and DOM-position selectors lowest.
- **FR-009**: The system MUST reduce a candidate's score and attach a warning when the candidate contains values that appear generated or unstable (e.g., UUID, hash, timestamp, long numeric id, random suffix, framework-generated or CSS-module class name, element index / nth-child).
- **FR-010**: The system MUST recommend the highest-scoring candidate and MUST show, in plain language, why it was chosen (reasons) and any concerns (warnings), including whether it is unique on the page.
- **FR-011**: Users MUST be able to select a different candidate for any action, MUST be able to highlight the current target in the controlled browser (via SuiSui's overlay) to confirm it, and MUST be able to **re-pick the target by clicking a different element** in the live browser using SuiSui's picker (FR-001a), after which the candidate set is re-derived for the newly picked element.
- **FR-012**: The workspace MUST be able to configure preferred test-id attributes and whether role, text, and CSS-fallback locators are allowed; the system MUST honor these settings when ranking candidates.
- **FR-013**: Each recorded target MUST have a human-readable name derived in a preferred order (accessible name → associated label → aria-label → button/link text → placeholder → test-id turned into readable text → tag plus nearby context), and the user MUST NOT be required to understand the final selector in the standard interface.

**Matching to step definitions**

- **FR-014**: The system MUST match recorded actions to the workspace's existing step definitions using a deterministic strategy first, populating step arguments automatically for known bundled steps without requiring AI.
- **FR-015**: The system MUST support optional project-provided metadata that maps custom step definitions to recorded action types and arguments, and MUST be extensible to additional metadata sources without redesign.
- **FR-016**: When deterministic matching is not confident, and only if the optional AI layer is enabled, the system MAY offer an AI-suggested match; it MUST validate any AI suggestion against the real definition and its argument schema, MUST show confidence and reasoning, MUST NOT preselect low-confidence suggestions, and MUST NOT accept any suggestion silently.
- **FR-017**: Users MUST be able to change the matched step for any action and re-map its arguments.
- **FR-018**: The system MUST surface duplicate and ambiguous matches to the user for disambiguation rather than choosing arbitrarily.

**Scenario insertion & step provenance**

- **FR-019**: On confirmation, the system MUST insert only the kept, enabled actions, in order, into the currently selected scenario as valid BDD steps, and the resulting Gherkin feature file MUST be valid and runnable by the existing runner.
- **FR-020**: The system MUST track, for each recorded step, its source step definition and recording provenance (which recorded actions it came from, the matching confidence, the chosen locator, and whether it was produced deterministically, by AI, or by the user), without requiring this metadata to be stored inside the executable Gherkin file.
- **FR-021**: The `.feature` file MUST remain the source of truth for executable Gherkin; any recorder-specific metadata MUST be reconstructable from matching or stored outside the Gherkin as optional supplementary data.

**Step source locations**

- **FR-022**: Every step definition surfaced in SuiSui MUST expose its source location (file and line, optionally column) so the user can open its implementation.
- **FR-023**: The system MUST keep step definitions that share the same pattern but live at different locations distinguishable from one another (they MUST NOT be collapsed into one by pattern alone), and each MUST carry a stable identifier that survives catalog refreshes when the definition has not moved or changed.
- **FR-024**: Users MUST be able to open a step definition's implementation at the correct file and line via the configured or system editor; when a location is unknown the action MUST be unavailable rather than opening the wrong target.

**Sensitive data**

- **FR-025**: The system MUST detect password and sensitive fields (password inputs, current/new-password autofill hints, and fields whose names suggest password, token, secret, api-key, or authorization).
- **FR-026**: The system MUST never display captured sensitive values in clear text, MUST never write them into a feature file as a literal by default, MUST never send them to any AI provider, and MUST represent them by a committable name (a test-profile name or a named secret reference) that the user can rename.

**Test profiles, credential resolution & recording context (issues #98, #105, #106)**

- **FR-026a**: When the Test Profiles capability (#98) is available, the system MUST resolve captured login credentials to a named test profile and SHOULD offer to collapse a recognized login sequence into a profile-based login step (e.g. `I am logged in as "Admin"`); when it is not available, the system MUST fall back to a named secret reference. In both cases only the committable name is written to the `.feature`, and the secret is resolved at run time (encrypted local store in the app; environment/CI secrets in CI).
- **FR-026b**: The system MUST conduct recording against the workspace's configured base URL and active test profile/run context, consistent with how scenarios are executed, so recorded targets and navigations match the environment the scenario will run in.
- **FR-018a**: When a recorded action has no matching catalog step, the system MUST flag it as a gap (never silently discard it), MUST offer to route it to the missing-step stub generation flow (#100) where that capability exists, and MUST still allow the matched actions to be inserted.
- **FR-019a**: The system MUST separate raw capture (the ordered action log) from conversion (mapping the log to catalog steps), so the cleaned, user-edited action log produced by the recording UX (#106) is the input handed to the conversion step (#105) — enabling either deterministic conversion or, when enabled, AI-assisted conversion over the same log.

**Assertions**

- **FR-027**: The system MUST provide an explicit assertion mode — replacing Playwright's assertion overlay — that lets the user choose an assertion target by **picking any element in the live browser via SuiSui's own picker (FR-001a)** or by selecting a page condition, and choose an assertion type. The **first release MUST support the full assertion set**: visible, hidden, contains text, has value, is checked, is enabled, has element count, URL contains/equals, and page title contains/equals.
- **FR-028**: The system MUST offer suggested assertions by comparing page state before and after an interaction, MUST present them as optional, and MUST NOT add any suggested assertion to the scenario without explicit user acceptance.
- **FR-029**: Generated assertion steps MUST express genuine expectations (a real check) rather than a manual wait for state.

**Optional AI layer (feature-flagged)**

- **FR-030**: All AI-assisted capabilities (step matching, action grouping, assertion suggestions, locator repair) MUST sit behind a feature flag and MUST NOT be a dependency of basic recording; with AI disabled the full record-to-insert flow MUST work.
- **FR-031**: The system MUST never delete, replace, or group recorded actions without explicit user confirmation, and MUST let the user inspect the affected actions before accepting a grouping.
- **FR-032**: For locator repair, the system MUST require user confirmation before applying a replacement unless confidence is extremely high and automatic repair has been explicitly enabled by the user.

**Errors & resilience**

- **FR-033**: The system MUST handle and clearly explain, with recovery guidance where possible: Playwright not installed, missing browser binary, a change in the underlying recording capability, browser launch failure, the target page closing, the workspace changing during recording, no step definitions available, a non-unique or no-longer-matching locator, a step with missing arguments, and AI provider unavailability or invalid AI responses.
- **FR-034**: A failure affecting one action, one file, or the AI layer MUST NOT abort the whole recording session or discard already-captured actions without notice.

**Process & security boundaries**

- **FR-035**: Browser control, recording, locator analysis, step matching, secret handling, and any AI provider access MUST remain in the desktop application's privileged process; the user-facing layer MUST communicate only through the existing typed, validated channel and MUST NOT be granted arbitrary file-system or browser access.
- **FR-036**: The dependency used to drive and capture the browser MUST be version-pinned, and the private recording capability MUST be isolated behind a single adapter so that no user-facing component or domain logic depends on it directly.

### Key Entities _(include if feature involves data)_

- **Recording Session**: One recording activity with a status (idle → starting → recording ⇄ paused → stopping → error), the page(s) involved, the current browser URL, and the ordered actions captured so far.
- **Recorded Action**: A single captured interaction or assertion, with its type, human-readable label, optional value (possibly marked secret), candidate targets, chosen target, matched step and confidence, and a review status (draft, matched, needs-review, accepted).
- **Element Target / Locator Candidate**: A semantic way to identify an element (test attribute, role+name, label, placeholder, text, name, id, or CSS fallback), each with a reliability score, uniqueness, number of matched elements, and human-readable reasons and warnings. The recommended one is the highest-scoring candidate.
- **Element Fingerprint**: Durable descriptive information about a recorded element (tag, accessible name, role, label, placeholder, test attributes, nearby text, ancestor context) used to explain choices and to support later locator repair.
- **Step Match**: The association between a recorded action and an existing step definition, including the resolved arguments, the confidence, and how it was produced (deterministic, project metadata, AI, or user).
- **Step Definition (as surfaced to the recorder)**: An existing usable step with its keyword, pattern, argument schema, source location (file/line), a stable identifier, and whether it is a bundled generic step; may carry recorder-oriented metadata mapping it to an action type and arguments.
- **Secret Reference**: A named placeholder standing in for a captured sensitive value, used in place of the literal everywhere it would otherwise appear.
- **Test Profile (reference)**: A named credential set defined by the Test Profiles capability (#98); the recorder references it by name so a recorded login becomes a profile-based login step, with the actual credentials resolved at run time and never committed.
- **Recording Context**: The environment a session runs against — the workspace's configured base URL and active test profile/run context — so captured targets and navigations align with execution.
- **Assertion**: A recorded expectation about an element or the page (visible, text, URL, etc.), either explicitly added or accepted from a suggestion.
- **Recorder Locator Settings**: Per-workspace configuration of preferred test-id attributes and which locator strategies (role, text, CSS fallback) are allowed.
- **Element Picker (pick mode)**: SuiSui's own in-browser overlay (hover-highlight + click-to-pick) that replaces Playwright's overlay. Activated from the SuiSui UI, it captures the next element the user clicks in the live browser and returns its identity to SuiSui — used to set/adjust an action's target and to choose an assertion target on any element.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A non-developer can record the canonical login flow (navigate → fill email → fill password → click submit → verify a result is visible) and insert valid, runnable scenario steps in under 3 minutes, without reading any CSS selector or generated code.
- **SC-002**: For the first-release interaction set (navigate, click, fill, select, check/uncheck, press, basic upload), at least 90% of recorded actions are automatically matched to an appropriate bundled step with arguments populated, requiring no manual step selection.
- **SC-003**: Whenever a recorded element carries a configured test-id attribute that is unique on the page, that attribute is the recommended target 100% of the time.
- **SC-004**: Sensitive values never appear in clear text anywhere the user or downstream systems can see them — 0 occurrences in action cards, inserted steps / feature files, git diffs, or any AI request payload — verified across recorded flows containing password, token, secret, api-key, and authorization fields; only committable names (test-profile names or secret references) appear.
- **SC-004a**: When Test Profiles (#98) is available, a recorded login sequence is offered as a single profile-based login step in at least 90% of standard username+password+submit flows, and the resulting `.feature` contains only the profile name.
- **SC-004b**: 100% of recorded actions with no matching catalog step are surfaced to the user as gaps (never silently dropped), and the matched actions in the same session remain insertable.
- **SC-005**: 100% of confirmed recordings using only first-release step types produce a syntactically valid `.feature` file that executes through the existing runner with no step-resolution errors.
- **SC-006**: Every recorded target displays a human-readable name and, when its target selector is inspected, a reliability rating with at least one plain-language reason; users can switch to an alternative candidate in a single action.
- **SC-007**: The complete record-to-insert flow succeeds with no AI provider configured (AI disabled), confirming AI is never required for basic recording.
- **SC-008**: For every one of the enumerated error conditions, the recorder surfaces a specific, human-readable message (and a recovery action where one exists) instead of an unhandled failure, and already-captured actions are preserved.
- **SC-009**: For a step matched to a definition with a known location, "Open implementation" opens the correct file at the correct line in at least 95% of attempts; definitions sharing a pattern but differing in location always resolve to their own distinct source.
- **SC-010**: The recorder captures a session of at least 100 sequential actions without losing or reordering any captured action.
- **SC-011**: Playwright's in-page overlay is never visible during a SuiSui recording session; using SuiSui's own picker, a user can add an assertion on an element they never interacted with, and can re-pick an action's target by clicking a different element — in both cases SuiSui re-derives the candidate set.
- **SC-012**: All full-set assertion types (visible, hidden, contains text, has value, is checked, is enabled, has element count, URL contains/equals, page title contains/equals) can be recorded in the MVP and produce genuine `expect`-style checks that pass/fail with page state.

## Assumptions

- **Reuses the existing native step catalog (feature 006)**: SuiSui already exposes step definitions as structured data including source locations (file/line/column), stable identifiers, argument schemas, and precision/origin metadata. This recorder consumes that catalog as its source of step metadata rather than re-introducing text-based export parsing. FR-022–FR-024 are satisfied by that catalog; this feature adds recorder-oriented metadata on top.
- **Default browser engine**: Recording uses a Chromium-based browser by default; multi-browser and mobile recording are out of scope for the first release.
- **Secret reference format**: In the absence of a pre-existing project secret convention, sensitive values are represented as an environment-variable-style placeholder (e.g., `<LOGIN_PASSWORD>`); if the workspace already has a secret syntax, that is used instead.
- **Test Profiles (#98) is a separate, possibly-not-yet-built capability**: the recorder integrates with it when present (resolving credentials to profile names) and degrades gracefully to named secret references when it is absent. This spec depends on #98 for the richer login mapping but does not itself implement profile storage, encryption, or CI resolution.
- **Missing-step stub generation (#100) is a separate capability**: the recorder flags unmatched actions as gaps and offers a handoff to it when present; it does not generate step-definition source code itself.
- **Recording context**: the recorder uses the same base URL / run context resolution as scenario execution (see the flexible test runner, feature 002), rather than defining its own.
- **Recorder-metadata storage**: Recorder provenance is primarily reconstructed from step matching; an optional supplementary (sidecar) store MAY be used, but recorder metadata is not written into the executable Gherkin.
- **Generic step vocabulary**: SuiSui's bundled generic steps cover the first-release action set (click, fill, select, check/uncheck, navigate, press, upload) and the **full assertion set** (visible, hidden, contains text, has value, is checked, is enabled, has element count, URL contains/equals, page title contains/equals) and carry machine-readable recorder metadata mapping each to an action type and its argument roles; assertion steps express genuine expectations. Where a workspace lacks one of these steps, the corresponding action/assertion surfaces as a gap (FR-018a).
- **Editor for "Open implementation"**: The configured editor is used when set; otherwise the operating system's default handler for the source file is used.
- **Fixture pages for testing**: Recorder end-to-end tests run against stable local fixture pages rather than external sites.
- **Playwright version is pinned** because the recording capability relies on a private, version-sensitive API isolated behind an adapter.

## Dependencies

- The workspace has Playwright and step definitions available; the existing test runner and Gherkin generation continue to be the execution path.
- The existing scenario/step model and step catalog (feature 006) are extended, not replaced; existing scenario creation and Gherkin generation behavior is preserved.
- The optional AI layer depends on the existing multi-provider AI capability (feature 005, issue #99) and its configured provider, but only when the feature flag is enabled.
- **Richer login mapping depends on Test Profiles ([#98](https://github.com/Asteb612/SuiSui/issues/98))**; the recorder degrades to named secret references without it.
- **Gap handoff depends on missing-step stub generation ([#100](https://github.com/Asteb612/SuiSui/issues/100))**; without it, gaps are still flagged but not auto-routed.
- **Recording context reuses the flexible test runner (feature 002)** for base URL / run configuration.
- The AI-assisted locator repair (US6) is the recorder-side realization of approval-based self-healing ([#103](https://github.com/Asteb612/SuiSui/issues/103)); full failure-time self-healing across existing scenarios remains #103's own scope.

## Traceability (issues → spec)

| Issue                                                             | Title                                                      | How this spec addresses it                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#106](https://github.com/Asteb612/SuiSui/issues/106)             | In-app recording UX (controls, assertions, element picker) | **US1** (in-app start/pause/resume/stop, no raw-code window; live plain-language action list; delete/reorder), **US2** (element picker / hover-highlight, target selection), **US4** (point-and-click assertion mode). FR-001–FR-006, FR-011, FR-027. Its "hand off the cleaned action log to conversion" is FR-019a. Its base-URL/profile requirement is FR-026b. |
| [#105](https://github.com/Asteb612/SuiSui/issues/105)             | Record-and-convert → catalog-mapped scenario               | **US1** (capture → map to catalog steps → editable draft, not auto-commit), **US6** (optional AI mapping). Refined to **deterministic-first** mapping (FR-014) with AI optional (FR-016, FR-030). Unmatched → gap + stub handoff = FR-018a. Credentials → profiles, never inline = US3 / FR-026a.                                                                  |
| [#98](https://github.com/Asteb612/SuiSui/issues/98)               | Test profiles: encrypted local credentials                 | **US3** + FR-026a/FR-026b: recorded logins resolve to profile names; only the name is committed; secrets resolve at run time (local encrypted store / CI env). _Consumes_ #98; does not implement it.                                                                                                                                                              |
| [#103](https://github.com/Asteb612/SuiSui/issues/103)             | Approval-based self-healing for broken selectors           | **US6** locator repair — suggested, never silent (FR-032). Recorder-side realization; failure-time healing of existing scenarios stays in #103.                                                                                                                                                                                                                    |
| [#100](https://github.com/Asteb612/SuiSui/issues/100)             | Missing-step → dev stub generation                         | FR-018a routes unmatched recorded actions to the stub flow; the recorder flags the gap, #100 generates the stub.                                                                                                                                                                                                                                                   |
| [#99](https://github.com/Asteb612/SuiSui/issues/99) / feature 005 | AI foundation (provider config, BYOK, consent)             | The optional AI layer (US6) runs only when this foundation is configured and the feature flag is on (FR-030).                                                                                                                                                                                                                                                      |
| feature 006                                                       | Native step catalog                                        | Supplies structured step metadata + source locations the recorder consumes (FR-022–FR-024).                                                                                                                                                                                                                                                                        |
| feature 002                                                       | Flexible test runner                                       | Supplies base URL / run context for recording (FR-026b) and executes the generated `.feature`.                                                                                                                                                                                                                                                                     |

## Out of Scope (first release)

- Fully automatic AI test generation.
- Automatic, silent locator repair without confirmation.
- Visual-regression recording, network-request mocking, loops/conditions.
- Cross-browser simultaneous recording and mobile-device recording.
- Automatic generation of new custom step-definition source code from the UI.
- Reproducing the complete step-matching engine of the underlying BDD tooling.
