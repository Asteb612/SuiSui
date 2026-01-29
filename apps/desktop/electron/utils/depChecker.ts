import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

interface DepCheckResult {
  name: string
  status: 'ok' | 'missing' | 'error'
  path: string | null
  error?: string
  details?: Record<string, unknown>
}

interface DepCheckReport {
  timestamp: string
  isPackaged: boolean
  appPath: string
  resourcesPath: string | null
  results: DepCheckResult[]
  summary: {
    total: number
    ok: number
    missing: number
    error: number
  }
}

function getAppRoot(): string {
  if (app.isPackaged) {
    return app.getAppPath()
  }
  return path.resolve(__dirname, '..', '..')
}

function getBundledDepsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bundled-deps')
  }
  return path.resolve(__dirname, '..', '..', 'bundled-deps')
}

function getNodeModulesPaths(): string[] {
  const appRoot = getAppRoot()
  const paths: string[] = []

  // App's own node_modules
  const appNodeModules = path.join(appRoot, 'node_modules')
  if (fs.existsSync(appNodeModules)) {
    paths.push(appNodeModules)
  }

  // Resource node_modules (extraResources)
  if (app.isPackaged && process.resourcesPath) {
    const resourceNodeModules = path.join(process.resourcesPath, 'node_modules')
    if (fs.existsSync(resourceNodeModules)) {
      paths.push(resourceNodeModules)
    }

    const unpackedNodeModules = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    if (fs.existsSync(unpackedNodeModules)) {
      paths.push(unpackedNodeModules)
    }
  }

  // Monorepo root node_modules (dev only)
  if (!app.isPackaged) {
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')
    if (fs.existsSync(rootNodeModules)) {
      paths.push(rootNodeModules)
    }
  }

  return paths
}

function findInNodeModules(modulePath: string): string | null {
  const nodeModulesPaths = getNodeModulesPaths()
  for (const nmPath of nodeModulesPaths) {
    const fullPath = path.join(nmPath, modulePath)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }
  return null
}

function checkPlaywrightBddBundle(): DepCheckResult {
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
      error: `Failed to load bundle: ${(err as Error).message}`
    }
  }
}

function checkBddgenCli(): DepCheckResult {
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
      error: `Failed to access CLI: ${(err as Error).message}`
    }
  }
}

function checkPlaywrightCli(): DepCheckResult {
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
      error: `Failed to access CLI: ${(err as Error).message}`
    }
  }
}

function checkPlaywrightBrowsers(): DepCheckResult {
  const appRoot = getAppRoot()

  // Check packaged location first
  let browsersPath: string | null = null
  if (app.isPackaged && process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'playwright-browsers')
    if (fs.existsSync(packagedPath)) {
      browsersPath = packagedPath
    }
  }

  // Check dev location
  if (!browsersPath) {
    const devPath = path.join(appRoot, 'playwright-browsers')
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
      error: `Failed to read browsers directory: ${(err as Error).message}`
    }
  }
}

function checkPlaywrightModule(): DepCheckResult {
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
      error: `Failed to check module: ${(err as Error).message}`
    }
  }
}

function checkPlaywrightBddModule(): DepCheckResult {
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
      error: `Failed to check module: ${(err as Error).message}`
    }
  }
}

export function runDepCheck(): DepCheckReport {
  const results: DepCheckResult[] = [
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

  return {
    timestamp: new Date().toISOString(),
    isPackaged: app.isPackaged,
    appPath: getAppRoot(),
    resourcesPath: app.isPackaged ? process.resourcesPath : null,
    results,
    summary,
  }
}

export function printDepCheckReport(report: DepCheckReport): void {
  console.log('\n========================================')
  console.log('  SuiSui Dependency Check Report')
  console.log('========================================\n')

  console.log(`Timestamp: ${report.timestamp}`)
  console.log(`Packaged: ${report.isPackaged}`)
  console.log(`App Path: ${report.appPath}`)
  if (report.resourcesPath) {
    console.log(`Resources Path: ${report.resourcesPath}`)
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
