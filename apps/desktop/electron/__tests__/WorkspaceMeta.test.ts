import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import type { WorkspaceMetadata } from '@suisui/shared'
import { readMeta, writeMeta, withWorkspaceLock } from '../services/WorkspaceMeta'

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return { default: memfs.vol.promises }
})

const WS = '/ws'
const LOCK = `${WS}/.app/lock`
const META = `${WS}/.app/workspace.json`

describe('WorkspaceMeta', () => {
  beforeEach(() => {
    vol.reset()
    vol.mkdirSync(WS, { recursive: true })
  })

  describe('readMeta / writeMeta', () => {
    it('returns null when metadata file is missing', async () => {
      expect(await readMeta(WS)).toBeNull()
    })

    it('round-trips metadata and creates the .app directory', async () => {
      const meta = { remoteUrl: 'https://example.com/repo.git', branch: 'main' } as WorkspaceMetadata
      await writeMeta(WS, meta)
      expect(await readMeta(WS)).toEqual(meta)
    })

    it('returns null when metadata file is corrupt JSON', async () => {
      vol.mkdirSync(`${WS}/.app`, { recursive: true })
      vol.writeFileSync(META, '{ not json')
      expect(await readMeta(WS)).toBeNull()
    })
  })

  describe('withWorkspaceLock', () => {
    it('runs the callback and releases the lock afterwards', async () => {
      const result = await withWorkspaceLock(WS, async () => 'done')
      expect(result).toBe('done')
      expect(vol.existsSync(LOCK)).toBe(false)
    })

    it('releases the lock even when the callback throws', async () => {
      await expect(
        withWorkspaceLock(WS, async () => {
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')
      expect(vol.existsSync(LOCK)).toBe(false)
    })

    it('rejects when a fresh lock is held by a live process', async () => {
      vol.mkdirSync(`${WS}/.app`, { recursive: true })
      vol.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, timestamp: Date.now() }))

      await expect(withWorkspaceLock(WS, async () => 'x')).rejects.toThrow(
        'Workspace is locked by another operation',
      )
      // Existing lock must be left intact.
      expect(vol.existsSync(LOCK)).toBe(true)
    })

    it('takes over a lock whose timestamp is stale', async () => {
      vol.mkdirSync(`${WS}/.app`, { recursive: true })
      vol.writeFileSync(
        LOCK,
        JSON.stringify({ pid: process.pid, timestamp: Date.now() - 60_000 }),
      )

      const result = await withWorkspaceLock(WS, async () => 'recovered')
      expect(result).toBe('recovered')
      expect(vol.existsSync(LOCK)).toBe(false)
    })

    it('takes over a lock whose owning process is dead', async () => {
      vol.mkdirSync(`${WS}/.app`, { recursive: true })
      // PID 0x7fffffff is effectively guaranteed not to be running.
      vol.writeFileSync(LOCK, JSON.stringify({ pid: 2147483647, timestamp: Date.now() }))

      const result = await withWorkspaceLock(WS, async () => 'recovered')
      expect(result).toBe('recovered')
      expect(vol.existsSync(LOCK)).toBe(false)
    })

    it('serializes nested acquisition attempts on the same workspace', async () => {
      await expect(
        withWorkspaceLock(WS, async () => {
          return withWorkspaceLock(WS, async () => 'inner')
        }),
      ).rejects.toThrow('Workspace is locked by another operation')
    })
  })
})
