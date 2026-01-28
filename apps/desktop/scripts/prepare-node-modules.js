#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const distElectronDir = path.join(appRoot, 'dist-electron');
const packDir = path.join(distElectronDir, 'node_modules');
const deployDir = path.join(appRoot, '.pnpm-deploy');

if (!fs.existsSync(distElectronDir)) {
  console.error(`[prepare-node-modules] dist-electron not found: ${distElectronDir}`);
  console.error('[prepare-node-modules] Run the electron build step first.');
  process.exit(1);
}

if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}

console.log('[prepare-node-modules] Running pnpm deploy with node-linker=hoisted...');
const pnpmArgs = ['--filter', '@suisui/desktop', '--prod', 'deploy', deployDir];
let command = 'pnpm';
let args = pnpmArgs;

if (process.env.npm_execpath) {
  command = process.execPath;
  args = [process.env.npm_execpath, ...pnpmArgs];
}

// Use hoisted node-linker to create a flat node_modules structure
// This ensures all packages are accessible via standard Node.js module resolution
// Requires pnpm 10+ (see https://github.com/pnpm/pnpm/issues/6682)
const env = {
  ...process.env,
  npm_config_node_linker: 'hoisted'
};

const result = spawnSync(command, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  env
});

if (result.error) {
  console.error('[prepare-node-modules] Failed to run pnpm.', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('[prepare-node-modules] pnpm deploy failed.');
  process.exit(result.status ?? 1);
}

const sourceDir = path.join(deployDir, 'node_modules');
if (!fs.existsSync(sourceDir)) {
  console.error(`[prepare-node-modules] Deployed node_modules not found: ${sourceDir}`);
  process.exit(1);
}

if (fs.existsSync(packDir)) {
  fs.rmSync(packDir, { recursive: true, force: true });
}

fs.mkdirSync(path.dirname(packDir), { recursive: true });
console.log(`[prepare-node-modules] Copying ${sourceDir} -> ${packDir}`);
fs.cpSync(sourceDir, packDir, { recursive: true, dereference: true });

fs.rmSync(deployDir, { recursive: true, force: true });
console.log('[prepare-node-modules] Done');
