# 🎫 Ticket 5 — Scenario Management (CRUD + Folders)

## Title

Scenario and Feature Folder Management

## Description

As a user, I want to organize my scenarios into folders and manage their lifecycle easily from the UI.

## Features

* Create a feature folder
* Create a new scenario in a folder
* Rename a scenario
* Delete a scenario
* Move a scenario between folders
* Display scenarios in a folder tree

## Acceptance Criteria

* `.feature` files are correctly created, moved, and deleted on disk
* The UI tree accurately reflects the filesystem
* No operation escapes the `features/` directory
* Naming conflicts are handled with user feedback

## Out of Scope (V1)

* Git synchronization
* Trash / versioning
* Import/export

## Technical Notes

* Secure filesystem access (sandboxed)
* Relative paths only
* Real-time UI updates
