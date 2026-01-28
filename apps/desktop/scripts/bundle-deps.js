#!/usr/bin/env node
const { build } = require('esbuild');
const fs = require('fs');
const path = require('path');

/**
 * Script to bundle playwright-bdd and its dependencies into a single file
 * using esbuild. This avoids version compatibility issues between packages.
 */

const appRoot = path.resolve(__dirname, '..');
const bundledDepsDir = path.join(appRoot, 'bundled-deps');

async function bundleDeps() {
  console.log('Bundling dependencies with esbuild...');
  console.log(`Output directory: ${bundledDepsDir}`);

  // Clean existing bundled-deps
  if (fs.existsSync(bundledDepsDir)) {
    fs.rmSync(bundledDepsDir, { recursive: true });
  }
  fs.mkdirSync(bundledDepsDir, { recursive: true });

  // Find playwright-bdd in node_modules
  const monorepoRoot = path.resolve(appRoot, '..', '..');
  let playwrightBddPath = path.join(appRoot, 'node_modules', 'playwright-bdd');
  if (!fs.existsSync(playwrightBddPath)) {
    playwrightBddPath = path.join(monorepoRoot, 'node_modules', 'playwright-bdd');
  }
  // Follow symlink if needed (pnpm)
  playwrightBddPath = fs.realpathSync(playwrightBddPath);

  console.log(`Using playwright-bdd from: ${playwrightBddPath}`);

  // Create an entry point that exports what we need from playwright-bdd
  // Use absolute paths to bypass exports restrictions
  const entryContent = `
// Re-export playwright-bdd internals needed for step extraction
const loadConfigModule = require('${playwrightBddPath.replace(/\\/g, '/')}/dist/playwright/loadConfig');
const envModule = require('${playwrightBddPath.replace(/\\/g, '/')}/dist/config/env');
const genModule = require('${playwrightBddPath.replace(/\\/g, '/')}/dist/gen/index');

module.exports = {
  loadConfig: loadConfigModule.loadConfig,
  getEnvConfigs: envModule.getEnvConfigs,
  TestFilesGenerator: genModule.TestFilesGenerator,
};
`;

  const entryFile = path.join(bundledDepsDir, '_entry.js');
  fs.writeFileSync(entryFile, entryContent);

  try {
    // Bundle everything into a single file
    await build({
      entryPoints: [entryFile],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(bundledDepsDir, 'playwright-bdd-bundle.js'),
      format: 'cjs',
      // Don't bundle node built-ins and problematic packages
      external: [
        // Node.js built-ins
        'fs',
        'path',
        'os',
        'url',
        'util',
        'stream',
        'events',
        'crypto',
        'child_process',
        'net',
        'http',
        'https',
        'tls',
        'zlib',
        'readline',
        'assert',
        'buffer',
        'querystring',
        'string_decoder',
        'tty',
        'dns',
        'module',
        'worker_threads',
        'perf_hooks',
        'inspector',
        'async_hooks',
        'v8',
        'vm',
        'timers',
        'constants',
        // Electron module
        'electron',
        // Native modules and browser-specific packages we don't need
        'fsevents',
        'chromium-bidi',
        'chromium-bidi/*',
        // Playwright internals we don't need for step extraction
        'playwright',
        'playwright-core',
        '@playwright/test',
      ],
      // Minify to reduce size
      minify: false,
      // Keep names for debugging
      keepNames: true,
      // Source maps for debugging
      sourcemap: true,
      // Log level
      logLevel: 'info',
    });

    // Clean up entry file
    fs.unlinkSync(entryFile);

    console.log('\nDependencies bundled successfully!');
    console.log(`Output: ${path.join(bundledDepsDir, 'playwright-bdd-bundle.js')}`);

    // Check output size
    const stats = fs.statSync(path.join(bundledDepsDir, 'playwright-bdd-bundle.js'));
    console.log(`Bundle size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('Bundle failed:', error);
    process.exit(1);
  }
}

bundleDeps();
