#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const distElectronDir = path.join(appRoot, 'dist-electron');
const packDir = path.join(distElectronDir, 'node_modules');
const deployDir = path.join(appRoot, '.pnpm-deploy');

// Critical packages that must exist in node_modules for the app to work
// These are marked as "external" in bundle-deps.js and need to be available at runtime
const CRITICAL_PACKAGES = [
  'playwright',
  'playwright-core',
  '@playwright/test',
];

if (!fs.existsSync(distElectronDir)) {
  console.error(`[prepare-node-modules] dist-electron not found: ${distElectronDir}`);
  console.error('[prepare-node-modules] Run the electron build step first.');
  process.exit(1);
}

if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}

console.log('[prepare-node-modules] Running pnpm deploy (prod)...');
const pnpmArgs = ['--filter', '@suisui/desktop', '--prod', 'deploy', deployDir];
let command = 'pnpm';
let args = pnpmArgs;

if (process.env.npm_execpath) {
  command = process.execPath;
  args = [process.env.npm_execpath, ...pnpmArgs];
}

const result = spawnSync(command, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env
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

// Verify and fix critical packages
// On Windows, pnpm deploy may use junctions that fs.cpSync doesn't handle correctly
console.log('[prepare-node-modules] Verifying critical packages...');
const pnpmStoreDir = path.join(sourceDir, '.pnpm');

for (const pkgName of CRITICAL_PACKAGES) {
  const pkgPath = path.join(packDir, pkgName);
  const hasPackageJson = fs.existsSync(path.join(pkgPath, 'package.json'));

  if (!fs.existsSync(pkgPath) || !hasPackageJson) {
    console.log(`[prepare-node-modules] Missing or incomplete: ${pkgName}, attempting recovery...`);

    // Find the package in .pnpm store
    const pnpmEntries = fs.existsSync(pnpmStoreDir) ? fs.readdirSync(pnpmStoreDir) : [];
    const pkgBaseName = pkgName.replace('@', '').replace('/', '+');
    const matchingEntry = pnpmEntries.find(entry =>
      entry.startsWith(pkgBaseName + '@') || entry.startsWith(pkgName.replace('/', '+') + '@')
    );

    if (matchingEntry) {
      const sourcePkgPath = path.join(pnpmStoreDir, matchingEntry, 'node_modules', pkgName);
      if (fs.existsSync(sourcePkgPath)) {
        console.log(`[prepare-node-modules] Copying from .pnpm store: ${matchingEntry}`);
        if (fs.existsSync(pkgPath)) {
          fs.rmSync(pkgPath, { recursive: true, force: true });
        }
        // Ensure parent directory exists for scoped packages
        const pkgParentDir = path.dirname(pkgPath);
        if (!fs.existsSync(pkgParentDir)) {
          fs.mkdirSync(pkgParentDir, { recursive: true });
        }
        fs.cpSync(sourcePkgPath, pkgPath, { recursive: true, dereference: true });
        console.log(`[prepare-node-modules] Recovered: ${pkgName}`);
      } else {
        console.warn(`[prepare-node-modules] Could not find ${pkgName} in .pnpm store entry`);
      }
    } else {
      console.warn(`[prepare-node-modules] Could not find .pnpm store entry for: ${pkgName}`);
    }
  } else {
    console.log(`[prepare-node-modules] OK: ${pkgName}`);
  }
}

fs.rmSync(deployDir, { recursive: true, force: true });
console.log('[prepare-node-modules] Done');
