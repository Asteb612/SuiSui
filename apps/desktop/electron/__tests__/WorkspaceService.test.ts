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
          "const testDir = defineBddConfig({",
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
      expect(String(configContent)).toContain("paths: featureFile ? [featureFile] : ['specs/**/*.feature']")
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

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
      ])
    })

    it('should return default paths when no step files exist', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const result = await service.detectStepPaths(workspacePath)

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
      ])
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

      expect(result).toEqual([
        'features/steps/**/*.ts',
        'features/steps/**/*.js',
      ])
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
      const existingConfig = "export default {}"
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
          "const testDir = defineBddConfig({",
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
    it('should update SuiSui-managed config when content is outdated', async () => {
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
      // Should have been replaced with the full template
      expect(updatedContent).toContain('defineBddConfig')
      expect(updatedContent).not.toBe(outdatedConfig)
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
})
