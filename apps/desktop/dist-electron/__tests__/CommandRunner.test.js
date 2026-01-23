"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const CommandRunner_1 = require("../services/CommandRunner");
(0, vitest_1.describe)('FakeCommandRunner', () => {
    let runner;
    (0, vitest_1.beforeEach)(() => {
        runner = new CommandRunner_1.FakeCommandRunner();
    });
    (0, vitest_1.it)('should return default response when no response is set', async () => {
        const result = await runner.exec('any', ['command']);
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toBe('');
        (0, vitest_1.expect)(result.stderr).toBe('');
    });
    (0, vitest_1.it)('should return custom default response', async () => {
        runner.setDefaultResponse({ code: 1, stdout: 'out', stderr: 'err' });
        const result = await runner.exec('any', ['command']);
        (0, vitest_1.expect)(result.code).toBe(1);
        (0, vitest_1.expect)(result.stdout).toBe('out');
        (0, vitest_1.expect)(result.stderr).toBe('err');
    });
    (0, vitest_1.it)('should return matching response for pattern', async () => {
        runner.setResponse('bddgen export', {
            code: 0,
            stdout: '{"steps":[]}',
            stderr: '',
        });
        const result = await runner.exec('npx', ['bddgen', 'export']);
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toBe('{"steps":[]}');
    });
    (0, vitest_1.it)('should record call history', async () => {
        await runner.exec('git', ['status'], { cwd: '/test' });
        await runner.exec('npm', ['install']);
        (0, vitest_1.expect)(runner.callHistory).toHaveLength(2);
        (0, vitest_1.expect)(runner.callHistory[0]).toEqual({
            cmd: 'git',
            args: ['status'],
            options: { cwd: '/test' },
        });
        (0, vitest_1.expect)(runner.callHistory[1]).toEqual({
            cmd: 'npm',
            args: ['install'],
            options: undefined,
        });
    });
    (0, vitest_1.it)('should clear responses and history', async () => {
        runner.setResponse('test', { code: 0, stdout: '', stderr: '' });
        await runner.exec('test', []);
        runner.clearResponses();
        (0, vitest_1.expect)(runner.callHistory).toHaveLength(0);
        const result = await runner.exec('test', []);
        (0, vitest_1.expect)(result.code).toBe(0); // Should use default
    });
});
//# sourceMappingURL=CommandRunner.test.js.map