import type { IpcMain, Dialog, Shell } from 'electron'
import { app } from 'electron'
import { IPC_CHANNELS } from '@suisui/shared'
import type { Scenario, RunOptions, AppSettings } from '@suisui/shared'
import {
  getWorkspaceService,
  getFeatureService,
  getStepService,
  getValidationService,
  getRunnerService,
  getGitService,
  getSettingsService,
  getNodeService,
  getDependencyService,
  FakeCommandRunner,
  setCommandRunner,
} from '../services'
import { createLogger } from '../utils/logger'

const logger = createLogger('IPC')

interface HandlerOptions {
  isTestMode: boolean
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  dialog: Dialog,
  shell: Shell,
  options: HandlerOptions
) {
  const { isTestMode } = options

  if (isTestMode) {
    setCommandRunner(new FakeCommandRunner())
  }

  const workspaceService = getWorkspaceService()
  const featureService = getFeatureService()
  const stepService = getStepService()
  const validationService = getValidationService()
  const runnerService = getRunnerService()
  const gitService = getGitService()
  const settingsService = getSettingsService()
  const nodeService = getNodeService()
  const dependencyService = getDependencyService()

  // App handlers
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // Workspace handlers
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, async () => {
    logger.debug('WORKSPACE_GET called')
    const result = await workspaceService.get()
    logger.debug('WORKSPACE_GET completed', { hasWorkspace: result !== null })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SET, async (_event, path: string) => {
    logger.info('WORKSPACE_SET called', { path })
    const result = await workspaceService.set(path)
    logger.info('WORKSPACE_SET completed', { path, isValid: result.isValid })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SELECT, async () => {
    logger.info('WORKSPACE_SELECT called')
    let workspacePath: string | null = null

    // Mock dialog in test mode using environment variable
    if (isTestMode && process.env.TEST_WORKSPACE_PATH) {
      workspacePath = process.env.TEST_WORKSPACE_PATH
      logger.debug('Test mode: using path from env', { workspacePath })
    } else {
      logger.debug('Showing workspace selection dialog')
      // Normal dialog flow (requires GUI, won't work in headless mode)
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Workspace Directory',
      })

      if (result.canceled || result.filePaths.length === 0) {
        logger.debug('Workspace selection canceled')
        return { workspace: null, validation: null, selectedPath: null }
      }

      workspacePath = result.filePaths[0]!
      logger.info('Workspace path selected', { workspacePath })
    }

    // Continue with validation and workspace setup
    const validation = await workspaceService.set(workspacePath)

    if (!validation.isValid) {
      logger.warn('Workspace validation failed', { workspacePath, errors: validation.errors })
      return { workspace: null, validation, selectedPath: workspacePath }
    }

    const workspace = await workspaceService.get()
    logger.info('Workspace selected successfully', { workspacePath, workspaceName: workspace?.name })
    return { workspace, validation, selectedPath: workspacePath }
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_VALIDATE, async (_event, path: string) => {
    logger.debug('WORKSPACE_VALIDATE called', { path })
    const result = await workspaceService.validate(path)
    logger.debug('WORKSPACE_VALIDATE completed', { path, isValid: result.isValid })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_INIT, async (_event, path: string) => {
    logger.info('WORKSPACE_INIT called', { path })
    const result = await workspaceService.init(path)
    logger.info('WORKSPACE_INIT completed', { path, workspaceName: result.name })
    return result
  })

  // Features handlers
  ipcMain.handle(IPC_CHANNELS.FEATURES_LIST, async () => {
    return featureService.list()
  })

  ipcMain.handle(IPC_CHANNELS.FEATURES_READ, async (_event, relativePath: string) => {
    return featureService.read(relativePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.FEATURES_WRITE,
    async (_event, relativePath: string, content: string) => {
      await featureService.write(relativePath, content)
    }
  )

  ipcMain.handle(IPC_CHANNELS.FEATURES_DELETE, async (_event, relativePath: string) => {
    await featureService.delete(relativePath)
  })

  ipcMain.handle(IPC_CHANNELS.FEATURES_GET_TREE, async () => {
    return featureService.getTree()
  })

  ipcMain.handle(IPC_CHANNELS.FEATURES_CREATE_FOLDER, async (_event, relativePath: string) => {
    await featureService.createFolder(relativePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.FEATURES_RENAME_FOLDER,
    async (_event, oldPath: string, newPath: string) => {
      await featureService.renameFolder(oldPath, newPath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.FEATURES_DELETE_FOLDER, async (_event, relativePath: string) => {
    await featureService.deleteFolder(relativePath)
  })

  ipcMain.handle(IPC_CHANNELS.FEATURES_RENAME, async (_event, oldPath: string, newPath: string) => {
    await featureService.renameFeature(oldPath, newPath)
  })

  ipcMain.handle(IPC_CHANNELS.FEATURES_MOVE, async (_event, oldPath: string, newFolderPath: string) => {
    await featureService.moveFeature(oldPath, newFolderPath)
  })

  ipcMain.handle(IPC_CHANNELS.FEATURES_COPY, async (_event, sourcePath: string, targetPath: string) => {
    await featureService.copyFeature(sourcePath, targetPath)
  })

  // Steps handlers
  ipcMain.handle(IPC_CHANNELS.STEPS_EXPORT, async () => {
    return stepService.export()
  })

  ipcMain.handle(IPC_CHANNELS.STEPS_GET_CACHED, async () => {
    return stepService.getCached()
  })

  ipcMain.handle(IPC_CHANNELS.STEPS_GET_DECORATORS, async () => {
    return stepService.getDecorators()
  })

  // Validation handlers
  ipcMain.handle(IPC_CHANNELS.VALIDATE_SCENARIO, async (_event, scenario: Scenario) => {
    return validationService.validateScenario(scenario)
  })

  // Runner handlers
  ipcMain.handle(IPC_CHANNELS.RUNNER_RUN_HEADLESS, async (_event, options?: Partial<RunOptions>) => {
    return runnerService.runHeadless(options)
  })

  ipcMain.handle(IPC_CHANNELS.RUNNER_RUN_UI, async (_event, options?: Partial<RunOptions>) => {
    return runnerService.runUI(options)
  })

  ipcMain.handle(IPC_CHANNELS.RUNNER_STOP, async () => {
    await runnerService.stop()
  })

  // Git handlers
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async () => {
    return gitService.status()
  })

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async () => {
    return gitService.pull()
  })

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_PUSH, async (_event, message: string) => {
    return gitService.commitPush(message)
  })

  // Settings handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return settingsService.get()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, settings: Partial<AppSettings>) => {
    await settingsService.save(settings)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, async () => {
    await settingsService.reset()
  })

  // Node runtime handlers
  ipcMain.handle(IPC_CHANNELS.NODE_ENSURE_RUNTIME, async () => {
    return nodeService.ensureRuntime()
  })

  ipcMain.handle(IPC_CHANNELS.NODE_GET_INFO, async () => {
    return nodeService.getRuntimeInfo()
  })

  // Dependency handlers
  ipcMain.handle(IPC_CHANNELS.DEPS_CHECK_STATUS, async () => {
    return dependencyService.checkStatus()
  })

  ipcMain.handle(IPC_CHANNELS.DEPS_CHECK_PACKAGE_JSON, async () => {
    return dependencyService.checkPackageJson()
  })

  ipcMain.handle(IPC_CHANNELS.DEPS_ENSURE_REQUIRED, async () => {
    return dependencyService.ensureRequiredDependencies()
  })

  ipcMain.handle(IPC_CHANNELS.DEPS_INSTALL, async () => {
    return dependencyService.install()
  })

  logger.info('IPC handlers registered', { isTestMode })
}
