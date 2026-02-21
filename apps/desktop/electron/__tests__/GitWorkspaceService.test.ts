import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import git from 'isomorphic-git'
import { GitWorkspaceService } from '../services/GitWorkspaceService'

vi.mock('isomorphic-git', () => {
  const api = {
    listBranches: vi.fn(),
    currentBranch: vi.fn(),
    listRemotes: vi.fn(),
    resolveRef: vi.fn(),
    statusMatrix: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    fetch: vi.fn(),
    writeRef: vi.fn(),
    checkout: vi.fn(),
    isDescendent: vi.fn(),
    walk: vi.fn(),
    TREE: vi.fn(),
    clone: vi.fn(),
    addRemote: vi.fn(),
    deleteRemote: vi.fn(),
    init: vi.fn(),
  }
  return { default: api }
})

vi.mock('../services/WorkspaceMeta', () => ({
  readMeta: vi.fn(async () => null),
  writeMeta: vi.fn(async () => undefined),
  withWorkspaceLock: vi.fn(async (_localPath: string, fn: () => Promise<unknown>) => fn()),
}))

describe('GitWorkspaceService', () => {
  const gitMock = vi.mocked(git, true)
  let service: GitWorkspaceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitWorkspaceService()
  })

  it('initializes repo marker on status and returns branch/remote metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-status-'))

    gitMock.currentBranch.mockRejectedValue(new Error('no HEAD'))
    gitMock.listRemotes.mockResolvedValue([])
    gitMock.resolveRef.mockRejectedValue(new Error('no HEAD'))
    gitMock.statusMatrix.mockResolvedValue([
      ['features/new.feature', 0, 2, 0],
      ['README.md', 0, 2, 0],
    ] as unknown as Awaited<ReturnType<typeof git.statusMatrix>>)

    const result = await service.getStatus(dir)

    const headContent = String(await fs.readFile(path.join(dir, '.git', 'HEAD'), 'utf-8'))
    expect(headContent).toContain('ref: refs/heads/main')
    expect(result.branch).toBe('main')
    expect(result.hasRemote).toBe(false)
    expect(result.fullStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'features/new.feature', status: 'untracked' }),
      ])
    )
  })

  it('commits with safe defaults and explicit branch ref', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-commit-'))

    gitMock.currentBranch.mockResolvedValue(null)
    gitMock.listRemotes.mockResolvedValue([])
    gitMock.resolveRef.mockRejectedValue(new Error('no HEAD'))
    gitMock.statusMatrix.mockResolvedValue([])
    gitMock.commit.mockResolvedValue('deadbeef')

    const result = await service.commitAndPush(dir, undefined, {
      message: null as unknown as string,
      authorName: null as unknown as string,
      authorEmail: null as unknown as string,
      paths: null as unknown as string[],
    })

    expect(result.commitOid).toBe('deadbeef')
    expect(result.pushed).toBe(false)
    expect(gitMock.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        dir,
        ref: 'refs/heads/main',
        message: 'Update via SuiSui',
        author: {
          name: 'SuiSui User',
          email: 'suisui@local',
        },
      })
    )
  })
})
