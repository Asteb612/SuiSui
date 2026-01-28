#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(appRoot, 'package.json');
const distPath = path.join(appRoot, 'dist-electron', 'package.json');

if (!fs.existsSync(sourcePath)) {
  console.error(`[copy-package-json] Source not found: ${sourcePath}`);
  process.exit(1);
}

const distDir = path.dirname(distPath);
if (!fs.existsSync(distDir)) {
  console.error(`[copy-package-json] dist-electron not found: ${distDir}`);
  console.error('[copy-package-json] Run the electron build step first.');
  process.exit(1);
}

const raw = fs.readFileSync(sourcePath, 'utf-8');
const json = JSON.parse(raw);
delete json.build;
fs.writeFileSync(distPath, JSON.stringify(json, null, 2));
console.log(`[copy-package-json] Copied ${sourcePath} -> ${distPath} (build removed)`);
