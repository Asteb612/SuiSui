"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnerService = void 0;
exports.getRunnerService = getRunnerService;
exports.resetRunnerService = resetRunnerService;
const CommandRunner_1 = require("./CommandRunner");
const WorkspaceService_1 = require("./WorkspaceService");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_1 = require("electron");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('RunnerService');
const debugRunner = process.env.SUISUI_DEBUG_RUNNER === '1';
class RunnerService {
    commandRunner;
    currentProcess = null;
    constructor(commandRunner) {
        this.commandRunner = commandRunner ?? (0, CommandRunner_1.getCommandRunner)();
    }
    getAppRoot() {
        const appRoot = node_path_1.default.resolve(__dirname, '..', '..');
        const packageJsonPath = node_path_1.default.join(appRoot, 'package.json');
        try {
            node_fs_1.default.accessSync(packageJsonPath);
            return appRoot;
        }
        catch {
            try {
                return electron_1.app.getAppPath();
            }
            catch {
                return appRoot;
            }
        }
    }
    resolvePlaywrightCliPath(appRoot) {
        const appNodeModules = node_path_1.default.join(appRoot, 'node_modules');
        const monorepoRoot = node_path_1.default.resolve(appRoot, '..', '..');
        const rootNodeModules = node_path_1.default.join(monorepoRoot, 'node_modules');
        const candidates = [
            node_path_1.default.join(appNodeModules, 'playwright', 'cli.js'),
            node_path_1.default.join(rootNodeModules, 'playwright', 'cli.js'),
        ];
        for (const candidate of candidates) {
            if (node_fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
        return null;
    }
    resolveBddgenCliPath(appRoot) {
        const appNodeModules = node_path_1.default.join(appRoot, 'node_modules');
        const monorepoRoot = node_path_1.default.resolve(appRoot, '..', '..');
        const rootNodeModules = node_path_1.default.join(monorepoRoot, 'node_modules');
        const candidates = [
            node_path_1.default.join(appNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js'),
            node_path_1.default.join(rootNodeModules, 'playwright-bdd', 'dist', 'cli', 'index.js'),
        ];
        for (const candidate of candidates) {
            if (node_fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
        return null;
    }
    async runHeadless(options = {}) {
        return this.run({ ...options, mode: 'headless' });
    }
    async runUI(options = {}) {
        return this.run({ ...options, mode: 'ui' });
    }
    async run(options) {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            logger.error('No workspace selected');
            return {
                status: 'error',
                exitCode: 1,
                stdout: '',
                stderr: 'No workspace selected',
                duration: 0,
            };
        }
        const args = ['playwright', 'test'];
        if (options.mode === 'ui') {
            args.push('--ui');
        }
        if (options.featurePath) {
            const normalized = options.featurePath.replace(/\\/g, '/');
            const isAbsolute = node_path_1.default.isAbsolute(options.featurePath);
            const isInFeaturesDir = normalized.startsWith('features/');
            const resolvedFeaturePath = isAbsolute || isInFeaturesDir
                ? options.featurePath
                : node_path_1.default.join('features', options.featurePath);
            args.push(resolvedFeaturePath);
        }
        if (options.scenarioName) {
            args.push('--grep', options.scenarioName);
        }
        const appRoot = this.getAppRoot();
        const appNodeModules = node_path_1.default.join(appRoot, 'node_modules');
        const monorepoRoot = node_path_1.default.resolve(appRoot, '..', '..');
        const rootNodeModules = node_path_1.default.join(monorepoRoot, 'node_modules');
        const playwrightCliPath = this.resolvePlaywrightCliPath(appRoot);
        const bddgenCliPath = this.resolveBddgenCliPath(appRoot);
        const nodePathParts = [appNodeModules];
        if (node_fs_1.default.existsSync(rootNodeModules)) {
            nodePathParts.push(rootNodeModules);
        }
        if (process.env.NODE_PATH) {
            nodePathParts.push(process.env.NODE_PATH);
        }
        const normalizedBaseUrl = options.baseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(options.baseUrl)
            ? `https://${options.baseUrl}`
            : options.baseUrl;
        const env = {
            ...(normalizedBaseUrl ? { BASE_URL: normalizedBaseUrl } : {}),
            NODE_PATH: nodePathParts.join(node_path_1.default.delimiter),
            PATH: `${node_path_1.default.join(appNodeModules, '.bin')}${node_path_1.default.delimiter}${process.env.PATH || ''}`,
        };
        if (debugRunner) {
            logger.warn('Debug: Starting Playwright run', {
                mode: options.mode,
                workspacePath,
                args,
                featurePath: options.featurePath,
                scenarioName: options.scenarioName,
                baseUrl: normalizedBaseUrl,
                appRoot,
                appNodeModules,
                rootNodeModules,
                playwrightCliPath,
                bddgenCliPath,
            });
        }
        else {
            logger.info('Starting Playwright run', {
                mode: options.mode,
                workspacePath,
                args,
                featurePath: options.featurePath,
                scenarioName: options.scenarioName,
                baseUrl: options.baseUrl,
            });
        }
        const startTime = Date.now();
        if (!bddgenCliPath) {
            logger.error('bddgen CLI not found', undefined, { appRoot, appNodeModules, rootNodeModules });
            return {
                status: 'error',
                exitCode: 1,
                stdout: '',
                stderr: 'bddgen CLI not found. Please ensure playwright-bdd is installed in the app.',
                duration: 0,
            };
        }
        const bddgenResult = await this.commandRunner.exec('node', [bddgenCliPath], {
            cwd: workspacePath,
            timeout: 60000,
            env,
        });
        if (bddgenResult.code !== 0) {
            logger.error('bddgen generation failed', undefined, {
                exitCode: bddgenResult.code,
                stdoutLength: bddgenResult.stdout.length,
                stderrLength: bddgenResult.stderr.length,
            });
            return {
                status: 'error',
                exitCode: bddgenResult.code,
                stdout: bddgenResult.stdout,
                stderr: bddgenResult.stderr || 'bddgen generation failed',
                duration: Date.now() - startTime,
            };
        }
        const cmd = playwrightCliPath ? 'node' : 'npx';
        const cmdArgs = playwrightCliPath ? [playwrightCliPath, ...args.slice(1)] : args;
        const result = await this.commandRunner.exec(cmd, cmdArgs, {
            cwd: workspacePath,
            timeout: options.mode === 'ui' ? 0 : 300000,
            env,
        });
        const duration = Date.now() - startTime;
        if (debugRunner) {
            logger.warn('Debug: Playwright run completed', {
                exitCode: result.code,
                duration,
                stdoutLength: result.stdout.length,
                stderrLength: result.stderr.length,
                stdoutSnippet: result.stdout.slice(0, 2000),
                stderrSnippet: result.stderr.slice(0, 2000),
            });
        }
        else {
            logger.info('Playwright run completed', {
                exitCode: result.code,
                duration,
                stdoutLength: result.stdout.length,
                stderrLength: result.stderr.length,
            });
        }
        if (result.stderr) {
            logger.warn('Playwright run stderr', { stderr: result.stderr });
        }
        let status = 'passed';
        if (result.code !== 0) {
            status = result.stderr.includes('Error') ? 'error' : 'failed';
        }
        return {
            status,
            exitCode: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
            duration,
            reportPath: this.findReportPath(result.stdout),
        };
    }
    findReportPath(stdout) {
        const match = stdout.match(/HTML report.*?:\s*(.*\.html)/i);
        return match?.[1];
    }
    async stop() {
        if (this.currentProcess) {
            this.currentProcess.kill('SIGTERM');
            this.currentProcess = null;
        }
    }
}
exports.RunnerService = RunnerService;
let runnerServiceInstance = null;
function getRunnerService(commandRunner) {
    if (!runnerServiceInstance) {
        runnerServiceInstance = new RunnerService(commandRunner);
    }
    return runnerServiceInstance;
}
function resetRunnerService() {
    runnerServiceInstance = null;
}
//# sourceMappingURL=RunnerService.js.map