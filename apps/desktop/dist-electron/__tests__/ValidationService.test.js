"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('../services/StepService', () => ({
    getStepService: () => ({
        getCached: () => Promise.resolve(null),
    }),
}));
const { ValidationService } = await Promise.resolve().then(() => __importStar(require('../services/ValidationService')));
(0, vitest_1.describe)('ValidationService', () => {
    let service;
    (0, vitest_1.beforeEach)(() => {
        service = new ValidationService();
    });
    (0, vitest_1.describe)('validateScenario', () => {
        (0, vitest_1.it)('should fail if scenario name is empty', async () => {
            const scenario = {
                name: '',
                steps: [],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.issues).toContainEqual(vitest_1.expect.objectContaining({
                severity: 'error',
                message: 'Scenario name is required',
            }));
        });
        (0, vitest_1.it)('should fail if scenario has no steps', async () => {
            const scenario = {
                name: 'Test Scenario',
                steps: [],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.issues).toContainEqual(vitest_1.expect.objectContaining({
                severity: 'error',
                message: 'Scenario must have at least one step',
            }));
        });
        (0, vitest_1.it)('should fail if required argument is missing', async () => {
            const scenario = {
                name: 'Test Scenario',
                steps: [
                    {
                        id: 'step-1',
                        keyword: 'Given',
                        pattern: 'I am on the {string} page',
                        args: [{ name: 'page', type: 'string', value: '' }],
                    },
                ],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.issues).toContainEqual(vitest_1.expect.objectContaining({
                severity: 'error',
                message: 'Missing required argument: page',
                stepId: 'step-1',
            }));
        });
        (0, vitest_1.it)('should fail if int argument is not a number', async () => {
            const scenario = {
                name: 'Test Scenario',
                steps: [
                    {
                        id: 'step-1',
                        keyword: 'When',
                        pattern: 'I wait for {int} seconds',
                        args: [{ name: 'seconds', type: 'int', value: 'abc' }],
                    },
                ],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.issues).toContainEqual(vitest_1.expect.objectContaining({
                severity: 'error',
                message: 'Argument "seconds" must be an integer',
            }));
        });
        (0, vitest_1.it)('should warn if no Given step', async () => {
            const scenario = {
                name: 'Test Scenario',
                steps: [
                    {
                        id: 'step-1',
                        keyword: 'When',
                        pattern: 'I click on {string}',
                        args: [{ name: 'element', type: 'string', value: 'button' }],
                    },
                ],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.issues).toContainEqual(vitest_1.expect.objectContaining({
                severity: 'warning',
                message: 'Scenario should start with a Given step',
            }));
        });
        (0, vitest_1.it)('should warn if no Then step', async () => {
            const scenario = {
                name: 'Test Scenario',
                steps: [
                    {
                        id: 'step-1',
                        keyword: 'Given',
                        pattern: 'I am on the {string} page',
                        args: [{ name: 'page', type: 'string', value: 'home' }],
                    },
                ],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.issues).toContainEqual(vitest_1.expect.objectContaining({
                severity: 'warning',
                message: 'Scenario should have at least one Then step for assertions',
            }));
        });
        (0, vitest_1.it)('should pass with valid scenario', async () => {
            const scenario = {
                name: 'Valid Scenario',
                steps: [
                    {
                        id: 'step-1',
                        keyword: 'Given',
                        pattern: 'I am on the {string} page',
                        args: [{ name: 'page', type: 'string', value: 'home' }],
                    },
                    {
                        id: 'step-2',
                        keyword: 'When',
                        pattern: 'I click on {string}',
                        args: [{ name: 'element', type: 'string', value: 'login' }],
                    },
                    {
                        id: 'step-3',
                        keyword: 'Then',
                        pattern: 'I should see {string}',
                        args: [{ name: 'text', type: 'string', value: 'Welcome' }],
                    },
                ],
            };
            const result = await service.validateScenario(scenario);
            (0, vitest_1.expect)(result.isValid).toBe(true);
            (0, vitest_1.expect)(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=ValidationService.test.js.map