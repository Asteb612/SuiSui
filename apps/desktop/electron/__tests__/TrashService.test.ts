import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TrashService } from '../services/TrashService'
import type { WorkspaceService } from '../services/WorkspaceService'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Mock WorkspaceService
vi.mock('../services/WorkspaceService', () => ({
  getWorkspaceService: vi.fn(),
}))

describe('TrashService', () => {
  let tempDir: string
  let trashService: TrashService
  const featuresDir = () => path.join(tempDir, 'features')

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-trash-test-'))

    const { getWorkspaceService } = await import('../services/WorkspaceService')
    vi.mocked(getWorkspaceService).mockReturnValue({
      getPath: () => tempDir,
      getFeaturesDir: async () => 'features',
    } as unknown as WorkspaceService)

    trashService = new TrashService()
    await fs.mkdir(featuresDir(), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('trashItem', () => {
    it('moves a feature file to the trash and records it', async () => {
      await fs.writeFile(path.join(featuresDir(), 'login.feature'), 'Feature: Login')

      const entry = await trashService.trashItem('login.feature', 'file')

      expect(entry.type).toBe('file')
      expect(entry.name).toBe('login')
      expect(entry.originalPath).toBe('login.feature')
      // Original is gone
      await expect(fs.access(path.join(featuresDir(), 'login.feature'))).rejects.toThrow()
      // It shows up in the listing
      const items = await trashService.list()
      expect(items).toHaveLength(1)
      expect(items[0]!.id).toBe(entry.id)
    })

    it('moves a folder with contents to the trash', async () => {
      await fs.mkdir(path.join(featuresDir(), 'auth'), { recursive: true })
      await fs.writeFile(path.join(featuresDir(), 'auth', 'login.feature'), 'Feature: Login')

      const entry = await trashService.trashItem('auth', 'folder')

      expect(entry.type).toBe('folder')
      expect(entry.name).toBe('auth')
      await expect(fs.access(path.join(featuresDir(), 'auth'))).rejects.toThrow()
    })

    it('throws when the item does not exist', async () => {
      await expect(trashService.trashItem('missing.feature', 'file')).rejects.toThrow()
    })

    it('rejects path traversal', async () => {
      await expect(trashService.trashItem('../evil.feature', 'file')).rejects.toThrow()
    })
  })

  describe('restore', () => {
    it('restores a file to its original path', async () => {
      const content = 'Feature: Login'
      await fs.writeFile(path.join(featuresDir(), 'login.feature'), content)
      const entry = await trashService.trashItem('login.feature', 'file')

      await trashService.restore(entry.id)

      const restored = await fs.readFile(path.join(featuresDir(), 'login.feature'), 'utf-8')
      expect(restored).toBe(content)
      expect(await trashService.list()).toHaveLength(0)
    })

    it('restores a folder to its original path', async () => {
      await fs.mkdir(path.join(featuresDir(), 'auth'), { recursive: true })
      await fs.writeFile(path.join(featuresDir(), 'auth', 'login.feature'), 'Feature: Login')
      const entry = await trashService.trashItem('auth', 'folder')

      await trashService.restore(entry.id)

      const restored = await fs.readFile(path.join(featuresDir(), 'auth', 'login.feature'), 'utf-8')
      expect(restored).toBe('Feature: Login')
    })

    it('refuses to restore when something already occupies the original path', async () => {
      await fs.writeFile(path.join(featuresDir(), 'login.feature'), 'Feature: Login')
      const entry = await trashService.trashItem('login.feature', 'file')
      // Recreate a file at the original path
      await fs.writeFile(path.join(featuresDir(), 'login.feature'), 'Feature: Other')

      await expect(trashService.restore(entry.id)).rejects.toThrow()
    })

    it('throws for an unknown id', async () => {
      await expect(trashService.restore('does-not-exist')).rejects.toThrow()
    })
  })

  describe('deletePermanent and empty', () => {
    it('permanently removes a single item', async () => {
      await fs.writeFile(path.join(featuresDir(), 'a.feature'), 'Feature: A')
      await fs.writeFile(path.join(featuresDir(), 'b.feature'), 'Feature: B')
      const a = await trashService.trashItem('a.feature', 'file')
      await trashService.trashItem('b.feature', 'file')

      await trashService.deletePermanent(a.id)

      const items = await trashService.list()
      expect(items).toHaveLength(1)
      expect(items[0]!.name).toBe('b')
    })

    it('empties the entire trash', async () => {
      await fs.writeFile(path.join(featuresDir(), 'a.feature'), 'Feature: A')
      await fs.writeFile(path.join(featuresDir(), 'b.feature'), 'Feature: B')
      await trashService.trashItem('a.feature', 'file')
      await trashService.trashItem('b.feature', 'file')

      await trashService.empty()

      expect(await trashService.list()).toHaveLength(0)
    })
  })

  describe('list', () => {
    it('returns most recently deleted first', async () => {
      await fs.writeFile(path.join(featuresDir(), 'a.feature'), 'Feature: A')
      await fs.writeFile(path.join(featuresDir(), 'b.feature'), 'Feature: B')
      await trashService.trashItem('a.feature', 'file')
      await new Promise((r) => setTimeout(r, 5))
      await trashService.trashItem('b.feature', 'file')

      const items = await trashService.list()
      expect(items[0]!.name).toBe('b')
      expect(items[1]!.name).toBe('a')
    })

    it('returns empty list when no manifest exists', async () => {
      expect(await trashService.list()).toEqual([])
    })
  })
})
