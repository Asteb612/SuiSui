#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const browsersDir = path.join(__dirname, '..', 'playwright-browsers');

if (!fs.existsSync(browsersDir)) {
  fs.mkdirSync(browsersDir, { recursive: true });
}
