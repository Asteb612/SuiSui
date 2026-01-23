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
  FakeCommandRunner,
  setCommandRunner,
} from '../services'

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

  // App handlers
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // Workspace handlers
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, async () => {
    return workspaceService.get()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SET, async (_event, path: string) => {
    return workspaceService.set(path)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SELECT, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Directory',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const workspacePath = result.filePaths[0]!
    const validation = await workspaceService.set(workspacePath)

    if (!validation.isValid) {
      return null
    }

    return workspaceService.get()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_VALIDATE, async (_event, path: string) => {
    return workspaceService.validate(path)
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

  console.log(`[IPC] Handlers registered (testMode: ${isTestMode})`)
}
