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

  async pull(localPath: string, token: string): Promise<PullResult> {
    return withWorkspaceLock(localPath, async () => {
      const dir = localPath
      const meta = await readMeta(dir)
      if (!meta) {
        throw new WorkspaceNotFoundError('No workspace metadata found')
      }

      const beforeOid = await git.resolveRef({ fs, dir, ref: 'HEAD' })

      try {
        await git.fetch({
          fs,
          http,
          dir,
          ref: meta.branch,
          singleBranch: true,
          onAuth: () => onAuth(token),
        })
      } catch (err) {
        mapHttpError(err)
      }

      // Try fast-forward merge
      const remoteRef = `refs/remotes/origin/${meta.branch}`
      const remoteOid = await git.resolveRef({ fs, dir, ref: remoteRef })

      if (remoteOid === beforeOid) {
        return { updatedFiles: [], conflicts: [], headOid: beforeOid }
      }

      // Check if fast-forward is possible
      const isAncestor = await git.isDescendent({ fs, dir, oid: remoteOid, ancestor: beforeOid })

      if (!isAncestor) {
        throw new MergeConflictError(
          'Remote has diverged. Fast-forward merge not possible.',
          []
        )
      }

      // Fast-forward: update branch ref and checkout
      await git.writeRef({ fs, dir, ref: `refs/heads/${meta.branch}`, value: remoteOid, force: true })
      await git.checkout({ fs, dir, ref: meta.branch })

      // Find updated files
      const updatedFiles: string[] = []
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

      meta.lastPulledOid = remoteOid
      await writeMeta(dir, meta)

      return { updatedFiles, conflicts: [], headOid: remoteOid }
    })
  }

  async getStatus(localPath: string): Promise<WorkspaceStatusResult> {
    const dir = localPath
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

    return { fullStatus: fileStatuses, filteredStatus, counts }
  }

  async commitAndPush(
    localPath: string,
    token: string,
    options: CommitPushOptions
  ): Promise<CommitPushResult> {
    return withWorkspaceLock(localPath, async () => {
      const dir = localPath
      const meta = await readMeta(dir)
      if (!meta) {
        throw new WorkspaceNotFoundError('No workspace metadata found')
      }

      // Stage files
      const pathsToAdd = options.paths ?? ['.']
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
        message: options.message,
        author: {
          name: options.authorName ?? 'SuiSui User',
          email: options.authorEmail ?? 'suisui@local',
        },
      })

      // Push
      let pushed = false
      try {
        await git.push({
          fs,
          http,
          dir,
          remote: 'origin',
          ref: meta.branch,
          onAuth: () => onAuth(token),
        })
        pushed = true
      } catch (err) {
        logger.warn('Push failed', { error: err instanceof Error ? err.message : String(err) })
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
