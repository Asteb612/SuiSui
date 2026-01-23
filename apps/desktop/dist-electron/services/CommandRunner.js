"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeCommandRunner = exports.CommandRunner = void 0;
exports.getCommandRunner = getCommandRunner;
exports.setCommandRunner = setCommandRunner;
const node_child_process_1 = require("node:child_process");
class CommandRunner {
    async exec(cmd, args, options = {}) {
        const { cwd, env, timeout = 60000 } = options;
        return new Promise((resolve) => {
            const child = (0, node_child_process_1.spawn)(cmd, args, {
                cwd,
                env: { ...process.env, ...env },
                shell: true,
            });
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
            }, timeout);
            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({
                    code: timedOut ? -1 : (code ?? 1),
                    stdout,
                    stderr: timedOut ? `Command timed out after ${timeout}ms\n${stderr}` : stderr,
                });
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                resolve({
                    code: 1,
                    stdout,
                    stderr: err.message,
                });
            });
        });
    }
}
exports.CommandRunner = CommandRunner;
class FakeCommandRunner {
    responses = new Map();
    defaultResponse = { code: 0, stdout: '', stderr: '' };
    callHistory = [];
    setResponse(cmdPattern, response) {
        this.responses.set(cmdPattern, response);
    }
    setDefaultResponse(response) {
        this.defaultResponse = response;
    }
    clearResponses() {
        this.responses.clear();
        this.callHistory = [];
    }
    async exec(cmd, args, options) {
        this.callHistory.push({ cmd, args, options });
        const fullCmd = `${cmd} ${args.join(' ')}`;
        for (const [pattern, response] of this.responses) {
            if (fullCmd.includes(pattern)) {
                return response;
            }
        }
        return this.defaultResponse;
    }
}
exports.FakeCommandRunner = FakeCommandRunner;
let commandRunnerInstance = null;
function getCommandRunner(isTestMode = false) {
    if (!commandRunnerInstance) {
        commandRunnerInstance = isTestMode ? new FakeCommandRunner() : new CommandRunner();
    }
    return commandRunnerInstance;
}
function setCommandRunner(runner) {
    commandRunnerInstance = runner;
}
//# sourceMappingURL=CommandRunner.js.map