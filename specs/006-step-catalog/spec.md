# Feature Specification: Native Step Catalog for SuiSui

**Feature Branch**: `006-step-catalog`  
**Created**: 2026-07-24  
**Status**: Draft  
**Input**: User description: "Native Step Catalog for SuiSui — replace the fragile text-based `playwright-bdd` step export with an internal, structured step catalog that discovers, analyzes, and exposes every usable BDD step definition as rich, versioned data (source locations, parameter names/types, enum values, table columns, fixtures, documentation, categories/tags, precision levels, and diagnostics), while keeping existing plain `playwright-bdd` projects working and preserving current scenario creation and Gherkin generation."

## User Scenarios & Testing _(mandatory)_

SuiSui users visually assemble Gherkin scenarios from a picker of available step definitions. Today that picker is populated by converting extracted steps into plain-text lines and re-parsing them, which loses nearly everything except the raw pattern and forces the interface to guess parameters. The stories below re-frame the step picker around a structured catalog that captures accurate, source-grounded metadata.

Two audiences matter:

- **Scenario builder** — the person using SuiSui to create/edit tests. Wants a trustworthy, searchable list of steps with correct parameter inputs.
- **Step author** — the person who writes the project's step definitions (in a Playwright BDD project). Wants their steps to appear correctly with zero extra work, and optionally to enrich them with labels and documentation.

### User Story 1 - Trustworthy structured step catalog (Priority: P1)

A scenario builder opens the step picker for a workspace. The catalog lists **every** discoverable step with its correct keyword (Given/When/Then), its exact pattern, and the file and line where it is defined. If one step is dynamic or unsupported, that single step is shown with a warning instead of causing the entire list to fail or come back empty.

**Why this priority**: This is the foundational replacement. Without a reliable, structured catalog that survives odd inputs and carries source information, none of the richer experiences are possible. It also directly removes the fragile "flatten to text then re-parse" round-trip that silently drops information today.

**Independent Test**: Point SuiSui at a Playwright BDD project that contains a mix of plain-string steps, cucumber-expression steps, regular-expression steps, and one intentionally dynamic/unsupported step. Verify all resolvable steps appear with keyword, pattern, and source file+line, and that the unsupported step appears with a diagnostic rather than breaking the catalog.

**Acceptance Scenarios**:

1. **Given** a workspace with valid step definitions, **When** the catalog is generated, **Then** every statically discoverable step appears with its keyword, pattern, pattern kind, source file, and source line.
2. **Given** a workspace where one step definition is dynamically generated or otherwise unsupported, **When** the catalog is generated, **Then** all other steps still appear and the problematic step is returned as a partial entry carrying a warning diagnostic.
3. **Given** a workspace where one step definition **file** cannot be parsed, **When** the catalog is generated, **Then** steps from all other files are still returned and a diagnostic identifies the failing file.
4. **Given** two identical step patterns for the same keyword, **When** the catalog is generated, **Then** a duplicate diagnostic is reported.

---

### User Story 2 - Accurate parameters with the right input control (Priority: P2)

When a scenario builder inserts a step that has parameters, each parameter is presented with its real name and type, and the builder renders the correct input control: a dropdown for enumerated choices, a number field for integers and decimals, a table/grid editor for data-table parameters (with the known columns pre-filled), and a text field for strings. Unknown or unclassified parameters fall back to a plain text input rather than being hidden or mis-rendered.

**Why this priority**: Correct parameter capture is the primary day-to-day value of the picker. Getting names, types, enum options, and table columns straight from the catalog eliminates the guessing the interface does today and prevents invalid input.

**Independent Test**: Build a scenario using a step that takes an enumerated value, a numeric value, and a data table. Verify the enum renders as a dropdown limited to the allowed values, the number renders a numeric control, the table renders a grid with the declared columns, and the resulting Gherkin matches the expected output.

**Acceptance Scenarios**:

1. **Given** a step whose pattern declares an enumerated choice, **When** the builder inserts it, **Then** the parameter is offered as a selection limited to the declared values.
2. **Given** a step with integer or decimal parameters, **When** the builder inserts it, **Then** those parameters are offered as numeric inputs.
3. **Given** a step with a data-table parameter, **When** the builder inserts it, **Then** a table editor appears pre-populated with the declared column names.
4. **Given** a step whose parameter type cannot be determined, **When** the builder inserts it, **Then** a plain text input is offered and the parameter is still usable.
5. **Given** any step inserted through the catalog, **When** it is written into a scenario, **Then** the generated Gherkin is identical to what an equivalent step produced before this feature (no scenario/Gherkin regression).

---

### User Story 3 - Source and precision transparency, plus search at scale (Priority: P3)

A scenario builder can see, for each step, where it is defined (file and line) and how trustworthy its metadata is — clearly distinguishing information known **exactly** from information that was **inferred** or is only **partial**, with a visible warning when parameter names had to be guessed. When a project has hundreds of steps, the builder can quickly narrow the list by keyword, free-text search, category, tag, parameter type, and precision, and can see diagnostic badges on problematic steps.

**Why this priority**: Trust and navigability. Surfacing provenance and precision lets builders judge whether a step is safe to use as-is, and filtering keeps large catalogs usable. This builds on P1's structured data and P2's parameters.

**Independent Test**: Load a catalog containing both a richly-typed step (exact metadata) and a bare regular-expression step (inferred/partial metadata). Verify the first shows "Exact" with named parameters and a source location, the second shows "Partial" with an inferred-names warning, and that filtering by keyword, text, category, tag, type, and precision narrows the list correctly.

**Acceptance Scenarios**:

1. **Given** a step whose parameter names and types are known exactly, **When** it is displayed, **Then** it is marked as exact and shows the real parameter names.
2. **Given** a step whose parameter names were inferred from the callback or pattern, **When** it is displayed, **Then** it is marked as inferred/partial and shows a warning explaining the names were inferred.
3. **Given** a step with a source location, **When** it is displayed, **Then** the workspace-relative file path and line are shown.
4. **Given** a catalog of several hundred steps, **When** the builder filters by keyword, text, category, tag, parameter type, or precision, **Then** the list narrows to matching steps.
5. **Given** a step carrying a diagnostic, **When** it is displayed, **Then** a diagnostic badge communicates its severity (info/warning/error).

---

### User Story 4 - Optional author-provided rich metadata (Priority: P4)

A step author can optionally attach human-friendly metadata to a step — a title, description, category, tags, and per-parameter labels/descriptions/examples — using SuiSui's step-authoring helpers. SuiSui surfaces this metadata in the picker as the most authoritative source. The same step continues to execute unchanged under Playwright BDD; adopting the helpers is never required.

**Why this priority**: This is the highest-quality metadata source and improves the experience for teams that opt in, but it is additive. Existing projects must keep working without it, so it ranks below the core catalog, parameters, and transparency stories.

**Independent Test**: Define a step with explicit metadata (title, description, category, tags, parameter labels/examples) using the authoring helpers, and register it with Playwright BDD as usual. Verify SuiSui shows the declared title/description/category/tags and parameter labels/examples, marks that information as exact, and that the step still runs.

**Acceptance Scenarios**:

1. **Given** a step declared with explicit metadata, **When** the catalog is generated, **Then** the declared title, description, category, tags, and parameter labels/examples appear and are marked exact.
2. **Given** a step declared with explicit metadata, **When** it is used in a test run, **Then** it executes under Playwright BDD exactly as an equivalent plain step would.
3. **Given** explicit metadata that conflicts with what could be inferred from the pattern, **When** the catalog is generated, **Then** the explicit metadata wins and a diagnostic notes the conflict.
4. **Given** invalid or malformed explicit metadata, **When** the catalog is generated, **Then** the step is still cataloged as best it can be and a diagnostic reports the invalid metadata.

---

### User Story 5 - Fast, cached refresh that stays responsive (Priority: P5)

A scenario builder working in a large project experiences a catalog that is responsive: the first generation completes in reasonable time, re-opening or refreshing when nothing has changed is effectively instant, and after editing a step definition file the catalog reflects the change on the next refresh.

**Why this priority**: Performance and freshness make the catalog pleasant to use at scale, but they are optimizations on top of correct data. Correctness (P1–P3) must land first.

**Independent Test**: Generate the catalog for a project with several hundred steps and record the time. Regenerate with no changes and confirm it returns near-instantly. Edit one step definition file and regenerate; confirm the change is reflected and stale entries are gone.

**Acceptance Scenarios**:

1. **Given** a previously generated catalog and no source changes, **When** the catalog is requested again, **Then** it returns from cache without a full re-analysis.
2. **Given** a previously generated catalog, **When** a step definition file is modified, **Then** the next generation reflects the change.
3. **Given** a change to the project's Playwright configuration, relevant package configuration, or the catalog's own schema version, **When** the catalog is requested, **Then** the cache is treated as invalid and the catalog is regenerated.
4. **Given** the cache is stored on disk, **When** the repository is inspected, **Then** the cache location is excluded from version control.

### Edge Cases

- A step pattern that depends on a runtime value (e.g., built inside a loop from data) → returned as a partial, dynamic entry with a warning; never crashes generation.
- A step registered through a locally-renamed/aliased Given/When/Then (e.g., destructured under a different name) → still discovered and correctly keyworded.
- A step pattern referencing a constant defined elsewhere (imported or local) → resolved when statically knowable; otherwise reported as unresolved with a diagnostic.
- A regular-expression step with anonymous capture groups and no usable callback type information → parameters marked unknown rather than fabricated.
- A parameter count that disagrees between the pattern and the callback signature → reported via a mismatch diagnostic.
- Two steps that could both match the same phrase (one specific, one parameterized) → reported as a potential ambiguity.
- A workspace with no Playwright BDD configuration or no step files → catalog returns empty with an explanatory diagnostic, not an error that blocks the app.
- Step files authored on Windows vs. macOS/Linux → source paths are normalized and stored workspace-relative so the catalog is portable and consistent.
- The catalog data crossing to the interface → only structured, validated catalog data is exposed; the interface cannot request arbitrary file access through this feature.
- Moving a step to a different file → it may receive a new identifier; an unchanged, un-moved step keeps a stable identifier across refreshes.

## Requirements _(mandatory)_

### Functional Requirements

**Catalog generation & structure**

- **FR-001**: The system MUST produce a structured, versioned step catalog for a workspace without relying on parsing plain-text step output.
- **FR-002**: Each catalog entry MUST include at minimum: keyword, pattern text, pattern kind, source file (workspace-relative), source line, source column, an ordered parameter list, a metadata origin, and a precision level.
- **FR-003**: The catalog result MUST be serializable as JSON and carry a schema version to support future migrations.
- **FR-004**: The catalog result MUST record summary information sufficient to convey scope and freshness (e.g., when it was generated, the workspace it describes, how many files were analyzed).
- **FR-005**: Source file paths MUST be normalized and stored workspace-relative wherever possible, and MUST be consistent across Windows, macOS, and Linux.

**Metadata sources & precision**

- **FR-006**: The system MUST combine metadata from multiple sources and merge it deterministically using a fixed priority: explicit author metadata, then callback type information, then SuiSui typed-fragment metadata, then pattern-derived inference, then runtime-discovered data, then an unknown fallback.
- **FR-007**: The merge MUST never overwrite more precise information with less precise information.
- **FR-008**: Conflicting metadata from different sources MUST produce a diagnostic rather than being silently resolved.
- **FR-009**: Every step and every parameter MUST carry a precision indicator distinguishing exact, inferred, partial, and unknown information, and the system MUST NOT present inferred information as if it were exact.
- **FR-010**: The system MUST discover and analyze step definitions WITHOUT executing the project's test or step code as part of normal (static) catalog generation.

**Parameters**

- **FR-011**: For each step, the system MUST expose an ordered list of parameters, each with an index, a name, a type classification, and whether it is required.
- **FR-012**: The system MUST preserve author-declared parameter names (from SuiSui typed helpers or explicit metadata) as exact names in the catalog.
- **FR-013**: For enumerated parameters, the system MUST expose the allowed values; for data-table parameters, the system MUST expose the declared column names.
- **FR-014**: When available, the system MUST extract callback parameter names and their declared types, and the fixtures used by a step's callback.
- **FR-015**: When a parameter's type cannot be determined, the system MUST classify it as unknown rather than fabricating a type.

**Diagnostics & robustness**

- **FR-016**: A single unsupported, dynamic, or malformed step MUST NOT cause overall catalog generation to fail; it MUST be returned as a partial entry with diagnostics.
- **FR-017**: A single unparseable file MUST NOT prevent steps in other files from being cataloged; the failure MUST be reported as a diagnostic and analysis MUST continue.
- **FR-018**: Each diagnostic MUST include a stable code, a severity (info/warning/error), a human-readable message, and, where applicable, a source location. Diagnostics MUST cover at least: dynamic patterns, unresolved identifiers, unsupported pattern expressions, unsupported regex groups, parameter count mismatch, parameter type conflict, duplicate patterns, ambiguous patterns, missing callback, unresolved keyword, and invalid explicit metadata.

**Duplicate & ambiguity detection**

- **FR-019**: The system MUST detect and report exact duplicate step definitions (same keyword and pattern).
- **FR-020**: The system MUST provide basic detection of potentially ambiguous steps (a parameterized pattern that could also match a more specific one) as a diagnostic. Full reproduction of the execution engine's matching is out of scope.

**Stable identifiers**

- **FR-021**: Each step MUST have a deterministic, stable identifier derived from normalized metadata (such as relative source path, keyword, normalized pattern, and source position) so that an unchanged, un-moved step keeps the same identifier across refreshes.
- **FR-022**: The identifier scheme MUST NOT rely on non-deterministic or collision-prone ad-hoc string hashing; moving a step to another file MAY change its identifier.

**Caching & performance**

- **FR-023**: The system MUST cache catalog results locally to avoid fully re-analyzing the project on every request.
- **FR-024**: The cache MUST be invalidated by any of: step file modification time or content change, Playwright configuration change, relevant package configuration change, or a change to the catalog schema version.
- **FR-025**: The cache MUST be stored in a location that is excluded from version control.
- **FR-026**: The system MUST remain responsive for projects containing several hundred step definitions (see Success Criteria for targets).

**Author metadata & SuiSui typed helpers**

- **FR-027**: The system MUST provide an optional way for step authors to declare rich step metadata (title, description, category, tags, and per-parameter labels, descriptions, and examples) that is treated as the most authoritative source.
- **FR-028**: Steps declared with explicit metadata MUST remain usable with Playwright BDD and MUST execute unchanged.
- **FR-029**: SuiSui's typed step-pattern helpers MUST retain structured information about each fragment (its kind, optional name, enum values, table columns, and whether it captures a value) so that this information is available to the catalog, while the assembled pattern MUST remain assignable to a plain string for Playwright BDD compatibility.

**Backward compatibility & migration**

- **FR-030**: Existing plain Playwright BDD projects (plain-string, cucumber-expression, and regular-expression steps) MUST continue to work with no changes required; adopting SuiSui's helpers or explicit metadata MUST remain optional.
- **FR-031**: Existing scenario creation and Gherkin generation behavior MUST be preserved throughout the migration; inserting an equivalent step MUST produce the same Gherkin as before.
- **FR-032**: Once the native catalog is reliable, the system MUST no longer depend on plain-text step export for catalog metadata, and the legacy text-export path MUST be removable without loss of cataloged information.

**Boundaries & security**

- **FR-033**: Catalog data crossing to the interface MUST be validated on both input and output, and this feature MUST NOT expose arbitrary file-system access to the interface layer.

### Key Entities _(include if feature involves data)_

- **Step Catalog Result**: The versioned, serializable output of a generation. Holds the list of catalog steps, catalog-level diagnostics, generation timestamp, the workspace it describes, an optional configuration reference, the number of files analyzed, and generation duration.
- **Catalog Step**: A single usable step. Holds a stable identifier, keyword, pattern (kind + source text + optional flags), optional title/description/category, tags, ordered parameters, fixtures, source location, an overall metadata origin and precision, and any diagnostics.
- **Catalog Parameter**: One parameter of a step. Holds an index, name, type classification (string, int, float, word, any, boolean, enum, table, doc-string, custom, unknown), whether it is required, optional enum values / table columns, optional human labels/description/example/default, and its own origin and precision.
- **Diagnostic**: A structured note about a problem or observation. Holds a stable code, severity, message, and optional source location. Attached at the catalog level and/or to individual steps.
- **Step Source Location**: A workspace-relative file path plus line and column identifying where a step is defined.
- **Metadata Origin & Precision**: The provenance (explicit author metadata, callback types, SuiSui fragments, pattern inference, runtime discovery, unknown) and confidence (exact, inferred, partial, unknown) attached to steps and parameters.
- **Explicit Step Metadata**: Author-declared, most-authoritative descriptive data for a step (title, description, category, tags, per-parameter labels/descriptions/examples).
- **Step Fragment**: A structured piece of a SuiSui typed step pattern (its text, kind, optional name, enum values, table columns, and whether it captures a value).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of statically discoverable steps appear in the catalog with keyword, exact pattern, source file, and source line — up from the current state where source file/line is unavailable.
- **SC-002**: A project containing one dynamic, unsupported, or malformed step (or one unparseable file) still lists every other step; a single bad step or file causes zero catalog-wide failures.
- **SC-003**: For steps authored with SuiSui typed helpers or explicit metadata, parameter names and types are shown exactly (no inference) in 100% of cases, and are marked as exact.
- **SC-004**: Every displayed step communicates whether its metadata is exact, inferred, partial, or unknown; no inferred value is ever presented as exact.
- **SC-005**: The scenario builder renders the correct input control for each supported parameter kind — text, integer, decimal, enumerated (selection), and data table (grid with known columns) — verified for each kind.
- **SC-006**: A scenario builder can locate a target step within a several-hundred-step catalog in under 10 seconds using search and filters.
- **SC-007**: Cold catalog generation for a project with 500 step definitions completes within 5 seconds on a typical developer machine; a refresh with no changes returns from cache in under 500 ms.
- **SC-008**: 100% of steps previously listed for an existing plain Playwright BDD project remain listed after the feature ships, with no project changes required.
- **SC-009**: Inserting an equivalent step from the catalog produces byte-identical Gherkin compared to before the feature, across the existing scenario-creation test suite (no regressions).
- **SC-010**: After the migration, the catalog is generated with no dependence on plain-text step export, and the legacy text-export path can be removed with no loss of the metadata listed in SC-001–SC-005.

## Assumptions

- **Scope**: This specification covers the full progression described in the source brief — from a structured (non-text) catalog, through static source analysis, optional author metadata, an optional runtime fallback, and removal of the legacy text exporter — delivered in the priority order of the user stories above. Each user story is an independently shippable slice; P1 alone is already an improvement over today's behavior.
- **Runtime discovery is a best-effort fallback**: Steps that cannot be resolved statically (e.g., generated at runtime) are, by default, reported as partial/dynamic with diagnostics. Any optional runtime-registry capability is used only as a fallback, is not part of the default static generation flow, and must not execute arbitrary project code implicitly.
- **Execution engine unchanged**: Playwright BDD remains the test execution engine. This feature changes only where step **catalog metadata** comes from, not how tests run.
- **Performance targets** (SC-006, SC-007) assume a typical developer machine and a project in the low hundreds of step definitions; they are directional targets to keep the catalog responsive, not hard real-time guarantees.
- **Precision/type vocabulary** (exact/inferred/partial/unknown; the parameter type set) follows the model in the source brief and is treated as the contract the interface renders against.
- **"Several hundred"** step definitions is interpreted as up to ~500 for the purposes of the performance criteria.
- **Cache location** is a workspace-local, git-ignored path; the exact folder is an implementation detail chosen to align with existing SuiSui conventions.

## Out of Scope (First Version)

- Editing step source code or creating step implementations from the interface.
- Executing arbitrary project code during normal catalog generation.
- Fully reproducing the Playwright BDD step-matching engine (only basic duplicate/ambiguity diagnostics are in scope).
- Supporting every possible dynamically-generated pattern expression.
- Any public step marketplace, remote catalog synchronization, or automated refactoring of duplicate steps.
