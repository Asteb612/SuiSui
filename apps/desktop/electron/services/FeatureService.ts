import path from 'node:path'
import fs from 'node:fs/promises'
import type { FeatureFile } from '@suisui/shared'
import { getWorkspaceService } from './WorkspaceService'

export class FeatureService {
  private validatePath(relativePath: string): void {
    const normalized = path.normalize(relativePath)
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('Invalid path: must be relative and within features directory')
    }
    if (!normalized.endsWith('.feature')) {
      throw new Error('Invalid file: must be a .feature file')
    }
  }

  private getFullPath(relativePath: string): string {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    this.validatePath(relativePath)
    return path.join(workspacePath, 'features', relativePath)
  }

  async list(): Promise<FeatureFile[]> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      return []
    }

    const featuresDir = path.join(workspacePath, 'features')
    const features: FeatureFile[] = []

    async function scanDir(dir: string, prefix = ''): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

          if (entry.isDirectory()) {
            await scanDir(path.join(dir, entry.name), relativePath)
          } else if (entry.name.endsWith('.feature')) {
            features.push({
              path: path.join(dir, entry.name),
              name: entry.name.replace('.feature', ''),
              relativePath,
            })
          }
        }
      } catch {
        // Directory doesn't exist or not accessible
      }
    }

    await scanDir(featuresDir)
    return features.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  }

  async read(relativePath: string): Promise<string> {
    const fullPath = this.getFullPath(relativePath)
    return fs.readFile(fullPath, 'utf-8')
  }

  async write(relativePath: string, content: string): Promise<void> {
    const fullPath = this.getFullPath(relativePath)
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = this.getFullPath(relativePath)
    await fs.unlink(fullPath)
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(relativePath)
      await fs.access(fullPath)
      return true
    } catch {
      return false
    }
  }
}

let featureServiceInstance: FeatureService | null = null

export function getFeatureService(): FeatureService {
  if (!featureServiceInstance) {
    featureServiceInstance = new FeatureService()
  }
  return featureServiceInstance
}
