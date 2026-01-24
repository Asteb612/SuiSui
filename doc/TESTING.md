# SuiSui Testing Documentation

## Overview

SuiSui uses a layered testing strategy:

| Layer | Framework | Location | Purpose |
|-------|-----------|----------|---------|
| Unit Tests | Vitest | `electron/__tests__/` | Service logic |
| E2E Tests | Playwright | `e2e/` | Full application flow |

## Testing Philosophy

### Key Principles

1. **Mock External Commands**: Never call real `bddgen` or `playwright` in tests
2. **Test Service Logic**: Focus on business logic, not CLI wrappers
3. **Dependency Injection**: Use `FakeCommandRunner` for testability
4. **Fast Feedback**: Unit tests run in milliseconds

---

## Unit Testing with Vitest

### Configuration

**Location:** `apps/desktop/vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['electron/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['electron/services/**/*.ts']
    }
  }
});
```

### Running Tests

```bash
cd apps/desktop

pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test -- --coverage # With coverage
```

### Test Structure

```
apps/desktop/electron/__tests__/
├── CommandRunner.test.ts      # Command execution tests
├── ValidationService.test.ts  # Scenario validation tests
├── StepService.test.ts        # Step export/parse tests
└── GitService.test.ts         # Git operations tests
```

---

## FakeCommandRunner

**Purpose:** Mock command execution without calling real CLI tools.

**Usage:**

```typescript
import { FakeCommandRunner } from '../services/CommandRunner';

describe('StepService', () => {
  let fakeRunner: FakeCommandRunner;
  let service: StepService;

  beforeEach(() => {
    fakeRunner = new FakeCommandRunner();
    service = new StepService(fakeRunner);
  });

  it('should export steps', async () => {
    // Set expected command response
    fakeRunner.setResponse('npx', {
      code: 0,
      stdout: JSON.stringify([
        { keyword: 'Given', pattern: 'I am logged in' }
      ]),
      stderr: ''
    });

    const result = await service.export();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].pattern).toBe('I am logged in');
  });

  it('should handle export failure', async () => {
    fakeRunner.setResponse('npx', {
      code: 1,
      stdout: '',
      stderr: 'bddgen not found'
    });

    await expect(service.export()).rejects.toThrow();
  });
});
```

### FakeCommandRunner API

```typescript
class FakeCommandRunner implements ICommandRunner {
  // Set response for a command
  setResponse(command: string, result: CommandResult): void;

  // Set response with custom matcher
  setResponseMatcher(
    matcher: (cmd: string, args: string[]) => boolean,
    result: CommandResult
  ): void;

  // Get call history
  getCalls(): Array<{ command: string; args: string[] }>;

  // Clear all responses and history
  reset(): void;
}
```

---

## Writing Unit Tests

### Service Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeCommandRunner } from '../services/CommandRunner';
import { MyService } from '../services/MyService';

describe('MyService', () => {
  let fakeRunner: FakeCommandRunner;
  let service: MyService;

  beforeEach(() => {
    fakeRunner = new FakeCommandRunner();
    service = new MyService(fakeRunner);
  });

  describe('methodName', () => {
    it('should handle success case', async () => {
      fakeRunner.setResponse('command', {
        code: 0,
        stdout: 'expected output',
        stderr: ''
      });

      const result = await service.methodName();

      expect(result).toBeDefined();
      // More assertions
    });

    it('should handle error case', async () => {
      fakeRunner.setResponse('command', {
        code: 1,
        stdout: '',
        stderr: 'error message'
      });

      await expect(service.methodName()).rejects.toThrow();
    });
  });
});
```

### Mocking Modules

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('../services/SettingsService', () => ({
  getSettingsService: vi.fn(() => ({
    get: vi.fn(() => ({ workspacePath: '/test/path' })),
    set: vi.fn()
  }))
}));
```

### Testing File System Operations

```typescript
import { vol } from 'memfs';

vi.mock('fs', () => require('memfs'));

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    '/workspace/features/login.feature': 'Feature: Login\n...',
    '/workspace/package.json': '{}'
  });
});
```

---

## E2E Testing with Playwright

### Configuration

**Location:** `apps/desktop/playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  workers: 1,                    // No parallelization
  retries: 1,
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  reporter: [['html', { open: 'never' }]]
});
```

### Running E2E Tests

```bash
cd apps/desktop

# Build first (required)
pnpm build

# Run E2E tests
pnpm test:e2e

# Run with UI mode
pnpm test:e2e -- --ui

# Run specific test
pnpm test:e2e -- --grep "should display"
```

### Electron Launcher

**Location:** `e2e/electron.ts`

```typescript
import { _electron as electron } from '@playwright/test';

export async function launchElectronApp() {
  const app = await electron.launch({
    args: ['dist-electron/main.js']
  });
  const window = await app.firstWindow();
  return { app, window };
}

export async function closeElectronApp(app) {
  await app.close();
}
```

### E2E Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './electron';

test.describe('App E2E', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    ({ app, window } = await launchElectronApp());
  });

  test.afterAll(async () => {
    await closeElectronApp(app);
  });

  test('should display main layout', async () => {
    await expect(window.locator('.scenario-builder')).toBeVisible();
    await expect(window.locator('.step-selector')).toBeVisible();
    await expect(window.locator('.validation-panel')).toBeVisible();
  });

  test('should add step to scenario', async () => {
    // Click on a step in the selector
    await window.locator('.step-item').first().click();

    // Verify step appears in builder
    await expect(window.locator('.scenario-step')).toHaveCount(1);
  });
});
```

---

## Test Coverage

### Viewing Coverage

```bash
pnpm test -- --coverage

# Open HTML report
open coverage/index.html
```

### Coverage Targets

| Area | Target | Notes |
|------|--------|-------|
| Services | 80%+ | Core business logic |
| Validation | 90%+ | Critical for correctness |
| IPC Handlers | 70%+ | Mostly pass-through |
| UI Components | N/A | Covered by E2E |

---

## Testing Best Practices

### DO

- Use descriptive test names: `it('should return validation error when scenario name is empty')`
- Test both success and failure paths
- Use `FakeCommandRunner` for all CLI operations
- Keep tests focused and independent
- Clean up state in `beforeEach`

### DON'T

- Don't call real `bddgen` or `playwright` commands
- Don't share state between tests
- Don't test implementation details
- Don't skip tests without explanation
- Don't use `any` types in tests

---

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch pushes

### CI Pipeline

```yaml
# Example GitHub Actions
- name: Install dependencies
  run: pnpm install

- name: Build shared package
  run: pnpm --filter @suisui/shared build

- name: Run unit tests
  run: pnpm test

- name: Build application
  run: pnpm build

- name: Run E2E tests
  run: pnpm test:e2e
```

---

## Debugging Tests

### Vitest

```bash
# Run with debugger
node --inspect-brk ./node_modules/.bin/vitest run

# VS Code launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest",
  "program": "${workspaceFolder}/node_modules/.bin/vitest",
  "args": ["run", "--no-threads"]
}
```

### Playwright

```bash
# Run with headed browser
pnpm test:e2e -- --headed

# Run with debug mode
PWDEBUG=1 pnpm test:e2e

# Generate trace viewer
pnpm test:e2e -- --trace on
```

---

## Related Documentation

- [SERVICES.md](./SERVICES.md) - Backend services (what to test)
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development workflow
