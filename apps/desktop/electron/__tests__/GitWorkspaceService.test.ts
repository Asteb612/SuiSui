import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import git from 'isomorphic-git'
import { GitWorkspaceService } from '../services/GitWorkspaceService'
import { GitAuthError, WorkspaceNotFoundError, MergeConflictError } from '@suisui/shared'

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

describe('cloneOrOpen', () => {
  const gitMock = vi.mocked(git, true)
  let service: GitWorkspaceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitWorkspaceService()
  })

  it('clones a new repo when .git directory does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-clone-'))

    // No .git directory exists in the fresh temp dir
    gitMock.clone.mockResolvedValue(undefined as unknown as void)
    gitMock.resolveRef.mockResolvedValue('abc123')

    const result = await service.cloneOrOpen({
      owner: 'test',
      repo: 'repo',
      repoUrl: 'https://github.com/test/repo.git',
      branch: 'main',
      localPath: dir,
    })

    expect(gitMock.clone).toHaveBeenCalledWith(
      expect.objectContaining({
        dir,
        url: 'https://github.com/test/repo.git',
        ref: 'main',
        singleBranch: true,
        depth: 50,
      })
    )
    expect(result.owner).toBe('test')
    expect(result.repo).toBe('repo')
    expect(result.branch).toBe('main')
    expect(result.remoteUrl).toBe('https://github.com/test/repo.git')
    expect(result.lastPulledOid).toBe('abc123')
  })

  it('opens existing repo without cloning when .git directory exists', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-open-'))
    // Create .git directory to simulate existing repo
    await fs.mkdir(path.join(dir, '.git'), { recursive: true })

    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.checkout.mockResolvedValue(undefined as unknown as void)
    gitMock.resolveRef.mockResolvedValue('def456')

    const result = await service.cloneOrOpen({
      owner: 'test',
      repo: 'repo',
      repoUrl: 'https://github.com/test/repo.git',
      branch: 'main',
      localPath: dir,
    })

    expect(gitMock.clone).not.toHaveBeenCalled()
    expect(gitMock.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ dir, ref: 'main' })
    )
    expect(result.lastPulledOid).toBe('def456')
  })

  it('updates remote URL when origin has a different URL', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-remote-'))
    await fs.mkdir(path.join(dir, '.git'), { recursive: true })

    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/old/repo.git' },
    ])
    gitMock.deleteRemote.mockResolvedValue(undefined as unknown as void)
    gitMock.addRemote.mockResolvedValue(undefined as unknown as void)
    gitMock.checkout.mockResolvedValue(undefined as unknown as void)
    gitMock.resolveRef.mockResolvedValue('aaa111')

    await service.cloneOrOpen({
      owner: 'test',
      repo: 'repo',
      repoUrl: 'https://github.com/new/repo.git',
      branch: 'main',
      localPath: dir,
    })

    expect(gitMock.deleteRemote).toHaveBeenCalledWith(
      expect.objectContaining({ dir, remote: 'origin' })
    )
    expect(gitMock.addRemote).toHaveBeenCalledWith(
      expect.objectContaining({ dir, remote: 'origin', url: 'https://github.com/new/repo.git' })
    )
  })
})

describe('cloneOrOpen — error handling', () => {
  const gitMock = vi.mocked(git, true)
  let service: GitWorkspaceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitWorkspaceService()
  })

  it('throws GitAuthError on 401 auth failure', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-auth-'))

    gitMock.clone.mockRejectedValue(new Error('HTTP Error: 401 Authorization required'))

    await expect(
      service.cloneOrOpen({
        owner: 'test',
        repo: 'repo',
        repoUrl: 'https://github.com/test/repo.git',
        branch: 'main',
        localPath: dir,
      })
    ).rejects.toThrow(GitAuthError)
  })

  it('throws GitAuthError with SSH message for SSH URL error', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-ssh-'))

    gitMock.clone.mockRejectedValue(new Error('unknown transport protocol "ssh"'))

    await expect(
      service.cloneOrOpen({
        owner: 'test',
        repo: 'repo',
        repoUrl: 'git@github.com:test/repo.git',
        branch: 'main',
        localPath: dir,
      })
    ).rejects.toThrow(GitAuthError)

    await expect(
      service.cloneOrOpen({
        owner: 'test',
        repo: 'repo',
        repoUrl: 'git@github.com:test/repo.git',
        branch: 'main',
        localPath: dir,
      })
    ).rejects.toThrow('SSH remotes are not supported')
  })

  it('throws WorkspaceNotFoundError on 404', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-404-'))

    gitMock.clone.mockRejectedValue(new Error('HTTP Error: 404 Not Found'))

    await expect(
      service.cloneOrOpen({
        owner: 'test',
        repo: 'repo',
        repoUrl: 'https://github.com/test/repo.git',
        branch: 'main',
        localPath: dir,
      })
    ).rejects.toThrow(WorkspaceNotFoundError)
  })
})

describe('pull', () => {
  const gitMock = vi.mocked(git, true)
  let service: GitWorkspaceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitWorkspaceService()
  })

  it('performs fast-forward merge when remote is ahead', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-pull-ff-'))

    // getRepoContext mocks
    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.resolveRef.mockImplementation(async (opts: { ref: string }) => {
      if (opts.ref === 'HEAD') return 'before-oid'
      if (opts.ref === 'refs/remotes/origin/main') return 'remote-oid'
      return 'unknown'
    })

    gitMock.fetch.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof git.fetch>>)
    gitMock.isDescendent.mockResolvedValue(true)
    gitMock.writeRef.mockResolvedValue(undefined as unknown as void)
    gitMock.checkout.mockResolvedValue(undefined as unknown as void)
    gitMock.TREE.mockImplementation((opts: { ref: string }) => opts as ReturnType<typeof git.TREE>)
    gitMock.walk.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof git.walk>>)

    const result = await service.pull(dir)

    expect(gitMock.writeRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'refs/heads/main',
        value: 'remote-oid',
        force: true,
      })
    )
    expect(result.headOid).toBe('remote-oid')
    expect(result.conflicts).toEqual([])
  })

  it('returns no-op when HEAD and remote OID are the same', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-pull-noop-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.resolveRef.mockResolvedValue('same-oid')
    gitMock.fetch.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof git.fetch>>)

    const result = await service.pull(dir)

    expect(result.updatedFiles).toEqual([])
    expect(result.headOid).toBe('same-oid')
    expect(gitMock.writeRef).not.toHaveBeenCalled()
  })

  it('returns early with empty result when no remote is configured', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-pull-noremote-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([])
    gitMock.resolveRef.mockResolvedValue('local-oid')

    const result = await service.pull(dir)

    expect(result.updatedFiles).toEqual([])
    expect(result.headOid).toBe('local-oid')
    expect(gitMock.fetch).not.toHaveBeenCalled()
  })

  it('throws MergeConflictError when history has diverged', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-pull-diverge-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.resolveRef.mockImplementation(async (opts: { ref: string }) => {
      if (opts.ref === 'HEAD') return 'local-oid'
      if (opts.ref === 'refs/remotes/origin/main') return 'remote-oid'
      return 'unknown'
    })
    gitMock.fetch.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof git.fetch>>)
    gitMock.isDescendent.mockResolvedValue(false)

    await expect(service.pull(dir)).rejects.toThrow(MergeConflictError)
  })
})

describe('getStatus — all status types', () => {
  const gitMock = vi.mocked(git, true)
  let service: GitWorkspaceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitWorkspaceService()
  })

  it('classifies all status matrix combinations and filters by DEFAULT_FILTER_GLOBS', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-status-all-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.resolveRef.mockResolvedValue('head-oid')
    gitMock.statusMatrix.mockResolvedValue([
      ['features/auth/new.feature', 0, 2, 0],
      ['features/auth/modified.feature', 1, 2, 1],
      ['features/auth/deleted.feature', 1, 0, 0],
      ['features/auth/added.feature', 0, 2, 2],
      ['features/auth/staged.feature', 1, 2, 2],
      ['features/auth/both.feature', 1, 2, 3],
      ['README.md', 0, 2, 0],
      ['src/app.ts', 1, 2, 1],
    ] as unknown as Awaited<ReturnType<typeof git.statusMatrix>>)

    const result = await service.getStatus(dir)

    // fullStatus should contain ALL entries that have a mapped status
    expect(result.fullStatus).toEqual(
      expect.arrayContaining([
        { path: 'features/auth/new.feature', status: 'untracked' },
        { path: 'features/auth/modified.feature', status: 'modified' },
        { path: 'features/auth/deleted.feature', status: 'deleted' },
        { path: 'features/auth/added.feature', status: 'added' },
        { path: 'features/auth/staged.feature', status: 'modified' },
        { path: 'features/auth/both.feature', status: 'modified' },
        { path: 'README.md', status: 'untracked' },
        { path: 'src/app.ts', status: 'modified' },
      ])
    )
    expect(result.fullStatus).toHaveLength(8)

    // filteredStatus should only contain entries matching DEFAULT_FILTER_GLOBS
    // features/**/*.feature matches paths with subdirectories, but README.md and src/app.ts do not
    const filteredPaths = result.filteredStatus.map((f) => f.path)
    expect(filteredPaths).toContain('features/auth/new.feature')
    expect(filteredPaths).toContain('features/auth/modified.feature')
    expect(filteredPaths).toContain('features/auth/deleted.feature')
    expect(filteredPaths).toContain('features/auth/added.feature')
    expect(filteredPaths).toContain('features/auth/staged.feature')
    expect(filteredPaths).toContain('features/auth/both.feature')
    expect(filteredPaths).not.toContain('README.md')
    expect(filteredPaths).not.toContain('src/app.ts')
    expect(result.filteredStatus).toHaveLength(6)

    // counts should be based on filtered entries only
    expect(result.counts).toEqual({
      modified: 3, // modified.feature + staged.feature + both.feature
      added: 1,    // added.feature
      deleted: 1,  // deleted.feature
      untracked: 1, // new.feature
    })
  })
})

describe('commitAndPush — extended', () => {
  const gitMock = vi.mocked(git, true)
  let service: GitWorkspaceService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitWorkspaceService()
  })

  it('pushes to remote when origin is configured', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-push-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.resolveRef.mockResolvedValue('head-oid')
    gitMock.statusMatrix.mockResolvedValue([])
    gitMock.commit.mockResolvedValue('commit-oid')
    gitMock.push.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof git.push>>)

    const result = await service.commitAndPush(dir, undefined, {
      message: 'Test commit',
      paths: ['.'],
    })

    expect(result.pushed).toBe(true)
    expect(gitMock.push).toHaveBeenCalledWith(
      expect.objectContaining({
        dir,
        remote: 'origin',
        ref: 'main',
      })
    )
  })

  it('stages specific paths instead of all files when paths are provided', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-paths-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([])
    gitMock.resolveRef.mockResolvedValue('head-oid')
    gitMock.statusMatrix.mockResolvedValue([])
    gitMock.add.mockResolvedValue(undefined as unknown as void)
    gitMock.commit.mockResolvedValue('commit-oid')

    await service.commitAndPush(dir, undefined, {
      message: 'Add feature',
      paths: ['features/login.feature'],
    })

    expect(gitMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        dir,
        filepath: 'features/login.feature',
      })
    )
    // statusMatrix should NOT be called because we are not staging '.'
    expect(gitMock.statusMatrix).not.toHaveBeenCalled()
  })

  it('uses custom author and message when provided', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-author-'))

    gitMock.currentBranch.mockResolvedValue('develop')
    gitMock.listRemotes.mockResolvedValue([])
    gitMock.resolveRef.mockResolvedValue('head-oid')
    gitMock.statusMatrix.mockResolvedValue([])
    gitMock.add.mockResolvedValue(undefined as unknown as void)
    gitMock.commit.mockResolvedValue('custom-oid')

    await service.commitAndPush(dir, undefined, {
      message: 'Custom commit',
      authorName: 'John',
      authorEmail: 'john@example.com',
      paths: ['.'],
    })

    expect(gitMock.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        dir,
        ref: 'refs/heads/develop',
        message: 'Custom commit',
        author: {
          name: 'John',
          email: 'john@example.com',
        },
      })
    )
  })

  it('throws GitAuthError when push fails with 403 Forbidden', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-gitws-pushauth-'))

    gitMock.currentBranch.mockResolvedValue('main')
    gitMock.listRemotes.mockResolvedValue([
      { remote: 'origin', url: 'https://github.com/test/repo.git' },
    ])
    gitMock.resolveRef.mockResolvedValue('head-oid')
    gitMock.statusMatrix.mockResolvedValue([])
    gitMock.commit.mockResolvedValue('commit-oid')
    gitMock.push.mockRejectedValue(new Error('HTTP Error: 403 Forbidden'))

    await expect(
      service.commitAndPush(dir, undefined, {
        message: 'Test commit',
        paths: ['.'],
      })
    ).rejects.toThrow(GitAuthError)
  })
})
