"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
exports.getWorkspaceService = getWorkspaceService;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const SettingsService_1 = require("./SettingsService");
class WorkspaceService {
    currentWorkspace = null;
    async validate(workspacePath) {
        const errors = [];
        try {
            const stat = await promises_1.default.stat(workspacePath);
            if (!stat.isDirectory()) {
                errors.push('Path is not a directory');
                return { isValid: false, errors };
            }
        }
        catch {
            errors.push('Directory does not exist');
            return { isValid: false, errors };
        }
        const packageJsonPath = node_path_1.default.join(workspacePath, 'package.json');
        let hasPackageJson = false;
        try {
            await promises_1.default.access(packageJsonPath);
            hasPackageJson = true;
        }
        catch {
            errors.push('Missing package.json');
        }
        const featuresPath = node_path_1.default.join(workspacePath, 'features');
        let hasFeaturesDir = false;
        try {
            const stat = await promises_1.default.stat(featuresPath);
            hasFeaturesDir = stat.isDirectory();
        }
        catch {
            errors.push('Missing features/ directory');
        }
        return {
            isValid: hasPackageJson && hasFeaturesDir,
            errors,
        };
    }
    async set(workspacePath) {
        const validation = await this.validate(workspacePath);
        if (validation.isValid) {
            this.currentWorkspace = {
                path: workspacePath,
                name: node_path_1.default.basename(workspacePath),
                isValid: true,
                hasPackageJson: true,
                hasFeaturesDir: true,
            };
            const settingsService = (0, SettingsService_1.getSettingsService)();
            await settingsService.save({ workspacePath });
            await settingsService.addRecentWorkspace(workspacePath);
        }
        return validation;
    }
    async get() {
        if (this.currentWorkspace) {
            return this.currentWorkspace;
        }
        const settingsService = (0, SettingsService_1.getSettingsService)();
        const settings = await settingsService.get();
        if (settings.workspacePath) {
            const validation = await this.validate(settings.workspacePath);
            if (validation.isValid) {
                this.currentWorkspace = {
                    path: settings.workspacePath,
                    name: node_path_1.default.basename(settings.workspacePath),
                    isValid: true,
                    hasPackageJson: true,
                    hasFeaturesDir: true,
                };
                return this.currentWorkspace;
            }
        }
        return null;
    }
    getPath() {
        return this.currentWorkspace?.path ?? null;
    }
    clear() {
        this.currentWorkspace = null;
    }
}
exports.WorkspaceService = WorkspaceService;
let workspaceServiceInstance = null;
function getWorkspaceService() {
    if (!workspaceServiceInstance) {
        workspaceServiceInstance = new WorkspaceService();
    }
    return workspaceServiceInstance;
}
//# sourceMappingURL=WorkspaceService.js.map