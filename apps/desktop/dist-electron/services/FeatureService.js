"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureService = void 0;
exports.getFeatureService = getFeatureService;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const WorkspaceService_1 = require("./WorkspaceService");
class FeatureService {
    validatePath(relativePath) {
        const normalized = node_path_1.default.normalize(relativePath);
        if (normalized.startsWith('..') || node_path_1.default.isAbsolute(normalized)) {
            throw new Error('Invalid path: must be relative and within features directory');
        }
        if (!normalized.endsWith('.feature')) {
            throw new Error('Invalid file: must be a .feature file');
        }
    }
    getFullPath(relativePath) {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            throw new Error('No workspace selected');
        }
        this.validatePath(relativePath);
        return node_path_1.default.join(workspacePath, 'features', relativePath);
    }
    async list() {
        const workspaceService = (0, WorkspaceService_1.getWorkspaceService)();
        const workspacePath = workspaceService.getPath();
        if (!workspacePath) {
            return [];
        }
        const featuresDir = node_path_1.default.join(workspacePath, 'features');
        const features = [];
        async function scanDir(dir, prefix = '') {
            try {
                const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        await scanDir(node_path_1.default.join(dir, entry.name), relativePath);
                    }
                    else if (entry.name.endsWith('.feature')) {
                        features.push({
                            path: node_path_1.default.join(dir, entry.name),
                            name: entry.name.replace('.feature', ''),
                            relativePath,
                        });
                    }
                }
            }
            catch {
                // Directory doesn't exist or not accessible
            }
        }
        await scanDir(featuresDir);
        return features.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    }
    async read(relativePath) {
        const fullPath = this.getFullPath(relativePath);
        return promises_1.default.readFile(fullPath, 'utf-8');
    }
    async write(relativePath, content) {
        const fullPath = this.getFullPath(relativePath);
        const dir = node_path_1.default.dirname(fullPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(fullPath, content, 'utf-8');
    }
    async delete(relativePath) {
        const fullPath = this.getFullPath(relativePath);
        await promises_1.default.unlink(fullPath);
    }
    async exists(relativePath) {
        try {
            const fullPath = this.getFullPath(relativePath);
            await promises_1.default.access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.FeatureService = FeatureService;
let featureServiceInstance = null;
function getFeatureService() {
    if (!featureServiceInstance) {
        featureServiceInstance = new FeatureService();
    }
    return featureServiceInstance;
}
//# sourceMappingURL=FeatureService.js.map