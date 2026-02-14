export const IPC_CHANNELS = {
  // Workspace
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_SET: 'workspace:set',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_VALIDATE: 'workspace:validate',
  WORKSPACE_INIT: 'workspace:init',

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

  // GitHub Auth
  GITHUB_SAVE_TOKEN: 'github:saveToken',
  GITHUB_GET_TOKEN: 'github:getToken',
  GITHUB_DELETE_TOKEN: 'github:deleteToken',
  GITHUB_VALIDATE_TOKEN: 'github:validateToken',
  GITHUB_DEVICE_FLOW_START: 'github:deviceFlowStart',
  GITHUB_DEVICE_FLOW_POLL: 'github:deviceFlowPoll',
  GITHUB_GET_USER: 'github:getUser',
  GITHUB_LIST_REPOS: 'github:listRepos',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
