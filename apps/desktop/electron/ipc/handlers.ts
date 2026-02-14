import type { IpcMain, Dialog, Shell } from 'electron'
import { app } from 'electron'
import { IPC_CHANNELS, parseArgs } from '@suisui/shared'
import type { Scenario, RunOptions, AppSettings, StepExportResult, StepDefinition } from '@suisui/shared'
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
  getGitWorkspaceService,
  getGithubAuthService,
  FakeCommandRunner,
  setCommandRunner,
} from '../services'
import type {
  GitWorkspaceParams,
  CommitPushOptions,
} from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('IPC')

/**
 * Build mock step export data matching the 10 default generic.steps.ts definitions.
 * Used in test mode so StepService.export() doesn't need to spawn real processes.
 */
function buildMockStepData(): StepExportResult {
  const patterns: Array<{ keyword: 'Given' | 'When' | 'Then'; pattern: string }> = [
    { keyword: 'Given', pattern: 'I am on the {string} page' },
    { keyword: 'Given', pattern: 'I am logged in as {string}' },
    { keyword: 'When', pattern: 'I click on {string}' },
    { keyword: 'When', pattern: 'I fill {string} with {string}' },
    { keyword: 'When', pattern: 'I select {string} from {string}' },
    { keyword: 'When', pattern: 'I wait for {int} seconds' },
    { keyword: 'Then', pattern: 'I should see {string}' },
    { keyword: 'Then', pattern: 'I should not see {string}' },
    { keyword: 'Then', pattern: 'the URL should contain {string}' },
    { keyword: 'Then', pattern: 'the element {string} should be visible' },
  ]

  const steps: StepDefinition[] = patterns.map(({ keyword, pattern }) => {
    const hash = `${keyword}-${pattern}`
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    return {
      id: `step-${Math.abs(hash).toString(16)}`,
      keyword,
      pattern,
      location: 'features/steps/generic.steps.ts',
      args: parseArgs(pattern),
      isGeneric: true,
    }
  })

  return {
    steps,
    decorators: [],
    exportedAt: new Date().toISOString(),
  }
}

interface HandlerOptions {
  isTestMode: boolean
}

function configureTestMode(): void {
  const fakeRunner = new FakeCommandRunner()

  // Git commands — return clean status
  fakeRunner.setResponse('git rev-parse --abbrev-ref', {
    code: 0,
    stdout: 'main\n',
    stderr: '',
  })
  fakeRunner.setResponse('git status --porcelain', {
    code: 0,
    stdout: '',
    stderr: '',
  })
  fakeRunner.setResponse('git rev-list', {
    code: 0,
    stdout: '0\t0\n',
    stderr: '',
  })
  fakeRunner.setResponse('git remote get-url', {
    code: 2,
    stdout: '',
    stderr: 'fatal: No such remote \'origin\'\n',
  })

  // Default: all other commands succeed
  fakeRunner.setDefaultResponse({ code: 0, stdout: '', stderr: '' })

  setCommandRunner(fakeRunner)
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  dialog: Dialog,
  shell: Shell,
  options: HandlerOptions
) {
  const { isTestMode } = options

  if (isTestMode) {
    configureTestMode()
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
  if (isTestMode) {
    // In test mode, StepService.export() would fail because it spawns real processes.
    // Instead, return mock step data matching the 10 default generic.steps.ts definitions.
    const mockStepData = buildMockStepData()
    ipcMain.handle(IPC_CHANNELS.STEPS_EXPORT, async () => {
      return mockStepData
    })
    ipcMain.handle(IPC_CHANNELS.STEPS_GET_CACHED, async () => {
      return mockStepData
    })
  } else {
    ipcMain.handle(IPC_CHANNELS.STEPS_EXPORT, async () => {
      return stepService.export()
    })
    ipcMain.handle(IPC_CHANNELS.STEPS_GET_CACHED, async () => {
      return stepService.getCached()
    })
  }

  ipcMain.handle(IPC_CHANNELS.STEPS_GET_DECORATORS, async () => {
    return stepService.getDecorators()
  })

  // Validation handlers
  ipcMain.handle(IPC_CHANNELS.VALIDATE_SCENARIO, async (_event, scenario: Scenario) => {
    try {
      logger.debug('VALIDATE_SCENARIO called', { scenarioName: scenario.name, stepCount: scenario.steps.length })
      const result = await validationService.validateScenario(scenario)
      logger.debug('VALIDATE_SCENARIO completed', { 
        isValid: result.isValid, 
        issueCount: result.issues.length,
        errorCount: result.issues.filter(i => i.severity === 'error').length 
      })
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('VALIDATE_SCENARIO failed', error)
      throw error
    }
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

  // Git Workspace handlers (isomorphic-git)
  if (isTestMode) {
    ipcMain.handle(IPC_CHANNELS.GIT_WS_CLONE_OR_OPEN, async (_event, _params: GitWorkspaceParams) => {
      return {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        remoteUrl: 'https://github.com/test-owner/test-repo.git',
        lastPulledOid: 'abc123mock',
      }
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_PULL, async () => {
      return { updatedFiles: [], conflicts: [], headOid: 'abc123mock' }
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_STATUS, async () => {
      return {
        fullStatus: [],
        filteredStatus: [],
        counts: { modified: 0, added: 0, deleted: 0, untracked: 0 },
      }
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_COMMIT_PUSH, async () => {
      return { commitOid: 'mock-commit-oid', pushed: true }
    })

    // GitHub Auth handlers (test mode mocks)
    ipcMain.handle(IPC_CHANNELS.GITHUB_SAVE_TOKEN, async () => {})
    ipcMain.handle(IPC_CHANNELS.GITHUB_GET_TOKEN, async () => null)
    ipcMain.handle(IPC_CHANNELS.GITHUB_DELETE_TOKEN, async () => {})
    ipcMain.handle(IPC_CHANNELS.GITHUB_VALIDATE_TOKEN, async () => {
      return { login: 'test-user', name: 'Test User', avatarUrl: 'https://avatars.githubusercontent.com/u/0' }
    })
    ipcMain.handle(IPC_CHANNELS.GITHUB_DEVICE_FLOW_START, async () => {
      return {
        deviceCode: 'mock-device-code',
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        expiresIn: 900,
        interval: 5,
      }
    })
    ipcMain.handle(IPC_CHANNELS.GITHUB_DEVICE_FLOW_POLL, async () => {
      return { status: 'success' as const, accessToken: 'mock-access-token' }
    })
    ipcMain.handle(IPC_CHANNELS.GITHUB_GET_USER, async () => {
      return { login: 'test-user', name: 'Test User', avatarUrl: 'https://avatars.githubusercontent.com/u/0' }
    })
    ipcMain.handle(IPC_CHANNELS.GITHUB_LIST_REPOS, async () => {
      return [
        {
          owner: 'test-user',
          name: 'test-repo',
          fullName: 'test-user/test-repo',
          cloneUrl: 'https://github.com/test-user/test-repo.git',
          defaultBranch: 'main',
          private: false,
        },
        {
          owner: 'test-user',
          name: 'another-repo',
          fullName: 'test-user/another-repo',
          cloneUrl: 'https://github.com/test-user/another-repo.git',
          defaultBranch: 'main',
          private: true,
        },
      ]
    })
  } else {
    const gitWorkspaceService = getGitWorkspaceService()
    const githubAuthService = getGithubAuthService()

    ipcMain.handle(IPC_CHANNELS.GIT_WS_CLONE_OR_OPEN, async (_event, params: GitWorkspaceParams) => {
      return gitWorkspaceService.cloneOrOpen(params)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_PULL, async (_event, localPath: string, token: string) => {
      return gitWorkspaceService.pull(localPath, token)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_STATUS, async (_event, localPath: string) => {
      return gitWorkspaceService.getStatus(localPath)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_COMMIT_PUSH, async (_event, localPath: string, token: string, options: CommitPushOptions) => {
      return gitWorkspaceService.commitAndPush(localPath, token, options)
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_SAVE_TOKEN, async (_event, token: string) => {
      await githubAuthService.saveToken(token)
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_GET_TOKEN, async () => {
      return githubAuthService.getToken()
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_DELETE_TOKEN, async () => {
      await githubAuthService.deleteToken()
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_VALIDATE_TOKEN, async (_event, token: string) => {
      return githubAuthService.validateToken(token)
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_DEVICE_FLOW_START, async () => {
      return githubAuthService.deviceFlowStart()
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_DEVICE_FLOW_POLL, async (_event, deviceCode: string) => {
      return githubAuthService.deviceFlowPoll(deviceCode)
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_GET_USER, async (_event, token: string) => {
      return githubAuthService.getUser(token)
    })

    ipcMain.handle(IPC_CHANNELS.GITHUB_LIST_REPOS, async (_event, token: string) => {
      return githubAuthService.listRepos(token)
    })
  }

  logger.info('IPC handlers registered', { isTestMode })
}
