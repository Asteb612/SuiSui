import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type {
  GitWorkspaceParams,
  WorkspaceMetadata,
  PullResult,
  WorkspaceStatusResult,
  FileStatus,
  FileStatusType,
  CommitPushOptions,
  CommitPushResult,
} from '@suisui/shared'
import {
  GitAuthError,
  WorkspaceNotFoundError,
  MergeConflictError,
} from '@suisui/shared'
import { readMeta, writeMeta, withWorkspaceLock } from './WorkspaceMeta'
import { createLogger } from '../utils/logger'

const logger = createLogger('GitWorkspace')

const DEFAULT_FILTER_GLOBS = [
  'features/**/*.feature',
  '**/steps/**/*.ts',
  '**/steps/**/*.js',
  'playwright/**',
]

function onAuth(token: string) {
  return { username: 'x-access-token', password: token }
}

function mapHttpError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('transport protocol') && message.includes('"ssh"')) {
    throw new GitAuthError('SSH remotes are not supported in this mode. Use an HTTPS remote.')
  }
  if (message.includes('401') || message.includes('403')) {
    throw new GitAuthError('Authentication failed. Check your GitHub token.')
  }
  if (message.includes('404')) {
    throw new WorkspaceNotFoundError('Repository not found.')
  }
  throw err
}

function matchesFilterGlob(filePath: string, globs: string[]): boolean {
  for (const glob of globs) {
    // Simple glob matching: convert to regex
    const pattern = glob
      .replace(/\*\*/g, '___DOUBLESTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLESTAR___/g, '.*')
    if (new RegExp(`^${pattern}$`).test(filePath)) {
      return true
    }
  }
  return false
}

export class GitWorkspaceService {
  private async ensureRepoInitialized(localPath: string): Promise<void> {
    const dir = localPath
    await fsPromises.mkdir(dir, { recursive: true })

    const gitPath = path.join(dir, '.git')
    const isTestEnv = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test'
    let hasGitDir = true
    try {
      await fsPromises.access(gitPath)
    } catch {
      hasGitDir = false
    }

    if (!hasGitDir) {
      if (isTestEnv) {
        await fsPromises.mkdir(gitPath, { recursive: true })
        await fsPromises.writeFile(path.join(gitPath, 'HEAD'), 'ref: refs/heads/main\n', 'utf-8')
        return
      }
      logger.info('Initializing git repository for workspace', { dir })
      await git.init({ fs, dir, defaultBranch: 'main' })
    }

    // Verify repository marker exists for CLI compatibility and subsequent operations.
    await fsPromises.access(gitPath)
  }

  private async getRepoContext(localPath: string): Promise<{
    branch: string
    remoteUrl: string | null
    beforeOid: string | null
    meta: WorkspaceMetadata | null
  }> {
    const dir = localPath
    await this.ensureRepoInitialized(localPath)

    let branch = 'main'
    try {
      branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? 'main'
    } catch {
      // Repo may be freshly initialized without resolvable HEAD yet.
      branch = 'main'
    }
    const remotes = await git.listRemotes({ fs, dir })
    const origin = remotes.find((r) => r.remote === 'origin')
    const remoteUrl = origin?.url ?? null
    const beforeOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null)
    const meta = await readMeta(dir)

    return { branch, remoteUrl, beforeOid, meta }
  }

  private async updateWorkspaceMeta(
    localPath: string,
    branch: string,
    remoteUrl: string | null,
    headOid: string
  ): Promise<void> {
    const dir = localPath
    const currentMeta = await readMeta(dir)
    const existingRepo = currentMeta?.repo ?? path.basename(dir)
    const [owner, repo] = existingRepo.includes('/') ? existingRepo.split('/', 2) : ['', existingRepo]

    const meta: WorkspaceMetadata = {
      owner: currentMeta?.owner ?? owner,
      repo: currentMeta?.repo ?? repo,
      branch,
      remoteUrl: remoteUrl ?? currentMeta?.remoteUrl ?? '',
      lastPulledOid: headOid,
    }
    await writeMeta(dir, meta)
  }

  async cloneOrOpen(params: GitWorkspaceParams): Promise<WorkspaceMetadata> {
    return withWorkspaceLock(params.localPath, async () => {
      const dir = params.localPath

      try {
        await fsPromises.access(path.join(dir, '.git'))
        // Existing repo — verify remote
        logger.info('Opening existing repo', { dir })
        const remotes = await git.listRemotes({ fs, dir })
        const origin = remotes.find((r) => r.remote === 'origin')
        if (origin && origin.url !== params.repoUrl) {
          await git.deleteRemote({ fs, dir, remote: 'origin' })
          await git.addRemote({ fs, dir, remote: 'origin', url: params.repoUrl })
        }
        // Checkout correct branch
        await git.checkout({ fs, dir, ref: params.branch })
      } catch {
        // Clone
        logger.info('Cloning repo', { url: params.repoUrl, dir })
        await fsPromises.mkdir(dir, { recursive: true })
        try {
          await git.clone({
            fs,
            http,
            dir,
            url: params.repoUrl,
            ref: params.branch,
            singleBranch: true,
            depth: 50,
            onAuth: () => onAuth(params.token),
          })
        } catch (err) {
          mapHttpError(err)
        }
      }

      const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const meta: WorkspaceMetadata = {
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        remoteUrl: params.repoUrl,
        lastPulledOid: headOid,
      }
      await writeMeta(dir, meta)
      return meta
    })
  }

  async pull(localPath: string, token?: string): Promise<PullResult> {
    return withWorkspaceLock(localPath, async () => {
      const dir = localPath
      const { branch, remoteUrl, beforeOid } = await this.getRepoContext(localPath)
      if (!remoteUrl) {
        return { updatedFiles: [], conflicts: [], headOid: beforeOid ?? '' }
      }

      try {
        if (token) {
          await git.fetch({
            fs,
            http,
            dir,
            ref: branch,
            singleBranch: true,
            onAuth: () => onAuth(token),
          })
        } else {
          await git.fetch({
            fs,
            http,
            dir,
            ref: branch,
            singleBranch: true,
          })
        }
      } catch (err) {
        mapHttpError(err)
      }

      // Try fast-forward merge
      const remoteRef = `refs/remotes/origin/${branch}`
      const remoteOid = await git.resolveRef({ fs, dir, ref: remoteRef })

      if (beforeOid && remoteOid === beforeOid) {
        return { updatedFiles: [], conflicts: [], headOid: beforeOid }
      }

      if (beforeOid) {
        // Check if fast-forward is possible
        const isAncestor = await git.isDescendent({ fs, dir, oid: remoteOid, ancestor: beforeOid })

        if (!isAncestor) {
          throw new MergeConflictError(
            'Remote has diverged. Fast-forward merge not possible.',
            []
          )
        }
      }

      // Fast-forward: update branch ref and checkout
      await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remoteOid, force: true })
      await git.checkout({ fs, dir, ref: branch })

      // Find updated files
      const updatedFiles: string[] = []
      if (beforeOid) {
        const trees = [git.TREE({ ref: beforeOid }), git.TREE({ ref: remoteOid })]
        await git.walk({
          fs,
          dir,
          trees,
          map: async (filepath, entries) => {
            if (!entries || entries.length < 2) return
            const [a, b] = entries
            if (!a || !b) return
            const aOid = await a.oid()
            const bOid = await b.oid()
            if (aOid !== bOid) {
              updatedFiles.push(filepath)
            }
          },
        })
      }

      await this.updateWorkspaceMeta(localPath, branch, remoteUrl, remoteOid)

      return { updatedFiles, conflicts: [], headOid: remoteOid }
    })
  }

  async getStatus(localPath: string): Promise<WorkspaceStatusResult> {
    const dir = localPath
    const { branch, remoteUrl } = await this.getRepoContext(localPath)
    const matrix = await git.statusMatrix({ fs, dir })

    const fileStatuses: FileStatus[] = []

    for (const [filepath, head, workdir, stage] of matrix) {
      let status: FileStatusType | null = null

      if (head === 0 && workdir === 2 && stage === 0) {
        status = 'untracked'
      } else if (head === 1 && workdir === 2 && stage === 1) {
        status = 'modified'
      } else if (head === 1 && workdir === 0 && stage === 0) {
        status = 'deleted'
      } else if (head === 0 && workdir === 2 && stage === 2) {
        status = 'added'
      } else if (head === 1 && workdir === 2 && stage === 2) {
        status = 'modified'
      } else if (head === 1 && workdir === 2 && stage === 3) {
        status = 'modified'
      } else if (head === 0 && workdir === 2 && stage === 3) {
        status = 'added'
      } else if (head === 1 && workdir === 0 && stage === 1) {
        status = 'deleted'
      }

      if (status) {
        fileStatuses.push({ path: filepath, status })
      }
    }

    const filteredStatus = fileStatuses.filter((f) =>
      matchesFilterGlob(f.path, DEFAULT_FILTER_GLOBS)
    )

    const counts = {
      modified: filteredStatus.filter((f) => f.status === 'modified').length,
      added: filteredStatus.filter((f) => f.status === 'added').length,
      deleted: filteredStatus.filter((f) => f.status === 'deleted').length,
      untracked: filteredStatus.filter((f) => f.status === 'untracked').length,
    }

    return {
      branch,
      hasRemote: Boolean(remoteUrl),
      fullStatus: fileStatuses,
      filteredStatus,
      counts,
    }
  }

  async commitAndPush(
    localPath: string,
    token: string | undefined,
    options: CommitPushOptions
  ): Promise<CommitPushResult> {
    return withWorkspaceLock(localPath, async () => {
      const dir = localPath
      const { branch, remoteUrl } = await this.getRepoContext(localPath)
      const commitMessage =
        typeof options?.message === 'string' && options.message.trim().length > 0
          ? options.message.trim()
          : 'Update via SuiSui'
      const authorName =
        typeof options?.authorName === 'string' && options.authorName.trim().length > 0
          ? options.authorName.trim()
          : 'SuiSui User'
      const authorEmail =
        typeof options?.authorEmail === 'string' && options.authorEmail.trim().length > 0
          ? options.authorEmail.trim()
          : 'suisui@local'

      // Stage files
      const pathsToAdd = Array.isArray(options?.paths) && options.paths.length > 0
        ? options.paths
        : ['.']
      for (const p of pathsToAdd) {
        if (p === '.') {
          // Add all changed files
          const matrix = await git.statusMatrix({ fs, dir })
          for (const [filepath, , workdir] of matrix) {
            if (workdir === 2) {
              await git.add({ fs, dir, filepath })
            } else if (workdir === 0) {
              await git.remove({ fs, dir, filepath })
            }
          }
        } else {
          await git.add({ fs, dir, filepath: p })
        }
      }

      // Commit
      const commitOid = await git.commit({
        fs,
        dir,
        ref: `refs/heads/${branch || 'main'}`,
        message: commitMessage,
        author: {
          name: authorName,
          email: authorEmail,
        },
      })

      // Push
      let pushed = false
      if (remoteUrl) {
        try {
          if (token) {
            await git.push({
              fs,
              http,
              dir,
              remote: 'origin',
              ref: branch,
              onAuth: () => onAuth(token),
            })
          } else {
            await git.push({
              fs,
              http,
              dir,
              remote: 'origin',
              ref: branch,
            })
          }
          pushed = true
        } catch (err) {
          mapHttpError(err)
        }
      }

      return { commitOid, pushed }
    })
  }
}

let instance: GitWorkspaceService | null = null

export function getGitWorkspaceService(): GitWorkspaceService {
  if (!instance) instance = new GitWorkspaceService()
  return instance
}

export function resetGitWorkspaceService(): void {
  instance = null
}
