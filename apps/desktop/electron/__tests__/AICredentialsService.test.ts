import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileStore: Record<string, Buffer> = {}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/userdata'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`enc:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('enc:', '')),
  },
}))

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn((path: string, data: Buffer) => {
      fileStore[path] = data
    }),
    readFileSync: vi.fn((path: string) => {
      if (!fileStore[path]) throw new Error('ENOENT')
      return fileStore[path]
    }),
    existsSync: vi.fn((path: string) => Boolean(fileStore[path])),
    unlinkSync: vi.fn((path: string) => {
      delete fileStore[path]
    }),
    mkdirSync: vi.fn(),
  },
}))

import { AICredentialsService } from '../services/ai/AICredentialsService'

describe('AICredentialsService', () => {
  let service: AICredentialsService

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(fileStore)) delete fileStore[key]
    service = new AICredentialsService()
  })

  it('stores and reads back a key (main-process only)', async () => {
    await service.setKey('sk-secret-123')
    expect(await service.getKey()).toBe('sk-secret-123')
    expect(await service.hasKey()).toBe(true)
  })

  it('returns null / false when no key is stored', async () => {
    expect(await service.getKey()).toBeNull()
    expect(await service.hasKey()).toBe(false)
  })

  it('clears the stored key', async () => {
    await service.setKey('sk-secret-123')
    await service.clearKey()
    expect(await service.getKey()).toBeNull()
    expect(await service.hasKey()).toBe(false)
  })

  it('encrypts the key at rest (plaintext is not written verbatim)', async () => {
    await service.setKey('sk-secret-123')
    const stored = Object.values(fileStore)[0]!.toString()
    expect(stored).not.toBe('sk-secret-123')
    expect(stored).toContain('enc:')
  })

  it('throws when encryption is unavailable', async () => {
    const { safeStorage } = await import('electron')
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)
    await expect(service.setKey('sk-secret')).rejects.toThrow('Encryption not available')
  })
})
