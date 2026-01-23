"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
exports.getSettingsService = getSettingsService;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const shared_1 = require("@suisui/shared");
class SettingsService {
    settingsPath;
    settings = null;
    constructor(customPath) {
        this.settingsPath = customPath ?? node_path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
    }
    async load() {
        if (this.settings) {
            return this.settings;
        }
        try {
            const data = await promises_1.default.readFile(this.settingsPath, 'utf-8');
            this.settings = { ...shared_1.DEFAULT_SETTINGS, ...JSON.parse(data) };
        }
        catch {
            this.settings = { ...shared_1.DEFAULT_SETTINGS };
        }
        return this.settings;
    }
    async save(updates) {
        const current = await this.load();
        this.settings = { ...current, ...updates };
        const dir = node_path_1.default.dirname(this.settingsPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    }
    async reset() {
        this.settings = { ...shared_1.DEFAULT_SETTINGS };
        await promises_1.default.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    }
    async get() {
        return this.load();
    }
    async addRecentWorkspace(workspacePath) {
        const settings = await this.load();
        const recent = settings.recentWorkspaces.filter((p) => p !== workspacePath);
        recent.unshift(workspacePath);
        await this.save({ recentWorkspaces: recent.slice(0, 10) });
    }
}
exports.SettingsService = SettingsService;
let settingsServiceInstance = null;
function getSettingsService(customPath) {
    if (!settingsServiceInstance) {
        settingsServiceInstance = new SettingsService(customPath);
    }
    return settingsServiceInstance;
}
//# sourceMappingURL=SettingsService.js.map