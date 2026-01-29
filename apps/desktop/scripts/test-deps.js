#!/usr/bin/env node
/**
 * Standalone dependency checker for SuiSui.
 * Verifies that bundled dependencies (playwright, playwright-bdd, bddgen) are correctly packaged.
 *
 * Usage:
 *   node scripts/test-deps.js                              # Development mode
 *   node scripts/test-deps.js --dist-electron              # Test dist-electron build
 *   node scripts/test-deps.js --packaged /path/to/resources  # Test packaged app
 *
 * npm scripts:
 *   pnpm test:deps          # Development mode
 *   pnpm test:deps:build    # Test dist-electron
 *   pnpm test:deps:release  # Test release/linux-unpacked
 *   pnpm test:deps:appimage # Extract and test AppImage
 */

const path = require('node:path')
const fs = require('node:fs')

// Parse arguments
const args = process.argv.slice(2)
const packagedIndex = args.indexOf('--packaged')
const distElectronIndex = args.indexOf('--dist-electron')
const isPackaged = packagedIndex !== -1
const isDistElectron = distElectronIndex !== -1
const resourcesPathArg = isPackaged ? args[packagedIndex + 1] : null

if (isPackaged && !resourcesPathArg) {
  console.error('Error: --packaged requires a path to the resources directory')
  process.exit(1)
}

// Resolve to absolute path for packaged mode
const absoluteResourcesPath = resourcesPathArg ? path.resolve(resourcesPathArg) : null

// For --dist-electron mode, simulate what the packaged app would see
const distElectronPath = path.join(__dirname, '..', 'dist-electron')

function getAppRoot() {
  if (isPackaged) {
    return path.join(absoluteResourcesPath, 'app.asar')
  }
  if (isDistElectron) {
    return distElectronPath
  }
  return path.resolve(__dirname, '..')
}

function getBundledDepsPath() {
  if (isPackaged) {
    return path.join(absoluteResourcesPath, 'bundled-deps')
  }
  return path.resolve(__dirname, '..', 'bundled-deps')
}

function getNodeModulesPaths() {
  const appRoot = getAppRoot()
  const paths = []

  if (isPackaged) {
    // Resource node_modules (extraResources)
    const resourceNodeModules = path.join(absoluteResourcesPath, 'node_modules')
    if (fs.existsSync(resourceNodeModules)) {
      paths.push(resourceNodeModules)
    }

    const unpackedNodeModules = path.join(absoluteResourcesPath, 'app.asar.unpacked', 'node_modules')
    if (fs.existsSync(unpackedNodeModules)) {
      paths.push(unpackedNodeModules)
    }
  } else if (isDistElectron) {
    // Simulating packaged app - only look in dist-electron/node_modules
    const distNodeModules = path.join(distElectronPath, 'node_modules')
    if (fs.existsSync(distNodeModules)) {
      paths.push(distNodeModules)
    }
  } else {
    // Dev mode - check monorepo root node_modules
    const monorepoRoot = path.resolve(__dirname, '..', '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')
    if (fs.existsSync(rootNodeModules)) {
      paths.push(rootNodeModules)
    }
  }

  return paths
}

function findInNodeModules(modulePath) {
  const nodeModulesPaths = getNodeModulesPaths()
  for (const nmPath of nodeModulesPaths) {
    const fullPath = path.join(nmPath, modulePath)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }
  return null
}

function checkPlaywrightBddBundle() {
  const bundlePath = path.join(getBundledDepsPath(), 'playwright-bdd-bundle.js')

  if (!fs.existsSync(bundlePath)) {
    return {
      name: 'playwright-bdd-bundle',
      status: 'missing',
      path: bundlePath,
      error: 'Bundle file not found'
    }
  }

  try {
    // Try to require the bundle
    const bundleExports = require(bundlePath)
    const hasLoadConfig = typeof bundleExports.loadConfig === 'function'
    const hasGetEnvConfigs = typeof bundleExports.getEnvConfigs === 'function'
    const hasTestFilesGenerator = typeof bundleExports.TestFilesGenerator === 'function'

    if (!hasLoadConfig || !hasGetEnvConfigs || !hasTestFilesGenerator) {
      return {
        name: 'playwright-bdd-bundle',
        status: 'error',
        path: bundlePath,
        error: 'Bundle missing required exports',
        details: {
          hasLoadConfig,
          hasGetEnvConfigs,
          hasTestFilesGenerator
        }
      }
    }

    const stats = fs.statSync(bundlePath)
    return {
      name: 'playwright-bdd-bundle',
      status: 'ok',
      path: bundlePath,
      details: {
        size: stats.size,
        exports: Object.keys(bundleExports)
      }
    }
  } catch (err) {
    return {
      name: 'playwright-bdd-bundle',
      status: 'error',
      path: bundlePath,
      error: `Failed to load bundle: ${err.message}`
    }
  }
}

function checkBddgenCli() {
  const cliPath = findInNodeModules('playwright-bdd/dist/cli/index.js')

  if (!cliPath) {
    return {
      name: 'bddgen-cli',
      status: 'missing',
      path: null,
      error: 'bddgen CLI not found in any node_modules',
      details: {
        searchedPaths: getNodeModulesPaths()
      }
    }
  }

  try {
    const stats = fs.statSync(cliPath)
    return {
      name: 'bddgen-cli',
      status: 'ok',
      path: cliPath,
      details: {
        size: stats.size
      }
    }
  } catch (err) {
    return {
      name: 'bddgen-cli',
      status: 'error',
      path: cliPath,
      error: `Failed to access CLI: ${err.message}`
    }
  }
}

function checkPlaywrightCli() {
  // Try @playwright/test first, then playwright
  let cliPath = findInNodeModules('@playwright/test/cli.js')
  if (!cliPath) {
    cliPath = findInNodeModules('playwright/cli.js')
  }

  if (!cliPath) {
    return {
      name: 'playwright-cli',
      status: 'missing',
      path: null,
      error: 'Playwright CLI not found in any node_modules',
      details: {
        searchedPaths: getNodeModulesPaths()
      }
    }
  }

  try {
    const stats = fs.statSync(cliPath)
    return {
      name: 'playwright-cli',
      status: 'ok',
      path: cliPath,
      details: {
        size: stats.size
      }
    }
  } catch (err) {
    return {
      name: 'playwright-cli',
      status: 'error',
      path: cliPath,
      error: `Failed to access CLI: ${err.message}`
    }
  }
}

function checkPlaywrightBrowsers() {
  let browsersPath = null

  if (isPackaged) {
    const packagedPath = path.join(absoluteResourcesPath, 'playwright-browsers')
    if (fs.existsSync(packagedPath)) {
      browsersPath = packagedPath
    }
  } else {
    const devPath = path.join(__dirname, '..', 'playwright-browsers')
    if (fs.existsSync(devPath)) {
      browsersPath = devPath
    }
  }

  if (!browsersPath) {
    return {
      name: 'playwright-browsers',
      status: 'missing',
      path: null,
      error: 'Playwright browsers directory not found'
    }
  }

  try {
    const entries = fs.readdirSync(browsersPath)
    const chromiumEntry = entries.find(e => e.startsWith('chromium'))

    return {
      name: 'playwright-browsers',
      status: chromiumEntry ? 'ok' : 'missing',
      path: browsersPath,
      error: chromiumEntry ? undefined : 'Chromium not found in browsers directory',
      details: {
        entries,
        hasChromium: !!chromiumEntry
      }
    }
  } catch (err) {
    return {
      name: 'playwright-browsers',
      status: 'error',
      path: browsersPath,
      error: `Failed to read browsers directory: ${err.message}`
    }
  }
}

function checkPlaywrightModule() {
  const modulePath = findInNodeModules('playwright')

  if (!modulePath) {
    return {
      name: 'playwright-module',
      status: 'missing',
      path: null,
      error: 'playwright module not found',
      details: {
        searchedPaths: getNodeModulesPaths()
      }
    }
  }

  try {
    const packageJsonPath = path.join(modulePath, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      return {
        name: 'playwright-module',
        status: 'ok',
        path: modulePath,
        details: {
          version: packageJson.version,
          name: packageJson.name
        }
      }
    }

    return {
      name: 'playwright-module',
      status: 'ok',
      path: modulePath
    }
  } catch (err) {
    return {
      name: 'playwright-module',
      status: 'error',
      path: modulePath,
      error: `Failed to check module: ${err.message}`
    }
  }
}

function checkPlaywrightBddModule() {
  const modulePath = findInNodeModules('playwright-bdd')

  if (!modulePath) {
    return {
      name: 'playwright-bdd-module',
      status: 'missing',
      path: null,
      error: 'playwright-bdd module not found',
      details: {
        searchedPaths: getNodeModulesPaths()
      }
    }
  }

  try {
    const packageJsonPath = path.join(modulePath, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      return {
        name: 'playwright-bdd-module',
        status: 'ok',
        path: modulePath,
        details: {
          version: packageJson.version,
          name: packageJson.name
        }
      }
    }

    return {
      name: 'playwright-bdd-module',
      status: 'ok',
      path: modulePath
    }
  } catch (err) {
    return {
      name: 'playwright-bdd-module',
      status: 'error',
      path: modulePath,
      error: `Failed to check module: ${err.message}`
    }
  }
}

function runDepCheck() {
  const results = [
    checkPlaywrightBddBundle(),
    checkBddgenCli(),
    checkPlaywrightCli(),
    checkPlaywrightBrowsers(),
    checkPlaywrightModule(),
    checkPlaywrightBddModule(),
  ]

  const summary = {
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    missing: results.filter(r => r.status === 'missing').length,
    error: results.filter(r => r.status === 'error').length,
  }

  const mode = isPackaged ? 'packaged' : (isDistElectron ? 'dist-electron' : 'development')

  return {
    timestamp: new Date().toISOString(),
    mode,
    isPackaged,
    isDistElectron,
    appPath: getAppRoot(),
    absoluteResourcesPath: isPackaged ? absoluteResourcesPath : null,
    results,
    summary,
  }
}

function printDepCheckReport(report) {
  console.log('\n========================================')
  console.log('  SuiSui Dependency Check Report')
  console.log('========================================\n')

  console.log(`Timestamp: ${report.timestamp}`)
  console.log(`Mode: ${report.mode}`)
  console.log(`App Path: ${report.appPath}`)
  if (report.absoluteResourcesPath) {
    console.log(`Resources Path: ${report.absoluteResourcesPath}`)
  }
  console.log('')

  console.log('Node Modules Search Paths:')
  getNodeModulesPaths().forEach((p, i) => {
    console.log(`  ${i + 1}. ${p}`)
  })
  console.log('')

  console.log('Dependency Status:')
  console.log('------------------')

  for (const result of report.results) {
    const statusIcon = result.status === 'ok' ? '[OK]' : result.status === 'missing' ? '[MISSING]' : '[ERROR]'
    console.log(`\n${statusIcon} ${result.name}`)

    if (result.path) {
      console.log(`    Path: ${result.path}`)
    }

    if (result.error) {
      console.log(`    Error: ${result.error}`)
    }

    if (result.details) {
      console.log(`    Details: ${JSON.stringify(result.details, null, 2).replace(/\n/g, '\n    ')}`)
    }
  }

  console.log('\n----------------------------------------')
  console.log(`Summary: ${report.summary.ok}/${report.summary.total} OK, ${report.summary.missing} missing, ${report.summary.error} errors`)
  console.log('----------------------------------------\n')
}

// Run the check
const report = runDepCheck()
printDepCheckReport(report)

// Exit with appropriate code
const exitCode = report.summary.missing > 0 || report.summary.error > 0 ? 1 : 0
process.exit(exitCode)
