# 🎫 Ticket 2 — Centralized Step Catalog

## Title

Centralized Step Catalog

## Description

As a user, I want to view and use only existing steps in order to avoid errors and ensure consistency across scenarios.

## Features

* Load the list of steps from the project
* Display steps with:

  * label
  * parameters
  * category (Navigation, Form, Table, Modal, Variables…)
* Filter and search steps
* Select steps from the builder

## Acceptance Criteria

* Displayed steps match those usable by Playwright
* No free-text steps can be added outside the catalog
* The list is searchable and remains performant with 50+ steps

## Out of Scope (V1)

* Creating steps from the UI
* Editing step code
* Step marketplace or sharing

## Technical Notes

* Source: code extraction (`bddgen export` or internal parser)
* Local caching in the app
* Step → dynamic parameters mapping
