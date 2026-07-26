import { describe, expect, it, vi } from 'vitest'
import { EditorService } from '../../services/EditorService'
import type { StepSourceLocation } from '@suisui/shared'

function service(openExternal = vi.fn().mockResolvedValue(undefined), openPath = vi.fn().mockResolvedValue('')) {
  return {
    svc: new EditorService({ getWorkspacePath: () => '/ws', openExternal, openPath }),
    openExternal,
    openPath,
  }
}

const loc = (file: string, line: number, column = 1): StepSourceLocation => ({ file, line, column })

describe('EditorService.openStepLocation', () => {
  it('opens the file at its line via the VS Code URL', async () => {
    const { svc, openExternal } = service()
    await svc.openStepLocation(loc('features/steps/a.steps.ts', 10, 2))
    expect(openExternal).toHaveBeenCalledWith('vscode://file/ws/features/steps/a.steps.ts:10:2')
  })

  it('resolves same-pattern-different-location steps to distinct targets', async () => {
    const { svc, openExternal } = service()
    await svc.openStepLocation(loc('features/steps/a.steps.ts', 10))
    await svc.openStepLocation(loc('features/steps/b.steps.ts', 20))
    expect(openExternal.mock.calls.map((c) => c[0])).toEqual([
      'vscode://file/ws/features/steps/a.steps.ts:10:1',
      'vscode://file/ws/features/steps/b.steps.ts:20:1',
    ])
  })

  it('falls back to the OS open when the editor URL fails', async () => {
    const openExternal = vi.fn().mockRejectedValue(new Error('no handler'))
    const openPath = vi.fn().mockResolvedValue('')
    const { svc } = service(openExternal, openPath)
    await svc.openStepLocation(loc('features/steps/a.steps.ts', 5))
    expect(openPath).toHaveBeenCalledWith('/ws/features/steps/a.steps.ts')
  })

  it('refuses to open a path outside the workspace', async () => {
    const { svc, openExternal, openPath } = service()
    await expect(svc.openStepLocation(loc('../../etc/passwd', 1))).rejects.toThrow(/outside the workspace/)
    expect(openExternal).not.toHaveBeenCalled()
    expect(openPath).not.toHaveBeenCalled()
  })

  it('throws when no workspace is selected', async () => {
    const svc = new EditorService({ getWorkspacePath: () => null, openExternal: vi.fn(), openPath: vi.fn() })
    await expect(svc.openStepLocation(loc('a.ts', 1))).rejects.toThrow(/No workspace/)
  })
})
