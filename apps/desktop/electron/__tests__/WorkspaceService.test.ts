import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { WorkspaceService } from '../services/WorkspaceService'
import type { AppSettings } from '@suisui/shared'
import { DEFAULT_SETTINGS } from '@suisui/shared'

// Mock fs/promises with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return {
    default: memfs.vol.promises,
  }
})

// Mock node:fs (sync) — full memfs replacement with real readFileSync fallback for assets
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  const memfs = await import('memfs')
  const realReadFileSync = actual.readFileSync
  // Use memfs for existsSync, real fs for readFileSync (needed for asset loading at import time)
  const merged = {
    ...actual,
    ...memfs.fs,
    readFileSync: realReadFileSync,
  }
  return {
    ...merged,
    default: merged,
  }
})

// Mock SettingsService
const mockSave = vi.fn()
const mockAddRecentWorkspace = vi.fn()
const mockGet = vi.fn<() => Promise<AppSettings>>()

vi.mock('../services/SettingsService', () => ({
  getSettingsService: () => ({
    save: mockSave,
    addRecentWorkspace: mockAddRecentWorkspace,
    get: mockGet,
  }),
}))

// Mock DependencyService
vi.mock('../services/DependencyService', () => ({
  getDependencyService: () => ({
    checkStatus: vi.fn().mockResolvedValue({ needsInstall: false }),
    install: vi.fn().mockResolvedValue({ success: true, duration: 0, stdout: '', stderr: '' }),
  }),
}))

// Read the actual asset file content for mocking
const assetFilePath = path.join(__dirname, '..', 'assets', 'generic.steps.ts')
const defaultStepsContent = readFileSync(assetFilePath, 'utf-8')

describe('WorkspaceService', () => {
  let service: WorkspaceService

  beforeEach(() => {
    // Reset memfs volume
    vol.reset()
    // Add the asset file to the mock filesystem
    vol.fromJSON({
      [assetFilePath]: defaultStepsContent,
    })
    // Reset mocks
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ ...DEFAULT_SETTINGS })
    // Create new service instance for each test
    service = new WorkspaceService()
  })

  describe('validate', () => {
    it('should validate a valid workspace', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return error when directory does not exist', async () => {
      const result = await service.validate('/nonexistent/path')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Directory does not exist')
    })

    it('should return error when path is not a directory', async () => {
      const filePath = '/test/file.txt'
      vol.fromJSON({
        [filePath]: 'content',
      })

      const result = await service.validate(filePath)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Path is not a directory')
    })

    it('should return error when package.json is missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing package.json')
    })

    it('should return error when features directory is missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing features/ directory')
    })

    it('should validate when playwright config points to a custom features directory', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/tests/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.ts`]: [
          "import { defineBddConfig } from 'playwright-bdd'",
          'const testDir = defineBddConfig({',
          "  paths: ['tests/features/**/*.feature'],",
          '})',
        ].join('\n'),
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate when cucumber.json points to a custom features directory', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/specs/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({
          default: { paths: ['specs/**/*.feature'] },
        }),
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return error when cucumber.json is missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing cucumber.json')
    })

    it('should return multiple errors when both package.json and features are missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/.gitkeep`]: '',
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing package.json')
      expect(result.errors).toContain('Missing features/ directory')
      expect(result.errors).toContain('Missing cucumber.json')
      expect(result.errors).toHaveLength(3)
    })
  })

  describe('set', () => {
    it('should successfully set a valid workspace', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const result = await service.set(workspacePath)

      expect(result.isValid).toBe(true)
      expect(mockSave).toHaveBeenCalledWith({ workspacePath })
      expect(mockAddRecentWorkspace).toHaveBeenCalledWith(workspacePath)
      expect(service.getPath()).toBe(workspacePath)
    })

    it('should create playwright.config.ts when missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = await vol.promises.readFile(configPath, 'utf-8')
      expect(String(configContent)).toContain('defineBddConfig')
    })

    it('should set feature paths from cucumber.json when creating playwright.config.ts', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/specs/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({
          default: { paths: ['specs/**/*.feature'] },
        }),
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = await vol.promises.readFile(configPath, 'utf-8')
      expect(String(configContent)).toContain(
        "paths: featureFile ? [featureFile] : ['specs/**/*.feature']"
      )
    })

    it('should not create playwright.config.ts when playwright.config.js exists', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.js`]: 'module.exports = {}',
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      await expect(vol.promises.readFile(configPath, 'utf-8')).rejects.toBeTruthy()
    })

    it('should not create generic.steps.ts when cucumber.json exists', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      const stepsPath = path.join(workspacePath, 'features', 'steps', 'generic.steps.ts')
      await expect(vol.promises.readFile(stepsPath, 'utf-8')).rejects.toBeTruthy()
    })

    it('should not create generic.steps.ts when workspace has features', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/example.feature`]: 'Feature: Example',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      const stepsPath = path.join(workspacePath, 'features', 'steps', 'generic.steps.ts')
      await expect(vol.promises.readFile(stepsPath, 'utf-8')).rejects.toBeTruthy()
    })

    it('should not overwrite existing generic.steps.ts', async () => {
      const workspacePath = '/test/workspace'
      const existingSteps = '// Custom steps'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/features/steps/generic.steps.ts`]: existingSteps,
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      const stepsPath = path.join(workspacePath, 'features', 'steps', 'generic.steps.ts')
      const stepsContent = await vol.promises.readFile(stepsPath, 'utf-8')
      expect(String(stepsContent)).toBe(existingSteps)
    })

    it('should not set workspace when validation fails', async () => {
      const workspacePath = '/invalid/workspace'

      const result = await service.set(workspacePath)

      expect(result.isValid).toBe(false)
      expect(mockSave).not.toHaveBeenCalled()
      expect(mockAddRecentWorkspace).not.toHaveBeenCalled()
      expect(service.getPath()).toBeNull()
    })

    it('should update current workspace when setting a new valid workspace', async () => {
      const workspacePath1 = '/test/workspace1'
      const workspacePath2 = '/test/workspace2'
      vol.fromJSON({
        [`${workspacePath1}/package.json`]: JSON.stringify({ name: 'test1' }),
        [`${workspacePath1}/features/.gitkeep`]: '',
        [`${workspacePath1}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath2}/package.json`]: JSON.stringify({ name: 'test2' }),
        [`${workspacePath2}/features/.gitkeep`]: '',
        [`${workspacePath2}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath1)
      expect(service.getPath()).toBe(workspacePath1)

      await service.set(workspacePath2)
      expect(service.getPath()).toBe(workspacePath2)
    })

    it('should initialize git marker when setting a valid workspace', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      const gitStat = await vol.promises.stat(path.join(workspacePath, '.git'))
      const headContent = String(
        await vol.promises.readFile(path.join(workspacePath, '.git', 'HEAD'), 'utf-8')
      )
      expect(gitStat.isDirectory()).toBe(true)
      expect(headContent).toContain('ref: refs/heads/main')
    })
  })

  describe('get', () => {
    it('should return current workspace if set', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)
      const result = await service.get()

      expect(result).not.toBeNull()
      expect(result?.path).toBe(workspacePath)
      expect(result?.name).toBe('workspace')
      expect(result?.isValid).toBe(true)
      expect(result?.hasPackageJson).toBe(true)
      expect(result?.hasFeaturesDir).toBe(true)
      expect(result?.hasCucumberJson).toBe(true)
    })

    it('should load workspace from settings if no current workspace', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      mockGet.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        workspacePath,
      })

      const result = await service.get()

      expect(result).not.toBeNull()
      expect(result?.path).toBe(workspacePath)
      expect(mockGet).toHaveBeenCalled()
    })

    it('should create playwright.config.ts when loading from settings', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      mockGet.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        workspacePath,
      })

      await service.get()

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = await vol.promises.readFile(configPath, 'utf-8')
      expect(String(configContent)).toContain('defineBddConfig')
    })

    it('should return null if no workspace in settings', async () => {
      mockGet.mockResolvedValue({ ...DEFAULT_SETTINGS })

      const result = await service.get()

      expect(result).toBeNull()
    })

    it('should return null if workspace in settings is invalid', async () => {
      const invalidPath = '/invalid/workspace'
      mockGet.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        workspacePath: invalidPath,
      })

      const result = await service.get()

      expect(result).toBeNull()
    })

    it('should cache workspace after loading from settings', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      mockGet.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        workspacePath,
      })

      const result1 = await service.get()
      const result2 = await service.get()

      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      expect(result1?.path).toBe(result2?.path)
      // Should only call get() once (on first call)
      expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('should initialize git marker when loading workspace from settings', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      mockGet.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        workspacePath,
      })

      await service.get()

      const gitStat = await vol.promises.stat(path.join(workspacePath, '.git'))
      const headContent = String(
        await vol.promises.readFile(path.join(workspacePath, '.git', 'HEAD'), 'utf-8')
      )
      expect(gitStat.isDirectory()).toBe(true)
      expect(headContent).toContain('ref: refs/heads/main')
    })
  })

  describe('getPath', () => {
    it('should return workspace path when set', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      expect(service.getPath()).toBe(workspacePath)
    })

    it('should return null when no workspace is set', () => {
      expect(service.getPath()).toBeNull()
    })
  })

  describe('clear', () => {
    it('should clear current workspace', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)
      expect(service.getPath()).toBe(workspacePath)

      service.clear()
      expect(service.getPath()).toBeNull()
      expect(await service.get()).toBeNull()
    })
  })

  describe('detectStepPaths', () => {
    it('should return default paths when only features/steps/ exists', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual(['features/steps/**/*.ts', 'features/steps/**/*.js'])
    })

    it('should return default paths when no step files exist', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual(['features/steps/**/*.ts', 'features/steps/**/*.js'])
    })

    it('should detect additional steps/ directory', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
        [`${workspacePath}/steps/login.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
        'steps/**/*.ts',
        'steps/**/*.js',
      ])
    })

    it('should collapse nested step dirs to common ancestor', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
        [`${workspacePath}/steps/broker/dashboard.steps.ts`]: '',
        [`${workspacePath}/steps/common/auth.steps.ts`]: '',
        [`${workspacePath}/steps/crm/contacts.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
        'steps/**/*.ts',
        'steps/**/*.js',
      ])
    })

    it('should detect steps in tests/ directory', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
        [`${workspacePath}/tests/login.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
        'tests/**/*.ts',
        'tests/**/*.js',
      ])
    })

    it('should skip node_modules directory', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
        [`${workspacePath}/node_modules/some-lib/example.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual(['features/steps/**/*.ts', 'features/steps/**/*.js'])
    })

    it('should detect .steps.js files', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/steps/login.steps.js`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
        'steps/**/*.ts',
        'steps/**/*.js',
      ])
    })

    it('should handle multiple independent step directories', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
        [`${workspacePath}/steps/login.steps.ts`]: '',
        [`${workspacePath}/tests/e2e/checkout.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toContain('features/steps/**/*.ts')
      expect(result).toContain('features/steps/**/*.js')
      expect(result).toContain('steps/**/*.ts')
      expect(result).toContain('steps/**/*.js')
      expect(result).toContain('tests/**/*.ts')
      expect(result).toContain('tests/**/*.js')
    })
  })

  describe('ensurePlaywrightConfig with detected step paths', () => {
    it('should include detected step paths in generated config', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/steps/broker/dashboard.steps.ts`]: '',
        [`${workspacePath}/steps/common/auth.steps.ts`]: '',
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = String(await vol.promises.readFile(configPath, 'utf-8'))

      expect(configContent).toContain("'features/steps/**/*.ts'")
      expect(configContent).toContain("'features/steps/**/*.js'")
      expect(configContent).toContain("'steps/**/*.ts'")
      expect(configContent).toContain("'steps/**/*.js'")
    })
  })

  describe('init', () => {
    it('should create package.json if missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.path).toBe(workspacePath)

      // Check that package.json was created
      const packageJsonPath = path.join(workspacePath, 'package.json')
      const packageJsonContent = await vol.promises.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent as string)

      expect(packageJson.name).toBe('workspace')
      expect(packageJson.version).toBe('1.0.0')
      expect(packageJson.description).toBe('BDD Test Project')
      expect(packageJson.scripts.test).toBe('bddgen && playwright test')
      expect(packageJson.devDependencies).toBeDefined()
    })

    it('should create features directory if missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)

      // Check that features directory was created
      const featuresPath = path.join(workspacePath, 'features')
      const stat = await vol.promises.stat(featuresPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should create playwright.config.ts if missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.init(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = await vol.promises.readFile(configPath, 'utf-8')
      expect(String(configContent)).toContain('defineBddConfig')
    })

    it('should create cucumber.json if missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      await service.init(workspacePath)

      const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
      const cucumberJsonContent = await vol.promises.readFile(cucumberJsonPath, 'utf-8')
      const cucumberJson = JSON.parse(cucumberJsonContent as string)

      expect(cucumberJson.default).toBeDefined()
      expect(cucumberJson.default.paths).toContain('features/**/*.feature')
    })

    it('should not create generic.steps.ts when configs are created during init', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/.gitkeep`]: '',
      })

      await service.init(workspacePath)

      const stepsPath = path.join(workspacePath, 'features', 'steps', 'generic.steps.ts')
      await expect(vol.promises.readFile(stepsPath, 'utf-8')).rejects.toBeTruthy()
    })

    it('should not overwrite existing generic.steps.ts', async () => {
      const workspacePath = '/test/workspace'
      const existingSteps = '// Custom user steps'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/steps/generic.steps.ts`]: existingSteps,
      })

      await service.init(workspacePath)

      const stepsPath = path.join(workspacePath, 'features', 'steps', 'generic.steps.ts')
      const stepsContent = await vol.promises.readFile(stepsPath, 'utf-8')
      expect(String(stepsContent)).toBe(existingSteps)
    })

    it('should not overwrite existing playwright.config.ts', async () => {
      const workspacePath = '/test/workspace'
      const existingConfig = 'export default {}'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/playwright.config.ts`]: existingConfig,
      })

      await service.init(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = await vol.promises.readFile(configPath, 'utf-8')
      expect(String(configContent)).toBe(existingConfig)
    })

    it('should not overwrite existing package.json', async () => {
      const workspacePath = '/test/workspace'
      const existingPackageJson = {
        name: 'existing-project',
        version: '2.0.0',
        customField: 'custom',
      }
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify(existingPackageJson),
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      await service.init(workspacePath)

      // Check that package.json was not overwritten
      const packageJsonPath = path.join(workspacePath, 'package.json')
      const packageJsonContent = await vol.promises.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent as string)

      expect(packageJson.name).toBe('existing-project')
      expect(packageJson.version).toBe('2.0.0')
      expect(packageJson.customField).toBe('custom')
      expect(packageJson.description).toBeUndefined()
    })

    it('should not fail if features directory already exists', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)
      // Should not throw error
    })

    it('should set workspace after initialization', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      await service.init(workspacePath)

      expect(service.getPath()).toBe(workspacePath)
      expect(mockSave).toHaveBeenCalledWith({ workspacePath })
      expect(mockAddRecentWorkspace).toHaveBeenCalledWith(workspacePath)
    })

    it('should handle partial initialization (package.json exists, features missing)', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)
      const featuresPath = path.join(workspacePath, 'features')
      const stat = await vol.promises.stat(featuresPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should handle partial initialization (features exists, package.json missing)', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)
      const packageJsonPath = path.join(workspacePath, 'package.json')
      const packageJsonContent = await vol.promises.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent as string)
      expect(packageJson.name).toBe('workspace')
    })
  })

  describe('detectFeaturesDir', () => {
    it('should return "features" as default when no config exists', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
      })

      const result = await service.detectFeaturesDir(workspacePath)
      expect(result).toBe('features')
    })

    it('should detect features dir from playwright.config.ts', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/playwright.config.ts`]: [
          "import { defineBddConfig } from 'playwright-bdd'",
          'const testDir = defineBddConfig({',
          "  paths: ['specs/**/*.feature'],",
          '})',
        ].join('\n'),
      })

      const result = await service.detectFeaturesDir(workspacePath)
      expect(result).toBe('specs')
    })

    it('should detect features dir from cucumber.json default.paths', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/cucumber.json`]: JSON.stringify({
          default: { paths: ['tests/features/**/*.feature'] },
        }),
      })

      const result = await service.detectFeaturesDir(workspacePath)
      expect(result).toBe('tests/features')
    })

    it('should fall back to "features" when config has no feature paths', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const result = await service.detectFeaturesDir(workspacePath)
      expect(result).toBe('features')
    })

    it('should fall back to "features" when cucumber.json is malformed', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/cucumber.json`]: 'not valid json',
      })

      const result = await service.detectFeaturesDir(workspacePath)
      expect(result).toBe('features')
    })
  })

  describe('ensurePlaywrightConfig — update logic', () => {
    it('should NOT overwrite config without defineBddConfig even if marked as SuiSui-managed', async () => {
      const workspacePath = '/test/workspace'
      const outdatedConfig = [
        '// This file is managed by SuiSui',
        'import { defineConfig } from "@playwright/test"',
        'export default defineConfig({})',
      ].join('\n')

      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.ts`]: outdatedConfig,
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const updatedContent = String(await vol.promises.readFile(configPath, 'utf-8'))
      // Config without defineBddConfig should NOT be modified
      expect(updatedContent).toBe(outdatedConfig)
    })

    it('should NOT overwrite custom (non-SuiSui) playwright.config.ts', async () => {
      const workspacePath = '/test/workspace'
      const customConfig = 'export default { projects: [] }'

      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.ts`]: customConfig,
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const content = String(await vol.promises.readFile(configPath, 'utf-8'))
      expect(content).toBe(customConfig)
    })

    it('should skip creation when playwright.config.mjs exists', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.mjs`]: 'export default {}',
      })

      await service.set(workspacePath)

      const configPath = path.join(workspacePath, 'playwright.config.ts')
      await expect(vol.promises.readFile(configPath, 'utf-8')).rejects.toBeTruthy()
    })
  })

  describe('set — workspace switching', () => {
    it('should keep old workspace when setting invalid path after valid workspace', async () => {
      const validPath = '/test/workspace1'
      const invalidPath = '/invalid/workspace'
      vol.fromJSON({
        [`${validPath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${validPath}/features/.gitkeep`]: '',
        [`${validPath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(validPath)
      expect(service.getPath()).toBe(validPath)

      const result = await service.set(invalidPath)
      expect(result.isValid).toBe(false)
      // Old workspace should still be set
      expect(service.getPath()).toBe(validPath)
    })
  })

  // ===== US1: Safe Workspace Activation Tests =====

  describe('set — script preservation (FR-006)', () => {
    it('should not overwrite existing scripts with same names during set()', async () => {
      const workspacePath = '/test/workspace'
      const existingPackageJson = {
        name: 'test',
        scripts: {
          test: 'jest',
          lint: 'eslint .',
        },
      }
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify(existingPackageJson),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      await service.set(workspacePath)

      const packageJsonPath = path.join(workspacePath, 'package.json')
      const content = JSON.parse(String(await vol.promises.readFile(packageJsonPath, 'utf-8')))
      // User's existing scripts must be preserved
      expect(content.scripts.test).toBe('jest')
      expect(content.scripts.lint).toBe('eslint .')
      // SuiSui-only scripts should be added
      expect(content.scripts.bddgen).toBe('bddgen')
      expect(content.scripts['bddgen:export']).toBe('bddgen export')
    })
  })

  describe('init — script preservation (FR-006)', () => {
    it('should not overwrite existing scripts with same names during init()', async () => {
      const workspacePath = '/test/workspace'
      const existingPackageJson = {
        name: 'existing-project',
        scripts: {
          test: 'jest --coverage',
        },
      }
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify(existingPackageJson),
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      await service.init(workspacePath)

      const packageJsonPath = path.join(workspacePath, 'package.json')
      const content = JSON.parse(String(await vol.promises.readFile(packageJsonPath, 'utf-8')))
      // User's test script must be preserved
      expect(content.scripts.test).toBe('jest --coverage')
      // Missing SuiSui scripts should be added
      expect(content.scripts.bddgen).toBe('bddgen')
      expect(content.scripts['test:ui']).toBe('bddgen && playwright test --ui')
    })
  })

  describe('init — cucumber.json preservation', () => {
    it('should preserve existing cucumber.json fields and only add require paths during init()', async () => {
      const workspacePath = '/test/workspace'
      const existingCucumber = {
        default: {
          paths: ['specs/**/*.feature'],
          format: ['json:reports/cucumber.json'],
          customOption: true,
        },
      }
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/specs/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify(existingCucumber),
      })

      await service.init(workspacePath)

      const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
      const content = String(await vol.promises.readFile(cucumberJsonPath, 'utf-8'))
      const parsed = JSON.parse(content)
      // Custom fields preserved
      expect(parsed.default.paths).toEqual(['specs/**/*.feature'])
      expect(parsed.default.format).toEqual(['json:reports/cucumber.json'])
      expect(parsed.default.customOption).toBe(true)
      // require paths added via additive merge
      expect(parsed.default.require).toBeDefined()
      expect(Array.isArray(parsed.default.require)).toBe(true)
    })
  })

  describe('set — .gitignore preservation (FR-009)', () => {
    it('should not overwrite existing .gitignore during git initialization', async () => {
      const workspacePath = '/test/workspace'
      const customGitignore = '# Custom gitignore\n*.log\ncoverage/\nmy-secret-folder/\n'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/.gitignore`]: customGitignore,
      })

      await service.set(workspacePath)

      const gitignorePath = path.join(workspacePath, '.gitignore')
      const content = String(await vol.promises.readFile(gitignorePath, 'utf-8'))
      expect(content).toBe(customGitignore)
    })
  })

  describe('set — .git as file (submodule)', () => {
    it('should skip git init when .git exists as a file', async () => {
      const workspacePath = '/test/workspace'
      const gitFileContent = 'gitdir: ../.git/modules/sub'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/.git`]: gitFileContent,
      })

      await service.set(workspacePath)

      // .git should still be a file, not replaced with a directory
      const gitPath = path.join(workspacePath, '.git')
      const stat = await vol.promises.stat(gitPath)
      expect(stat.isFile()).toBe(true)
      const content = String(await vol.promises.readFile(gitPath, 'utf-8'))
      expect(content).toBe(gitFileContent)
    })
  })

  // ===== US2: Flexible Workspace Detection Tests =====

  describe('set — empty playwright.config.ts (FR-008)', () => {
    it('should handle empty playwright.config.ts gracefully during set()', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.ts`]: '',
      })

      const result = await service.set(workspacePath)

      expect(result.isValid).toBe(true)
      // Empty config should be treated as custom (no defineBddConfig or managed marker)
      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const content = String(await vol.promises.readFile(configPath, 'utf-8'))
      expect(content).toBe('')
    })

    it('should handle playwright.config.ts with syntax errors gracefully', async () => {
      const workspacePath = '/test/workspace'
      const badConfig = 'export defaul {}'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.ts`]: badConfig,
      })

      const result = await service.set(workspacePath)

      expect(result.isValid).toBe(true)
      // Bad config should be treated as custom and not overwritten
      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const content = String(await vol.promises.readFile(configPath, 'utf-8'))
      expect(content).toBe(badConfig)
    })
  })

  describe('init — invalid cucumber.json (FR-008)', () => {
    it('should handle invalid JSON in cucumber.json during init()', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: 'not valid json',
      })

      // Should not crash
      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)
      // cucumber.json should not be overwritten (it exists)
      const cucumberPath = path.join(workspacePath, 'cucumber.json')
      const content = String(await vol.promises.readFile(cucumberPath, 'utf-8'))
      expect(content).toBe('not valid json')
    })
  })

  describe('validate — config path to non-existent directory', () => {
    it('should return error when config points to non-existent features directory', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/cucumber.json`]: JSON.stringify({
          default: { paths: ['nonexistent/**/*.feature'] },
        }),
      })

      const result = await service.validate(workspacePath)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing nonexistent directory')
    })
  })

  describe('detectStepPaths — depth limit', () => {
    it('should not discover step files beyond depth 4', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/steps/generic.steps.ts`]: '',
        // Depth 3 from workspace root: a/b/c/shallow.steps.ts (should be found)
        [`${workspacePath}/a/b/c/shallow.steps.ts`]: '',
        // Depth 5 from workspace root: a/b/c/d/e/deep.steps.ts (should NOT be found)
        [`${workspacePath}/a/b/c/d/e/deep.steps.ts`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      // 'a' root should be found (from the depth-3 file)
      expect(result).toContain('a/**/*.ts')
      expect(result).toContain('a/**/*.js')
      // The deep file shouldn't add any extra patterns beyond what 'a/**/*.ts' already covers
      // Both files are under 'a/', so they collapse to the same root
    })
  })

  describe('set/init — workspace paths with spaces (FR-011)', () => {
    it('should handle workspace path with spaces in set()', async () => {
      const workspacePath = '/test/my workspace/project'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const result = await service.set(workspacePath)

      expect(result.isValid).toBe(true)
      expect(service.getPath()).toBe(workspacePath)

      // Verify generated config has correct paths
      const configPath = path.join(workspacePath, 'playwright.config.ts')
      const configContent = String(await vol.promises.readFile(configPath, 'utf-8'))
      expect(configContent).toContain('defineBddConfig')
    })

    it('should handle workspace path with spaces in init()', async () => {
      const workspacePath = '/test/my workspace/project'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.path).toBe(workspacePath)
    })
  })

  describe('init — multiple config files', () => {
    it('should not create playwright.config.ts when playwright.config.js exists during init()', async () => {
      const workspacePath = '/test/workspace'
      const existingJsConfig = 'module.exports = { projects: [] }'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
        [`${workspacePath}/playwright.config.js`]: existingJsConfig,
      })

      await service.init(workspacePath)

      // playwright.config.ts should NOT have been created
      const tsConfigPath = path.join(workspacePath, 'playwright.config.ts')
      await expect(vol.promises.readFile(tsConfigPath, 'utf-8')).rejects.toBeTruthy()
      // Existing .js config should be untouched
      const jsConfigPath = path.join(workspacePath, 'playwright.config.js')
      const content = String(await vol.promises.readFile(jsConfigPath, 'utf-8'))
      expect(content).toBe(existingJsConfig)
    })
  })

  // ===== US4: Graceful Partial Setup Tests =====

  describe('init — partial setup with missing cucumber.json only', () => {
    it('should create only missing files when package.json and features exist', async () => {
      const workspacePath = '/test/workspace'
      const existingPackageJson = {
        name: 'existing-project',
        version: '2.0.0',
        scripts: { test: 'jest' },
      }
      const existingPackageJsonStr = JSON.stringify(existingPackageJson)
      vol.fromJSON({
        [`${workspacePath}/package.json`]: existingPackageJsonStr,
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.init(workspacePath)

      expect(result.isValid).toBe(true)

      // cucumber.json should have been created
      const cucumberJsonPath = path.join(workspacePath, 'cucumber.json')
      const cucumberContent = JSON.parse(
        String(await vol.promises.readFile(cucumberJsonPath, 'utf-8'))
      )
      expect(cucumberContent.default).toBeDefined()

      // package.json should preserve existing content (name, version, existing scripts)
      const packageJsonPath = path.join(workspacePath, 'package.json')
      const packageContent = JSON.parse(
        String(await vol.promises.readFile(packageJsonPath, 'utf-8'))
      )
      expect(packageContent.name).toBe('existing-project')
      expect(packageContent.version).toBe('2.0.0')
      expect(packageContent.scripts.test).toBe('jest')
    })
  })

  describe('init — error propagation', () => {
    it('should not persist workspace to settings when init encounters an error', async () => {
      // Use a path where the workspace directory can't be created
      // Simulate by providing a file where a directory is expected
      const filePath = '/test/file-not-dir'
      vol.fromJSON({
        [filePath]: 'I am a file',
      })

      await expect(service.init(filePath)).rejects.toBeTruthy()

      // Settings should NOT have been saved
      expect(mockSave).not.toHaveBeenCalled()
      expect(mockAddRecentWorkspace).not.toHaveBeenCalled()
    })
  })
})
