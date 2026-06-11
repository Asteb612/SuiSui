import path from 'node:path'
import fs from 'node:fs/promises'
import type { TrashEntry } from '@suisui/shared'
import { getWorkspaceService } from './WorkspaceService'

/** Trash storage lives alongside other app data under the workspace root. */
const TRASH_DIR = path.join('.app', 'trash')
const MANIFEST_FILE = 'manifest.json'

/**
 * Moves deleted feature files and folders to a recoverable trash bin instead of
 * permanently removing them. Items are stored under `<workspace>/.app/trash/<id>/`
 * with metadata tracked in a manifest so they can be restored to their original path.
 */
export class TrashService {
  private async getWorkspacePath(): Promise<string> {
    const workspacePath = getWorkspaceService().getPath()
    if (!workspacePath) {
      throw new Error('No workspace selected')
    }
    return workspacePath
  }

  private async getFeaturesDirFull(): Promise<string> {
    const workspaceService = getWorkspaceService()
    const workspacePath = await this.getWorkspacePath()
    const featuresDir = await workspaceService.getFeaturesDir(workspacePath)
    return path.join(workspacePath, featuresDir)
  }

  private async getTrashRoot(): Promise<string> {
    const workspacePath = await this.getWorkspacePath()
    return path.join(workspacePath, TRASH_DIR)
  }

  private async getManifestPath(): Promise<string> {
    return path.join(await this.getTrashRoot(), MANIFEST_FILE)
  }

  private validatePath(relativePath: string): void {
    const normalized = path.normalize(relativePath)
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('Invalid path: must be relative and within features directory')
    }
  }

  private generateId(): string {
    return `trash-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }

  private async readManifest(): Promise<TrashEntry[]> {
    try {
      const content = await fs.readFile(await this.getManifestPath(), 'utf-8')
      const parsed = JSON.parse(content)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      // Missing or unparseable manifest — treat as empty trash
      return []
    }
  }

  private async writeManifest(entries: TrashEntry[]): Promise<void> {
    const trashRoot = await this.getTrashRoot()
    await fs.mkdir(trashRoot, { recursive: true })
    await fs.writeFile(await this.getManifestPath(), JSON.stringify(entries, null, 2), 'utf-8')
  }

  /** Move a file or folder, falling back to copy+remove across devices. */
  private async move(source: string, dest: string): Promise<void> {
    await fs.mkdir(path.dirname(dest), { recursive: true })
    try {
      await fs.rename(source, dest)
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'EXDEV') {
        await fs.cp(source, dest, { recursive: true })
        await fs.rm(source, { recursive: true, force: true })
      } else {
        throw error
      }
    }
  }

  /**
   * Move a feature file or folder (identified by its path relative to the
   * features directory) into the trash and record it in the manifest.
   */
  async trashItem(relativePath: string, type: 'file' | 'folder'): Promise<TrashEntry> {
    this.validatePath(relativePath)
    const featuresDir = await this.getFeaturesDirFull()
    const source = path.join(featuresDir, relativePath)

    try {
      await fs.access(source)
    } catch {
      throw new Error(`${type === 'folder' ? 'Folder' : 'Feature file'} not found: ${relativePath}`)
    }

    const id = this.generateId()
    const storedName = path.basename(relativePath)
    const dest = path.join(await this.getTrashRoot(), id, storedName)
    await this.move(source, dest)

    const entry: TrashEntry = {
      id,
      type,
      name: type === 'file' ? storedName.replace(/\.feature$/, '') : storedName,
      originalPath: relativePath,
      storedName,
      deletedAt: new Date().toISOString(),
    }

    const entries = await this.readManifest()
    entries.push(entry)
    await this.writeManifest(entries)
    return entry
  }

  /** List all trashed items, most recently deleted first. */
  async list(): Promise<TrashEntry[]> {
    const entries = await this.readManifest()
    return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  /** Restore a trashed item back to its original path within the features directory. */
  async restore(id: string): Promise<void> {
    const entries = await this.readManifest()
    const entry = entries.find((e) => e.id === id)
    if (!entry) {
      throw new Error(`Trash entry not found: ${id}`)
    }

    const featuresDir = await this.getFeaturesDirFull()
    const target = path.join(featuresDir, entry.originalPath)

    let targetExists = false
    try {
      await fs.access(target)
      targetExists = true
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT') throw error
    }
    if (targetExists) {
      throw new Error(`Cannot restore: an item already exists at ${entry.originalPath}`)
    }

    const trashRoot = await this.getTrashRoot()
    const source = path.join(trashRoot, id, entry.storedName)
    await this.move(source, target)

    await fs.rm(path.join(trashRoot, id), { recursive: true, force: true })
    await this.writeManifest(entries.filter((e) => e.id !== id))
  }

  /** Permanently delete a single trashed item. */
  async deletePermanent(id: string): Promise<void> {
    const entries = await this.readManifest()
    const trashRoot = await this.getTrashRoot()
    await fs.rm(path.join(trashRoot, id), { recursive: true, force: true })
    await this.writeManifest(entries.filter((e) => e.id !== id))
  }

  /** Permanently delete everything in the trash. */
  async empty(): Promise<void> {
    const entries = await this.readManifest()
    const trashRoot = await this.getTrashRoot()
    for (const entry of entries) {
      await fs.rm(path.join(trashRoot, entry.id), { recursive: true, force: true })
    }
    await this.writeManifest([])
  }
}

let trashServiceInstance: TrashService | null = null

export function getTrashService(): TrashService {
  if (!trashServiceInstance) {
    trashServiceInstance = new TrashService()
  }
  return trashServiceInstance
}
