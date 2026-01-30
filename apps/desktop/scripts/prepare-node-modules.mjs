#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
console.log(`[prepare-node-modules] Deploy target: ${deployDir}`);

// Use hoisted node-linker to create a flat node_modules structure
// This ensures all packages are accessible via standard Node.js module resolution
// Requires pnpm 10+ (see https://github.com/pnpm/pnpm/issues/6682)
const env = {
  ...process.env,
  npm_config_node_linker: 'hoisted'
};

let result;

if (process.platform === 'win32') {
  // On Windows, use shell with properly quoted paths to handle spaces
  const quotedDeployDir = `"${deployDir}"`;
  const cmdLine = `pnpm --filter @suisui/desktop --prod deploy ${quotedDeployDir}`;
  console.log(`[prepare-node-modules] Running: ${cmdLine}`);
  result = spawnSync(cmdLine, [], {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
    shell: true
  });
} else {
  // On Unix, pass args as array (no shell needed)
  const pnpmArgs = ['--filter', '@suisui/desktop', '--prod', 'deploy', deployDir];
  let command = 'pnpm';
  let args = pnpmArgs;

  // Check if npm_execpath is a JS file (not a native binary)
  // Native pnpm binaries (ELF on Linux) cannot be run via Node.js
  if (process.env.npm_execpath && process.env.npm_execpath.endsWith('.js')) {
    command = process.execPath;
    args = [process.env.npm_execpath, ...pnpmArgs];
  }

  result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env
  });
}

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
