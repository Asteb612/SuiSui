import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@suisui/shared'
import type { ElectronAPI } from '@suisui/shared'

const api: ElectronAPI = {
  workspace: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET),
    set: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SET, path),
    select: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SELECT),
    validate: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_VALIDATE, path),
    init: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_INIT, path),
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
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.RUNNER_STOP),
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
    pull: (localPath, token) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_PULL, localPath, token),
    status: (localPath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_STATUS, localPath),
    commitAndPush: (localPath, token, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WS_COMMIT_PUSH, localPath, token, options),
  },

  github: {
    saveToken: (token) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_SAVE_TOKEN, token),
    getToken: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_TOKEN),
    deleteToken: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_DELETE_TOKEN),
    validateToken: (token) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_VALIDATE_TOKEN, token),
    deviceFlowStart: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_DEVICE_FLOW_START),
    deviceFlowPoll: (deviceCode) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_DEVICE_FLOW_POLL, deviceCode),
    getUser: (token) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_USER, token),
    listRepos: (token) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_LIST_REPOS, token),
  },
}

contextBridge.exposeInMainWorld('api', api)
