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

// Copy assets directory
const assetsSourceDir = path.join(__dirname, '..', 'electron', 'assets');
const assetsDestDir = path.join(__dirname, '..', 'dist-electron', 'assets');

if (fs.existsSync(assetsSourceDir)) {
  console.log(`Copying ${assetsSourceDir} to ${assetsDestDir}...`);
  copyRecursive(assetsSourceDir, assetsDestDir);
  console.log('Assets copied successfully!');
} else {
  console.log(`Assets directory not found: ${assetsSourceDir} (skipping)`);
}

// Copy scripts directory (for bddgen-export.js wrapper)
const scriptsSourceDir = path.join(__dirname, '..', 'electron', 'scripts');
const scriptsDestDir = path.join(__dirname, '..', 'dist-electron', 'scripts');

if (fs.existsSync(scriptsSourceDir)) {
  console.log(`Copying ${scriptsSourceDir} to ${scriptsDestDir}...`);
  copyRecursive(scriptsSourceDir, scriptsDestDir);
  console.log('Scripts copied successfully!');
} else {
  console.log(`Scripts directory not found: ${scriptsSourceDir} (skipping)`);
}
