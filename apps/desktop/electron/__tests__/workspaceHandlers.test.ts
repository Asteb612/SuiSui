import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import type { IpcMain, Dialog, Shell } from 'electron'
import { IPC_CHANNELS } from '@suisui/shared'
import { registerIpcHandlers } from '../ipc/handlers'
import { resetWorkspaceService } from '../services/WorkspaceService'
import type { AppSettings } from '@suisui/shared'
import { DEFAULT_SETTINGS } from '@suisui/shared'

// Read the actual asset file content for mocking
const assetFilePath = path.join(__dirname, '..', 'assets', 'generic.steps.ts')
const defaultStepsContent = readFileSync(assetFilePath, 'utf-8')

// Mock fs/promises with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return {
    default: memfs.vol.promises,
  }
})

// Mock electron app
vi.mock('electron', async () => {
  const actual = await vi.importActual('electron')
  return {
    ...actual,
    app: {
      getVersion: vi.fn(() => '1.0.0'),
      getPath: vi.fn(() => '/tmp/test-user-data'),
    },
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

// Mock other services to avoid dependencies
vi.mock('../services/FeatureService', () => ({
  getFeatureService: () => ({}),
}))

vi.mock('../services/StepService', () => ({
  getStepService: () => ({}),
}))

vi.mock('../services/ValidationService', () => ({
  getValidationService: () => ({}),
}))

vi.mock('../services/RunnerService', () => ({
  getRunnerService: () => ({}),
}))

vi.mock('../services/GitService', () => ({
  getGitService: () => ({}),
}))

describe('Workspace IPC Handlers', () => {
  let mockIpcMain: IpcMain
  let mockDialog: Dialog
  let mockShell: Shell

  beforeEach(() => {
    // Reset memfs volume
    vol.reset()
    // Add the asset file to the mock filesystem
    vol.fromJSON({
      [assetFilePath]: defaultStepsContent,
    })
    // Reset workspace service singleton
    resetWorkspaceService()
    // Reset mocks
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ ...DEFAULT_SETTINGS })

    // Create mock IPC main
    const handlers = new Map<string, (...args: any[]) => Promise<any>>()
    mockIpcMain = {
      handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<any>) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn(),
    } as unknown as IpcMain

    // Create mock dialog
    mockDialog = {
      showOpenDialog: vi.fn(),
    } as unknown as Dialog

    // Create mock shell
    mockShell = {
      openExternal: vi.fn(),
    } as unknown as Shell

    // Register handlers
    registerIpcHandlers(mockIpcMain, mockDialog, mockShell, { isTestMode: false })

    // Helper to invoke handler
    const invokeHandler = async (channel: string, ...args: any[]) => {
      const handler = handlers.get(channel)
      if (!handler) {
        throw new Error(`No handler registered for channel: ${channel}`)
      }
      return handler({} as any, ...args)
    }

    // Attach helper to mockIpcMain for easier access
    ;(mockIpcMain as any).invoke = invokeHandler
  })

  describe('WORKSPACE_GET', () => {
    it('should return workspace when set', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      // First set the workspace
      const setHandler = (mockIpcMain as any).invoke
      await setHandler(IPC_CHANNELS.WORKSPACE_SET, workspacePath)

      // Then get it
      const result = await setHandler(IPC_CHANNELS.WORKSPACE_GET)

      expect(result).not.toBeNull()
      expect(result?.path).toBe(workspacePath)
    })

    it('should return null when no workspace is set', async () => {
      const getHandler = (mockIpcMain as any).invoke
      const result = await getHandler(IPC_CHANNELS.WORKSPACE_GET)

      expect(result).toBeNull()
    })
  })

  describe('WORKSPACE_SET', () => {
    it('should validate and set workspace', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const setHandler = (mockIpcMain as any).invoke
      const result = await setHandler(IPC_CHANNELS.WORKSPACE_SET, workspacePath)

      expect(result.isValid).toBe(true)
      expect(mockSave).toHaveBeenCalledWith({ workspacePath })
      expect(mockAddRecentWorkspace).toHaveBeenCalledWith(workspacePath)
    })

    it('should return validation errors for invalid workspace', async () => {
      const invalidPath = '/invalid/workspace'

      const setHandler = (mockIpcMain as any).invoke
      const result = await setHandler(IPC_CHANNELS.WORKSPACE_SET, invalidPath)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('WORKSPACE_SELECT', () => {
    it('should return null when dialog is canceled', async () => {
      ;(mockDialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: true,
        filePaths: [],
      })

      const selectHandler = (mockIpcMain as any).invoke
      const result = await selectHandler(IPC_CHANNELS.WORKSPACE_SELECT)

      expect(result.workspace).toBeNull()
      expect(result.validation).toBeNull()
      expect(result.selectedPath).toBeNull()
    })

    it('should return workspace when dialog returns valid path', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      ;(mockDialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: [workspacePath],
      })

      const selectHandler = (mockIpcMain as any).invoke
      const result = await selectHandler(IPC_CHANNELS.WORKSPACE_SELECT)

      expect(result.workspace).not.toBeNull()
      expect(result.workspace?.path).toBe(workspacePath)
      expect(result.validation?.isValid).toBe(true)
      expect(result.selectedPath).toBe(workspacePath)
      expect(mockSave).toHaveBeenCalledWith({ workspacePath })
    })

    it('should return validation errors when dialog returns invalid path', async () => {
      const invalidPath = '/invalid/workspace'

      ;(mockDialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: [invalidPath],
      })

      const selectHandler = (mockIpcMain as any).invoke
      const result = await selectHandler(IPC_CHANNELS.WORKSPACE_SELECT)

      expect(result.workspace).toBeNull()
      expect(result.validation).not.toBeNull()
      expect(result.validation?.isValid).toBe(false)
      expect(result.selectedPath).toBe(invalidPath)
      expect(mockSave).not.toHaveBeenCalled()
    })

    it('should return null when dialog returns empty filePaths', async () => {
      ;(mockDialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: [],
      })

      const selectHandler = (mockIpcMain as any).invoke
      const result = await selectHandler(IPC_CHANNELS.WORKSPACE_SELECT)

      expect(result.workspace).toBeNull()
      expect(result.validation).toBeNull()
      expect(result.selectedPath).toBeNull()
    })

    it('should use TEST_WORKSPACE_PATH in test mode', async () => {
      const testWorkspacePath = '/test/workspace'
      vol.fromJSON({
        [`${testWorkspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${testWorkspacePath}/features/.gitkeep`]: '',
      })

      // Save original env
      const originalEnv = process.env.TEST_WORKSPACE_PATH
      process.env.TEST_WORKSPACE_PATH = testWorkspacePath

      try {
        // Re-register handlers in test mode
        const handlers = new Map<string, (...args: any[]) => Promise<any>>()
        const testMockIpcMain = {
          handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<any>) => {
            handlers.set(channel, handler)
          }),
        } as unknown as IpcMain

        registerIpcHandlers(testMockIpcMain, mockDialog, mockShell, { isTestMode: true })

        const selectHandler = handlers.get(IPC_CHANNELS.WORKSPACE_SELECT)!
        const result = await selectHandler({} as any)

        expect(result.workspace).not.toBeNull()
        expect(result.workspace?.path).toBe(testWorkspacePath)
        expect(mockDialog.showOpenDialog).not.toHaveBeenCalled()
      } finally {
        // Restore original env
        if (originalEnv !== undefined) {
          process.env.TEST_WORKSPACE_PATH = originalEnv
        } else {
          delete process.env.TEST_WORKSPACE_PATH
        }
      }
    })
  })

  describe('WORKSPACE_VALIDATE', () => {
    it('should validate a valid workspace path', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
        [`${workspacePath}/features/.gitkeep`]: '',
        [`${workspacePath}/cucumber.json`]: JSON.stringify({ default: {} }),
      })

      const validateHandler = (mockIpcMain as any).invoke
      const result = await validateHandler(IPC_CHANNELS.WORKSPACE_VALIDATE, workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return validation errors for invalid path', async () => {
      const invalidPath = '/invalid/workspace'

      const validateHandler = (mockIpcMain as any).invoke
      const result = await validateHandler(IPC_CHANNELS.WORKSPACE_VALIDATE, invalidPath)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('WORKSPACE_INIT', () => {
    it('should initialize workspace and return workspace info', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const initHandler = (mockIpcMain as any).invoke
      const result = await initHandler(IPC_CHANNELS.WORKSPACE_INIT, workspacePath)

      expect(result.isValid).toBe(true)
      expect(result.path).toBe(workspacePath)
      expect(result.name).toBe('workspace')
      expect(result.hasPackageJson).toBe(true)
      expect(result.hasFeaturesDir).toBe(true)
      expect(result.hasCucumberJson).toBe(true)

      // Verify package.json was created
      const packageJsonPath = path.join(workspacePath, 'package.json')
      const packageJsonContent = await vol.promises.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent as string)
      expect(packageJson.name).toBe('workspace')
    })

    it('should create features directory if missing', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/package.json`]: JSON.stringify({ name: 'test' }),
      })

      const initHandler = (mockIpcMain as any).invoke
      const result = await initHandler(IPC_CHANNELS.WORKSPACE_INIT, workspacePath)

      expect(result.isValid).toBe(true)
      
      // Verify features directory was created
      const featuresPath = path.join(workspacePath, 'features')
      const stat = await vol.promises.stat(featuresPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should set workspace after initialization', async () => {
      const workspacePath = '/test/workspace'
      vol.fromJSON({
        [`${workspacePath}/features/.gitkeep`]: '',
      })

      const initHandler = (mockIpcMain as any).invoke
      await initHandler(IPC_CHANNELS.WORKSPACE_INIT, workspacePath)

      expect(mockSave).toHaveBeenCalledWith({ workspacePath })
      expect(mockAddRecentWorkspace).toHaveBeenCalledWith(workspacePath)
    })
  })
})
