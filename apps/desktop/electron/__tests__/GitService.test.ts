import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitService } from '../services/GitService'
import { FakeCommandRunner } from '../services/CommandRunner'

vi.mock('../services/WorkspaceService', () => ({
  getWorkspaceService: () => ({
    getPath: () => '/test/workspace',
  }),
}))

describe('GitService', () => {
  let service: GitService
  let runner: FakeCommandRunner

  beforeEach(() => {
    runner = new FakeCommandRunner()
    service = new GitService(runner)
  })

  describe('status', () => {
    it('should return clean status with remote', async () => {
      runner.setResponse('rev-parse', { code: 0, stdout: 'main\n', stderr: '' })
      runner.setResponse('status --porcelain', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('rev-list', { code: 0, stdout: '0\t0', stderr: '' })

      const result = await service.status()

      expect(result.status).toBe('clean')
      expect(result.branch).toBe('main')
      expect(result.hasRemote).toBe(true)
      expect(result.modified).toHaveLength(0)
      expect(result.untracked).toHaveLength(0)
    })

    it('should return clean status without remote', async () => {
      runner.setResponse('rev-parse', { code: 0, stdout: 'main\n', stderr: '' })
      runner.setResponse('status --porcelain', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('remote get-url', { code: 2, stdout: '', stderr: 'fatal: No such remote' })

      const result = await service.status()

      expect(result.status).toBe('clean')
      expect(result.branch).toBe('main')
      expect(result.hasRemote).toBe(false)
      expect(result.ahead).toBe(0)
      expect(result.behind).toBe(0)
    })

    it('should detect modified files', async () => {
      runner.setResponse('rev-parse', { code: 0, stdout: 'main\n', stderr: '' })
      runner.setResponse('status --porcelain', {
        code: 0,
        stdout: ' M modified.txt\n?? untracked.txt\nA  staged.txt\n',
        stderr: '',
      })
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('rev-list', { code: 0, stdout: '0\t0', stderr: '' })

      const result = await service.status()

      expect(result.status).toBe('dirty')
      expect(result.modified).toContain('modified.txt')
      expect(result.untracked).toContain('untracked.txt')
      expect(result.staged).toContain('staged.txt')
    })

    it('should parse ahead/behind counts', async () => {
      runner.setResponse('rev-parse', { code: 0, stdout: 'feature\n', stderr: '' })
      runner.setResponse('status --porcelain', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('rev-list', { code: 0, stdout: '2\t5', stderr: '' })

      const result = await service.status()

      expect(result.behind).toBe(2)
      expect(result.ahead).toBe(5)
    })
  })

  describe('pull', () => {
    it('should return success on successful pull', async () => {
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('pull', {
        code: 0,
        stdout: 'Already up to date.',
        stderr: '',
      })

      const result = await service.pull()

      expect(result.success).toBe(true)
      expect(result.message).toBe('Already up to date.')
    })

    it('should return error on failed pull', async () => {
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('pull', {
        code: 1,
        stdout: '',
        stderr: 'error: Your local changes would be overwritten',
      })

      const result = await service.pull()

      expect(result.success).toBe(false)
      expect(result.error).toContain('overwritten')
    })

    it('should handle no remote gracefully', async () => {
      runner.setResponse('remote get-url', { code: 2, stdout: '', stderr: 'fatal: No such remote' })

      const result = await service.pull()

      expect(result.success).toBe(true)
      expect(result.message).toContain('No remote configured')
    })
  })

  describe('commitPush', () => {
    it('should commit and push successfully with remote', async () => {
      runner.setResponse('add -A', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('commit -m', { code: 0, stdout: 'committed', stderr: '' })
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('push', { code: 0, stdout: '', stderr: '' })

      const result = await service.commitPush('Test commit')

      expect(result.success).toBe(true)
      expect(result.message).toContain('committed and pushed')
    })

    it('should commit without push when no remote', async () => {
      runner.setResponse('add -A', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('commit -m', { code: 0, stdout: 'committed', stderr: '' })
      runner.setResponse('remote get-url', { code: 2, stdout: '', stderr: 'fatal: No such remote' })

      const result = await service.commitPush('Test commit')

      expect(result.success).toBe(true)
      expect(result.message).toContain('committed successfully')
    })

    it('should handle nothing to commit', async () => {
      runner.setResponse('add -A', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('commit -m', {
        code: 1,
        stdout: 'nothing to commit, working tree clean',
        stderr: '',
      })

      const result = await service.commitPush('Test commit')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Nothing to commit')
    })

    it('should handle push failure gracefully', async () => {
      runner.setResponse('add -A', { code: 0, stdout: '', stderr: '' })
      runner.setResponse('commit -m', { code: 0, stdout: 'committed', stderr: '' })
      runner.setResponse('remote get-url', { code: 0, stdout: 'https://github.com/user/repo.git\n', stderr: '' })
      runner.setResponse('push', { code: 1, stdout: '', stderr: 'push rejected' })

      const result = await service.commitPush('Test commit')

      expect(result.success).toBe(true)
      expect(result.message).toContain('committed but push failed')
    })
  })
})
