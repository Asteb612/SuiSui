export const IPC_CHANNELS = {
  // Workspace
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_SET: 'workspace:set',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_VALIDATE: 'workspace:validate',
  WORKSPACE_INIT: 'workspace:init',
  WORKSPACE_DETECT_BDD: 'workspace:detectBdd',
  WORKSPACE_GET_BASE_URL: 'workspace:getBaseUrl',

  // Features
  FEATURES_LIST: 'features:list',
  FEATURES_READ: 'features:read',
  FEATURES_WRITE: 'features:write',
  FEATURES_DELETE: 'features:delete',
  FEATURES_GET_TREE: 'features:getTree',
  FEATURES_CREATE_FOLDER: 'features:createFolder',
  FEATURES_RENAME_FOLDER: 'features:renameFolder',
  FEATURES_DELETE_FOLDER: 'features:deleteFolder',
  FEATURES_RENAME: 'features:rename',
  FEATURES_MOVE: 'features:move',
  FEATURES_COPY: 'features:copy',

  // Step Catalog (native structured catalog)
  STEP_CATALOG_GENERATE: 'catalog:generate',
  STEP_CATALOG_GET_CACHED: 'catalog:getCached',
  STEP_CATALOG_CLEAR_CACHE: 'catalog:clearCache',
  STEP_CATALOG_GET_STEP: 'catalog:getStep',

  // Validation
  VALIDATE_SCENARIO: 'validate:scenario',

  // Runner
  RUNNER_RUN_HEADLESS: 'runner:runHeadless',
  RUNNER_RUN_UI: 'runner:runUI',
  RUNNER_RUN_BATCH: 'runner:runBatch',
  RUNNER_GET_WORKSPACE_TESTS: 'runner:getWorkspaceTests',
  RUNNER_STOP: 'runner:stop',
  RUNNER_SHOW_REPORT: 'runner:showReport',
  RUNNER_LOG: 'runner:log',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // Variables / secrets (global, injected into the test-run env)
  VARIABLES_GET: 'variables:get',
  VARIABLES_SET: 'variables:set',

  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  APP_OPEN_IN_EDITOR: 'app:openInEditor',

  // Node Runtime
  NODE_ENSURE_RUNTIME: 'node:ensureRuntime',
  NODE_GET_INFO: 'node:getInfo',

  // Dependencies
  DEPS_CHECK_STATUS: 'deps:checkStatus',
  DEPS_CHECK_PACKAGE_JSON: 'deps:checkPackageJson',
  DEPS_ENSURE_REQUIRED: 'deps:ensureRequired',
  DEPS_INSTALL: 'deps:install',

  // Git Workspace (isomorphic-git)
  GIT_WS_CLONE_OR_OPEN: 'gitws:cloneOrOpen',
  GIT_WS_PULL: 'gitws:pull',
  GIT_WS_STATUS: 'gitws:status',
  GIT_WS_COMMIT_PUSH: 'gitws:commitPush',
  GIT_WS_LIST_BRANCHES: 'gitws:listBranches',
  GIT_WS_CHECKOUT_BRANCH: 'gitws:checkoutBranch',
  GIT_WS_CREATE_BRANCH: 'gitws:createBranch',

  // Git Credentials
  GIT_CRED_SAVE: 'git:credSave',
  GIT_CRED_GET: 'git:credGet',
  GIT_CRED_DELETE: 'git:credDelete',

  // AI: config, credentials, status (invoke)
  AI_CONFIG_GET: 'ai:configGet',
  AI_CONFIG_SET: 'ai:configSet',
  AI_KEY_SET: 'ai:keySet',
  AI_KEY_CLEAR: 'ai:keyClear',
  // (target?: AIStatusTarget) => AIProviderStatus — probe a given provider w/o persisting, or test the configured one
  AI_STATUS: 'ai:status',

  // AI: streaming generation (invoke to start/cancel)
  AI_START: 'ai:start',
  AI_CANCEL: 'ai:cancel',

  // AI: main -> renderer stream events (webContents.send)
  AI_CHUNK: 'ai:chunk',
  AI_DONE: 'ai:done',
  AI_ERROR: 'ai:error',

  // Recorder: request/response (invoke)
  RECORDER_START: 'recorder:start',
  RECORDER_STOP: 'recorder:stop',
  RECORDER_PAUSE: 'recorder:pause',
  RECORDER_RESUME: 'recorder:resume',
  RECORDER_PICK: 'recorder:pick',
  RECORDER_CANCEL_PICK: 'recorder:cancelPick',
  RECORDER_HIGHLIGHT: 'recorder:highlight',
  RECORDER_VALIDATE_LOCATOR: 'recorder:validateLocator',
  RECORDER_ADD_ASSERTION: 'recorder:addAssertion',

  // Recorder: main -> renderer stream events (webContents.send)
  RECORDER_ACTION: 'recorder:action',
  RECORDER_ACTION_UPDATED: 'recorder:actionUpdated',
  RECORDER_PICKED: 'recorder:picked',
  RECORDER_STATUS: 'recorder:status',
  RECORDER_ERROR: 'recorder:error',

  // Auto-update: request/response (invoke)
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_QUIT_AND_INSTALL: 'update:quitAndInstall',
  UPDATE_GET_STATE: 'update:getState',
  UPDATE_GET_PREFERENCES: 'update:getPreferences',
  UPDATE_SET_PREFERENCES: 'update:setPreferences',

  // Auto-update: main -> renderer push (webContents.send)
  UPDATE_STATE_CHANGED: 'update:stateChanged',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
