# SuiSui Demo Workspace

A **self-contained** example workspace for trying out SuiSui end-to-end — running
BDD tests **and** recording new ones — with **no external website and no internet
required**. It ships a tiny local site (`site/`) served by a zero-dependency Node
server, plus a ready-to-run `playwright-bdd` project.

```
demo-workspace/
├── site/                     # the local website under test (static HTML/CSS/JS)
│   ├── index.html            #   → login page (email, password, "Sign in")
│   └── dashboard.html        #   → welcome banner + add-task form + task list
├── server.mjs                # zero-dependency static server (npm run serve)
├── features/
│   ├── login.feature         # sign-in happy path + invalid credentials
│   ├── tasks.feature         # add a task, mark urgent
│   └── steps/generic.steps.ts# SuiSui's bundled generic steps (unmodified)
├── playwright.config.ts      # playwright-bdd + auto-start webServer
└── package.json              # @playwright/test 1.60 + playwright-bdd
```

The site is deliberately rich in **`data-testid`** attributes, roles, labels,
placeholders, a **password field**, a checkbox, and a `<select>` — so SuiSui's
locator scoring, step matching, and secret redaction all have something to show.

## 1. Install

```bash
cd examples/demo-workspace
npm install
```

Requires Node 18+ and Playwright's Chromium (`npx playwright install chromium` if
it isn't already on your machine).

## 2. Run the tests (standalone)

```bash
npm test          # bddgen + playwright test (auto-starts the local site)
```

All four scenarios should pass. The `webServer` block in `playwright.config.ts`
starts `server.mjs` automatically, so you don't need a separate terminal.

## 3. Open it in SuiSui

1. **Open workspace** → select this `demo-workspace/` folder.
2. Set the workspace **Base URL** to `http://localhost:5173`.
3. You'll see the `login` and `tasks` features and the generic step catalog.
4. **Run** a scenario — SuiSui runs `bddgen` + `playwright test`, and the local
   site is started automatically by the `webServer` config.

## 4. Try the Recorder

The Recorder drives a **real browser** against a URL, so the demo site must be
running. If you started SuiSui with `pnpm dev` from the repo root, the site is
**already served on `http://localhost:5173`** (dev starts it for you). Otherwise
start it yourself:

```bash
npm run serve     # serves http://localhost:5173
```

Then, in SuiSui, click the header **Record** button (beside *Generate with AI*),
or open a scenario in edit mode and click **Record**:

1. A headed browser opens on the demo site — **no Playwright Inspector, no
   in-page overlay** (SuiSui suppresses it and shows its own picker/highlight).
2. Type into **Email**, then **Password** → the password is **redacted at the
   source**; the card shows a masked value and a secret reference, never the
   cleartext, and it never reaches an AI provider.
3. Click **Sign in** (`data-testid="login-submit"`) → its recommended locator is
   `data-testid="login-submit"`, rated **Excellent**, even though the click
   navigates to the dashboard.
4. On the dashboard, use **Add assertion** → pick the **Welcome** banner (an
   element you never interacted with) → **Visible** to add a real `expect` check.
5. **Confirm** → the kept actions insert into your scenario as ordinary generic
   steps and the resulting `.feature` runs through the normal runner.

> Prefer no server at all? You can also point the Recorder at
> `file://<abs-path>/site/index.html` — the toy auth uses `sessionStorage` and
> relative links, so it works over `file://` too. Using the HTTP server is
> recommended because it matches how the tests run.

## Demo credentials

`arthur@example.com` / `secret123` (any other password shows *Invalid
credentials*). These live only in the toy client-side script in `site/` — there
is no real backend.
