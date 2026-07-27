import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CommandRunner, FakeCommandRunner } from '../services/CommandRunner'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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

describe('CommandRunner (real spawn)', () => {
  const runner = new CommandRunner()
  const printArgv = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))'

  it('does not let shell metacharacters in arguments be interpreted', async () => {
    const hostile = ['a b', '$(echo INJECTED)', '; echo HACKED', '`whoami`', '&& echo X']
    const result = await runner.exec(process.execPath, ['-e', printArgv, ...hostile])

    expect(result.code).toBe(0)
    // Arguments must arrive verbatim — no substitution, no word splitting.
    // (The literal tokens contain "INJECTED"/"HACKED"; a shell would instead
    // have produced the command *output*, i.e. those words on their own line.)
    expect(JSON.parse(result.stdout)).toEqual(hostile)
    expect(result.stdout).not.toContain('INJECTED\n')
    expect(result.stdout).not.toContain('HACKED\n')
  })

  it('preserves spaces in arguments as a single argv entry', async () => {
    const result = await runner.exec(process.execPath, [
      '-e',
      printArgv,
      '/path with spaces/file.feature',
    ])
    expect(JSON.parse(result.stdout)).toEqual(['/path with spaces/file.feature'])
  })

  it('reports a non-zero exit code without throwing', async () => {
    const result = await runner.exec(process.execPath, ['-e', 'process.exit(3)'])
    expect(result.code).toBe(3)
  })

  it('times out long-running commands and returns code -1', async () => {
    const result = await runner.exec(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 10000)'],
      { timeout: 200 },
    )
    expect(result.code).toBe(-1)
    expect(result.stderr).toContain('timed out')
    expect(result.timedOut).toBe('total')
  })

  it('gives the child no stdin, so a command that reads it sees EOF instead of hanging', async () => {
    // With an inherited/open stdin pipe this never resolves: nothing is ever
    // written and nothing ever closes it. Real-world case: pnpm asking
    // "reinstall from scratch? (Y/n)" with no TTY to answer it.
    const readStdin =
      "let n=0;process.stdin.on('data',c=>{n+=c.length});" +
      "process.stdin.on('end',()=>process.stdout.write('EOF:'+n))"
    const result = await runner.exec(process.execPath, ['-e', readStdin], { timeout: 3000 })

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('EOF:0')
  })

  describe('idle timeout', () => {
    it('kills a command that goes silent, reporting the idle reason', async () => {
      const result = await runner.exec(
        process.execPath,
        ['-e', "process.stdout.write('starting'); setTimeout(() => {}, 10000)"],
        { timeout: 0, idleTimeout: 300 },
      )

      expect(result.code).toBe(-1)
      expect(result.timedOut).toBe('idle')
      expect(result.stderr).toContain('no output')
      // The tail is what tells a user where it got stuck.
      expect(result.stderr).toContain('starting')
    })

    it('does not kill a slow command that keeps streaming output', async () => {
      // Ticks every 100ms for ~1s. Far longer than the 400ms idle window, but
      // never silent for that long — the old wall-clock-only timeout could not
      // tell these two cases apart.
      const ticker =
        'let i = 0; const t = setInterval(() => {' +
        "process.stdout.write('tick'); if (++i === 10) { clearInterval(t) } }, 100)"
      const result = await runner.exec(process.execPath, ['-e', ticker], {
        timeout: 0,
        idleTimeout: 400,
      })

      expect(result.timedOut).toBeUndefined()
      expect(result.code).toBe(0)
      expect(result.stdout).toBe('tick'.repeat(10))
    }, 10000)
  })

  it.skipIf(process.platform === 'win32')(
    'kills the whole process tree on timeout, not just the direct child',
    async () => {
      // Regression test. `node corepack pnpm install` nests four levels deep;
      // signalling only the direct child left pnpm/tsc running as orphans,
      // still holding the store lock, so every later install wedged too.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-killtree-'))
      const marker = path.join(dir, 'grandchild.txt')
      const script = path.join(dir, 'grandchild.js')
      fs.writeFileSync(
        script,
        `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 1500)`,
      )

      // `& wait` keeps the shell alive holding a grandchild, mirroring the
      // corepack -> pnpm -> tsc nesting we actually run.
      const result = await runner.exec('sh', ['-c', `"${process.execPath}" "${script}" & wait`], {
        timeout: 300,
      })
      expect(result.code).toBe(-1)

      // Outlive the grandchild's timer. If the tree survived, it writes here.
      await sleep(2500)
      expect(fs.existsSync(marker)).toBe(false)
    },
    10000,
  )

  it.skipIf(process.platform === 'win32')(
    'sweeps stragglers that ignore SIGTERM after the direct child has exited',
    async () => {
      // The nastiest shape: the process we hold a handle to dies promptly, so
      // 'close' fires, but a grandchild is trapping SIGTERM and lives on. If the
      // pending SIGKILL is cancelled at that point the orphan is permanent.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-sweep-'))
      const marker = path.join(dir, 'straggler.txt')
      const script = path.join(dir, 'straggler.js')
      fs.writeFileSync(
        script,
        // Ignore SIGTERM, then write the marker well after the grace period.
        `process.on('SIGTERM', () => {});` +
          `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 7000)`,
      )

      // No `wait` here: the shell exits immediately, leaving the grandchild.
      const result = await runner.exec('sh', ['-c', `"${process.execPath}" "${script}" &`], {
        idleTimeout: 300,
        timeout: 0,
      })
      expect(result.timedOut).toBe('idle')

      // Past KILL_GRACE_MS (5s) and past the straggler's 7s write.
      await sleep(8000)
      expect(fs.existsSync(marker)).toBe(false)
    },
    20000,
  )
})
