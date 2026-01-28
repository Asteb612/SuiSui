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

console.log('[prepare-node-modules] Running pnpm deploy (prod)...');
const result = spawnSync(
  'pnpm',
  ['--filter', '@suisui/desktop', '--prod', 'deploy', deployDir],
  { cwd: repoRoot, stdio: 'inherit', env: process.env }
);

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
