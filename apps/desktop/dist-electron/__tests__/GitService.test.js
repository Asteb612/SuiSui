"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const GitService_1 = require("../services/GitService");
const CommandRunner_1 = require("../services/CommandRunner");
vitest_1.vi.mock('../services/WorkspaceService', () => ({
    getWorkspaceService: () => ({
        getPath: () => '/test/workspace',
    }),
}));
(0, vitest_1.describe)('GitService', () => {
    let service;
    let runner;
    (0, vitest_1.beforeEach)(() => {
        runner = new CommandRunner_1.FakeCommandRunner();
        service = new GitService_1.GitService(runner);
    });
    (0, vitest_1.describe)('status', () => {
        (0, vitest_1.it)('should return clean status', async () => {
            runner.setResponse('rev-parse', { code: 0, stdout: 'main\n', stderr: '' });
            runner.setResponse('status --porcelain', { code: 0, stdout: '', stderr: '' });
            runner.setResponse('rev-list', { code: 0, stdout: '0\t0', stderr: '' });
            const result = await service.status();
            (0, vitest_1.expect)(result.status).toBe('clean');
            (0, vitest_1.expect)(result.branch).toBe('main');
            (0, vitest_1.expect)(result.modified).toHaveLength(0);
            (0, vitest_1.expect)(result.untracked).toHaveLength(0);
        });
        (0, vitest_1.it)('should detect modified files', async () => {
            runner.setResponse('rev-parse', { code: 0, stdout: 'main\n', stderr: '' });
            runner.setResponse('status --porcelain', {
                code: 0,
                stdout: ' M modified.txt\n?? untracked.txt\nA  staged.txt\n',
                stderr: '',
            });
            runner.setResponse('rev-list', { code: 0, stdout: '0\t0', stderr: '' });
            const result = await service.status();
            (0, vitest_1.expect)(result.status).toBe('dirty');
            (0, vitest_1.expect)(result.modified).toContain('modified.txt');
            (0, vitest_1.expect)(result.untracked).toContain('untracked.txt');
            (0, vitest_1.expect)(result.staged).toContain('staged.txt');
        });
        (0, vitest_1.it)('should parse ahead/behind counts', async () => {
            runner.setResponse('rev-parse', { code: 0, stdout: 'feature\n', stderr: '' });
            runner.setResponse('status --porcelain', { code: 0, stdout: '', stderr: '' });
            runner.setResponse('rev-list', { code: 0, stdout: '2\t5', stderr: '' });
            const result = await service.status();
            (0, vitest_1.expect)(result.behind).toBe(2);
            (0, vitest_1.expect)(result.ahead).toBe(5);
        });
    });
    (0, vitest_1.describe)('pull', () => {
        (0, vitest_1.it)('should return success on successful pull', async () => {
            runner.setResponse('pull', {
                code: 0,
                stdout: 'Already up to date.',
                stderr: '',
            });
            const result = await service.pull();
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.message).toBe('Already up to date.');
        });
        (0, vitest_1.it)('should return error on failed pull', async () => {
            runner.setResponse('pull', {
                code: 1,
                stdout: '',
                stderr: 'error: Your local changes would be overwritten',
            });
            const result = await service.pull();
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('overwritten');
        });
    });
    (0, vitest_1.describe)('commitPush', () => {
        (0, vitest_1.it)('should commit and push successfully', async () => {
            runner.setResponse('add features/', { code: 0, stdout: '', stderr: '' });
            runner.setResponse('commit -m', { code: 0, stdout: 'committed', stderr: '' });
            runner.setResponse('push', { code: 0, stdout: '', stderr: '' });
            const result = await service.commitPush('Test commit');
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.message).toContain('committed and pushed');
        });
        (0, vitest_1.it)('should handle nothing to commit', async () => {
            runner.setResponse('add features/', { code: 0, stdout: '', stderr: '' });
            runner.setResponse('commit -m', {
                code: 1,
                stdout: 'nothing to commit, working tree clean',
                stderr: '',
            });
            const result = await service.commitPush('Test commit');
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.message).toBe('Nothing to commit');
        });
        (0, vitest_1.it)('should handle push failure', async () => {
            runner.setResponse('add features/', { code: 0, stdout: '', stderr: '' });
            runner.setResponse('commit -m', { code: 0, stdout: 'committed', stderr: '' });
            runner.setResponse('push', { code: 1, stdout: '', stderr: 'push rejected' });
            const result = await service.commitPush('Test commit');
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.message).toContain('committed but push failed');
            (0, vitest_1.expect)(result.error).toContain('push rejected');
        });
    });
});
//# sourceMappingURL=GitService.test.js.map