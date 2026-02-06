# Contributing to SuiSui

Thank you for your interest in contributing to SuiSui! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Code Style](#code-style)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Project Structure](#project-structure)

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to maintain a welcoming environment for all contributors.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/SuiSui.git
   cd SuiSui
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/Asteb612/SuiSui.git
   ```

## Development Setup

```bash
# Install dependencies
pnpm install

# Build the shared package
pnpm --filter @suisui/shared build

# Start development mode
pnpm --filter @suisui/desktop dev
```

### Development Commands

| Command           | Description             |
| ----------------- | ----------------------- |
| `pnpm dev`        | Start with hot reload   |
| `pnpm test`       | Run unit tests          |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck`  | Full TypeScript check   |
| `pnpm lint:fix`   | Fix linting issues      |

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-scenario-tags` - New features
- `fix/step-matching-regex` - Bug fixes
- `docs/update-user-guide` - Documentation
- `refactor/service-pattern` - Code refactoring

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting, no code change
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:

```
feat(scenario): add support for scenario tags

fix(steps): handle regex escaping in pattern matching

docs(readme): add quick start section
```

## Code Style

### TypeScript

- Use strict mode
- Avoid `any` type - use proper typing
- Prefer interfaces over type aliases for objects
- Use PascalCase for types and interfaces

```typescript
// Good
interface StepDefinition {
  id: string
  pattern: string
  keyword: StepKeyword
}

// Avoid
type StepDef = any
```

### Vue Components

- Use Composition API with `<script setup lang="ts">`
- Use PrimeVue components for UI consistency
- Keep components focused and single-purpose

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '~/stores/scenario'

const store = useScenarioStore()
const hasSteps = computed(() => store.scenario.steps.length > 0)
</script>
```

### Services (Electron)

- Use singleton pattern with factory function
- Accept dependencies via constructor for testing
- Use CommandRunner abstraction for CLI commands

```typescript
export class MyService {
  constructor(private commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
  }
}

let instance: MyService | null = null
export function getMyService(): MyService {
  if (!instance) instance = new MyService()
  return instance
}
```

### Naming Conventions

| Type             | Convention             | Example               |
| ---------------- | ---------------------- | --------------------- |
| Vue Components   | PascalCase             | `ScenarioBuilder.vue` |
| Pinia Stores     | camelCase + use prefix | `useScenarioStore`    |
| Services         | PascalCase             | `ValidationService`   |
| IPC Channels     | SCREAMING_SNAKE_CASE   | `WORKSPACE_GET`       |
| Types/Interfaces | PascalCase             | `StepDefinition`      |

## Testing

### Unit Tests

All services must have unit tests using Vitest:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { FakeCommandRunner } from './FakeCommandRunner'
import { MyService } from '../services/MyService'

describe('MyService', () => {
  let service: MyService
  let fakeRunner: FakeCommandRunner

  beforeEach(() => {
    fakeRunner = new FakeCommandRunner()
    service = new MyService(fakeRunner)
  })

  it('should do something', async () => {
    fakeRunner.setResponse('npm', { code: 0, stdout: 'ok', stderr: '' })
    const result = await service.doSomething()
    expect(result).toBe('expected')
  })
})
```

### Testing Rules

1. **Never call real CLI tools in tests** - Use FakeCommandRunner
2. **Test edge cases** - Error handling, empty inputs
3. **Keep tests focused** - One concept per test
4. **Use descriptive names** - `should return error when file not found`

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- ValidationService

# Run with coverage
pnpm test:coverage
```

## Submitting Changes

### Pull Request Process

1. **Update your fork**:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a feature branch**:

   ```bash
   git checkout -b feature/your-feature
   ```

3. **Make your changes** with clear commits

4. **Run checks**:

   ```bash
   pnpm lint:fix
   pnpm typecheck
   pnpm test
   ```

5. **Push your branch**:

   ```bash
   git push origin feature/your-feature
   ```

6. **Open a Pull Request** on GitHub

### PR Requirements

- [ ] Tests pass
- [ ] TypeScript compiles without errors
- [ ] Linting passes
- [ ] New code has tests
- [ ] Documentation updated if needed
- [ ] Clear PR description

### PR Description Template

```markdown
## Summary

Brief description of changes

## Changes

- Added X
- Fixed Y
- Updated Z

## Testing

How the changes were tested

## Screenshots (if UI changes)

Before/after screenshots
```

## Project Structure

```
SuiSui/
├── apps/desktop/
│   ├── app/                 # Frontend (Vue/Nuxt)
│   │   ├── components/      # Vue components
│   │   ├── composables/     # Vue composables
│   │   ├── stores/          # Pinia stores
│   │   └── pages/           # Nuxt pages
│   ├── electron/            # Backend (Electron)
│   │   ├── services/        # Business logic
│   │   ├── ipc/             # IPC handlers
│   │   └── __tests__/       # Unit tests
│   └── e2e/                 # E2E tests
├── packages/shared/         # Shared types
└── doc/                     # Documentation
```

### Key Files

| File                        | Purpose              |
| --------------------------- | -------------------- |
| `electron/preload.ts`       | IPC API bridge       |
| `electron/ipc/handlers.ts`  | IPC request handlers |
| `packages/shared/src/ipc/`  | IPC contracts        |
| `app/composables/useApi.ts` | Frontend API access  |

### Adding New Features

1. **Backend service** → `electron/services/`
2. **Shared types** → `packages/shared/src/types/`
3. **IPC channel** → See [IPC_TYPES.md](doc/IPC_TYPES.md)
4. **Frontend store** → `app/stores/`
5. **UI component** → `app/components/`

## Questions?

- Open an issue for questions
- Check existing issues and PRs
- Read the documentation in `/doc`

Thank you for contributing!
