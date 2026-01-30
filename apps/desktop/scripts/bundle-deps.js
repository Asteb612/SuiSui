#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Script to prepare bundled dependencies directory.
 *
 * Note: We no longer bundle playwright-bdd internals since we switched to
 * running `bddgen export` via subprocess (with ELECTRON_RUN_AS_NODE=1).
 * This approach properly initializes the Cucumber context and avoids
 * version compatibility issues.
 *
 * The subprocess approach uses:
 * - The CLI at node_modules/playwright-bdd/dist/cli/index.js
 * - process.execPath with ELECTRON_RUN_AS_NODE=1 to run as Node.js
 */

const appRoot = path.resolve(__dirname, '..');
const bundledDepsDir = path.join(appRoot, 'bundled-deps');

async function prepareDeps() {
  console.log('Preparing bundled dependencies directory...');
  console.log(`Output directory: ${bundledDepsDir}`);

  // Clean existing bundled-deps
  if (fs.existsSync(bundledDepsDir)) {
    fs.rmSync(bundledDepsDir, { recursive: true });
  }
  fs.mkdirSync(bundledDepsDir, { recursive: true });

  // Create a marker file to indicate the directory was processed
  const markerContent = `// This directory was prepared by bundle-deps.js
// playwright-bdd is now used via CLI subprocess instead of in-process bundling
// See StepService.ts for implementation details
module.exports = { version: '${new Date().toISOString()}' };
`;

  fs.writeFileSync(path.join(bundledDepsDir, 'marker.js'), markerContent);

  console.log('\nDependencies directory prepared successfully!');
  console.log('Note: playwright-bdd is used via CLI subprocess, not bundled.');
}

prepareDeps();
