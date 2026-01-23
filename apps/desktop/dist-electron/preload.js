"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const shared_1 = require("@suisui/shared");
const api = {
    workspace: {
        get: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.WORKSPACE_GET),
        set: (path) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.WORKSPACE_SET, path),
        select: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.WORKSPACE_SELECT),
        validate: (path) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.WORKSPACE_VALIDATE, path),
    },
    features: {
        list: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.FEATURES_LIST),
        read: (relativePath) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.FEATURES_READ, relativePath),
        write: (relativePath, content) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.FEATURES_WRITE, relativePath, content),
        delete: (relativePath) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.FEATURES_DELETE, relativePath),
    },
    steps: {
        export: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.STEPS_EXPORT),
        getCached: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.STEPS_GET_CACHED),
        getDecorators: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.STEPS_GET_DECORATORS),
    },
    validate: {
        scenario: (scenario) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.VALIDATE_SCENARIO, scenario),
    },
    runner: {
        runHeadless: (options) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.RUNNER_RUN_HEADLESS, options),
        runUI: (options) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.RUNNER_RUN_UI, options),
        stop: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.RUNNER_STOP),
    },
    git: {
        status: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.GIT_STATUS),
        pull: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.GIT_PULL),
        commitPush: (message) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.GIT_COMMIT_PUSH, message),
    },
    settings: {
        get: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.SETTINGS_GET),
        set: (settings) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.SETTINGS_SET, settings),
        reset: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.SETTINGS_RESET),
    },
    app: {
        getVersion: () => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.APP_GET_VERSION),
        openExternal: (url) => electron_1.ipcRenderer.invoke(shared_1.IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
    },
};
electron_1.contextBridge.exposeInMainWorld('api', api);
//# sourceMappingURL=preload.js.map