#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Cross-platform script to copy electron assets to dist-electron
 */

function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const sourceDir = path.join(__dirname, '..', 'electron', 'assets');
const destDir = path.join(__dirname, '..', 'dist-electron', 'assets');

if (!fs.existsSync(sourceDir)) {
  console.log(`Assets directory not found: ${sourceDir} (skipping)`);
  process.exit(0);
}

console.log(`Copying ${sourceDir} to ${destDir}...`);
copyRecursive(sourceDir, destDir);
console.log('Assets copied successfully!');
