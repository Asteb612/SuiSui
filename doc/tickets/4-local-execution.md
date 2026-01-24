# 🎫 Ticket 4 — Local Playwright Execution (Headless + UI)

## Title

Local Playwright Execution (Headless and UI Modes)

## Description

As a user, I want to execute my scenarios directly from the application, either in headless mode or using the Playwright UI.

## Features

* “Run headless” button
* “Run UI” button
* Target execution by scenario or feature
* Display execution logs
* Link to HTML report / trace if available

## Acceptance Criteria

* A scenario can be launched from the UI without using the CLI
* UI mode opens Playwright UI
* Errors are visible and understandable
* Execution does not block the UI

## Out of Scope (V1)

* Execution queue
* Parallel runs
* Multi-scenario orchestration

## Technical Notes

* Node execution via `child_process`
* Mockable for tests
* Configurable timeout
