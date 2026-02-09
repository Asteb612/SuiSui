#!/usr/bin/env node
/**
 * Wrapper script to run bddgen export programmatically.
 * This bypasses Commander.js argument parsing issues with ELECTRON_RUN_AS_NODE.
 *
 * Usage: node bddgen-export.js <config-path> <node-modules-path>
 * Output: Prints step definitions to stdout
 */

const path = require('path');

const configPath = process.argv[2];
const nodeModulesPath = process.argv[3] || process.env.NODE_PATH;

if (!configPath) {
  console.error('Usage: bddgen-export.js <config-path> [node-modules-path]');
  process.exit(1);
}

/**
 * Extract the pattern string from a step definition's pattern property.
 * Handles: string patterns, RegExp objects, wrapper objects with .source/.regexp,
 * and fallback to String() with regex literal slash stripping.
 */
function extractPattern(pattern) {
  if (typeof pattern === 'string') {
    return pattern;
  }
  if (pattern instanceof RegExp) {
    return pattern.source;
  }
  if (pattern && typeof pattern === 'object') {
    if (typeof pattern.source === 'string') {
      return pattern.source;
    }
    if (pattern.regexp instanceof RegExp) {
      return pattern.regexp.source;
    }
  }
  // Fallback: stringify and strip regex literal slashes /pattern/flags
  const str = String(pattern);
  const regexLiteralMatch = str.match(/^\/(.+)\/[gimsuy]*$/);
  if (regexLiteralMatch) {
    return regexLiteralMatch[1];
  }
  return str;
}

async function main() {
  try {
    // Resolve playwright-bdd path from node_modules
    // Use absolute paths to bypass package.json exports restrictions
    let playwrightBddPath;
    if (nodeModulesPath) {
      playwrightBddPath = path.join(nodeModulesPath, 'playwright-bdd');
    } else {
      playwrightBddPath = path.dirname(require.resolve('playwright-bdd/package.json'));
    }

    // Import playwright-bdd internals using absolute paths (requires v8+)
    const { loadConfig } = require(path.join(playwrightBddPath, 'dist', 'playwright', 'loadConfig'));
    const { getEnvConfigs } = require(path.join(playwrightBddPath, 'dist', 'config', 'env'));
    const { TestFilesGenerator } = require(path.join(playwrightBddPath, 'dist', 'generate'));

    // Load the Playwright config
    await loadConfig(configPath);

    // Get BDD configs
    const configs = Object.values(getEnvConfigs());

    if (configs.length === 0) {
      console.error('No BDD configs found. Ensure defineBddConfig() is called in your Playwright config.');
      process.exit(1);
    }

    // Extract steps from all configs
    const allSteps = new Set();

    for (const config of configs) {
      const generator = new TestFilesGenerator(config);
      const stepDefinitions = await generator.extractSteps();

      stepDefinitions.forEach((step) => {
        const keyword = step.keyword === 'Unknown' ? 'When' : step.keyword;
        const pattern = extractPattern(step.pattern);
        allSteps.add(`* ${keyword} ${pattern}`);
      });
    }

    // Output in the same format as bddgen export
    console.log(`List of all steps (${allSteps.size}):`);
    allSteps.forEach((stepText) => console.log(stepText));

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
