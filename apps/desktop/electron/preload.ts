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

  steps: {
    export: () => ipcRenderer.invoke(IPC_CHANNELS.STEPS_EXPORT),
    getCached: () => ipcRenderer.invoke(IPC_CHANNELS.STEPS_GET_CACHED),
    getDecorators: () => ipcRenderer.invoke(IPC_CHANNELS.STEPS_GET_DECORATORS),
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

  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
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
  },

  gitCredentials: {
    save: (workspacePath, credentials) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CRED_SAVE, workspacePath, credentials),
    get: (workspacePath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CRED_GET, workspacePath),
    delete: (workspacePath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CRED_DELETE, workspacePath),
  },
}

contextBridge.exposeInMainWorld('api', api)
