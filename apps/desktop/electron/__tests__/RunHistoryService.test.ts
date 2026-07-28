import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RUN_SNAPSHOT_VERSION, emptyLiveRunState, type LiveRunState } from '@suisui/shared'
import { RunHistoryService } from '../services/RunHistoryService'
import * as workspaceModule from '../services/WorkspaceService'

let workspace: string
let service: RunHistoryService

const snapshotFile = () => path.join(workspace, '.app', 'last-run.json')

function liveWithFailure(): LiveRunState {
  return {
    ...emptyLiveRunState(),
    available: true,
    reconciled: true,
    scenarios: {
      t1: {
        testId: 't1',
        relativePath: 'login.feature',
        title: 'Valid login',
        status: 'failed',
        attempt: 0,
        steps: {
          0: { index: 0, title: 'Given a', status: 'passed', durationMs: 4 },
          1: { index: 1, title: 'When b', status: 'failed', error: 'boom' },
        },
      },
    },
  }
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-history-'))
  vi.spyOn(workspaceModule, 'getWorkspaceService').mockReturnValue({
    getPath: () => workspace,
  } as unknown as ReturnType<typeof workspaceModule.getWorkspaceService>)
  service = new RunHistoryService()
})

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('RunHistoryService', () => {
  it('round-trips a run, keeping which step failed and why', async () => {
    await service.save(liveWithFailure(), 'global', Date.now())

    const restored = await service.load()
    expect(restored?.scopeId).toBe('global')
    expect(restored?.live.scenarios['t1']!.steps[1]).toMatchObject({
      status: 'failed',
      error: 'boom',
    })
  })

  it('writes under .app/ so it stays out of the user’s VCS', async () => {
    await service.save(liveWithFailure(), 'global', Date.now())
    expect(fs.existsSync(snapshotFile())).toBe(true)
  })

  it('returns null when nothing has ever been saved', async () => {
    expect(await service.load()).toBeNull()
  })

  it('does not save a run that produced no live data', async () => {
    // Writing an empty snapshot would clobber a genuinely useful earlier one.
    await service.save(emptyLiveRunState(), 'global', Date.now())
    expect(fs.existsSync(snapshotFile())).toBe(false)
  })

  it('never reports a restored run as still running', async () => {
    const live = liveWithFailure()
    live.running = ['t1']
    await service.save(live, 'global', Date.now())

    const restored = await service.load()
    expect(restored?.live.running).toEqual([])
    expect(restored?.live.reconciled).toBe(true)
  })

  it('discards a snapshot written by a different version', async () => {
    await fsp.mkdir(path.dirname(snapshotFile()), { recursive: true })
    await fsp.writeFile(
      snapshotFile(),
      JSON.stringify({ version: RUN_SNAPSHOT_VERSION + 1, savedAt: Date.now(), scopeId: 'g', live: liveWithFailure() }),
    )

    expect(await service.load()).toBeNull()
  })

  it('discards a stale snapshot rather than showing it against edited files', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    await service.save(liveWithFailure(), 'global', eightDaysAgo)

    expect(await service.load()).toBeNull()
  })

  it('keeps a recent snapshot', async () => {
    await service.save(liveWithFailure(), 'global', Date.now() - 60_000)
    expect(await service.load()).not.toBeNull()
  })

  it('returns null on a corrupt file rather than throwing', async () => {
    // The file is on disk; a crash mid-write or a hand-edit must not break startup.
    await fsp.mkdir(path.dirname(snapshotFile()), { recursive: true })
    await fsp.writeFile(snapshotFile(), '{ truncated')

    await expect(service.load()).resolves.toBeNull()
  })

  it('rejects a structurally wrong snapshot', async () => {
    await fsp.mkdir(path.dirname(snapshotFile()), { recursive: true })
    await fsp.writeFile(
      snapshotFile(),
      JSON.stringify({ version: RUN_SNAPSHOT_VERSION, savedAt: Date.now(), scopeId: 'g', live: { scenarios: null } }),
    )

    expect(await service.load()).toBeNull()
  })

  it('clears the snapshot', async () => {
    await service.save(liveWithFailure(), 'global', Date.now())
    await service.clear()

    expect(await service.load()).toBeNull()
  })

  it('does not throw when the workspace cannot be written', async () => {
    vi.spyOn(fsp, 'writeFile').mockRejectedValue(new Error('EACCES'))
    // Saving is best-effort — it must never surface to the run.
    await expect(service.save(liveWithFailure(), 'global', Date.now())).resolves.toBeUndefined()
  })

  it('does nothing without a workspace', async () => {
    vi.spyOn(workspaceModule, 'getWorkspaceService').mockReturnValue({
      getPath: () => null,
    } as unknown as ReturnType<typeof workspaceModule.getWorkspaceService>)

    await expect(service.save(liveWithFailure(), 'global', Date.now())).resolves.toBeUndefined()
    expect(await service.load()).toBeNull()
  })
})
