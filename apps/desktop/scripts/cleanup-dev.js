#!/usr/bin/env node
/**
 * Lightweight dev-time cleanup, run before `tsc -p electron/tsconfig.json --watch`
 * (see the `dev:electron:watch` script).
 *
 * Two jobs:
 *
 * 1. `tsc --watch` never deletes the compiled output of a source file that was
 *    renamed or removed, so stale `.js` can linger across dev sessions. This
 *    clears the TypeScript-emitted main-process output in `dist-electron` so the
 *    watch rebuild starts clean.
 *
 * 2. Remove a stale `dist-electron/node_modules`. That directory is a
 *    production `pnpm deploy` copy created only for packaging
 *    (scripts/prepare-node-modules.mjs). In dev it is never regenerated, yet it
 *    SHADOWS the live workspace packages during Node module resolution — so a
 *    stale copy of `@suisui/shared`/`@suisui/step-catalog` there silently
 *    overrides freshly-built ones and desyncs IPC channels/types. Removing it
 *    lets the electron main resolve the fresh `apps/desktop/node_modules`
 *    workspace symlinks. The real dependency install (`apps/desktop/node_modules`)
 *    is never touched; `pnpm build` recreates the deploy copy for packaging.
 *
 * IMPORTANT: it must NOT delete `preload.bundle.js` — that bundle is produced by
 * a separate concurrent process (`dev:electron:preload`) and `dev:electron`
 * blocks on it via `wait-on`; deleting it here would deadlock startup. For a
 * full clean, use `pnpm clean` (scripts/cleanup.js).
 */
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const distElectron = path.join(appRoot, 'dist-electron');

// Stale artifacts to clear, relative to dist-electron. `tsc --watch` regenerates
// the TypeScript output; packaging regenerates node_modules. `preload.bundle.js`
// is intentionally NOT listed (see the header note).
const staleTargets = [
  'main.js',
  'main.js.map',
  'preload.js',
  'preload.js.map',
  'ipc',
  'services',
  'utils',
  'node_modules',
];

// Ensure the output directory exists so the watch/copy steps can write into it.
fs.mkdirSync(distElectron, { recursive: true });

for (const entry of staleTargets) {
  const target = path.join(distElectron, entry);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

// Clear any TypeScript incremental build info so the rebuild is complete.
for (const dir of [appRoot, distElectron]) {
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (name.endsWith('.tsbuildinfo')) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

console.log('[cleanup-dev] cleared stale dist-electron TypeScript output + deploy node_modules');
