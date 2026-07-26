import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@suisui/shared'
import type { ElectronAPI } from '@suisui/shared'

const api: ElectronAPI = {
  workspace: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET),
    set: (path, gitRoot) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SET, path, gitRoot),
    select: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SELECT),
    validate: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_VALIDATE, path),
    init: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_INIT, path),
    detectBdd: (clonePath) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DETECT_BDD, clonePath),
    getBaseUrl: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_BASE_URL),
  },

  features: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_LIST),
    read: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_READ, relativePath),
    write: (relativePath, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.FEATURES_WRITE, relativePath, content),
    delete: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_DELETE, relativePath),
    getTree: () => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_GET_TREE),
    createFolder: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_CREATE_FOLDER, relativePath),
    renameFolder: (oldPath, newPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.FEATURES_RENAME_FOLDER, oldPath, newPath),
    deleteFolder: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_DELETE_FOLDER, relativePath),
    rename: (oldPath, newPath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_RENAME, oldPath, newPath),
    move: (filePath, newFolderPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.FEATURES_MOVE, filePath, newFolderPath),
    copy: (sourcePath, targetPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.FEATURES_COPY, sourcePath, targetPath),
  },

  stepCatalog: {
    generate: (options) => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_GENERATE, options),
    getCached: () => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_GET_CACHED),
    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_CLEAR_CACHE),
    getStep: (id) => ipcRenderer.invoke(IPC_CHANNELS.STEP_CATALOG_GET_STEP, id),
  },

  validate: {
    scenario: (scenario) => ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_SCENARIO, scenario),
  },

  runner: {
    runHeadless: (options) => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_RUN_HEADLESS, options),
    runUI: (options) => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_RUN_UI, options),
    runBatch: (options) => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_RUN_BATCH, options),
    getWorkspaceTests: () => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_GET_WORKSPACE_TESTS),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_STOP),
    showReport: (scope: string) => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_SHOW_REPORT, scope),
    onRunnerLog: (callback: (line: string) => void) => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.RUNNER_LOG)
      ipcRenderer.on(IPC_CHANNELS.RUNNER_LOG, (_event: Electron.IpcRendererEvent, line: string) => callback(line))
    },
    offRunnerLog: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.RUNNER_LOG)
    },
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RESET),
  },

  variables: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_GET),
    set: (variables) => ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_SET, variables),
  },

  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
    openInEditor: (location) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_IN_EDITOR, location),
  },

  node: {
    ensureRuntime: () => ipcRenderer.invoke(IPC_CHANNELS.NODE_ENSURE_RUNTIME),
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.NODE_GET_INFO),
  },

  deps: {
    checkStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DEPS_CHECK_STATUS),
    checkPackageJson: () => ipcRenderer.invoke(IPC_CHANNELS.DEPS_CHECK_PACKAGE_JSON),
    ensureRequired: () => ipcRenderer.invoke(IPC_CHANNELS.DEPS_ENSURE_REQUIRED),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.DEPS_INSTALL),
  },

  gitWorkspace: {
    cloneOrOpen: (params) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_CLONE_OR_OPEN, params),
    pull: (localPath, credentials) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_PULL, localPath, credentials),
    status: (localPath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_STATUS, localPath),
    commitAndPush: (localPath, credentials, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_COMMIT_PUSH, localPath, credentials, options),
    listBranches: (localPath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_LIST_BRANCHES, localPath),
    checkoutBranch: (localPath, branch) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_CHECKOUT_BRANCH, localPath, branch),
    createBranch: (localPath, branch) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_CREATE_BRANCH, localPath, branch),
  },

  gitCredentials: {
    save: (workspacePath, credentials) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CRED_SAVE, workspacePath, credentials),
    get: (workspacePath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CRED_GET, workspacePath),
    delete: (workspacePath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CRED_DELETE, workspacePath),
  },

  ai: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_GET),
    setConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_SET, config),
    setKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.AI_KEY_SET, apiKey),
    clearKey: () => ipcRenderer.invoke(IPC_CHANNELS.AI_KEY_CLEAR),
    status: (target) => ipcRenderer.invoke(IPC_CHANNELS.AI_STATUS, target),
    start: (req) => ipcRenderer.invoke(IPC_CHANNELS.AI_START, req),
    cancel: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL, requestId),
    onChunk: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, chunk: Parameters<typeof callback>[0]) => callback(chunk)
      ipcRenderer.on(IPC_CHANNELS.AI_CHUNK, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CHUNK, listener)
    },
    onDone: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, done: Parameters<typeof callback>[0]) => callback(done)
      ipcRenderer.on(IPC_CHANNELS.AI_DONE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_DONE, listener)
    },
    onError: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, err: Parameters<typeof callback>[0]) => callback(err)
      ipcRenderer.on(IPC_CHANNELS.AI_ERROR, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_ERROR, listener)
    },
  },

  recorder: {
    start: (options) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_START, options),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_STOP),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_PAUSE),
    resume: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_RESUME),
    pick: (request) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_PICK, request),
    cancelPick: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_CANCEL_PICK),
    highlight: (locator) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_HIGHLIGHT, locator),
    validateLocator: (locator) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_VALIDATE_LOCATOR, locator),
    addAssertion: (request) => ipcRenderer.invoke(IPC_CHANNELS.RECORDER_ADD_ASSERTION, request),
    onAction: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: Parameters<typeof callback>[0]) => callback(action)
      ipcRenderer.on(IPC_CHANNELS.RECORDER_ACTION, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDER_ACTION, listener)
    },
    onActionUpdated: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: Parameters<typeof callback>[0]) => callback(action)
      ipcRenderer.on(IPC_CHANNELS.RECORDER_ACTION_UPDATED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDER_ACTION_UPDATED, listener)
    },
    onPicked: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, picked: Parameters<typeof callback>[0]) => callback(picked)
      ipcRenderer.on(IPC_CHANNELS.RECORDER_PICKED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDER_PICKED, listener)
    },
    onStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status)
      ipcRenderer.on(IPC_CHANNELS.RECORDER_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDER_STATUS, listener)
    },
    onError: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, err: Parameters<typeof callback>[0]) => callback(err)
      ipcRenderer.on(IPC_CHANNELS.RECORDER_ERROR, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDER_ERROR, listener)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
