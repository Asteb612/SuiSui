import path from 'node:path'
import fs from 'node:fs/promises'
import type { FeatureFile, FeatureTreeNode } from '@suisui/shared'
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

  private async getFullPath(relativePath: string): Promise<string> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    this.validatePath(relativePath)
    return path.join(workspacePath, featuresDir, relativePath)
  }

  async list(): Promise<FeatureFile[]> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      return []
    }

    const featuresDir = path.join(workspacePath, await workspaceService.getFeaturesDir(workspacePath))
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
    const fullPath = await this.getFullPath(relativePath)
    
    try {
      return await fs.readFile(fullPath, 'utf-8')
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') {
        throw new Error(`Feature file not found: ${relativePath}`)
      }
      throw error
    }
  }

  async write(relativePath: string, content: string): Promise<void> {
    const fullPath = await this.getFullPath(relativePath)
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = await this.getFullPath(relativePath)
    await fs.unlink(fullPath)
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = await this.getFullPath(relativePath)
      await fs.access(fullPath)
      return true
    } catch {
      return false
    }
  }

  async createFolder(relativePath: string): Promise<void> {
    this.validatePath(relativePath + '/dummy.feature')
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    const fullPath = path.join(workspacePath, featuresDir, relativePath)
    await fs.mkdir(fullPath, { recursive: true })
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    this.validatePath(oldPath + '/dummy.feature')
    this.validatePath(newPath + '/dummy.feature')
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    const oldFullPath = path.join(workspacePath, featuresDir, oldPath)
    const newFullPath = path.join(workspacePath, featuresDir, newPath)
    
    try {
      await fs.rename(oldFullPath, newFullPath)
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') {
        throw new Error(`Folder not found: ${oldPath}`)
      }
      throw error
    }
  }

  async deleteFolder(relativePath: string): Promise<void> {
    this.validatePath(relativePath + '/dummy.feature')
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    const fullPath = path.join(workspacePath, featuresDir, relativePath)
    
    try {
      await fs.rm(fullPath, { recursive: true, force: false })
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') {
        throw new Error(`Folder not found: ${relativePath}`)
      }
      throw error
    }
  }

  async renameFeature(oldPath: string, newPath: string): Promise<void> {
    this.validatePath(oldPath)
    this.validatePath(newPath)
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    const oldFullPath = path.join(workspacePath, featuresDir, oldPath)
    const newFullPath = path.join(workspacePath, featuresDir, newPath)
    
    try {
      await fs.rename(oldFullPath, newFullPath)
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') {
        throw new Error(`Feature file not found: ${oldPath}`)
      }
      throw error
    }
  }

  async moveFeature(oldPath: string, newFolderPath: string): Promise<void> {
    this.validatePath(oldPath)
    this.validatePath(newFolderPath + '/dummy.feature')
    
    const fileName = path.basename(oldPath)
    const newPath = newFolderPath ? `${newFolderPath}/${fileName}` : fileName
    await this.renameFeature(oldPath, newPath)
  }

  async copyFeature(sourcePath: string, targetPath: string): Promise<void> {
    this.validatePath(sourcePath)
    this.validatePath(targetPath)
    
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    const sourceFullPath = path.join(workspacePath, featuresDir, sourcePath)
    const targetFullPath = path.join(workspacePath, featuresDir, targetPath)
    
    try {
      const content = await fs.readFile(sourceFullPath, 'utf-8')
      const targetDir = path.dirname(targetFullPath)
      await fs.mkdir(targetDir, { recursive: true })
      await fs.writeFile(targetFullPath, content, 'utf-8')
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') {
        throw new Error(`Source feature file not found: ${sourcePath}`)
      }
      throw error
    }
  }

  async getTree(): Promise<FeatureTreeNode[]> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()
    if (!workspacePath) {
      return []
    }

    const featuresDir = path.join(workspacePath, await workspaceService.getFeaturesDir(workspacePath))

    async function scanDir(dir: string, prefix = ''): Promise<FeatureTreeNode[]> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        const nodes: FeatureTreeNode[] = []

        for (const entry of entries) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
          
          if (entry.isDirectory()) {
            // Hide internal directories (e.g., steps/) from the feature tree
            if (entry.name === 'steps') continue

            const children = await scanDir(path.join(dir, entry.name), relativePath)
            nodes.push({
              type: 'folder',
              name: entry.name,
              relativePath,
              children,
            })
          } else if (entry.name.endsWith('.feature')) {
            nodes.push({
              type: 'file',
              name: entry.name.replace('.feature', ''),
              relativePath,
              feature: {
                path: path.join(dir, entry.name),
                name: entry.name.replace('.feature', ''),
                relativePath,
              },
            })
          }
        }

        return nodes.sort((a, b) => {
          // Folders first, then files
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
      } catch {
        return []
      }
    }

    return await scanDir(featuresDir)
  }
}

let featureServiceInstance: FeatureService | null = null

export function getFeatureService(): FeatureService {
  if (!featureServiceInstance) {
    featureServiceInstance = new FeatureService()
  }
  return featureServiceInstance
}
