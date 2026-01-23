import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@suisui/shared'
import type { ElectronAPI } from '@suisui/shared'

const api: ElectronAPI = {
  workspace: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET),
    set: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SET, path),
    select: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SELECT),
    validate: (path) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_VALIDATE, path),
  },

  features: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_LIST),
    read: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_READ, relativePath),
    write: (relativePath, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.FEATURES_WRITE, relativePath, content),
    delete: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_DELETE, relativePath),
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

  git: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS),
    pull: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL),
    commitPush: (message) => ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_PUSH, message),
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
}

contextBridge.exposeInMainWorld('api', api)
