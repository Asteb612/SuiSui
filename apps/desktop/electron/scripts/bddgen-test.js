#!/usr/bin/env node
/**
 * Wrapper script to run bddgen test (generate test files) programmatically.
 * This bypasses Commander.js argument parsing issues with ELECTRON_RUN_AS_NODE.
 *
 * Usage: node bddgen-test.js <config-path> <node-modules-path>
 * Output: Generates test files from Gherkin feature files
 */

const path = require('path');

const configPath = process.argv[2];
const nodeModulesPath = process.argv[3] || process.env.NODE_PATH;

if (!configPath) {
  console.error('Usage: bddgen-test.js <config-path> [node-modules-path]');
  process.exit(1);
}

async function main() {
  try {
    // Resolve playwright-bdd path from node_modules
    // Use absolute paths to bypass package.json exports restrictions
    let playwrightBddPath;
    if (nodeModulesPath) {
      playwrightBddPath = path.join(nodeModulesPath.split(path.delimiter)[0], 'playwright-bdd');
    } else {
      playwrightBddPath = path.dirname(require.resolve('playwright-bdd/package.json'));
    }

    // Import playwright-bdd internals using absolute paths
    const { loadConfig } = require(path.join(playwrightBddPath, 'dist', 'playwright', 'loadConfig'));
    const { getEnvConfigs } = require(path.join(playwrightBddPath, 'dist', 'config', 'env'));
    const { TestFilesGenerator } = require(path.join(playwrightBddPath, 'dist', 'generate'));

    // Load the Playwright config
    const { resolvedConfigFile } = await loadConfig(configPath);
    console.log(`Using config: ${path.relative(process.cwd(), resolvedConfigFile)}`);

    // Get BDD configs
    const configs = Object.values(getEnvConfigs());

    if (configs.length === 0) {
      console.error('No BDD configs found. Ensure defineBddConfig() is called in your Playwright config.');
      process.exit(1);
    }

    // Generate test files for all configs
    for (const config of configs) {
      const generator = new TestFilesGenerator(config);
      await generator.generate();
    }

    console.log('Test files generated successfully');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
