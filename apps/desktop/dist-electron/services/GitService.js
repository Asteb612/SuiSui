"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitService = void 0;
exports.getGitService = getGitService;
exports.resetGitService = resetGitService;
const CommandRunner_1 = require("./CommandRunner");
const WorkspaceService_1 = require("./WorkspaceService");
class GitService {
    commandRunner;
    constructor(commandRunner) {
        this.commandRunner = commandRunner ?? (0, CommandRunner_1.getCommandRunner)();
    }
    async status() {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            return {
                status: 'error',
                branch: '',
                ahead: 0,
                behind: 0,
                modified: [],
                untracked: [],
                staged: [],
            };
        }
        const branchResult = await this.commandRunner.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspacePath });
        const branch = branchResult.stdout.trim();
        const statusResult = await this.commandRunner.exec('git', ['status', '--porcelain'], {
            cwd: workspacePath,
        });
        const modified = [];
        const untracked = [];
        const staged = [];
        for (const line of statusResult.stdout.split('\n')) {
            if (!line)
                continue;
            const status = line.substring(0, 2);
            const file = line.substring(3);
            if (status.startsWith('?')) {
                untracked.push(file);
            }
            else if (status[0] !== ' ') {
                staged.push(file);
            }
            else if (status[1] !== ' ') {
                modified.push(file);
            }
        }
        const aheadBehindResult = await this.commandRunner.exec('git', ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`], { cwd: workspacePath });
        let ahead = 0;
        let behind = 0;
        if (aheadBehindResult.code === 0) {
            const [b, a] = aheadBehindResult.stdout.trim().split(/\s+/);
            behind = parseInt(b ?? '0', 10) || 0;
            ahead = parseInt(a ?? '0', 10) || 0;
        }
        let gitStatus = 'clean';
        if (modified.length > 0 || staged.length > 0) {
            gitStatus = 'dirty';
        }
        else if (untracked.length > 0) {
            gitStatus = 'untracked';
        }
        return {
            status: gitStatus,
            branch,
            ahead,
            behind,
            modified,
            untracked,
            staged,
        };
    }
    async pull() {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            return { success: false, message: '', error: 'No workspace selected' };
        }
        const result = await this.commandRunner.exec('git', ['pull'], {
            cwd: workspacePath,
        });
        if (result.code !== 0) {
            return {
                success: false,
                message: '',
                error: result.stderr || 'Pull failed',
            };
        }
        return {
            success: true,
            message: result.stdout.trim() || 'Already up to date.',
        };
    }
    async commitPush(message) {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            return { success: false, message: '', error: 'No workspace selected' };
        }
        const addResult = await this.commandRunner.exec('git', ['add', 'features/'], {
            cwd: workspacePath,
        });
        if (addResult.code !== 0) {
            return {
                success: false,
                message: '',
                error: `Failed to stage changes: ${addResult.stderr}`,
            };
        }
        const commitResult = await this.commandRunner.exec('git', ['commit', '-m', message], {
            cwd: workspacePath,
        });
        if (commitResult.code !== 0) {
            if (commitResult.stdout.includes('nothing to commit')) {
                return { success: true, message: 'Nothing to commit' };
            }
            return {
                success: false,
                message: '',
                error: `Commit failed: ${commitResult.stderr}`,
            };
        }
        const pushResult = await this.commandRunner.exec('git', ['push'], {
            cwd: workspacePath,
        });
        if (pushResult.code !== 0) {
            return {
                success: false,
                message: 'Changes committed but push failed',
                error: pushResult.stderr,
            };
        }
        return {
            success: true,
            message: 'Changes committed and pushed successfully',
        };
    }
}
exports.GitService = GitService;
let gitServiceInstance = null;
function getGitService(commandRunner) {
    if (!gitServiceInstance) {
        gitServiceInstance = new GitService(commandRunner);
    }
    return gitServiceInstance;
}
function resetGitService() {
    gitServiceInstance = null;
}
//# sourceMappingURL=GitService.js.map