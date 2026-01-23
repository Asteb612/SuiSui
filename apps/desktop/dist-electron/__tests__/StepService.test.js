"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const StepService_1 = require("../services/StepService");
const CommandRunner_1 = require("../services/CommandRunner");
vitest_1.vi.mock('../services/WorkspaceService', () => ({
    getWorkspaceService: () => ({
        getPath: () => '/test/workspace',
    }),
}));
(0, vitest_1.describe)('StepService', () => {
    let service;
    let runner;
    (0, vitest_1.beforeEach)(() => {
        runner = new CommandRunner_1.FakeCommandRunner();
        service = new StepService_1.StepService(runner);
    });
    (0, vitest_1.describe)('export', () => {
        (0, vitest_1.it)('should parse bddgen export output', async () => {
            const bddgenOutput = JSON.stringify({
                steps: [
                    { keyword: 'Given', pattern: 'I am on the {string} page', location: 'steps/nav.ts:10' },
                    { keyword: 'When', pattern: 'I click on {string}', location: 'steps/actions.ts:5' },
                    { keyword: 'Then', pattern: 'I should see {string}', location: 'steps/assertions.ts:8' },
                ],
            });
            runner.setResponse('bddgen export', {
                code: 0,
                stdout: bddgenOutput,
                stderr: '',
            });
            const result = await service.export();
            (0, vitest_1.expect)(result.steps).toHaveLength(3);
            const firstStep = result.steps[0];
            (0, vitest_1.expect)(firstStep.keyword).toBe('Given');
            (0, vitest_1.expect)(firstStep.pattern).toBe('I am on the {string} page');
            (0, vitest_1.expect)(firstStep.args).toHaveLength(1);
            (0, vitest_1.expect)(firstStep.args[0].type).toBe('string');
        });
        (0, vitest_1.it)('should parse step arguments correctly', async () => {
            const bddgenOutput = JSON.stringify({
                steps: [
                    { keyword: 'When', pattern: 'I wait for {int} seconds', location: 'steps/wait.ts:1' },
                    {
                        keyword: 'When',
                        pattern: 'I fill {string} with {string}',
                        location: 'steps/form.ts:1',
                    },
                ],
            });
            runner.setResponse('bddgen export', {
                code: 0,
                stdout: bddgenOutput,
                stderr: '',
            });
            const result = await service.export();
            const firstStep = result.steps[0];
            (0, vitest_1.expect)(firstStep.args).toHaveLength(1);
            (0, vitest_1.expect)(firstStep.args[0].type).toBe('int');
            const secondStep = result.steps[1];
            (0, vitest_1.expect)(secondStep.args).toHaveLength(2);
            (0, vitest_1.expect)(secondStep.args[0].type).toBe('string');
            (0, vitest_1.expect)(secondStep.args[1].type).toBe('string');
        });
        (0, vitest_1.it)('should throw error on bddgen failure', async () => {
            runner.setResponse('bddgen export', {
                code: 1,
                stdout: '',
                stderr: 'bddgen not found',
            });
            await (0, vitest_1.expect)(service.export()).rejects.toThrow('Failed to export steps');
        });
        (0, vitest_1.it)('should cache the result', async () => {
            const bddgenOutput = JSON.stringify({ steps: [] });
            runner.setResponse('bddgen export', { code: 0, stdout: bddgenOutput, stderr: '' });
            await service.export();
            const cached = await service.getCached();
            (0, vitest_1.expect)(cached).not.toBeNull();
            (0, vitest_1.expect)(cached?.exportedAt).toBeDefined();
        });
    });
    (0, vitest_1.describe)('getStepsByKeyword', () => {
        (0, vitest_1.it)('should filter steps by keyword', async () => {
            const bddgenOutput = JSON.stringify({
                steps: [
                    { keyword: 'Given', pattern: 'step 1', location: 'a.ts:1' },
                    { keyword: 'Given', pattern: 'step 2', location: 'a.ts:2' },
                    { keyword: 'When', pattern: 'step 3', location: 'a.ts:3' },
                    { keyword: 'Then', pattern: 'step 4', location: 'a.ts:4' },
                ],
            });
            runner.setResponse('bddgen export', { code: 0, stdout: bddgenOutput, stderr: '' });
            await service.export();
            const givenSteps = service.getStepsByKeyword('Given');
            const whenSteps = service.getStepsByKeyword('When');
            const thenSteps = service.getStepsByKeyword('Then');
            (0, vitest_1.expect)(givenSteps).toHaveLength(2);
            (0, vitest_1.expect)(whenSteps).toHaveLength(1);
            (0, vitest_1.expect)(thenSteps).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)('clearCache', () => {
        (0, vitest_1.it)('should clear the cached steps', async () => {
            const bddgenOutput = JSON.stringify({ steps: [] });
            runner.setResponse('bddgen export', { code: 0, stdout: bddgenOutput, stderr: '' });
            await service.export();
            service.clearCache();
            const cached = await service.getCached();
            (0, vitest_1.expect)(cached).toBeNull();
        });
    });
});
//# sourceMappingURL=StepService.test.js.map