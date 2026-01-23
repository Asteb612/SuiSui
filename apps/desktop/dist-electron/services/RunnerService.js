"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnerService = void 0;
exports.getRunnerService = getRunnerService;
exports.resetRunnerService = resetRunnerService;
const CommandRunner_1 = require("./CommandRunner");
const WorkspaceService_1 = require("./WorkspaceService");
class RunnerService {
    commandRunner;
    currentProcess = null;
    constructor(commandRunner) {
        this.commandRunner = commandRunner ?? (0, CommandRunner_1.getCommandRunner)();
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
            args.push(options.featurePath);
        }
        if (options.scenarioName) {
            args.push('--grep', options.scenarioName);
        }
        const startTime = Date.now();
        const result = await this.commandRunner.exec('npx', args, {
            cwd: workspacePath,
            timeout: options.mode === 'ui' ? 0 : 300000,
        });
        const duration = Date.now() - startTime;
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