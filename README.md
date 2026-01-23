# SuiSui

A desktop application for building BDD (Behavior-Driven Development) tests using a visual interface. SuiSui integrates with [bddgen](https://github.com/nicholasgrose/bddgen) and Playwright to provide a seamless experience for creating and running Gherkin-based tests.

## Features

- Visual scenario builder with Given/When/Then steps
- Automatic step discovery from your bddgen project
- Generic steps for common testing patterns
- Real-time validation of scenarios
- Run tests headless or with Playwright UI
- Feature file management
- Git integration for version control

## Tech Stack

- **Electron** - Desktop application framework
- **Nuxt 4** - Vue.js framework for the renderer
- **PrimeVue** - UI component library
- **Pinia** - State management
- **TypeScript** - Type safety throughout
- **Vitest** - Unit testing
- **Playwright** - E2E testing

## Project Structure

```text
SuiSui/
├── apps/
│   └── desktop/           # Electron + Nuxt desktop app
│       ├── app/           # Nuxt 4 renderer (Vue components, stores)
│       │   ├── components/
│       │   ├── composables/
│       │   ├── pages/
│       │   └── stores/
│       ├── electron/      # Electron main process
│       │   ├── services/  # Business logic services
│       │   ├── ipc/       # IPC handlers
│       │   └── __tests__/ # Unit tests
│       └── e2e/           # E2E tests
├── packages/
│   └── shared/            # Shared types and IPC contracts
└── PROJECT.md             # MVP specification
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- A bddgen-configured Playwright project

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/suisui.git
cd suisui

# Install dependencies
pnpm install

# Prepare Nuxt
pnpm --filter @suisui/desktop prepare
```

## Development

```bash
# Start the development server
pnpm --filter @suisui/desktop dev

# Run unit tests
pnpm --filter @suisui/desktop test

# Run unit tests in watch mode
pnpm --filter @suisui/desktop test:watch

# Type check
pnpm --filter @suisui/desktop typecheck
```

## Building

```bash
# Build the application
pnpm --filter @suisui/desktop build
```

## Testing

### Unit Tests

Unit tests are written with Vitest and cover the Electron services:

```bash
pnpm --filter @suisui/desktop test
```

### E2E Tests

E2E tests use Playwright to test the full Electron application:

```bash
# Build first
pnpm --filter @suisui/desktop build

# Run E2E tests
pnpm --filter @suisui/desktop test:e2e
```

## Architecture

### Main Process Services

- **WorkspaceService** - Manages workspace path and validation
- **FeatureService** - CRUD operations for .feature files
- **StepService** - Exports and caches steps from bddgen
- **ValidationService** - Validates scenarios before execution
- **RunnerService** - Executes Playwright tests
- **GitService** - Git operations (status, diff, commit, push)
- **SettingsService** - Persistent settings storage

### Renderer Stores (Pinia)

- **workspace** - Workspace state and feature list
- **steps** - Available step definitions
- **scenario** - Current scenario being built
- **runner** - Test execution state and logs
- **git** - Git status and operations

### IPC Communication

All communication between renderer and main process uses typed IPC channels defined in `@suisui/shared`. The preload script exposes a secure API via `window.api`.

## Generic Steps

SuiSui includes built-in generic steps that are always available:

### Given

- `I am on the {string} page`
- `I am logged in as {string}`

### When

- `I click on {string}`
- `I fill {string} with {string}`
- `I wait for {int} seconds`
- `I press {string}`

### Then

- `I should see {string}`
- `I should not see {string}`
- `the URL should contain {string}`
- `the element {string} should be visible`

## License

MIT
