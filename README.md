<div align="center">

# SuiSui

**Visual BDD Test Builder for Playwright**

Create Gherkin scenarios with drag-and-drop, run them with Playwright.
No code required to write tests.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-BDD-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)

[Website](https://asteb612.github.io/SuiSui/) &middot; [Download](https://github.com/Asteb612/SuiSui/releases) &middot; [Documentation](https://asteb612.github.io/SuiSui/)

</div>

---

## What is SuiSui?

SuiSui is a **free, open-source desktop app** that lets QA engineers and developers build [BDD](https://cucumber.io/docs/bdd/) tests visually. It integrates with [playwright-bdd](https://github.com/vitalets/playwright-bdd) and [Playwright](https://playwright.dev/) so you can go from idea to running test without writing Gherkin by hand.

1. **Pick steps** from your project's step definitions
2. **Fill parameters** inline (strings, tables, examples)
3. **Hit Run** &mdash; tests execute headless or in Playwright UI

https://github.com/user-attachments/assets/scenario-builder-demo

> _Every demo video on the [project website](https://asteb612.github.io/SuiSui/) is auto-generated from an end-to-end Playwright test._

## Features

| Feature                      | Description                                                               |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Visual Scenario Builder**  | Drag-and-drop Given/When/Then steps. Edit arguments inline.               |
| **Automatic Step Discovery** | Imports step definitions from your playwright-bdd project.                |
| **Smart Step Matching**      | Cucumber expressions, enums, optional text, DataTables, anonymous params. |
| **Real-time Validation**     | Validates scenarios against step definitions before running.              |
| **Integrated Test Runner**   | Run headless or with Playwright UI from the app.                          |
| **Feature File Management**  | Create, edit, and organize .feature files in a tree view.                 |
| **Git Integration**          | Built-in version control via isomorphic-git.                              |
| **Self-Contained Runtime**   | Ships with embedded Node.js &mdash; no external install required.         |

## Quick Start

### Download

Grab the latest release for your platform:

| Platform | Format         |
| -------- | -------------- |
| Linux    | AppImage, .deb |
| macOS    | .dmg           |
| Windows  | .exe installer |

> [**Download latest release**](https://github.com/Asteb612/SuiSui/releases)

### Getting Started

1. Launch SuiSui and select a workspace folder (or clone a repo)
2. Initialize a new BDD project or open an existing playwright-bdd project
3. Create a feature file in the tree view
4. Build scenarios by selecting steps from the catalog
5. Run tests with the integrated runner

### Your First Test in 30 Seconds

1. Click **New Feature** &rarr; name it "Login"
2. Add steps from the catalog:
   - `Given I am on the "login" page`
   - `When I fill "username" with "testuser"`
   - `When I fill "password" with "secret123"`
   - `When I click on "Submit"`
   - `Then I should see "Welcome"`
3. Click **Save** then **Run**

## Step Pattern Support

SuiSui's pattern processor handles the full Cucumber expression syntax:

| Syntax          | Example                    | Description                  |
| --------------- | -------------------------- | ---------------------------- |
| `{string}`      | `I click on {string}`      | Quoted string parameter      |
| `{int}`         | `I wait {int} seconds`     | Integer (supports negatives) |
| `{float}`       | `price is {float}`         | Decimal number               |
| `{word}`        | `I click {word}`           | Single word                  |
| `{}`            | `I see {}`                 | Anonymous parameter          |
| `(a\|b\|c)`     | `I login as (admin\|user)` | Enum alternation             |
| `(text)`        | `{int} cucumber(s)`        | Optional text                |
| `word1/word2`   | `belly/stomach`            | Alternative text             |
| `(col1, col2):` | `users (name, email):`     | DataTable with columns       |

## Tech Stack

| Layer         | Technology                  |
| ------------- | --------------------------- |
| Desktop       | Electron 35                 |
| Frontend      | Nuxt 4 (Vue 3)              |
| UI Components | PrimeVue 4                  |
| State         | Pinia                       |
| Test Runner   | Playwright + playwright-bdd |
| Git           | isomorphic-git              |
| Unit Tests    | Vitest                      |
| E2E Tests     | Playwright Electron         |
| Runtime       | Embedded Node.js 22         |

## Development

```bash
git clone https://github.com/Asteb612/SuiSui.git
cd SuiSui
pnpm install
pnpm dev
```

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `pnpm dev`       | Start dev mode with hot reload |
| `pnpm build`     | Production build               |
| `pnpm test`      | Run unit tests                 |
| `pnpm test:e2e`  | Run E2E tests (build first)    |
| `pnpm typecheck` | Full TypeScript type checking  |
| `pnpm lint:fix`  | Fix linting issues             |
| `pnpm dist`      | Build distributable packages   |

### Project Structure

```
SuiSui/
├── apps/desktop/              # Electron + Nuxt desktop app
│   ├── app/                   # Frontend (Vue components, stores, pages)
│   ├── electron/              # Backend (services, IPC, main process)
│   └── e2e/                   # E2E tests + demo recordings
├── packages/shared/           # Shared types and IPC contracts
└── doc/                       # Documentation + GitHub Pages site
```

### Architecture

SuiSui follows strict process isolation:

- **Main Process** (Electron) &mdash; Node.js with file system access
- **Renderer Process** (Nuxt) &mdash; Browser-based UI
- **Preload Script** &mdash; Typed IPC bridge between the two

See [Architecture docs](doc/ARCHITECTURE.md) for details.

## Documentation

| Document                            | Description            |
| ----------------------------------- | ---------------------- |
| [User Guide](doc/USER_GUIDE.md)     | End-user documentation |
| [Architecture](doc/ARCHITECTURE.md) | Design and data flow   |
| [Services](doc/SERVICES.md)         | Backend services       |
| [Frontend](doc/FRONTEND.md)         | Components and stores  |
| [IPC & Types](doc/IPC_TYPES.md)     | IPC channels and types |
| [Development](doc/DEVELOPMENT.md)   | Dev workflow           |
| [Testing](doc/TESTING.md)           | Testing strategies     |

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Open a Pull Request

## License

MIT &mdash; see [LICENSE](LICENSE) for details.

## Acknowledgments

- [playwright-bdd](https://github.com/vitalets/playwright-bdd) &mdash; BDD framework for Playwright
- [Playwright](https://playwright.dev/) &mdash; Browser automation
- [PrimeVue](https://primevue.org/) &mdash; Vue UI components
