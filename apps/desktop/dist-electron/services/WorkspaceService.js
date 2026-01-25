"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
exports.getWorkspaceService = getWorkspaceService;
exports.resetWorkspaceService = resetWorkspaceService;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const SettingsService_1 = require("./SettingsService");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('WorkspaceService');
/**
 * Path to the default step definitions asset file.
 * In development: electron/assets/generic.steps.ts
 * In production: dist-electron/assets/generic.steps.ts (after build)
 */
function getDefaultStepsAssetPath() {
    // __dirname points to electron/services/ in dev, dist-electron/services/ after build
    // Go up from services/ to electron/, then into assets/
    return node_path_1.default.join(__dirname, '..', 'assets', 'generic.steps.ts');
}
class WorkspaceService {
    currentWorkspace = null;
    async ensurePlaywrightConfig(workspacePath) {
        const playwrightConfigPath = node_path_1.default.join(workspacePath, 'playwright.config.ts');
        try {
            await promises_1.default.access(playwrightConfigPath);
            logger.debug('playwright.config.ts already exists', { playwrightConfigPath });
        }
        catch {
            logger.info('Creating playwright.config.ts', { playwrightConfigPath });
            const playwrightConfig = [
                "import { defineConfig } from '@playwright/test'",
                "import { defineBddConfig } from 'playwright-bdd'",
                '',
                'const testDir = defineBddConfig({',
                "  paths: ['features/**/*.feature'],",
                "  steps: ['features/**/*.ts', 'features/**/*.js'],",
                '})',
                '',
                'const rawBaseUrl = process.env.BASE_URL',
                'const baseURL = rawBaseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(rawBaseUrl)',
                "  ? `https://${rawBaseUrl}`",
                '  : rawBaseUrl',
                '',
                'export default defineConfig({',
                '  testDir,',
                '  use: {',
                '    // Base URL is set via BASE_URL environment variable from SuiSui',
                '    baseURL,',
                '  },',
                '})',
                '',
            ].join('\n');
            await promises_1.default.writeFile(playwrightConfigPath, playwrightConfig, 'utf-8');
            logger.info('playwright.config.ts created', { playwrightConfigPath });
        }
    }
    async ensureDefaultSteps(workspacePath) {
        const stepsPath = node_path_1.default.join(workspacePath, 'features', 'steps');
        const defaultStepsPath = node_path_1.default.join(stepsPath, 'generic.steps.ts');
        try {
            await promises_1.default.access(defaultStepsPath);
            logger.debug('generic.steps.ts already exists', { defaultStepsPath });
        }
        catch {
            // Ensure steps directory exists
            try {
                await promises_1.default.access(stepsPath);
            }
            catch {
                logger.info('Creating features/steps/ directory', { stepsPath });
                await promises_1.default.mkdir(stepsPath, { recursive: true });
            }
            // Read the default steps from the asset file
            const assetPath = getDefaultStepsAssetPath();
            logger.info('Reading default steps from asset', { assetPath });
            const defaultStepsContent = await promises_1.default.readFile(assetPath, 'utf-8');
            logger.info('Creating generic.steps.ts', { defaultStepsPath });
            await promises_1.default.writeFile(defaultStepsPath, defaultStepsContent, 'utf-8');
            logger.info('generic.steps.ts created', { defaultStepsPath });
        }
    }
    async validate(workspacePath) {
        logger.debug('Validating workspace', { workspacePath });
        const errors = [];
        try {
            const stat = await promises_1.default.stat(workspacePath);
            if (!stat.isDirectory()) {
                errors.push('Path is not a directory');
                logger.warn('Path is not a directory', { workspacePath });
                return { isValid: false, errors };
            }
        }
        catch (error) {
            errors.push('Directory does not exist');
            logger.error('Directory does not exist', error instanceof Error ? error : new Error(String(error)), { workspacePath });
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
            logger.debug('Missing package.json', { packageJsonPath });
        }
        const featuresPath = node_path_1.default.join(workspacePath, 'features');
        let hasFeaturesDir = false;
        try {
            const stat = await promises_1.default.stat(featuresPath);
            hasFeaturesDir = stat.isDirectory();
        }
        catch {
            errors.push('Missing features/ directory');
            logger.debug('Missing features/ directory', { featuresPath });
        }
        const result = {
            isValid: hasPackageJson && hasFeaturesDir,
            errors,
        };
        logger.info('Workspace validation completed', { isValid: result.isValid, errors: result.errors.length });
        return result;
    }
    async set(workspacePath) {
        logger.info('Setting workspace', { workspacePath });
        const validation = await this.validate(workspacePath);
        if (validation.isValid) {
            this.currentWorkspace = {
                path: workspacePath,
                name: node_path_1.default.basename(workspacePath),
                isValid: true,
                hasPackageJson: true,
                hasFeaturesDir: true,
            };
            await this.ensurePlaywrightConfig(workspacePath);
            await this.ensureDefaultSteps(workspacePath);
            const settingsService = (0, SettingsService_1.getSettingsService)();
            await settingsService.save({ workspacePath });
            await settingsService.addRecentWorkspace(workspacePath);
            logger.info('Workspace set successfully', { workspacePath, name: this.currentWorkspace.name });
        }
        else {
            logger.warn('Workspace validation failed', { workspacePath, errors: validation.errors });
        }
        return validation;
    }
    async get() {
        if (this.currentWorkspace) {
            logger.debug('Returning cached workspace', { path: this.currentWorkspace.path });
            return this.currentWorkspace;
        }
        logger.debug('Loading workspace from settings');
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
                await this.ensurePlaywrightConfig(settings.workspacePath);
                await this.ensureDefaultSteps(settings.workspacePath);
                logger.info('Workspace loaded from settings', { path: this.currentWorkspace.path });
                return this.currentWorkspace;
            }
            else {
                logger.warn('Workspace from settings is invalid', { path: settings.workspacePath, errors: validation.errors });
            }
        }
        logger.debug('No valid workspace found');
        return null;
    }
    getPath() {
        return this.currentWorkspace?.path ?? null;
    }
    clear() {
        this.currentWorkspace = null;
    }
    async init(workspacePath) {
        logger.info('Initializing workspace', { workspacePath });
        // Create package.json if missing
        const packageJsonPath = node_path_1.default.join(workspacePath, 'package.json');
        try {
            await promises_1.default.access(packageJsonPath);
            logger.debug('package.json already exists', { packageJsonPath });
        }
        catch {
            logger.info('Creating package.json', { packageJsonPath });
            const packageJson = {
                name: node_path_1.default.basename(workspacePath),
                version: '1.0.0',
                description: 'BDD Test Project',
                scripts: {
                    test: 'npx bddgen && npx playwright test',
                },
                devDependencies: {
                    '@playwright/test': '^1.40.0',
                    'playwright-bdd': '^6.0.0',
                },
            };
            await promises_1.default.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
            logger.info('package.json created', { packageJsonPath });
        }
        // Create features directory if missing
        const featuresPath = node_path_1.default.join(workspacePath, 'features');
        try {
            await promises_1.default.access(featuresPath);
            logger.debug('features/ directory already exists', { featuresPath });
        }
        catch {
            logger.info('Creating features/ directory', { featuresPath });
            await promises_1.default.mkdir(featuresPath, { recursive: true });
            logger.info('features/ directory created', { featuresPath });
        }
        await this.ensurePlaywrightConfig(workspacePath);
        await this.ensureDefaultSteps(workspacePath);
        // Now set the workspace
        await this.set(workspacePath);
        const result = {
            path: workspacePath,
            name: node_path_1.default.basename(workspacePath),
            isValid: true,
            hasPackageJson: true,
            hasFeaturesDir: true,
        };
        logger.info('Workspace initialized successfully', { workspacePath, name: result.name });
        return result;
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
// For testing: reset the singleton instance
function resetWorkspaceService() {
    workspaceServiceInstance = null;
}
//# sourceMappingURL=WorkspaceService.js.map