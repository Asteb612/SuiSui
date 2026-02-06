# SuiSui User Guide

This guide walks you through using SuiSui to create and run BDD tests with Playwright.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Workspace Setup](#workspace-setup)
3. [Feature Files](#feature-files)
4. [Building Scenarios](#building-scenarios)
5. [Step Types](#step-types)
6. [Background Steps](#background-steps)
7. [Scenario Outlines & Examples](#scenario-outlines--examples)
8. [Running Tests](#running-tests)
9. [Git Integration](#git-integration)
10. [Keyboard Shortcuts](#keyboard-shortcuts)
11. [Troubleshooting](#troubleshooting)

---

## Getting Started

### First Launch

When you first launch SuiSui, you'll need to select or create a workspace:

1. Click **Select Workspace** in the header
2. Choose an existing folder or create a new one
3. If the folder is empty, SuiSui will initialize it as a BDD project

### Workspace Requirements

A valid SuiSui workspace needs:

- `package.json` - Node.js project configuration
- `features/` directory - Where feature files are stored
- `cucumber.json` - Cucumber configuration (created automatically)

SuiSui will create these files automatically when initializing a new workspace.

---

## Workspace Setup

### New Project

When you select an empty folder, SuiSui creates:

```
your-workspace/
├── package.json          # With playwright-bdd dependencies
├── playwright.config.ts  # Playwright + BDD configuration
├── cucumber.json         # Cucumber settings
└── features/
    └── steps/
        └── generic.steps.ts  # Default step definitions
```

### Existing Project

For existing playwright-bdd projects, SuiSui will:

1. Detect the project structure
2. Import existing step definitions
3. Load your feature files

### Configuration Files

SuiSui manages these configuration files:

**playwright.config.ts** - Test runner configuration:

```typescript
const testDir = defineBddConfig({
  paths: ['features/**/*.feature'],
  steps: ['features/steps/**/*.ts'],
  missingSteps: 'fail-on-run',
  verbose: true,
})
```

**package.json scripts** - Available npm scripts:

- `npm test` - Run all tests
- `npm run test:ui` - Open Playwright UI
- `npm run test:headed` - Run with browser visible
- `npm run bddgen` - Generate spec files

---

## Feature Files

### Creating Features

1. Right-click in the **Feature Tree** panel
2. Select **New Feature**
3. Enter a name (e.g., "login" creates `features/login.feature`)

### Feature Structure

A feature file contains:

```gherkin
Feature: Login
  As a user
  I want to log in
  So that I can access my account

  Background:
    Given I am on the "login" page

  Scenario: Successful login
    When I fill "username" with "testuser"
    And I fill "password" with "secret123"
    And I click on "Submit"
    Then I should see "Welcome"
```

### Organizing Features

Features can be organized in folders:

```
features/
├── auth/
│   ├── login.feature
│   └── logout.feature
├── cart/
│   └── checkout.feature
└── user/
    └── profile.feature
```

---

## Building Scenarios

### The Scenario Builder

The main panel shows the Scenario Builder with:

- **Feature name** - The feature title
- **Feature description** - Optional description text
- **Scenario tabs** - Switch between scenarios
- **Steps list** - The Given/When/Then steps
- **Background section** - Steps that run before each scenario

### Adding Steps

**Method 1: Step Selector**

1. Browse steps in the Step Selector panel (right side)
2. Click a step to add it to your scenario
3. Steps are categorized by keyword (Given/When/Then)

**Method 2: Drag and Drop**

1. Drag a step from the Step Selector
2. Drop it at the desired position in your scenario

### Editing Steps

Click on a step to edit its arguments:

- **String arguments** - Text inputs in quotes
- **Integer arguments** - Number inputs
- **Enum arguments** - Dropdown selections (for steps with alternatives)

### Reordering Steps

- Drag steps to reorder them
- Use the up/down buttons on each step
- Drop zones appear between steps when dragging

### Removing Steps

Click the trash icon on any step to remove it.

---

## Step Types

### Cucumber Expressions

SuiSui supports standard Cucumber expressions:

| Expression | Matches     | Example   |
| ---------- | ----------- | --------- |
| `{string}` | Quoted text | `"login"` |
| `{int}`    | Integers    | `5`       |
| `{float}`  | Decimals    | `3.14`    |
| `{any}`    | Any word    | `admin`   |

### Regex Patterns with Alternatives

Steps can use regex alternatives:

```
Given I am logged in as (admin|user|guest)
```

This creates a dropdown selector with the options.

### Custom Steps

Add your own steps in `features/steps/`:

```typescript
import { createBdd } from 'playwright-bdd'
const { Given, When, Then } = createBdd()

Given('I have {int} items in my cart', async ({ page }, count: number) => {
  // Your implementation
})
```

After adding steps, click **Refresh Steps** to import them.

---

## Background Steps

Background steps run before every scenario in a feature.

### Adding Background Steps

1. Switch to **Edit Mode**
2. Click **Add Background Step**
3. Select steps from the Step Selector

### Example

```gherkin
Feature: Shopping Cart

  Background:
    Given I am logged in as "customer"
    And I am on the "products" page

  Scenario: Add item to cart
    When I click on "Add to Cart"
    Then I should see "Item added"
```

The Background steps run before each Scenario.

---

## Scenario Outlines & Examples

Scenario Outlines let you run the same scenario with different data.

### Creating an Outline

1. Add a scenario with placeholder values using `<name>` syntax
2. Add an Examples table with the data

### Example

```gherkin
Scenario Outline: Login with different users
  Given I am on the "login" page
  When I fill "username" with "<username>"
  And I fill "password" with "<password>"
  And I click on "Submit"
  Then I should see "<message>"

  Examples:
    | username | password | message      |
    | admin    | admin123 | Admin Panel  |
    | user     | user456  | Dashboard    |
    | guest    | guest    | Welcome      |
```

### Adding Examples in SuiSui

1. Click **Add Examples** in the scenario editor
2. Define columns matching your `<placeholders>`
3. Add rows with test data

---

## Running Tests

### Run Modes

| Mode         | Description                                   |
| ------------ | --------------------------------------------- |
| **Headless** | Fast, no browser window                       |
| **UI Mode**  | Playwright Test UI with time-travel debugging |
| **Headed**   | Shows browser window during execution         |

### Running Tests

1. Save your feature file
2. Select a run mode:
   - Click **Run** for headless execution
   - Click **UI** for Playwright Test UI

### Test Scope

You can run:

- **Single scenario** - Select a scenario before running
- **Entire feature** - Run with no scenario selected
- **All features** - Use npm scripts from terminal

### Viewing Results

After a test run:

- **Status** shown in the Validation panel (Passed/Failed/Error)
- **Duration** displayed
- **HTML Report** link if available

---

## Git Integration

### Status Panel

The Git panel shows:

- Current branch name
- Number of modified files
- Number of untracked files

### Operations

| Action            | Description                          |
| ----------------- | ------------------------------------ |
| **Pull**          | Fetch and merge remote changes       |
| **Commit & Push** | Stage all, commit with message, push |

### Workflow

1. Make changes to your feature files
2. Enter a commit message
3. Click **Commit & Push**

---

## Keyboard Shortcuts

| Shortcut | Action                |
| -------- | --------------------- |
| `Ctrl+S` | Save current feature  |
| `Ctrl+R` | Run current scenario  |
| `Ctrl+N` | New scenario          |
| `Delete` | Remove selected step  |
| `Escape` | Cancel current action |

---

## Troubleshooting

### Steps Not Found

**Problem**: "Step not found in exported definitions" warning

**Solution**:

1. Click **Refresh Steps** to re-import step definitions
2. Check that your step file has no syntax errors
3. Ensure the step pattern matches your usage

### Step Matching Issues

**Problem**: Step text doesn't match definition

**Solution**:

- Check quotes: `{string}` expects quoted or unquoted words
- Check numbers: `{int}` expects whole numbers only
- Enum values must match exactly

### Test Execution Fails

**Problem**: "bddgen CLI not found" error

**Solution**:

1. Wait for dependency installation to complete
2. Check the workspace has `playwright-bdd` installed
3. Try restarting SuiSui

### Dependency Installation

**Problem**: Dependencies won't install

**Solution**:

1. Check internet connection
2. Verify `package.json` exists
3. Delete `node_modules` and restart SuiSui

### Configuration Issues

**Problem**: playwright.config.ts outdated

**Solution**:
SuiSui automatically updates managed config files. If you have customizations:

1. Backup your custom config
2. Let SuiSui update the file
3. Re-apply your customizations

---

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/Asteb612/SuiSui/issues)
- **Documentation**: See `/doc` folder for technical docs
- **Step Definitions**: Check `features/steps/generic.steps.ts` for examples

---

## Glossary

| Term                 | Definition                                       |
| -------------------- | ------------------------------------------------ |
| **Feature**          | A .feature file describing a software capability |
| **Scenario**         | A specific test case within a feature            |
| **Step**             | A single Given/When/Then action                  |
| **Background**       | Steps that run before every scenario             |
| **Scenario Outline** | A template scenario with variable data           |
| **Examples**         | Data table for Scenario Outline variables        |
| **Gherkin**          | The language used to write feature files         |
| **BDD**              | Behavior-Driven Development methodology          |
