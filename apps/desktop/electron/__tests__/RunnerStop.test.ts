import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CommandOptions, CommandResult } from '@suisui/shared'
import type { ICommandRunner } from '../services/CommandRunner'
import { RunnerService } from '../services/RunnerService'
import * as workspaceModule from '../services/WorkspaceService'
import * as depModule from '../services/DependencyService'
import * as nodeModule from '../services/NodeService'

/**
 * Stopping a run must actually stop it.
 *
 * `RunnerService` previously held a `ChildProcess` field that was never
 * assigned, so `stop()` was a no-op: the UI reported the run as stopped while
 * Playwright carried on in the background. These tests pin the replacement —
 * every long-running command of a run receives the cancellation signal.
 */

let workspace: string

/** Records the options each command was launched with, and blocks until released. */
class BlockingRunner implements ICommandRunner {
  readonly calls: Array<{ cmd: string; args: string[]; options: CommandOptions }> = []
  private release: (() => void) | null = null

  async exec(cmd: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    this.calls.push({ cmd, args, options })

    // bddgen resolves immediately so the run reaches the Playwright step; the
    // Playwright command blocks until cancelled, as a real run would.
    if (!args.some((a) => a.includes('@playwright'))) {
      return { code: 0, stdout: '', stderr: '' }
    }

    return new Promise<CommandResult>((resolve) => {
      const finish = () => resolve({ code: -1, stdout: '', stderr: '', cancelled: true })
      this.release = finish
      if (options.signal?.aborted) return finish()
      options.signal?.addEventListener('abort', finish, { once: true })
    })
  }

  releaseAll(): void {
    this.release?.()
  }

  /** Options the Playwright command was launched with. */
  playwrightCall() {
    return this.calls.find((c) => c.args.some((a) => a.includes('@playwright')))
  }
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-stop-'))
  // A workspace that looks runnable enough to reach the Playwright step.
  fs.mkdirSync(path.join(workspace, 'node_modules', '@playwright', 'test'), { recursive: true })
  fs.writeFileSync(path.join(workspace, 'node_modules', '@playwright', 'test', 'cli.js'), '')
  fs.mkdirSync(path.join(workspace, 'node_modules', 'playwright-bdd', 'dist', 'cli'), {
    recursive: true,
  })
  fs.writeFileSync(path.join(workspace, 'node_modules', 'playwright-bdd', 'dist', 'cli', 'index.js'), '')

  vi.spyOn(workspaceModule, 'getWorkspaceService').mockReturnValue({
    getPath: () => workspace,
    getFeaturesDir: async () => 'features',
  } as unknown as ReturnType<typeof workspaceModule.getWorkspaceService>)

  vi.spyOn(depModule, 'getDependencyService').mockReturnValue({
    checkStatus: async () => ({ needsInstall: false }),
  } as unknown as ReturnType<typeof depModule.getDependencyService>)

  vi.spyOn(nodeModule, 'getNodeService').mockReturnValue({
    getNodePath: async () => process.execPath,
  } as unknown as ReturnType<typeof nodeModule.getNodeService>)
})

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('RunnerService.stop', () => {
  it('hands the Playwright command a cancellation signal', async () => {
    const runner = new BlockingRunner()
    const service = new RunnerService(runner)

    const run = service.runBatch({ mode: 'headless', executionMode: 'all' } as never)
    await vi.waitFor(() => expect(runner.playwrightCall()).toBeDefined())

    // Without a signal there is nothing `stop()` could possibly act on.
    expect(runner.playwrightCall()!.options.signal).toBeInstanceOf(AbortSignal)

    await service.stop()
    await run
  })

  it('aborts the in-flight run when stopped', async () => {
    const runner = new BlockingRunner()
    const service = new RunnerService(runner)

    const run = service.runBatch({ mode: 'headless', executionMode: 'all' } as never)
    await vi.waitFor(() => expect(runner.playwrightCall()).toBeDefined())

    const signal = runner.playwrightCall()!.options.signal!
    expect(signal.aborted).toBe(false)

    await service.stop()

    expect(signal.aborted).toBe(true)
    // The run resolves rather than hanging, so the UI leaves the running state.
    await expect(run).resolves.toBeDefined()
  })

  it('also cancels generation, which runs before Playwright', async () => {
    // bddgen on a large suite is not instant; Stop pressed during it must work.
    const runner = new BlockingRunner()
    const service = new RunnerService(runner)

    const run = service.runBatch({ mode: 'headless', executionMode: 'all' } as never)
    await vi.waitFor(() => expect(runner.calls.length).toBeGreaterThan(0))

    const bddgen = runner.calls.find((c) => c.args.some((a) => a.includes('playwright-bdd')))
    expect(bddgen?.options.signal).toBeInstanceOf(AbortSignal)

    await service.stop()
    await run
  })

  it('is harmless when nothing is running', async () => {
    const service = new RunnerService(new BlockingRunner())
    await expect(service.stop()).resolves.toBeUndefined()
  })

  it('does not abort a later run with an earlier run’s stop', async () => {
    const runner = new BlockingRunner()
    const service = new RunnerService(runner)

    const first = service.runBatch({ mode: 'headless', executionMode: 'all' } as never)
    await vi.waitFor(() => expect(runner.playwrightCall()).toBeDefined())
    await service.stop()
    await first

    // A stale controller must not take down the next run.
    await service.stop()

    const second = service.runBatch({ mode: 'headless', executionMode: 'all' } as never)
    await vi.waitFor(() => expect(runner.calls.length).toBeGreaterThan(2))
    const latest = runner.calls.filter((c) => c.args.some((a) => a.includes('@playwright'))).pop()!
    expect(latest.options.signal!.aborted).toBe(false)

    await service.stop()
    await second
  })
})
