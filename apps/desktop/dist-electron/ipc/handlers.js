"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const shared_1 = require("@suisui/shared");
const services_1 = require("../services");
function registerIpcHandlers(ipcMain, dialog, shell, options) {
    const { isTestMode } = options;
    if (isTestMode) {
        (0, services_1.setCommandRunner)(new services_1.FakeCommandRunner());
    }
    const workspaceService = (0, services_1.getWorkspaceService)();
    const featureService = (0, services_1.getFeatureService)();
    const stepService = (0, services_1.getStepService)();
    const validationService = (0, services_1.getValidationService)();
    const runnerService = (0, services_1.getRunnerService)();
    const gitService = (0, services_1.getGitService)();
    const settingsService = (0, services_1.getSettingsService)();
    // App handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.APP_GET_VERSION, () => {
        return electron_1.app.getVersion();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url) => {
        await shell.openExternal(url);
    });
    // Workspace handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_GET, async () => {
        return workspaceService.get();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_SET, async (_event, path) => {
        return workspaceService.set(path);
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_SELECT, async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Workspace Directory',
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        const workspacePath = result.filePaths[0];
        const validation = await workspaceService.set(workspacePath);
        if (!validation.isValid) {
            return null;
        }
        return workspaceService.get();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_VALIDATE, async (_event, path) => {
        return workspaceService.validate(path);
    });
    // Features handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.FEATURES_LIST, async () => {
        return featureService.list();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.FEATURES_READ, async (_event, relativePath) => {
        return featureService.read(relativePath);
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.FEATURES_WRITE, async (_event, relativePath, content) => {
        await featureService.write(relativePath, content);
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.FEATURES_DELETE, async (_event, relativePath) => {
        await featureService.delete(relativePath);
    });
    // Steps handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.STEPS_EXPORT, async () => {
        return stepService.export();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.STEPS_GET_CACHED, async () => {
        return stepService.getCached();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.STEPS_GET_DECORATORS, async () => {
        return stepService.getDecorators();
    });
    // Validation handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.VALIDATE_SCENARIO, async (_event, scenario) => {
        return validationService.validateScenario(scenario);
    });
    // Runner handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.RUNNER_RUN_HEADLESS, async (_event, options) => {
        return runnerService.runHeadless(options);
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.RUNNER_RUN_UI, async (_event, options) => {
        return runnerService.runUI(options);
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.RUNNER_STOP, async () => {
        await runnerService.stop();
    });
    // Git handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.GIT_STATUS, async () => {
        return gitService.status();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.GIT_PULL, async () => {
        return gitService.pull();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.GIT_COMMIT_PUSH, async (_event, message) => {
        return gitService.commitPush(message);
    });
    // Settings handlers
    ipcMain.handle(shared_1.IPC_CHANNELS.SETTINGS_GET, async () => {
        return settingsService.get();
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.SETTINGS_SET, async (_event, settings) => {
        await settingsService.save(settings);
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.SETTINGS_RESET, async () => {
        await settingsService.reset();
    });
    console.log(`[IPC] Handlers registered (testMode: ${isTestMode})`);
}
//# sourceMappingURL=handlers.js.map