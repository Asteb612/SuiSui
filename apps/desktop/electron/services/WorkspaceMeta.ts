import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkspaceMetadata } from '@suisui/shared'

const META_DIR = '.app'
const META_FILE = 'workspace.json'
const LOCK_FILE = 'lock'
const LOCK_STALE_MS = 30_000

function metaDir(localPath: string): string {
  return path.join(localPath, META_DIR)
}

function metaFilePath(localPath: string): string {
  return path.join(localPath, META_DIR, META_FILE)
}

function lockFilePath(localPath: string): string {
  return path.join(localPath, META_DIR, LOCK_FILE)
}

export async function readMeta(localPath: string): Promise<WorkspaceMetadata | null> {
  try {
    const raw = await fs.readFile(metaFilePath(localPath), 'utf-8')
    return JSON.parse(raw) as WorkspaceMetadata
  } catch {
    return null
  }
}

export async function writeMeta(localPath: string, meta: WorkspaceMetadata): Promise<void> {
  const dir = metaDir(localPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(metaFilePath(localPath), JSON.stringify(meta, null, 2), 'utf-8')
}

async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(lockPath, 'utf-8')
    const data = JSON.parse(raw)
    const age = Date.now() - data.timestamp
    if (age > LOCK_STALE_MS) return true

    // Check if PID is alive
    try {
      process.kill(data.pid, 0)
      return false
    } catch {
      return true // process not running
    }
  } catch {
    return true
  }
}

export async function withWorkspaceLock<T>(localPath: string, fn: () => Promise<T>): Promise<T> {
  const dir = metaDir(localPath)
  await fs.mkdir(dir, { recursive: true })
  const lock = lockFilePath(localPath)

  // Check existing lock
  try {
    await fs.access(lock)
    if (!(await isLockStale(lock))) {
      throw new Error('Workspace is locked by another operation')
    }
    // Stale lock — remove it
    await fs.unlink(lock)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && (err as Error).message !== 'Workspace is locked by another operation') {
      // access error, lock doesn't exist — proceed
    } else if ((err as Error).message === 'Workspace is locked by another operation') {
      throw err
    }
  }

  // Acquire lock
  const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now() })
  await fs.writeFile(lock, lockData, 'utf-8')

  try {
    return await fn()
  } finally {
    try {
      await fs.unlink(lock)
    } catch {
      // ignore cleanup errors
    }
  }
}
