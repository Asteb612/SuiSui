import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileStore: Record<string, Buffer> = {}

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`enc:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('enc:', '')),
  },
  app: {
    getPath: vi.fn(() => '/tmp/suisui-test'),
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
  },
}))

import { GitCredentialsService } from '../services/GitCredentialsService'

describe('GitCredentialsService', () => {
  let service: GitCredentialsService

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(fileStore)) {
      delete fileStore[key]
    }
    service = new GitCredentialsService()
  })

  it('saves and retrieves credentials', async () => {
    const creds = { username: 'user1', password: 'pass123' }
    await service.saveCredentials(creds)

    const result = await service.getCredentials()
    expect(result).toEqual(creds)
  })

  it('returns null when no credentials file exists', async () => {
    const result = await service.getCredentials()
    expect(result).toBeNull()
  })

  it('deletes credentials', async () => {
    const creds = { username: 'user1', password: 'pass123' }
    await service.saveCredentials(creds)
    await service.deleteCredentials()

    const result = await service.getCredentials()
    expect(result).toBeNull()
  })

  it('throws when encryption not available', async () => {
    const { safeStorage } = await import('electron')
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)

    await expect(service.saveCredentials({ username: 'u', password: 'p' }))
      .rejects.toThrow('Encryption not available')
  })
})
