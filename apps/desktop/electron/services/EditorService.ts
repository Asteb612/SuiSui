import { shell } from 'electron'
import path from 'node:path'
import type { StepSourceLocation } from '@suisui/shared'
import { getWorkspaceService } from './WorkspaceService'

/** Injectable deps (Constitution IV — singleton + DI; tests avoid real shell). */
export interface EditorServiceDeps {
  getWorkspacePath?: () => string | null
  openExternal?: (url: string) => Promise<void>
  openPath?: (fsPath: string) => Promise<string>
}

/**
 * Opens a step definition's source at the right line (US5). Prefers the
 * VS Code editor URL; falls back to the OS default handler. The target MUST
 * resolve inside the active workspace (no traversal).
 */
export class EditorService {
  private readonly getWorkspacePath: () => string | null
  private readonly openExternal: (url: string) => Promise<void>
  private readonly openPath: (fsPath: string) => Promise<string>

  constructor(deps: EditorServiceDeps = {}) {
    this.getWorkspacePath = deps.getWorkspacePath ?? (() => getWorkspaceService().getPath())
    this.openExternal = deps.openExternal ?? ((url) => shell.openExternal(url))
    this.openPath = deps.openPath ?? ((fsPath) => shell.openPath(fsPath))
  }

  async openStepLocation(location: StepSourceLocation): Promise<void> {
    const root = this.getWorkspacePath()
    if (!root) throw new Error('No workspace selected')

    const abs = path.resolve(root, location.file)
    const rel = path.relative(root, abs)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Refusing to open a path outside the workspace')
    }

    const url = `vscode://file${abs}:${location.line}:${location.column ?? 1}`
    try {
      await this.openExternal(url)
    } catch {
      await this.openPath(abs)
    }
  }
}

let instance: EditorService | null = null

export function getEditorService(): EditorService {
  if (!instance) instance = new EditorService()
  return instance
}

export function resetEditorService(): void {
  instance = null
}
