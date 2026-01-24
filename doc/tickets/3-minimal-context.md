# 🎫 Ticket 3 — Minimal Intelligent Context

## Title

Automatic Context Handling (Page / Modal)

## Description

As a user, I want my actions to automatically execute in the correct context (page or modal) without having to specify it in every step.

## Features

* Automatically detect if a modal is open
* If yes → all actions target the modal
* Otherwise → actions target the page
* Display the current context in the UI
* Reset context on page navigation

## Acceptance Criteria

* When a modal is open, actions target the modal, not the page
* Interaction with the page behind an open modal is impossible
* Context updates dynamically

## Out of Scope (V1)

* Section/table context
* Manual context selection
* Hierarchical context discovery

## Technical Notes

* Detection via `role=dialog`
* Simple context stack (page / modal)
* Playwright wrapper around `page` and `dialog`
