# Feature Specification: AI Scenario Generation from Available Steps

**Feature Branch**: `012-ai-scenario-generation`
**Created**: 2026-07-30
**Status**: Draft
**Input**: User description: "issue 63 and 102 — on scenario create or edit, if the AI is activated, propose a prompt that will generate a scenario only using the available steps. Also use in priority the project steps and fallback to the generic steps if they are available."

## Clarifications

### Session 2026-07-30

- Q: When generating against an existing, non-empty scenario, does the draft extend it or replace it? → A: The tester chooses per generation — extend (keep all existing steps) or redraft (replace the scenario).
- Q: How is a requirement reference carried on an accepted scenario? → A: As a comment line above the scenario in the feature file.

## Overview

Testers describe what they want to test in plain language; the assistant proposes a
complete draft scenario **assembled exclusively from steps that already exist in the
workspace**. The assistant never invents step text. When the workspace has its own
project-authored steps, those are used in preference to the generic starter steps the
application provisions for a new workspace; the generic steps are a fallback, used only
where no project step covers the intent.

The draft is always shown for review before it becomes part of the scenario. Anything the
available steps cannot express is reported as a **gap**, not papered over with invented
Gherkin.

This closes out the two open threads: free-form description → scenario (issue #63) and
requirement / acceptance-criteria → scenario (issue #102).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Draft a new scenario from a description (Priority: P1)

A tester creates a new scenario. Because the assistant is configured, the create flow
offers a "describe it instead" affordance. The tester types "A logged-in customer adds two
items to the basket and checks out", and receives a draft scenario — name, tags, and an
ordered list of steps — where every step is one of the workspace's real steps with its
arguments filled in. The tester reviews it, edits anything they disagree with, and keeps it.

**Why this priority**: This is the core value: going from an idea to a runnable draft in
one step. It is the slice that makes the feature worth shipping on its own, and it works
without any of the later stories.

**Independent Test**: With a workspace containing a known set of steps and the assistant
configured, submit a description and confirm a draft scenario is proposed in which every
step matches an existing step in the workspace, and that discarding the draft leaves the
scenario untouched.

**Acceptance Scenarios**:

1. **Given** the assistant is configured and the workspace has steps, **When** the tester
   opens the new-scenario flow, **Then** an option to generate the scenario from a
   description is offered.
2. **Given** the assistant is not configured, **When** the tester opens the new-scenario
   flow, **Then** no generation option is offered and the flow behaves exactly as it does today.
3. **Given** a submitted description, **When** the draft is returned, **Then** every
   proposed step corresponds to an existing step in the workspace and no free-text step is present.
4. **Given** a returned draft, **When** the tester accepts it, **Then** the steps appear in
   the scenario builder ready for further editing, and nothing is written to disk until the
   tester saves as they do today.
5. **Given** a returned draft, **When** the tester discards it, **Then** the scenario is
   left exactly as it was before generation.
6. **Given** generation is in progress, **When** the tester cancels, **Then** generation
   stops and the scenario is unchanged.

---

### User Story 2 - Project steps preferred, generic steps as fallback (Priority: P1)

The workspace contains both the generic starter steps that the application provisioned when
the workspace was initialised and steps the team wrote themselves. When both could express
the same intent, the draft uses the team's own step. A generic step appears only where no
project step covers that intent. The tester can see, per step, which of the two it came from.

**Why this priority**: Without this, drafts are dominated by starter steps the team has
outgrown, and the feature actively works against the project's own step library. It is
inseparable from Story 1 being useful in a real workspace.

**Independent Test**: In a workspace where a project step and a generic step express the
same intent, submit a description covering that intent and confirm the project step is the
one proposed. Remove the project step and confirm the generic step is then proposed.

**Acceptance Scenarios**:

1. **Given** a project step and a generic step that both cover the described intent,
   **When** a draft is generated, **Then** the project step is used.
2. **Given** only a generic step covers a described intent, **When** a draft is generated,
   **Then** the generic step is used.
3. **Given** the workspace has no generic starter steps (the team deleted or replaced them),
   **When** a draft is generated, **Then** only project steps are used and generation still succeeds.
4. **Given** a returned draft, **When** the tester reviews it, **Then** each step indicates
   whether it is a project step or a generic step.

---

### User Story 3 - Extend or redraft an existing scenario (Priority: P2)

A tester is editing an existing scenario and wants help finishing it — "now add the part
where the payment is declined". The assistant is given the scenario as it currently stands
plus the description, and proposes steps that continue from it, again only from available
steps. The tester chooses whether the proposal **extends** the scenario or **redrafts** it
from scratch; extend is what they get unless they say otherwise. The existing scenario is
never modified until the tester accepts.

**Why this priority**: High value, but Story 1 already delivers a shippable feature. This
story extends the same machinery to the edit surface.

**Independent Test**: Open an existing scenario in edit mode, request generation with a
description, and confirm both the extend and the redraft outcome can be reviewed before
anything changes, and that the scenario on screen is unchanged until accepted.

**Acceptance Scenarios**:

1. **Given** a scenario open in edit mode and the assistant configured, **When** the tester
   requests generation, **Then** the current scenario content is used as context for the proposal.
2. **Given** a non-empty scenario, **When** the tester requests generation, **Then** they are
   offered extend and redraft, with extend pre-selected.
3. **Given** an extend proposal, **When** the tester reviews it, **Then** it is clear which
   steps are being added and where they land relative to the existing steps.
4. **Given** a redraft proposal, **When** the tester reviews it, **Then** they see what the
   scenario is now against what it would become, including which existing steps would be lost.
5. **Given** a redraft proposal, **When** the tester accepts it, **Then** an explicit
   confirmation is required that is distinct from accepting an extend.
6. **Given** an accepted extend, **When** the tester looks at the scenario, **Then** every step
   and argument that was there before is still there.
7. **Given** a proposal for an existing scenario, **When** the tester discards it, **Then**
   the scenario retains every step and argument it had before, whichever mode was selected.
8. **Given** an empty scenario, **When** the tester requests generation, **Then** no
   extend/redraft choice is presented.

---

### User Story 4 - Report what the available steps cannot express (Priority: P2)

The description asks for something no available step covers — "and verify the confirmation
email arrives". Rather than inventing a step, the draft reports this as an uncovered part of
the request, in the tester's own words, alongside the steps it _was_ able to assemble.

**Why this priority**: This is what makes "only available steps" honest instead of silently
lossy. It also gives the team a concrete list of steps worth asking a developer for.

**Independent Test**: Submit a description containing one intent that no available step
covers and confirm the draft returns the covered steps plus an explicit note of the
uncovered intent, with no invented step in the step list.

**Acceptance Scenarios**:

1. **Given** a description containing an intent no available step covers, **When** the draft
   is returned, **Then** the uncovered intent is reported separately and no invented step
   appears among the proposed steps.
2. **Given** no available step covers any part of the description, **When** generation
   completes, **Then** the tester is told a scenario could not be assembled and why, and the
   scenario is unchanged.

---

### User Story 5 - Generate from a requirement or acceptance criteria (Priority: P3)

Instead of a free-form sentence, the tester pastes a user story or a set of acceptance
criteria. The assistant proposes one or more scenarios covering them — again only from
available steps — and the tester reviews and keeps the ones they want.

**Why this priority**: This is issue #102's specific ask. It is a different input shape over
the same pipeline, so it is worth doing but does not block the earlier stories.

**Independent Test**: Paste multi-criterion acceptance criteria and confirm the resulting
proposal covers each criterion as a distinct scenario, reviewable independently.

**Acceptance Scenarios**:

1. **Given** pasted acceptance criteria containing several criteria, **When** a draft is
   generated, **Then** one scenario per criterion is proposed.
2. **Given** several proposed scenarios, **When** the tester reviews them, **Then** they can
   keep some and discard others independently.
3. **Given** a requirement reference was supplied, **When** a proposed scenario is kept and
   saved, **Then** a comment line recording that reference sits immediately above the
   scenario in the feature file.
4. **Given** a saved scenario carrying a requirement comment, **When** it is reopened, edited,
   and saved again, **Then** the comment is still there, unchanged and in the same position.
5. **Given** a scenario with a hand-written comment above it, **When** it is edited and saved,
   **Then** that comment is preserved.

---

### Edge Cases

- **No steps available at all** (empty or unreadable step catalog): generation is not
  offered, and the tester is told why rather than being given an empty prompt box.
- **Assistant configured but unreachable** (provider down, credentials rejected, offline):
  the failure is reported in plain language, the scenario is unchanged, and the tester can retry.
- **Very large step libraries**: the request must still succeed when the workspace has many
  hundreds of steps; if not all steps can be considered at once, the tester is told that the
  proposal was made from a subset, so an unexpected omission is explained rather than mysterious.
- **A proposed step is real but its arguments are wrong or missing** (e.g. a required value
  the description never mentioned): the step is still proposed, and the missing or unverifiable
  argument is flagged for the tester to complete rather than silently guessed.
- **A proposed step no longer exists** (catalog changed mid-generation): that step is dropped
  from the draft and reported, rather than inserted as unrunnable text.
- **The proposal is not valid Gherkin** or fails the existing scenario validation: the tester
  sees the validation problems in the review, and acceptance of an invalid draft is prevented
  or explicitly flagged.
- **Description in a language other than English**, or containing prose irrelevant to testing:
  generation still returns either a draft or an explicit "nothing could be assembled" result,
  never a partial silent failure.
- **Repeated generation**: regenerating replaces the previous unaccepted draft; it never
  accumulates duplicate drafts.
- **Tester closes the dialog or navigates away mid-generation**: generation is cancelled and
  no draft is applied.
- **Redraft of a scenario with hand-tuned arguments**: the tester must be able to see what
  they are about to lose before confirming, and there is no undo once saved — the pre-accept
  comparison is the only safeguard.
- **Redraft proposal is worse than what exists**: discarding must restore nothing, because
  nothing was changed; the scenario was never touched.
- **A scenario already carries a requirement comment** and a new requirement-driven
  generation runs against it: the existing comment must not be silently duplicated or
  replaced without the tester seeing it.
- **A comment sits between the tags and the scenario line**, or several comments are stacked:
  saving must not reorder, merge, or drop them.
- **A requirement reference containing characters that would break the feature file** (line
  breaks in a pasted URL or ticket title): the recorded comment must remain a single valid
  comment line and must not corrupt the file.
- **Feature files with CRLF line endings**: writing a comment must not rewrite the rest of
  the file's line endings.

## Requirements _(mandatory)_

### Functional Requirements

**Availability and entry points**

- **FR-001**: The generation affordance MUST be offered only when the assistant is configured
  and enabled; when it is not, every existing create and edit flow MUST behave exactly as it does today.
- **FR-002**: The generation affordance MUST be reachable when creating a new scenario and
  when editing an existing one.
- **FR-003**: Generation MUST NOT be offered when the workspace exposes no usable steps; the
  tester MUST be told why.

**Constrained assembly**

- **FR-004**: Every step in a proposed draft MUST correspond to a step that exists in the
  workspace at the time of generation. Invented, paraphrased, or free-text steps MUST NOT
  appear in a proposed draft.
- **FR-005**: The system MUST verify each proposed step against the available steps before
  showing the draft, and MUST drop and report any proposed step that does not correspond to
  a real one, rather than displaying it as if it were valid.
- **FR-006**: Argument values proposed for a step MUST be presented as editable values, and
  any argument the system could not derive from the tester's input MUST be flagged as needing
  the tester's attention rather than silently invented.
- **FR-007**: Any part of the tester's request that the available steps cannot express MUST
  be reported explicitly alongside the draft, in the tester's own words.

**Project-steps-first**

- **FR-008**: The system MUST classify each available step as either a **project step**
  (authored by the team) or a **generic step** (provisioned by the application when the
  workspace was initialised).
- **FR-009**: When both a project step and a generic step could express the same intent, the
  draft MUST use the project step.
- **FR-010**: Generic steps MUST be used only where no project step covers the intent, and
  generation MUST succeed whether the workspace has only project steps, only generic steps,
  or both.
- **FR-011**: The review UI MUST show, per proposed step, whether it is a project step or a
  generic step.

**Review before acceptance**

- **FR-012**: A generated draft MUST be presented for review and MUST NOT modify the tester's
  scenario until explicitly accepted.
- **FR-013**: The tester MUST be able to accept, discard, or regenerate a draft; discarding
  MUST leave the scenario exactly as it was.
- **FR-014**: An accepted draft MUST enter the normal scenario editing flow, and MUST NOT be
  written to disk except through the tester's existing save action.
- **FR-015**: A draft MUST be checked by the existing scenario validation before acceptance,
  and any validation problems MUST be shown in the review.
- **FR-016**: When generating against an existing scenario, the review MUST distinguish
  proposed additions from the scenario's current content.
- **FR-017**: The tester MUST be able to cancel an in-progress generation, and cancelling
  MUST leave the scenario unchanged.

**Requirement-driven input (issue #102)**

- **FR-018**: The tester MUST be able to supply a requirement or acceptance criteria as input
  in addition to a free-form description.
- **FR-019**: When the input contains multiple distinct criteria, the system MUST propose one
  scenario per criterion, each reviewable and acceptable independently.
- **FR-020**: When a requirement reference is supplied, it MUST be recorded on each accepted
  scenario so the originating requirement remains discoverable afterwards.

**Failure handling and privacy**

- **FR-021**: Failures (provider unreachable, rejected credentials, timeout, unusable
  response) MUST be reported in plain language, MUST leave the scenario unchanged, and MUST
  allow a retry.
- **FR-022**: If the proposal had to be made from a subset of the available steps, the tester
  MUST be told, so an unexpectedly missing step is explained.
- **FR-023**: The tester's description and the step information sent for generation MUST be
  subject to the same consent and privacy handling as the assistant's existing features; no
  credentials or secrets MUST be included in what is sent.

**Extend vs redraft (existing scenarios)**

- **FR-024**: When generating against an existing, non-empty scenario, the tester MUST choose
  per generation between **extend** (the proposed steps are added to the scenario, every
  existing step and argument kept) and **redraft** (the proposal replaces the scenario's steps).
- **FR-025**: Extend MUST be the pre-selected choice, so the non-destructive outcome is the
  one a tester gets by not thinking about it.
- **FR-026**: The review MUST present the two choices differently: for extend, which steps are
  being added and where; for redraft, what the scenario looks like now versus what it would
  become, including which existing steps would be lost.
- **FR-027**: Redraft MUST require an explicit confirmation distinct from accepting an extend,
  and MUST NOT be reachable by a single mis-click from the extend flow.
- **FR-028**: When the scenario being edited is empty, the choice MUST NOT be presented — there
  is nothing to preserve and nothing to lose.

**Requirement traceability**

- **FR-029**: A supplied requirement reference MUST be recorded as a comment line immediately
  above the scenario in the feature file, so it is committed with the test and readable by
  anyone reading the repository.
- **FR-030**: The comment MUST survive the full edit-and-save round trip: a scenario carrying a
  requirement comment that is opened, edited, and saved MUST still carry that comment, unchanged
  and in the same position.
- **FR-031**: Comments a tester wrote by hand above a scenario MUST NOT be destroyed by this
  feature — saving a scenario MUST NOT silently drop them.
- **FR-032**: The recorded reference MUST accept a free-form value, including a URL or an issue
  reference, without imposing tag-safe character restrictions.
- **FR-033**: A requirement comment MUST NOT be interpreted as a step, tag, or scenario
  description when the feature file is read back.

### Key Entities

- **Generation Request**: what the tester asked for — a free-form description or a pasted
  requirement / acceptance criteria, an optional requirement reference, and the scenario
  currently being edited (empty when creating).
- **Available Step**: a step that exists in the workspace and can be used in a draft. Carries
  its wording, its arguments, and its **tier**: project or generic.
- **Draft Scenario**: a proposed, not-yet-accepted scenario — a name, optional tags, and an
  ordered list of **Draft Steps**, plus its validation outcome.
- **Draft Step**: one proposed step — a reference to an Available Step, the proposed argument
  values, which of those values need the tester's attention, and the tier it came from.
- **Coverage Gap**: a part of the request that no available step could express, expressed in
  the tester's own words.
- **Requirement Link**: the reference supplied with a requirement-driven request, retained on
  accepted scenarios.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of steps in accepted drafts correspond to steps that exist in the
  workspace — zero invented steps reach a tester's scenario.
- **SC-002**: In a workspace where project steps and generic steps overlap in meaning, at
  least 90% of proposed steps that have a project equivalent use the project step.
- **SC-003**: A tester goes from a one-sentence description to a reviewable draft scenario in
  under 30 seconds for a workspace of up to 500 steps.
- **SC-004**: A tester produces a complete scenario at least 3× faster with generation than
  by picking each step by hand, measured on a 6–10 step scenario.
- **SC-005**: In 100% of discard and cancel cases, the scenario is identical to its
  pre-generation state.
- **SC-008**: In 100% of accepted extends, no step or argument present before the generation
  is missing afterwards.
- **SC-009**: No tester loses scenario content to a redraft they did not intend: every
  replacement is preceded by a comparison and a confirmation distinct from the extend flow.
- **SC-010**: 100% of comments above a scenario — recorded references and hand-written alike —
  survive an open-edit-save cycle unchanged and in position.
- **SC-006**: Every generation attempt ends in one of three explicit outcomes — a draft, an
  explicit "could not be assembled" with a reason, or a reported failure. No attempt ends
  with no feedback.
- **SC-007**: At least 80% of accepted drafts pass existing scenario validation without the
  tester having to change a step, argument values excepted.

## Assumptions

- **Generic steps are identified by the step-definition file the application itself
  provisions** when a workspace is initialised. Steps defined anywhere else in the workspace
  are project steps. If a team edits the provisioned file in place, its steps continue to be
  treated as generic — a knowingly imperfect but predictable rule.
- **"Available steps" means the workspace's current step catalog**, the same source that
  already populates the step picker. Generation does not introduce a second, separate notion
  of what steps exist.
- **The assistant is a draft generator only.** Correctness is enforced after the fact by
  matching against real steps and by the existing validation — never by trusting the
  generated text. This mirrors the project's established position on the assistant's role.
- **Nothing is auto-accepted.** There is no mode in which a generated scenario is written or
  saved without an explicit tester action.
- **Provider configuration, consent, and credential handling are already solved** by the
  existing assistant foundation; this feature consumes them and does not redefine them.
- **Multiple scenarios per request (FR-019)** applies to requirement-driven input; a
  free-form description produces a single scenario.
- Preference between project and generic steps is about **coverage of the same intent**, not
  a hard ban: a draft may legitimately mix both when different intents are covered by
  different tiers.
- **Extend and redraft are a choice, not a mode setting.** The choice is made per generation
  and is not remembered as a preference; extend is always the starting point.
- **There is no undo for an accepted redraft** beyond the tester not having saved yet, plus
  the workspace's version control. The pre-accept comparison (FR-026/FR-027) is the safeguard,
  which is why it is a requirement and not a nicety.
- **The requirement comment is a comment, not structured metadata.** It is written for a human
  reading the feature file. Nothing in this feature parses it back into a queryable link — a
  report over these comments belongs to issue #92.

## Out of Scope

- Generating new step **definitions** (developer code) for uncovered intents — that is the
  missing-step stub feature (issue #100). This feature only reports the gap.
- Recording from a browser session (issues #105, #106) — a different input path to the same builder.
- Self-healing broken selectors or steps (issue #103).
- Generating example / data-table values beyond the arguments of the proposed steps (issue #104).
- A living-documentation or traceability report built on the recorded requirement links
  (issue #92) — this feature records the link, it does not build the report.
- Editing or reorganising the step catalog itself.

## Dependencies

- The existing assistant foundation: provider configuration, enablement state, consent, and
  credential handling (issue #99).
- The workspace step catalog as the source of available steps, including the tier
  distinction needed by FR-008.
- The existing scenario builder, its create and edit flows, its Gherkin round-trip, and its
  scenario validation.

### Known constraint: the Gherkin round-trip does not carry comments

FR-029 to FR-031 (and SC-010) are **not** satisfiable by the current round-trip. Saving a
scenario regenerates the feature file from the in-memory scenario, and that scenario has no
comment concept — so a comment line written above a scenario is dropped the first time the
tester saves. Reading likewise skips comment lines rather than retaining them.

Choosing a comment as the traceability carrier therefore requires the scenario model and its
Gherkin round-trip to learn to preserve comments above a scenario. This is real work in a
shared, well-exercised code path, not incidental plumbing, and it is a prerequisite for User
Story 5 — it does not affect Stories 1 to 4. Planning should size it explicitly and treat
"an existing hand-written comment survives a save" as a regression test, since today it does not.
