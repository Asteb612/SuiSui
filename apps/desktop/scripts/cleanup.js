#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');

// Desktop app build artifacts
const desktopTargets = [
  'dist-electron',
  'release',
  'playwright-browsers',
  '.pnpm-deploy',
  'dist',
  '.output',
  '.nuxt',
  'node_modules'
].map((p) => path.join(appRoot, p));

// Root-level build artifacts
const rootTargets = [
  '.pnpm-deploy',
  'package',
  'node_modules'
].map((p) => path.join(repoRoot, p));

// Shared package build artifacts
const sharedTargets = [
  'packages/shared/dist',
  'packages/shared/node_modules'
].map((p) => path.join(repoRoot, p));

const allTargets = [...desktopTargets, ...rootTargets, ...sharedTargets];

for (const target of allTargets) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[cleanup] removed ${path.relative(repoRoot, target)}`);
  }
}

console.log('[cleanup] done');
