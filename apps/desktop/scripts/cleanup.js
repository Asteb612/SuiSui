#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const targets = [
  'dist-electron',
  'release',
  'bundled-deps',
  'playwright-browsers',
  '.pnpm-deploy',
  'dist',
  '.output',
  '.nuxt'
].map((p) => path.join(appRoot, p));

for (const target of targets) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[cleanup] removed ${target}`);
  }
}
