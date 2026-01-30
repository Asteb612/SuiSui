import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type { NodeRuntimeInfo, NodeExtractionResult } from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('NodeService')

const NODE_VERSION = '22.13.1'

export interface INodeService {
  ensureRuntime(): Promise<NodeExtractionResult>
  getRuntimeInfo(): Promise<NodeRuntimeInfo | null>
  getNodePath(): Promise<string | null>
  getNpmPath(): Promise<string | null>
  verifyRuntime(): Promise<boolean>
  getCacheDir(): string
  getBundledRuntimePath(): string | null
}

export class NodeService implements INodeService {
  private runtimeInfo: NodeRuntimeInfo | null = null

  getCacheDir(): string {
    const platform = process.platform

    if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA
      if (localAppData) {
        return path.join(localAppData, 'SuiSui')
      }
      return path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'SuiSui')
    }

    if (platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Library', 'Caches', 'SuiSui')
    }

    // Linux and others
    const xdgCache = process.env.XDG_CACHE_HOME
    if (xdgCache) {
      return path.join(xdgCache, 'suisui')
    }
    return path.join(process.env.HOME || '', '.cache', 'suisui')
  }

  getBundledRuntimePath(): string | null {
    const platform = process.platform
    const arch = process.arch

    // In packaged app, check resources directory
    if (app.isPackaged && process.resourcesPath) {
      const packagedPath = path.join(process.resourcesPath, 'nodejs', `${platform}-${arch}`)
      if (fs.existsSync(packagedPath)) {
        return packagedPath
      }
    }

    // In development, check local nodejs-runtime directory
    const devPath = path.join(__dirname, '..', '..', 'nodejs-runtime', `${platform}-${arch}`)
    if (fs.existsSync(devPath)) {
      return devPath
    }

    // Also check from app root in development
    const appRoot = this.getAppRoot()
    const devPath2 = path.join(appRoot, 'nodejs-runtime', `${platform}-${arch}`)
    if (fs.existsSync(devPath2)) {
      return devPath2
    }

    return null
  }

  private getAppRoot(): string {
    try {
      return app.getAppPath()
    } catch {
      return path.resolve(__dirname, '..', '..')
    }
  }

  private getRuntimeInfoPath(): string {
    return path.join(this.getCacheDir(), 'runtime-info.json')
  }

  private getExtractedRuntimePath(): string {
    return path.join(this.getCacheDir(), `nodejs-v${NODE_VERSION}`)
  }

  async ensureRuntime(): Promise<NodeExtractionResult> {
    try {
      // Check if runtime already extracted and valid
      const existingInfo = await this.getRuntimeInfo()
      if (existingInfo && existingInfo.version === NODE_VERSION) {
        const isValid = await this.verifyRuntime()
        if (isValid) {
          logger.info('Runtime already extracted and valid', { version: NODE_VERSION })
          return { success: true, runtimeInfo: existingInfo }
        }
      }

      // Find bundled runtime
      const bundledPath = this.getBundledRuntimePath()
      if (!bundledPath) {
        const error = 'Bundled Node.js runtime not found'
        logger.error(error)
        return { success: false, error }
      }

      logger.info('Extracting Node.js runtime', {
        bundledPath,
        targetPath: this.getExtractedRuntimePath(),
      })

      // Ensure cache directory exists
      const cacheDir = this.getCacheDir()
      await fs.promises.mkdir(cacheDir, { recursive: true })

      // Remove old extraction if exists
      const extractPath = this.getExtractedRuntimePath()
      if (fs.existsSync(extractPath)) {
        await fs.promises.rm(extractPath, { recursive: true, force: true })
      }

      // Copy bundled runtime to cache
      await this.copyDirectory(bundledPath, extractPath)

      // Create runtime info
      const runtimeInfo: NodeRuntimeInfo = {
        version: NODE_VERSION,
        extractedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        path: extractPath,
      }

      // Save runtime info
      await fs.promises.writeFile(
        this.getRuntimeInfoPath(),
        JSON.stringify(runtimeInfo, null, 2)
      )

      this.runtimeInfo = runtimeInfo

      logger.info('Runtime extracted successfully', { version: NODE_VERSION })
      return { success: true, runtimeInfo }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to ensure runtime', new Error(message))
      return { success: false, error: message }
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true })
    const entries = await fs.promises.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath)
      } else if (entry.isSymbolicLink()) {
        const linkTarget = await fs.promises.readlink(srcPath)
        await fs.promises.symlink(linkTarget, destPath)
      } else {
        await fs.promises.copyFile(srcPath, destPath)
        // Preserve executable permissions
        const stats = await fs.promises.stat(srcPath)
        await fs.promises.chmod(destPath, stats.mode)
      }
    }
  }

  async getRuntimeInfo(): Promise<NodeRuntimeInfo | null> {
    if (this.runtimeInfo) {
      return this.runtimeInfo
    }

    try {
      const infoPath = this.getRuntimeInfoPath()
      if (!fs.existsSync(infoPath)) {
        return null
      }

      const content = await fs.promises.readFile(infoPath, 'utf-8')
      this.runtimeInfo = JSON.parse(content) as NodeRuntimeInfo
      return this.runtimeInfo
    } catch (error) {
      logger.warn('Failed to read runtime info', { error })
      return null
    }
  }

  async getNodePath(): Promise<string | null> {
    const info = await this.getRuntimeInfo()
    if (!info) {
      return null
    }

    const platform = process.platform
    const nodeBinary = platform === 'win32' ? 'node.exe' : 'bin/node'
    const nodePath = path.join(info.path, nodeBinary)

    if (fs.existsSync(nodePath)) {
      return nodePath
    }

    return null
  }

  async getNpmPath(): Promise<string | null> {
    const info = await this.getRuntimeInfo()
    if (!info) {
      return null
    }

    const platform = process.platform
    // npm is a JS script, we need to find the npm-cli.js or use the npm wrapper
    if (platform === 'win32') {
      const npmCmd = path.join(info.path, 'npm.cmd')
      if (fs.existsSync(npmCmd)) {
        return npmCmd
      }
      // Fallback to npm-cli.js
      const npmCli = path.join(info.path, 'node_modules', 'npm', 'bin', 'npm-cli.js')
      if (fs.existsSync(npmCli)) {
        return npmCli
      }
    } else {
      const npmBin = path.join(info.path, 'bin', 'npm')
      if (fs.existsSync(npmBin)) {
        return npmBin
      }
      // Fallback to npm-cli.js
      const npmCli = path.join(info.path, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
      if (fs.existsSync(npmCli)) {
        return npmCli
      }
    }

    return null
  }

  async verifyRuntime(): Promise<boolean> {
    const nodePath = await this.getNodePath()
    if (!nodePath) {
      return false
    }

    try {
      // Check if node binary exists and is executable
      await fs.promises.access(nodePath, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }
}

let nodeServiceInstance: NodeService | null = null

export function getNodeService(): NodeService {
  if (!nodeServiceInstance) {
    nodeServiceInstance = new NodeService()
  }
  return nodeServiceInstance
}

export function resetNodeService(): void {
  nodeServiceInstance = null
}
