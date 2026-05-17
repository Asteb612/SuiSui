import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import git from 'isomorphic-git'
import type { WorkspaceInfo, WorkspaceValidation, BddDetectionResult } from '@suisui/shared'
import { getSettingsService } from './SettingsService'
import { getDependencyService } from './DependencyService'
import { getStepService } from './StepService'
import { createLogger } from '../utils/logger'

const logger = createLogger('WorkspaceService')

/**
 * Path to the default step definitions asset file.
 * In development: electron/assets/generic.steps.ts
 * In production: dist-electron/assets/generic.steps.ts (after build)
 */
function getDefaultStepsAssetPath(): string {
  // __dirname points to electron/services/ in dev, dist-electron/services/ after build
  // Go up from services/ to electron/, then into assets/
  return path.join(__dirname, '..', 'assets', 'generic.steps.ts')
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.features-gen',
  'dist',
  'build',
  '.git',
  'dist-electron',
])

/** All Playwright config file candidates (root + tests/ subdirectory). */
export const PLAYWRIGHT_CONFIG_CANDIDATES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mjs',
  'playwright.config.cjs',
  path.join('tests', 'playwright.config.ts'),
  path.join('tests', 'playwright.config.js'),
  path.join('tests', 'playwright.config.mjs'),
  path.join('tests', 'playwright.config.cjs'),
]

/** Find the first existing Playwright config in a workspace, or null. */
export function findExistingPlaywrightConfig(workspacePath: string): string | null {
  for (const candidate of PLAYWRIGHT_CONFIG_CANDIDATES) {
    const fullPath = path.join(workspacePath, candidate)
    if (fsSync.existsSync(fullPath)) return fullPath
  }
  return null
}

/**
 * Extract string array values from a JS/TS array literal.
 * Handles single-line and multi-line arrays with single or double quotes.
 */
function extractStringArrayValues(arrayStr: string): string[] {
  const values: string[] = []
  const regex = /['"]([^'"]*)['"]/g
  let m
  while ((m = regex.exec(arrayStr)) !== null) {
    if (m[1]) values.push(m[1])
  }
  return values
}

/**
 * Find the defineBddConfig({...}) block in a file and return its start/end indices
 * (of the inner object literal, excluding the outer `defineBddConfig(` and `)` ).
 */
function findBddConfigBlock(content: string): { start: number; end: number } | null {
  const marker = 'defineBddConfig('
  const idx = content.indexOf(marker)
  if (idx === -1) return null

  const openParen = idx + marker.length
  // Find the opening `{`
  const braceStart = content.indexOf('{', openParen)
  if (braceStart === -1) return null

  // Brace-match to find the closing `}`
  let depth = 1
  let pos = braceStart + 1
  while (depth > 0 && pos < content.length) {
    if (content[pos] === '{') depth++
    else if (content[pos] === '}') depth--
    pos++
  }
  if (depth !== 0) return null

  return { start: braceStart, end: pos } // end is right after the closing `}`
}

export class WorkspaceService {
  private currentWorkspace: WorkspaceInfo | null = null

  /**
   * Filesystem-only scan for step files. Returns glob patterns
   * covering all discovered step directories. Does NOT read cucumber.json.
   */
  async scanFilesystemForStepPaths(workspacePath: string): Promise<string[]> {
    const stepDirs = new Set<string>()
    const featuresDir = await this.detectFeaturesDir(workspacePath)

    const scan = async (dir: string, depth: number): Promise<void> => {
      if (depth > 4) return
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch {
        return
      }
      for (const name of entries) {
        if (SKIP_DIRS.has(name)) continue
        const fullPath = path.join(dir, name)
        let stat
        try {
          stat = await fs.stat(fullPath)
        } catch {
          continue
        }
        if (stat.isDirectory()) {
          await scan(fullPath, depth + 1)
        } else if (stat.isFile() && (name.endsWith('.steps.ts') || name.endsWith('.steps.js'))) {
          const relDir = path.relative(workspacePath, dir)
          if (relDir) stepDirs.add(relDir)
        }
      }
    }

    await scan(workspacePath, 0)

    const roots = new Set<string>()
    for (const dir of stepDirs) {
      const firstSegment = dir.split('/')[0]
      roots.add(firstSegment)
    }

    const normalizedFeaturesDir = featuresDir.replace(/\\/g, '/')
    const defaultPatterns = [
      `${normalizedFeaturesDir}/steps/**/*.ts`,
      `${normalizedFeaturesDir}/steps/**/*.js`,
    ]
    const extraPatterns: string[] = []
    for (const root of [...roots].sort()) {
      if (root === 'features') continue
      extraPatterns.push(`${root}/**/*.ts`, `${root}/**/*.js`)
    }

    return [...defaultPatterns, ...extraPatterns]
  }

  /**
   * Detect step paths by merging filesystem scan with cucumber.json require paths.
   * cucumber.json paths are included first (additive merge, no duplicates).
   */
  async detectStepPaths(workspacePath: string): Promise<string[]> {
    const fsPaths = await this.scanFilesystemForStepPaths(workspacePath)

    // Read cucumber.json require paths and merge
    const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
    try {
      const content = await fs.readFile(cucumberJsonPath, 'utf-8')
      const parsed = JSON.parse(content)
      const requireValue = parsed?.default?.require ?? parsed?.require
      if (Array.isArray(requireValue)) {
        const cucumberPaths = requireValue.filter(
          (p: unknown): p is string => typeof p === 'string'
        )
        const merged = new Set([...cucumberPaths, ...fsPaths])
        return [...merged]
      }
    } catch {
      // cucumber.json missing or unparseable — use filesystem only
    }

    return fsPaths
  }

  private getPlaywrightConfigContent(stepPaths: string[], featureGlob: string): string {
    const stepsLine = `  steps: [${stepPaths.map((p) => `'${p}'`).join(', ')}],`
    return [
      '// This file was generated by SuiSui',
      "import { defineConfig } from '@playwright/test'",
      "import { defineBddConfig } from 'playwright-bdd'",
      '',
      '// Get feature file from FEATURE env var (used by SuiSui and npm scripts)',
      'const featureFile = process.env.FEATURE',
      '',
      'const testDir = defineBddConfig({',
      `  paths: featureFile ? [featureFile] : ['${featureGlob}'],`,
      stepsLine,
      "  missingSteps: 'fail-on-run',",
      '  verbose: true,',
      '})',
      '',
      '// Normalize base URL (add https:// if missing protocol)',
      'const rawBaseUrl = process.env.BASE_URL',
      'const baseURL = rawBaseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(rawBaseUrl)',
      '  ? `https://${rawBaseUrl}`',
      '  : rawBaseUrl',
      '',
      'export default defineConfig({',
      '  testDir,',
      "  reporter: [['html', { open: 'never' }]],",
      '  use: {',
      '    baseURL,',
      "    trace: 'on-first-retry',",
      '  },',
      '})',
      '',
    ].join('\n')
  }

  /**
   * Extract paths and steps arrays from the defineBddConfig({...}) block
   * in a Playwright config file.
   */
  extractBddConfigArrays(content: string): { paths: string[]; steps: string[] } | null {
    const block = findBddConfigBlock(content)
    if (!block) return null

    const blockContent = content.substring(block.start, block.end)

    // Extract paths: [...]
    const pathsMatch = blockContent.match(/paths:\s*(\[[\s\S]*?\])/)
    const paths = pathsMatch ? extractStringArrayValues(pathsMatch[1]) : []

    // Extract steps: [...]
    const stepsMatch = blockContent.match(/steps:\s*(\[[\s\S]*?\])/)
    const steps = stepsMatch ? extractStringArrayValues(stepsMatch[1]) : []

    return { paths, steps }
  }

  /**
   * Surgically update ONLY the paths and steps arrays inside defineBddConfig({...}).
   * Returns the updated file content, or null if defineBddConfig is not found.
   */
  private updateBddConfigArrays(
    content: string,
    newPaths: string[],
    newSteps: string[]
  ): string | null {
    const block = findBddConfigBlock(content)
    if (!block) return null

    let blockContent = content.substring(block.start, block.end)

    // Replace paths: [...] (handles multi-line)
    const pathsStr = `paths: [${newPaths.map((p) => `'${p}'`).join(', ')}]`
    if (/paths:\s*\[[\s\S]*?\]/.test(blockContent)) {
      blockContent = blockContent.replace(/paths:\s*\[[\s\S]*?\]/, pathsStr)
    }

    // Replace steps: [...] (handles multi-line)
    const stepsStr = `steps: [${newSteps.map((s) => `'${s}'`).join(', ')}]`
    if (/steps:\s*\[[\s\S]*?\]/.test(blockContent)) {
      blockContent = blockContent.replace(/steps:\s*\[[\s\S]*?\]/, stepsStr)
    }

    return content.substring(0, block.start) + blockContent + content.substring(block.end)
  }

  private async ensurePlaywrightConfig(workspacePath: string): Promise<void> {
    const existingConfigPath = findExistingPlaywrightConfig(workspacePath)

    if (existingConfigPath) {
      // Config exists — try surgical sync of paths/steps inside defineBddConfig
      try {
        const content = await fs.readFile(existingConfigPath, 'utf-8')
        if (!content.includes('defineBddConfig')) {
          logger.debug('Playwright config exists without defineBddConfig, skipping sync', {
            existingConfigPath,
          })
          return
        }

        // Read target paths/steps from cucumber.json (primary) or filesystem
        const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
        let targetPaths: string[] | null = null
        let targetSteps: string[] | null = null

        try {
          const cucumberContent = await fs.readFile(cucumberJsonPath, 'utf-8')
          const parsed = JSON.parse(cucumberContent)
          const defaultConfig = parsed?.default ?? parsed
          if (Array.isArray(defaultConfig?.paths)) targetPaths = defaultConfig.paths
          if (Array.isArray(defaultConfig?.require)) targetSteps = defaultConfig.require
        } catch {
          // cucumber.json missing or unparseable — use filesystem detection
        }

        if (!targetSteps) {
          targetSteps = await this.scanFilesystemForStepPaths(workspacePath)
        }
        if (!targetPaths) {
          const featuresDir = await this.detectFeaturesDir(workspacePath)
          targetPaths = [path.join(featuresDir, '**', '*.feature').replace(/\\/g, '/')]
        }

        const updated = this.updateBddConfigArrays(content, targetPaths, targetSteps)
        if (updated && updated !== content) {
          await fs.writeFile(existingConfigPath, updated, 'utf-8')
          logger.info('Synced paths/steps in playwright config', { existingConfigPath })
        } else {
          logger.debug('Playwright config paths/steps are up to date', { existingConfigPath })
        }
      } catch (error) {
        logger.warn('Failed to sync playwright config, skipping', {
          error: error instanceof Error ? error.message : String(error),
          existingConfigPath,
        })
      }
      return
    }

    // No config exists — create default template
    const playwrightConfigPath = path.join(workspacePath, 'playwright.config.ts')
    const stepPaths = await this.scanFilesystemForStepPaths(workspacePath)
    const featuresDir = await this.detectFeaturesDir(workspacePath)
    const featureGlob = path.join(featuresDir, '**', '*.feature').replace(/\\/g, '/')
    const content = this.getPlaywrightConfigContent(stepPaths, featureGlob)
    logger.info('Creating playwright.config.ts', { playwrightConfigPath })
    await fs.writeFile(playwrightConfigPath, content, 'utf-8')
    logger.info('playwright.config.ts created', { playwrightConfigPath })
  }

  private async ensureCucumberJson(workspacePath: string): Promise<void> {
    const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
    const fsStepPaths = await this.scanFilesystemForStepPaths(workspacePath)

    let existingContent: string | null = null
    try {
      existingContent = await fs.readFile(cucumberJsonPath, 'utf-8')
    } catch {
      // File doesn't exist — will create below
    }

    if (existingContent !== null) {
      // cucumber.json exists — additive sync of require paths
      try {
        const parsed = JSON.parse(existingContent)
        const defaultConfig = parsed?.default ?? parsed
        const existingRequire: string[] = Array.isArray(defaultConfig?.require)
          ? defaultConfig.require
          : []

        // Additive merge: add filesystem-detected paths not already present
        const merged = new Set([...existingRequire, ...fsStepPaths])
        const mergedArray = [...merged]

        if (
          mergedArray.length !== existingRequire.length ||
          !mergedArray.every((p, i) => p === existingRequire[i])
        ) {
          // Update only the require field, preserve everything else
          if (parsed.default) {
            parsed.default = { ...parsed.default, require: mergedArray }
          } else {
            parsed.require = mergedArray
          }
          await fs.writeFile(cucumberJsonPath, JSON.stringify(parsed, null, 2))
          logger.info('Updated cucumber.json require paths', {
            added: mergedArray.length - existingRequire.length,
          })
        } else {
          logger.debug('cucumber.json require paths are up to date')
        }
      } catch {
        logger.warn('Failed to parse cucumber.json for require sync, skipping')
      }
      return
    }

    // cucumber.json missing — create it
    const featuresDir = await this.detectFeaturesDir(workspacePath)
    const featuresGlob = path.join(featuresDir, '**', '*.feature').replace(/\\/g, '/')

    // Try to import paths/steps from existing playwright config
    const existingConfigPath = findExistingPlaywrightConfig(workspacePath)
    let initialPaths = [featuresGlob]
    let initialRequire = fsStepPaths

    if (existingConfigPath) {
      try {
        const configContent = await fs.readFile(existingConfigPath, 'utf-8')
        const extracted = this.extractBddConfigArrays(configContent)
        if (extracted) {
          if (extracted.paths.length > 0) initialPaths = extracted.paths
          if (extracted.steps.length > 0) {
            // Merge: playwright config steps + filesystem detected
            const merged = new Set([...extracted.steps, ...fsStepPaths])
            initialRequire = [...merged]
          }
          logger.info('Imported paths/steps from playwright config into cucumber.json')
        }
      } catch {
        // Couldn't read config — use defaults
      }
    }

    logger.info('Creating cucumber.json', { cucumberJsonPath })
    const cucumberConfig = {
      default: {
        formatOptions: {
          snippetInterface: 'async-await',
        },
        paths: initialPaths,
        require: initialRequire,
        format: ['progress-bar', 'html:reports/cucumber-report.html'],
        publishQuiet: true,
      },
    }
    await fs.writeFile(cucumberJsonPath, JSON.stringify(cucumberConfig, null, 2))
    logger.info('cucumber.json created', { cucumberJsonPath })
  }

  private async ensureDefaultSteps(workspacePath: string): Promise<void> {
    const featuresDir = await this.detectFeaturesDir(workspacePath)
    const stepsPath = path.join(workspacePath, featuresDir, 'steps')
    const defaultStepsPath = path.join(stepsPath, 'generic.steps.ts')

    const shouldCreate = await this.shouldCreateDefaultSteps(workspacePath)
    if (!shouldCreate) {
      logger.debug('Skipping default steps creation', { workspacePath })
      return
    }

    try {
      await fs.access(defaultStepsPath)
      logger.debug('generic.steps.ts already exists', { defaultStepsPath })
    } catch {
      // Ensure steps directory exists
      try {
        await fs.access(stepsPath)
      } catch {
        logger.info('Creating features/steps/ directory', { stepsPath })
        await fs.mkdir(stepsPath, { recursive: true })
      }

      // Read the default steps from the asset file
      const assetPath = getDefaultStepsAssetPath()
      logger.info('Reading default steps from asset', { assetPath })
      const defaultStepsContent = await fs.readFile(assetPath, 'utf-8')

      logger.info('Creating generic.steps.ts', { defaultStepsPath })
      await fs.writeFile(defaultStepsPath, defaultStepsContent, 'utf-8')
      logger.info('generic.steps.ts created', { defaultStepsPath })
    }
  }

  private async shouldCreateDefaultSteps(workspacePath: string): Promise<boolean> {
    if (findExistingPlaywrightConfig(workspacePath)) return false

    try {
      await fs.access(path.join(workspacePath, 'cucumber.json'))
      return false
    } catch {
      return true
    }
  }

  private normalizeFeatureDir(pattern: string): string | null {
    const trimmed = pattern.trim()
    if (!trimmed) return null

    // Extract base path before any glob chars
    const globIndex = trimmed.search(/[{}*?[\]]/)
    let base = globIndex >= 0 ? trimmed.slice(0, globIndex) : trimmed
    base = base.replace(/\\/g, '/')
    base = base.replace(/\/+$/, '')

    if (!base) return null

    // If base still looks like a file, use its directory
    if (base.endsWith('.feature')) {
      return path.dirname(base).replace(/\\/g, '/')
    }

    if (base.startsWith('./')) {
      base = base.slice(2)
    }

    return base
  }

  private extractFeatureDirFromPlaywrightConfig(content: string): string | null {
    // Look for string literals that reference .feature paths
    const match = content.match(/['"`]([^'"`]*\.feature[^'"`]*)['"`]/)
    if (!match || !match[1]) return null
    return this.normalizeFeatureDir(match[1])
  }

  private extractFeatureDirFromCucumberJson(content: string): string | null {
    try {
      const parsed = JSON.parse(content)
      const pathsValue = parsed?.default?.paths ?? parsed?.paths
      if (Array.isArray(pathsValue) && typeof pathsValue[0] === 'string') {
        return this.normalizeFeatureDir(pathsValue[0])
      }
    } catch {
      // Ignore parse errors and fall back to defaults
    }
    return null
  }

  private async detectFeaturesDir(workspacePath: string): Promise<string> {
    // Priority: cucumber.json → playwright config → default 'features'
    const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
    try {
      const content = await fs.readFile(cucumberJsonPath, 'utf-8')
      const detected = this.extractFeatureDirFromCucumberJson(content)
      if (detected) return detected
    } catch {
      // Ignore missing/unreadable cucumber.json
    }

    for (const candidate of PLAYWRIGHT_CONFIG_CANDIDATES) {
      const configPath = path.join(workspacePath, candidate)
      try {
        const content = await fs.readFile(configPath, 'utf-8')
        const detected = this.extractFeatureDirFromPlaywrightConfig(content)
        if (detected) return detected
      } catch {
        // Ignore missing/unreadable config files
      }
    }

    return 'features'
  }

  private getExpectedScripts(): Record<string, string> {
    return {
      test: 'bddgen && playwright test',
      'test:ui': 'bddgen && playwright test --ui',
      'test:headed': 'bddgen && playwright test --headed',
      'test:debug': 'bddgen && playwright test --debug',
      bddgen: 'bddgen',
      'bddgen:export': 'bddgen export',
    }
  }

  private async ensurePackageJsonScripts(workspacePath: string): Promise<void> {
    const packageJsonPath = path.join(workspacePath, 'package.json')

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(content)
      const expectedScripts = this.getExpectedScripts()

      // Only add scripts whose names don't already exist (FR-006: never overwrite user scripts)
      if (!packageJson.scripts) {
        packageJson.scripts = {}
      }

      let needsUpdate = false
      for (const [name, script] of Object.entries(expectedScripts)) {
        if (!(name in packageJson.scripts)) {
          packageJson.scripts[name] = script
          needsUpdate = true
        }
      }

      if (needsUpdate) {
        logger.info('Adding missing scripts to package.json', { packageJsonPath })
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8')
        logger.info('package.json scripts updated', { packageJsonPath })
      } else {
        logger.debug('package.json scripts are up to date', { packageJsonPath })
      }
    } catch (error) {
      logger.warn('Failed to update package.json scripts', {
        error: error instanceof Error ? error.message : String(error),
        packageJsonPath,
      })
    }
  }

  private async exportSteps(): Promise<void> {
    try {
      logger.info('Exporting steps for workspace')
      const stepService = getStepService()
      const result = await stepService.export()
      logger.info('Steps exported successfully', { stepCount: result.steps.length })
    } catch (error) {
      // Don't fail workspace setup if step export fails
      logger.warn('Failed to export steps', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private static readonly SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.app', 'coverage', 'out', 'tmp', 'temp',
  ])

  async detectBddWorkspace(clonePath: string): Promise<BddDetectionResult> {
    logger.info('Detecting BDD workspace', { clonePath })
    const candidates: string[] = []

    // Check if root already has BDD structure
    const rootHasBdd = await this.hasBddIndicators(clonePath)
    if (rootHasBdd) {
      logger.info('BDD structure found at root, skipping subfolder scan')
      return { candidates: [] }
    }

    // Scan first-level subdirectories
    try {
      const entries = await fs.readdir(clonePath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue
        if (WorkspaceService.SKIP_DIRS.has(entry.name)) continue

        const subPath = path.join(clonePath, entry.name)
        if (await this.hasBddIndicators(subPath)) {
          candidates.push(subPath)
        }
      }
    } catch (err) {
      logger.error('Failed to scan for BDD workspace', err instanceof Error ? err : new Error(String(err)))
    }

    logger.info('BDD detection complete', { clonePath, candidateCount: candidates.length })
    return { candidates }
  }

  private async hasBddIndicators(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path.join(dirPath, 'features'))
      if (stat.isDirectory()) return true
    } catch {
      // no features/ dir
    }
    try {
      await fs.access(path.join(dirPath, 'cucumber.json'))
      return true
    } catch {
      // no cucumber.json
    }
    return false
  }

  async validate(workspacePath: string): Promise<WorkspaceValidation> {
    logger.debug('Validating workspace', { workspacePath })
    const errors: string[] = []

    try {
      const stat = await fs.stat(workspacePath)
      if (!stat.isDirectory()) {
        errors.push('Path is not a directory')
        logger.warn('Path is not a directory', { workspacePath })
        return { isValid: false, errors }
      }
    } catch (error) {
      errors.push('Directory does not exist')
      logger.error(
        'Directory does not exist',
        error instanceof Error ? error : new Error(String(error)),
        { workspacePath }
      )
      return { isValid: false, errors }
    }

    const packageJsonPath = path.join(workspacePath, 'package.json')
    let hasPackageJson = false
    try {
      await fs.access(packageJsonPath)
      hasPackageJson = true
    } catch {
      errors.push('Missing package.json')
      logger.debug('Missing package.json', { packageJsonPath })
    }

    const featuresDir = await this.detectFeaturesDir(workspacePath)
    const featuresPath = path.join(workspacePath, featuresDir)
    let hasFeaturesDir = false
    try {
      const stat = await fs.stat(featuresPath)
      hasFeaturesDir = stat.isDirectory()
    } catch {
      if (featuresDir === 'features') {
        errors.push('Missing features/ directory')
        logger.debug('Missing features/ directory', { featuresPath })
      } else {
        errors.push(`Missing ${featuresDir} directory`)
        logger.debug('Missing configured features directory', { featuresPath, featuresDir })
      }
    }

    const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
    let hasCucumberJson = false
    try {
      await fs.access(cucumberJsonPath)
      hasCucumberJson = true
    } catch {
      // cucumber.json is optional when a playwright config with defineBddConfig exists
      // (ensureCucumberJson will auto-create it during set/get)
      const existingConfig = findExistingPlaywrightConfig(workspacePath)
      if (existingConfig) {
        try {
          const content = await fs.readFile(existingConfig, 'utf-8')
          if (content.includes('defineBddConfig')) {
            hasCucumberJson = true // will be auto-created
            logger.debug(
              'cucumber.json missing but playwright config has defineBddConfig, will auto-create'
            )
          }
        } catch {
          // Can't read config — treat as missing
        }
      }
      if (!hasCucumberJson) {
        errors.push('Missing cucumber.json')
        logger.debug('Missing cucumber.json', { cucumberJsonPath })
      }
    }

    const result = {
      isValid: hasPackageJson && hasFeaturesDir && hasCucumberJson,
      errors,
    }
    logger.info('Workspace validation completed', {
      isValid: result.isValid,
      errors: result.errors.length,
    })
    return result
  }

  async set(workspacePath: string, gitRoot?: string): Promise<WorkspaceValidation> {
    logger.info('Setting workspace', { workspacePath, gitRoot })
    const validation = await this.validate(workspacePath)

    if (validation.isValid) {
      this.currentWorkspace = {
        path: workspacePath,
        name: path.basename(workspacePath),
        isValid: true,
        hasPackageJson: true,
        hasFeaturesDir: true,
        hasCucumberJson: true,
        ...(gitRoot && gitRoot !== workspacePath ? { gitRoot } : {}),
      }

      await this.ensureWorkspaceSetup(workspacePath)

      const settingsService = getSettingsService()
      await settingsService.save({ workspacePath, gitRoot: gitRoot ?? null })
      await settingsService.addRecentWorkspace(workspacePath)
      logger.info('Workspace set successfully', { workspacePath, name: this.currentWorkspace.name })
    } else {
      logger.warn('Workspace validation failed', { workspacePath, errors: validation.errors })
    }

    return validation
  }

  async get(): Promise<WorkspaceInfo | null> {
    if (this.currentWorkspace) {
      logger.debug('Returning cached workspace', { path: this.currentWorkspace.path })
      return this.currentWorkspace
    }

    logger.debug('Loading workspace from settings')
    const settingsService = getSettingsService()
    const settings = await settingsService.get()

    if (settings.workspacePath) {
      const validation = await this.validate(settings.workspacePath)
      if (validation.isValid) {
        this.currentWorkspace = {
          path: settings.workspacePath,
          name: path.basename(settings.workspacePath),
          isValid: true,
          hasPackageJson: true,
          hasFeaturesDir: true,
          hasCucumberJson: true,
          ...(settings.gitRoot && settings.gitRoot !== settings.workspacePath ? { gitRoot: settings.gitRoot } : {}),
        }
        await this.ensureWorkspaceSetup(settings.workspacePath)

        logger.info('Workspace loaded from settings', { path: this.currentWorkspace.path })
        return this.currentWorkspace
      } else {
        logger.warn('Workspace from settings is invalid', {
          path: settings.workspacePath,
          errors: validation.errors,
        })
      }
    }

    logger.debug('No valid workspace found')
    return null
  }

  getPath(): string | null {
    return this.currentWorkspace?.path ?? null
  }

  async getFeaturesDir(workspacePath?: string): Promise<string> {
    const resolvedPath = workspacePath ?? this.getPath()
    if (!resolvedPath) return 'features'
    return await this.detectFeaturesDir(resolvedPath)
  }

  clear(): void {
    this.currentWorkspace = null
  }

  /**
   * Bring a validated workspace to a runnable state: ensure config files,
   * package scripts, default steps and a git repo exist, install workspace
   * dependencies if needed, then populate the step cache. Shared by `set()`
   * and `get()` so the bootstrap sequence stays in one place.
   */
  private async ensureWorkspaceSetup(workspacePath: string): Promise<void> {
    await this.ensureGitRepo(workspacePath)
    await this.ensureCucumberJson(workspacePath)
    await this.ensurePlaywrightConfig(workspacePath)
    await this.ensurePackageJsonScripts(workspacePath)
    await this.ensureDefaultSteps(workspacePath)

    // Install workspace dependencies using embedded Node.js
    const depService = getDependencyService()
    const depStatus = await depService.checkStatus(workspacePath)
    if (depStatus.needsInstall) {
      logger.info('Installing workspace dependencies', { reason: depStatus.reason })
      const installResult = await depService.install(workspacePath)
      if (!installResult.success) {
        logger.error('Failed to install dependencies', undefined, {
          error: installResult.error,
        })
      } else {
        logger.info('Dependencies installed', { duration: installResult.duration })
      }
    }

    // Export steps so the cache is populated (safe no-op if deps are missing)
    await this.exportSteps()
  }

  private async ensureGitRepo(workspacePath: string): Promise<void> {
    try {
      // Ensure workspace exists before git operations.
      await fs.mkdir(workspacePath, { recursive: true })

      const gitPath = path.join(workspacePath, '.git')
      const isTestEnv = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test'

      // Detect existing repo via .git marker (directory or gitdir file).
      try {
        await fs.access(gitPath)
        logger.debug('Git repo already exists', { workspacePath })
        return
      } catch {
        // No git marker found, initialize repository.
      }

      if (isTestEnv) {
        await fs.mkdir(gitPath, { recursive: true })
        await fs.writeFile(path.join(gitPath, 'HEAD'), 'ref: refs/heads/main\n', 'utf-8')
        logger.debug('Created test git marker', { workspacePath })
        return
      }

      logger.info('Initializing git repository', { workspacePath })
      await git.init({ fs: fsSync, dir: workspacePath, defaultBranch: 'main' })
      await fs.access(gitPath)

      // Create .gitignore
      const gitignorePath = path.join(workspacePath, '.gitignore')
      try {
        await fs.access(gitignorePath)
        logger.debug('.gitignore already exists', { gitignorePath })
      } catch {
        const gitignoreContent = [
          'node_modules/',
          'dist/',
          'build/',
          '.features-gen/',
          'test-results/',
          'playwright-report/',
          'blob-report/',
          '.app/',
          '',
        ].join('\n')
        await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8')
        logger.info('.gitignore created', { gitignorePath })
      }

      // Create initial commit with all files
      await git.add({ fs: fsSync, dir: workspacePath, filepath: '.' })
      await git.commit({
        fs: fsSync,
        dir: workspacePath,
        message: 'Initial commit (created by SuiSui)',
        author: { name: 'SuiSui', email: 'suisui@local' },
      })

      logger.info('Git repository initialized with initial commit', { workspacePath })
    } catch (error) {
      logger.warn('Failed to initialize git repository', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async init(workspacePath: string): Promise<WorkspaceInfo> {
    logger.info('Initializing workspace', { workspacePath })

    // Ensure target directory exists for initialization flow.
    await fs.mkdir(workspacePath, { recursive: true })

    // Create package.json if missing
    const packageJsonPath = path.join(workspacePath, 'package.json')
    try {
      await fs.access(packageJsonPath)
      logger.debug('package.json already exists', { packageJsonPath })
    } catch {
      logger.info('Creating package.json', { packageJsonPath })
      const packageJson = {
        name: path.basename(workspacePath),
        version: '1.0.0',
        description: 'BDD Test Project',
        scripts: this.getExpectedScripts(),
        devDependencies: {
          '@playwright/test': '^1.40.0',
          'playwright-bdd': '^8.0.0',
        },
      }
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
      logger.info('package.json created', { packageJsonPath })
    }

    // Create features directory if missing and no custom features dir is configured
    const featuresDir = await this.detectFeaturesDir(workspacePath)
    const featuresPath = path.join(workspacePath, featuresDir)
    if (featuresDir === 'features') {
      try {
        await fs.access(featuresPath)
        logger.debug('features/ directory already exists', { featuresPath })
      } catch {
        logger.info('Creating features/ directory', { featuresPath })
        await fs.mkdir(featuresPath, { recursive: true })
        logger.info('features/ directory created', { featuresPath })
      }
    }

    await this.ensureCucumberJson(workspacePath)
    await this.ensurePlaywrightConfig(workspacePath)
    await this.ensureDefaultSteps(workspacePath)
    await this.ensureGitRepo(workspacePath)

    // Now set the workspace
    await this.set(workspacePath)

    const result = {
      path: workspacePath,
      name: path.basename(workspacePath),
      isValid: true,
      hasPackageJson: true,
      hasFeaturesDir: true,
      hasCucumberJson: true,
    }
    logger.info('Workspace initialized successfully', { workspacePath, name: result.name })
    return result
  }
}

let workspaceServiceInstance: WorkspaceService | null = null

export function getWorkspaceService(): WorkspaceService {
  if (!workspaceServiceInstance) {
    workspaceServiceInstance = new WorkspaceService()
  }
  return workspaceServiceInstance
}

// For testing: reset the singleton instance
export function resetWorkspaceService(): void {
  workspaceServiceInstance = null
}
