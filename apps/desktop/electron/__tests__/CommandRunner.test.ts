import { describe, it, expect, beforeEach } from 'vitest'
import { FakeCommandRunner } from '../services/CommandRunner'

describe('FakeCommandRunner', () => {
  let runner: FakeCommandRunner

  beforeEach(() => {
    runner = new FakeCommandRunner()
  })

  it('should return default response when no response is set', async () => {
    const result = await runner.exec('any', ['command'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })

  it('should return custom default response', async () => {
    runner.setDefaultResponse({ code: 1, stdout: 'out', stderr: 'err' })
    const result = await runner.exec('any', ['command'])
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('out')
    expect(result.stderr).toBe('err')
  })

  it('should return matching response for pattern', async () => {
    runner.setResponse('bddgen export', {
      code: 0,
      stdout: '{"steps":[]}',
      stderr: '',
    })

    const result = await runner.exec('npx', ['bddgen', 'export'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('{"steps":[]}')
  })

  it('should record call history', async () => {
    await runner.exec('git', ['status'], { cwd: '/test' })
    await runner.exec('npm', ['install'])

    expect(runner.callHistory).toHaveLength(2)
    expect(runner.callHistory[0]).toEqual({
      cmd: 'git',
      args: ['status'],
      options: { cwd: '/test' },
    })
    expect(runner.callHistory[1]).toEqual({
      cmd: 'npm',
      args: ['install'],
      options: undefined,
    })
  })

  it('should clear responses and history', async () => {
    runner.setResponse('test', { code: 0, stdout: '', stderr: '' })
    await runner.exec('test', [])

    runner.clearResponses()

    expect(runner.callHistory).toHaveLength(0)
    const result = await runner.exec('test', [])
    expect(result.code).toBe(0) // Should use default
  })
})
