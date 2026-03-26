import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileStore: Record<string, Buffer> = {}

vi.mock('electron', () => ({
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

import { GitCredentialsService } from '../services/GitCredentialsService'

const WORKSPACE_A = '/tmp/workspace-a'
const WORKSPACE_B = '/tmp/workspace-b'

describe('GitCredentialsService', () => {
  let service: GitCredentialsService

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(fileStore)) {
      delete fileStore[key]
    }
    service = new GitCredentialsService()
  })

  it('saves and retrieves token credentials', async () => {
    const creds = { token: 'ghp_testtoken123abc456def789' }
    await service.saveCredentials(WORKSPACE_A, creds)

    const result = await service.getCredentials(WORKSPACE_A)
    expect(result).toEqual(creds)
  })

  it('returns null when no credentials file exists', async () => {
    const result = await service.getCredentials(WORKSPACE_A)
    expect(result).toBeNull()
  })

  it('deletes credentials', async () => {
    const creds = { token: 'ghp_testtoken123' }
    await service.saveCredentials(WORKSPACE_A, creds)
    await service.deleteCredentials(WORKSPACE_A)

    const result = await service.getCredentials(WORKSPACE_A)
    expect(result).toBeNull()
  })

  it('throws when encryption not available', async () => {
    const { safeStorage } = await import('electron')
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)

    await expect(service.saveCredentials(WORKSPACE_A, { token: 'ghp_test' }))
      .rejects.toThrow('Encryption not available')
  })

  it('stores credentials per workspace independently', async () => {
    const credsA = { token: 'ghp_tokenForWorkspaceA' }
    const credsB = { token: 'github_pat_tokenForWorkspaceB' }

    await service.saveCredentials(WORKSPACE_A, credsA)
    await service.saveCredentials(WORKSPACE_B, credsB)

    expect(await service.getCredentials(WORKSPACE_A)).toEqual(credsA)
    expect(await service.getCredentials(WORKSPACE_B)).toEqual(credsB)
  })

  it('returns null for old format credentials without token field', async () => {
    // Simulate old credentials stored as { username, password }
    const oldCreds = { username: 'user1', password: 'pass123' }
    const { safeStorage } = await import('electron')
    const encrypted = safeStorage.encryptString(JSON.stringify(oldCreds))
    fileStore[`${WORKSPACE_A}/.app/credentials.enc`] = encrypted

    const result = await service.getCredentials(WORKSPACE_A)
    expect(result).toBeNull()
  })

  it('deleting one workspace credentials does not affect another', async () => {
    await service.saveCredentials(WORKSPACE_A, { token: 'ghp_a' })
    await service.saveCredentials(WORKSPACE_B, { token: 'ghp_b' })

    await service.deleteCredentials(WORKSPACE_A)

    expect(await service.getCredentials(WORKSPACE_A)).toBeNull()
    expect(await service.getCredentials(WORKSPACE_B)).toEqual({ token: 'ghp_b' })
  })
})
