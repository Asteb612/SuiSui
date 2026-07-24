import type { IpcMain, Dialog, Shell } from 'electron'
import { app } from 'electron'
import { IPC_CHANNELS } from '@suisui/shared'
import type { Scenario, RunOptions, BatchRunOptions, AppSettings, GitCredentials, AIProviderConfig, AIGenerationRequest, AIStatusTarget, GenerateCatalogOptions } from '@suisui/shared'
import {
  getWorkspaceService,
  getFeatureService,
  getStepCatalogService,
  getValidationService,
  getRunnerService,
  getSettingsService,
  getNodeService,
  getDependencyService,
  getGitWorkspaceService,
  getGitCredentialsService,
  getAIService,
  getAICredentialsService,
  AIService,
  FakeAIProvider,
  type AICredentialsService,
  FakeCommandRunner,
  setCommandRunner,
} from '../services'
import type {
  GitWorkspaceParams,
  CommitPushOptions,
} from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('IPC')

interface HandlerOptions {
  isTestMode: boolean
}

function configureTestMode(): void {
  const fakeRunner = new FakeCommandRunner()

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
  const stepCatalogService = getStepCatalogService()
  const validationService = getValidationService()
  const runnerService = getRunnerService()
  const settingsService = getSettingsService()
  const nodeService = getNodeService()
  const dependencyService = getDependencyService()

  // App handlers
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    let protocol: string
    try {
      protocol = new URL(url).protocol
    } catch {
      throw new Error('Invalid URL')
    }
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'mailto:') {
      throw new Error(`Refusing to open URL with unsupported scheme: ${protocol}`)
    }
    await shell.openExternal(url)
  })

  // Workspace handlers
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, async () => {
    logger.debug('WORKSPACE_GET called')
    const result = await workspaceService.get()
    logger.debug('WORKSPACE_GET completed', { hasWorkspace: result !== null })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SET, async (_event, path: string, gitRoot?: string) => {
    logger.info('WORKSPACE_SET called', { path, gitRoot })
    const result = await workspaceService.set(path, gitRoot)
    logger.info('WORKSPACE_SET completed', { path, isValid: result.isValid })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_DETECT_BDD, async (_event, clonePath: string) => {
    logger.info('WORKSPACE_DETECT_BDD called', { clonePath })
    const result = await workspaceService.detectBddWorkspace(clonePath)
    logger.info('WORKSPACE_DETECT_BDD completed', { clonePath, candidateCount: result.candidates.length })
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

  // Step Catalog handlers (native structured catalog)
  // Validate renderer-supplied options: the workspace root always comes from
  // WorkspaceService, never the caller; globs must be workspace-relative.
  const validateGenerateOptions = (raw: unknown): GenerateCatalogOptions | undefined => {
    if (raw === undefined || raw === null) return undefined
    if (typeof raw !== 'object') throw new Error('generate: invalid options')
    const obj = raw as Record<string, unknown>
    const validateGlobs = (value: unknown, field: string): string[] | undefined => {
      if (value === undefined) return undefined
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        throw new Error(`generate: ${field} must be an array of strings`)
      }
      for (const g of value as string[]) {
        if (g.startsWith('/') || g.includes('..')) {
          throw new Error(`generate: ${field} must be workspace-relative (no absolute paths or "..")`)
        }
      }
      return value as string[]
    }
    const options: GenerateCatalogOptions = {}
    if (obj.force !== undefined) {
      if (typeof obj.force !== 'boolean') throw new Error('generate: force must be a boolean')
      options.force = obj.force
    }
    const include = validateGlobs(obj.include, 'include')
    if (include) options.include = include
    const exclude = validateGlobs(obj.exclude, 'exclude')
    if (exclude) options.exclude = exclude
    return options
  }

  ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_GENERATE, async (_event, options?: unknown) => {
    return stepCatalogService.generate(validateGenerateOptions(options))
  })

  ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_GET_CACHED, async () => {
    return stepCatalogService.getCached()
  })

  ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_CLEAR_CACHE, async () => {
    return stepCatalogService.clearCache()
  })

  ipcMain.handle(IPC_CHANNELS.STEP_CATALOG_GET_STEP, async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('getStep: invalid id')
    }
    return stepCatalogService.getStepById(id) ?? null
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

  ipcMain.handle(IPC_CHANNELS.RUNNER_RUN_BATCH, async (event, options: BatchRunOptions) => {
    const onOutput = (_stream: 'stdout' | 'stderr', data: string) => {
      const lines = data.split('\n')
      for (const line of lines) {
        if (line.length > 0) {
          event.sender.send(IPC_CHANNELS.RUNNER_LOG, line)
        }
      }
    }
    return runnerService.runBatch(options, onOutput)
  })

  ipcMain.handle(IPC_CHANNELS.RUNNER_GET_WORKSPACE_TESTS, async () => {
    return runnerService.getWorkspaceTests()
  })

  ipcMain.handle(IPC_CHANNELS.RUNNER_STOP, async () => {
    await runnerService.stop()
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
        branch: 'main',
        hasRemote: false,
        fullStatus: [],
        filteredStatus: [],
        counts: { modified: 0, added: 0, deleted: 0, untracked: 0 },
      }
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_COMMIT_PUSH, async () => {
      return { commitOid: 'mock-commit-oid', pushed: true }
    })

    // Git Credentials handlers (test mode mocks)
    ipcMain.handle(IPC_CHANNELS.GIT_CRED_SAVE, async () => {})
    ipcMain.handle(IPC_CHANNELS.GIT_CRED_GET, async () => null)
    ipcMain.handle(IPC_CHANNELS.GIT_CRED_DELETE, async () => {})
  } else {
    const gitWorkspaceService = getGitWorkspaceService()
    const githubAuthService = getGitCredentialsService()

    ipcMain.handle(IPC_CHANNELS.GIT_WS_CLONE_OR_OPEN, async (_event, params: GitWorkspaceParams) => {
      return gitWorkspaceService.cloneOrOpen(params)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_PULL, async (_event, localPath: string, credentials?: GitCredentials) => {
      return gitWorkspaceService.pull(localPath, credentials)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_STATUS, async (_event, localPath: string) => {
      return gitWorkspaceService.getStatus(localPath)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_WS_COMMIT_PUSH, async (_event, localPath: string, credentials: GitCredentials | undefined, options: CommitPushOptions) => {
      return gitWorkspaceService.commitAndPush(localPath, credentials, options)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_CRED_SAVE, async (_event, workspacePath: string, credentials: GitCredentials) => {
      await githubAuthService.saveCredentials(workspacePath, credentials)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_CRED_GET, async (_event, workspacePath: string) => {
      return githubAuthService.getCredentials(workspacePath)
    })

    ipcMain.handle(IPC_CHANNELS.GIT_CRED_DELETE, async (_event, workspacePath: string) => {
      await githubAuthService.deleteCredentials(workspacePath)
    })
  }

  // AI handlers
  let aiService: AIService
  let aiCredentials: AICredentialsService
  if (isTestMode) {
    // Test mode: drive AIService with a FakeAIProvider and no-op credentials so
    // no real model, CLI, network, or safeStorage is touched (Constitution Principle III).
    const fakeCredentials = {
      setKey: async () => {},
      getKey: async () => null,
      hasKey: async () => false,
      clearKey: async () => {},
    } as unknown as AICredentialsService
    aiCredentials = fakeCredentials
    // Context-aware canned output so E2E can exercise each use case deterministically
    // (Gherkin for scenario, a real existing-step pattern for step-match, a JSON arg map
    // for arg-fill, prose for failure-explain). Still a fake — no real model/CLI/network.
    aiService = new AIService({
      provider: new FakeAIProvider({
        responder: (req) => {
          switch (req.kind) {
            case 'scenario':
              return [
                'Feature: AI generated\n',
                '\n',
                '  Scenario: generated flow\n',
                '    Given I am on the "home" page\n',
                '    Then I should see "Welcome"\n',
              ]
            case 'step-match': {
              const first = req.context.steps[0]
              return [first ? `${first.keyword} ${first.pattern}` : 'NONE']
            }
            case 'arg-fill': {
              const args = req.context.targetStep?.args ?? []
              return [JSON.stringify(Object.fromEntries(args.map((a) => [a.name, 'AI value'])))]
            }
            case 'failure-explain':
              return ['The target element was not found. ', 'Verify the selector and re-run the test.']
            default:
              return ['Fake']
          }
        },
      }),
      credentialsService: fakeCredentials,
    })
  } else {
    aiService = getAIService()
    aiCredentials = getAICredentialsService()
  }

  ipcMain.handle(IPC_CHANNELS.AI_CONFIG_GET, async () => {
    return aiService.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.AI_CONFIG_SET, async (_event, config: AIProviderConfig) => {
    await aiService.setConfig(config)
  })

  ipcMain.handle(IPC_CHANNELS.AI_KEY_SET, async (_event, apiKey: string) => {
    await aiCredentials.setKey(apiKey)
  })

  ipcMain.handle(IPC_CHANNELS.AI_KEY_CLEAR, async () => {
    await aiCredentials.clearKey()
  })

  ipcMain.handle(IPC_CHANNELS.AI_STATUS, async (_event, target?: AIStatusTarget) => {
    return aiService.status(target)
  })

  // Streaming generation: AI_START returns immediately and streams chunks over
  // AI_CHUNK / AI_DONE / AI_ERROR (webContents.send). Cancellation via AI_CANCEL.
  const aiControllers = new Map<string, AbortController>()

  ipcMain.handle(IPC_CHANNELS.AI_START, async (event, req: AIGenerationRequest) => {
    const controller = new AbortController()
    aiControllers.set(req.requestId, controller)

    // Coalesce deltas on a short timer to avoid flooding the renderer.
    let buffer = ''
    let flushTimer: NodeJS.Timeout | null = null
    const flush = () => {
      flushTimer = null
      if (buffer.length === 0) return
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AI_CHUNK, { requestId: req.requestId, delta: buffer })
      }
      buffer = ''
    }

    // Drive the stream without awaiting inside the handler.
    void (async () => {
      try {
        for await (const delta of aiService.stream({
          kind: req.kind,
          input: req.input,
          context: req.context,
          signal: controller.signal,
        })) {
          buffer += delta
          if (!flushTimer) flushTimer = setTimeout(flush, 32)
        }
        if (flushTimer) clearTimeout(flushTimer)
        flush()
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.AI_DONE, { requestId: req.requestId, finishReason: 'stop' })
        }
      } catch (err) {
        if (flushTimer) clearTimeout(flushTimer)
        const aborted = err instanceof Error && err.name === 'AbortError'
        if (!event.sender.isDestroyed()) {
          if (aborted) {
            event.sender.send(IPC_CHANNELS.AI_DONE, { requestId: req.requestId, finishReason: 'aborted' })
          } else {
            const message = err instanceof Error ? err.message : String(err)
            logger.warn('AI_START stream error', { requestId: req.requestId, message })
            event.sender.send(IPC_CHANNELS.AI_ERROR, { requestId: req.requestId, message })
          }
        }
      } finally {
        aiControllers.delete(req.requestId)
      }
    })()

    return { accepted: true as const }
  })

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL, async (_event, requestId: string) => {
    aiControllers.get(requestId)?.abort()
    aiControllers.delete(requestId)
  })

  logger.info('IPC handlers registered', { isTestMode })
}
