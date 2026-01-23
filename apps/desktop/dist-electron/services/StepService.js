"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepService = void 0;
exports.getStepService = getStepService;
exports.resetStepService = resetStepService;
const CommandRunner_1 = require("./CommandRunner");
const WorkspaceService_1 = require("./WorkspaceService");
class StepService {
    cache = null;
    commandRunner;
    constructor(commandRunner) {
        this.commandRunner = commandRunner ?? (0, CommandRunner_1.getCommandRunner)();
    }
    parseArgs(pattern) {
        const args = [];
        const regex = /\{(string|int|float|any)(?::(\w+))?\}/g;
        let match;
        let index = 0;
        while ((match = regex.exec(pattern)) !== null) {
            const type = match[1];
            const name = match[2] ?? `arg${index}`;
            args.push({ name, type, required: true });
            index++;
        }
        return args;
    }
    parseDecorator(pattern) {
        const match = pattern.match(/^@(\w+)\s*/);
        return match?.[1];
    }
    generateStepId(keyword, pattern, location) {
        const hash = `${keyword}-${pattern}-${location}`
            .split('')
            .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
        return `step-${Math.abs(hash).toString(16)}`;
    }
    async export() {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            throw new Error('No workspace selected');
        }
        const result = await this.commandRunner.exec('npx', ['bddgen', 'export', '--format', 'json'], {
            cwd: workspacePath,
            timeout: 30000,
        });
        if (result.code !== 0) {
            console.error('bddgen export failed:', result.stderr);
            throw new Error(`Failed to export steps: ${result.stderr}`);
        }
        let bddgenExport;
        try {
            bddgenExport = JSON.parse(result.stdout);
        }
        catch {
            throw new Error('Failed to parse bddgen output');
        }
        const steps = bddgenExport.steps.map((step) => ({
            id: this.generateStepId(step.keyword, step.pattern, step.location),
            keyword: step.keyword,
            pattern: step.pattern,
            location: step.location,
            args: this.parseArgs(step.pattern),
            decorator: this.parseDecorator(step.pattern),
            isGeneric: false,
        }));
        const decorators = this.extractDecorators(steps);
        this.cache = {
            steps,
            decorators,
            exportedAt: new Date().toISOString(),
        };
        return this.cache;
    }
    extractDecorators(steps) {
        const decoratorMap = new Map();
        for (const step of steps) {
            if (step.decorator && !decoratorMap.has(step.decorator)) {
                decoratorMap.set(step.decorator, {
                    name: step.decorator,
                    location: step.location,
                });
            }
        }
        return Array.from(decoratorMap.values());
    }
    async getCached() {
        return this.cache;
    }
    async getDecorators() {
        if (this.cache) {
            return this.cache.decorators;
        }
        return [];
    }
    clearCache() {
        this.cache = null;
    }
    getStepsByKeyword(keyword) {
        if (!this.cache) {
            return [];
        }
        return this.cache.steps.filter((step) => step.keyword === keyword);
    }
    findMatchingStep(pattern) {
        if (!this.cache) {
            return undefined;
        }
        return this.cache.steps.find((step) => step.pattern === pattern);
    }
}
exports.StepService = StepService;
let stepServiceInstance = null;
function getStepService(commandRunner) {
    if (!stepServiceInstance) {
        stepServiceInstance = new StepService(commandRunner);
    }
    return stepServiceInstance;
}
function resetStepService() {
    stepServiceInstance = null;
}
//# sourceMappingURL=StepService.js.map