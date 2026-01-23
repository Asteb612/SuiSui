export const IPC_CHANNELS = {
  // Workspace
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_SET: 'workspace:set',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_VALIDATE: 'workspace:validate',

  // Features
  FEATURES_LIST: 'features:list',
  FEATURES_READ: 'features:read',
  FEATURES_WRITE: 'features:write',
  FEATURES_DELETE: 'features:delete',

  // Steps
  STEPS_EXPORT: 'steps:export',
  STEPS_GET_CACHED: 'steps:getCached',
  STEPS_GET_DECORATORS: 'steps:getDecorators',

  // Validation
  VALIDATE_SCENARIO: 'validate:scenario',

  // Runner
  RUNNER_RUN_HEADLESS: 'runner:runHeadless',
  RUNNER_RUN_UI: 'runner:runUI',
  RUNNER_STOP: 'runner:stop',

  // Git
  GIT_STATUS: 'git:status',
  GIT_PULL: 'git:pull',
  GIT_COMMIT_PUSH: 'git:commitPush',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_EXTERNAL: 'app:openExternal',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
