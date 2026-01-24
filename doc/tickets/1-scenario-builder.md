# 🎫 Ticket 1 — Simple Scenario Builder (Given / When / Then)

## Title

Visual Scenario Builder (Given / When / Then)

## Description

As a non-developer user, I want to create and edit test scenarios using a guided Given/When/Then interface, without manually writing Gherkin.

## Features

* Add a step (Given / When / Then)
* Select a step from the step catalog
* Fill step parameters
* Delete a step
* Reorder steps (drag & drop or up/down buttons)
* Edit an existing step
* Automatically generate the corresponding Gherkin
* Save the scenario to a `.feature` file

## Acceptance Criteria

* A scenario can be created without writing free text
* The generated Gherkin is valid for `playwright-bdd`
* Step order is respected
* Parameters are visible and editable
* Changes are persisted to the file

## Out of Scope (V1)

* Background support
* Scenario Outline
* Tables / DocStrings
* Bidirectional text ↔ builder synchronization

## Technical Notes

* Internal JSON model for scenarios
* One-way Gherkin generation
* One-page UI (Nuxt + PrimeVue)
* Lightweight validation (missing parameters)