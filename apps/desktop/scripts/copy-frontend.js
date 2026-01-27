#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Cross-platform script to copy the Nuxt build output to dist-electron
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

const sourceDir = path.join(__dirname, '..', '.output', 'public');
const destDir = path.join(__dirname, '..', 'dist-electron', 'public');

if (!fs.existsSync(sourceDir)) {
  console.error(`Error: Source directory not found: ${sourceDir}`);
  console.error('Make sure to run "nuxt build" first');
  process.exit(1);
}

console.log(`Copying ${sourceDir} to ${destDir}...`);
copyRecursive(sourceDir, destDir);
console.log('Frontend files copied successfully!');
