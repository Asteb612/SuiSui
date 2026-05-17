#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const type = process.argv[2]; // 'module' or 'commonjs'
const outputDir = process.argv[3]; // 'dist/esm' or 'dist/cjs'

if (!type || !outputDir) {
  console.error('Usage: node create-package-json.js <type> <outputDir>');
  process.exit(1);
}

const packageJson = {
  type: type
};

const outputPath = path.join(outputDir, 'package.json');

// Ensure directory exists
fs.mkdirSync(outputDir, { recursive: true });

// Write package.json
fs.writeFileSync(outputPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Created ${outputPath} with type: ${type}`);
