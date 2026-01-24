"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const shared_1 = require("@suisui/shared");
const services_1 = require("../services");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('IPC');
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
        logger.debug('WORKSPACE_GET called');
        const result = await workspaceService.get();
        logger.debug('WORKSPACE_GET completed', { hasWorkspace: result !== null });
        return result;
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_SET, async (_event, path) => {
        logger.info('WORKSPACE_SET called', { path });
        const result = await workspaceService.set(path);
        logger.info('WORKSPACE_SET completed', { path, isValid: result.isValid });
        return result;
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_SELECT, async () => {
        logger.info('WORKSPACE_SELECT called');
        let workspacePath = null;
        // Mock dialog in test mode using environment variable
        if (isTestMode && process.env.TEST_WORKSPACE_PATH) {
            workspacePath = process.env.TEST_WORKSPACE_PATH;
            logger.debug('Test mode: using path from env', { workspacePath });
        }
        else {
            logger.debug('Showing workspace selection dialog');
            // Normal dialog flow (requires GUI, won't work in headless mode)
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Workspace Directory',
            });
            if (result.canceled || result.filePaths.length === 0) {
                logger.debug('Workspace selection canceled');
                return { workspace: null, validation: null, selectedPath: null };
            }
            workspacePath = result.filePaths[0];
            logger.info('Workspace path selected', { workspacePath });
        }
        // Continue with validation and workspace setup
        const validation = await workspaceService.set(workspacePath);
        if (!validation.isValid) {
            logger.warn('Workspace validation failed', { workspacePath, errors: validation.errors });
            return { workspace: null, validation, selectedPath: workspacePath };
        }
        const workspace = await workspaceService.get();
        logger.info('Workspace selected successfully', { workspacePath, workspaceName: workspace?.name });
        return { workspace, validation, selectedPath: workspacePath };
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_VALIDATE, async (_event, path) => {
        logger.debug('WORKSPACE_VALIDATE called', { path });
        const result = await workspaceService.validate(path);
        logger.debug('WORKSPACE_VALIDATE completed', { path, isValid: result.isValid });
        return result;
    });
    ipcMain.handle(shared_1.IPC_CHANNELS.WORKSPACE_INIT, async (_event, path) => {
        logger.info('WORKSPACE_INIT called', { path });
        const result = await workspaceService.init(path);
        logger.info('WORKSPACE_INIT completed', { path, workspaceName: result.name });
        return result;
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
    logger.info('IPC handlers registered', { isTestMode });
}
//# sourceMappingURL=handlers.js.map