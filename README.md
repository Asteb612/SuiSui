# SuiSui

A desktop application for building BDD (Behavior-Driven Development) tests using a visual interface. SuiSui integrates with [playwright-bdd](https://github.com/vitalets/playwright-bdd) and Playwright to provide a seamless experience for creating and running Gherkin-based tests.

## Features

- **Visual Scenario Builder** - Create Given/When/Then steps with an intuitive drag-and-drop interface
- **Automatic Step Discovery** - Imports step definitions from your playwright-bdd project
- **Smart Step Matching** - Recognizes Cucumber expressions (`{string}`, `{int}`, `{float}`, `{word}`), enum alternations, optional text, alternatives, and anonymous `{}` parameters
- **Background & Examples Support** - Full support for Gherkin Background sections and Scenario Outline examples
- **Real-time Validation** - Validates scenarios against available step definitions before execution
- **Integrated Test Runner** - Run tests headless or with Playwright UI directly from the app
- **Feature File Management** - Create, edit, and organize feature files in a tree view
- **Git Integration** - Built-in version control for your test files
- **Embedded Node.js** - Self-contained runtime, no external Node.js installation required

## Screenshots

_Screenshots coming soon_

## Quick Start

### Prerequisites

- Node.js 20+ and pnpm 9+ (for development only)
- A playwright-bdd configured project (or let SuiSui create one)

### Installation

Download the latest release for your platform:

- **Linux**: AppImage or .deb
- **macOS**: .dmg
- **Windows**: .exe installer

### Getting Started

1. **Launch SuiSui** and select a workspace folder
2. **Initialize** a new BDD project or open an existing one
3. **Create a feature file** in the feature tree
4. **Build scenarios** by selecting steps from the step selector
5. **Run tests** with the integrated test runner

### Creating Your First Test

1. Click "New Feature" in the feature tree
2. Enter a feature name (e.g., "Login")
3. Add a scenario name
4. Drag steps from the Step Selector:
   - `Given I am on the "login" page`
   - `When I fill "username" with "testuser"`
   - `When I fill "password" with "secret123"`
   - `When I click on "Submit"`
   - `Then I should see "Welcome"`
5. Click "Save" then "Run"

## Development Setup

```bash
# Clone the repository
git clone https://github.com/Asteb612/SuiSui.git
cd SuiSui

# Install dependencies
pnpm install

# Start development mode
pnpm --filter @suisui/desktop dev
```

### Development Commands

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `pnpm dev`        | Start development mode with hot reload |
| `pnpm build`      | Build for production                   |
| `pnpm test`       | Run unit tests                         |
| `pnpm test:e2e`   | Run E2E tests (requires build first)   |
| `pnpm test:watch` | Run tests in watch mode                |
| `pnpm typecheck`  | Full TypeScript type checking          |
| `pnpm lint:fix`   | Fix linting issues                     |
| `pnpm dist`       | Build distributable packages           |

### Building Releases

```bash
# Download Node.js runtime for packaging
pnpm --filter @suisui/desktop prebuild:nodejs

# Build distributable packages
pnpm --filter @suisui/desktop dist
```

## Tech Stack

| Layer             | Technology          |
| ----------------- | ------------------- |
| Desktop Framework | Electron 33         |
| Frontend          | Nuxt 4 (Vue 3)      |
| UI Components     | PrimeVue 4          |
| State Management  | Pinia               |
| Unit Testing      | Vitest              |
| E2E Testing       | Playwright Electron |
| Runtime           | Embedded Node.js 22 |

## Project Structure

```
SuiSui/
├── apps/desktop/              # Electron + Nuxt desktop app
│   ├── app/                   # Frontend (Vue components, stores)
│   │   ├── components/        # Vue SFC components
│   │   ├── composables/       # Vue composables
│   │   ├── stores/            # Pinia stores
│   │   └── pages/             # Nuxt pages
│   ├── electron/              # Backend (Electron main process)
│   │   ├── services/          # Business logic
│   │   ├── ipc/               # IPC handlers
│   │   └── assets/            # Default step definitions
│   └── e2e/                   # E2E tests
├── packages/shared/           # Shared types and IPC contracts
└── doc/                       # Technical documentation
```

## Architecture

SuiSui follows a layered architecture with strict process isolation:

- **Main Process** (Electron) - Node.js environment with file system access
- **Renderer Process** (Nuxt) - Browser environment for UI
- **Preload Script** - Secure bridge exposing typed IPC API

For detailed architecture documentation, see [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md).

## Default Step Definitions

SuiSui includes built-in generic steps that work out of the box:

### Given

- `I am on the {string} page` - Navigate to a page
- `I am logged in as {string}` - Login with username

### When

- `I click on {string}` - Click an element
- `I fill {string} with {string}` - Fill an input field
- `I select {string} from {string}` - Select from dropdown
- `I wait for {int} seconds` - Wait for duration

### Then

- `I should see {string}` - Assert text is visible
- `I should not see {string}` - Assert text is hidden
- `the URL should contain {string}` - Assert URL
- `the element {string} should be visible` - Assert element visibility

These steps can be customized by editing `features/steps/generic.steps.ts` in your workspace.

## Step Pattern Support

SuiSui's pattern processor handles various step definition syntaxes:

| Syntax           | Example                    | Description                             |
| ---------------- | -------------------------- | --------------------------------------- |
| `{string}`       | `I click on {string}`      | Quoted string parameter                 |
| `{int}`          | `I wait {int} seconds`     | Integer (supports negatives: `-5`)      |
| `{float}`        | `price is {float}`         | Decimal number (supports `-3.14`, `.5`) |
| `{word}`         | `I click {word}`           | Single word without whitespace          |
| `{}`             | `I see {}`                 | Anonymous parameter (matches any text)  |
| `(a\|b\|c)`      | `I login as (admin\|user)` | Enum alternation                        |
| `(text)`         | `{int} cucumber(s)`        | Optional text                           |
| `word1/word2`    | `belly/stomach`            | Alternative text                        |
| `\{`, `\(`, `\/` | `I see \{braces\}`         | Escaped literal characters              |
| `(col1, col2) :` | `users (name, email) :`    | DataTable with column headers           |

## Documentation

| Document                               | Description                    |
| -------------------------------------- | ------------------------------ |
| [ARCHITECTURE.md](doc/ARCHITECTURE.md) | Overall design and data flow   |
| [SERVICES.md](doc/SERVICES.md)         | Backend services documentation |
| [FRONTEND.md](doc/FRONTEND.md)         | Frontend components and stores |
| [IPC_TYPES.md](doc/IPC_TYPES.md)       | IPC channels and shared types  |
| [DEVELOPMENT.md](doc/DEVELOPMENT.md)   | Development workflow           |
| [TESTING.md](doc/TESTING.md)           | Testing strategies             |
| [USER_GUIDE.md](doc/USER_GUIDE.md)     | End-user guide                 |

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [playwright-bdd](https://github.com/vitalets/playwright-bdd) - BDD framework for Playwright
- [Playwright](https://playwright.dev/) - Browser automation framework
- [PrimeVue](https://primevue.org/) - Vue UI component library
