import type { GitStatusResult, GitOperationResult, GitStatus } from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'

export class GitService {
  private commandRunner: ICommandRunner

  constructor(commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
  }

  async status(): Promise<GitStatusResult> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      return {
        status: 'error',
        branch: '',
        ahead: 0,
        behind: 0,
        modified: [],
        untracked: [],
        staged: [],
        hasRemote: false,
      }
    }

    const branchResult = await this.commandRunner.exec(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: workspacePath }
    )
    const branch = branchResult.stdout.trim()

    const statusResult = await this.commandRunner.exec('git', ['status', '--porcelain'], {
      cwd: workspacePath,
    })

    const modified: string[] = []
    const untracked: string[] = []
    const staged: string[] = []

    for (const line of statusResult.stdout.split('\n')) {
      if (!line) continue
      const status = line.substring(0, 2)
      const file = line.substring(3)

      if (status.startsWith('?')) {
        untracked.push(file)
      } else if (status[0] !== ' ') {
        staged.push(file)
      } else if (status[1] !== ' ') {
        modified.push(file)
      }
    }

    // Check ahead/behind only if remote origin exists
    let ahead = 0
    let behind = 0
    const hasOrigin = await this.commandRunner.exec(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: workspacePath }
    )
    if (hasOrigin.code === 0) {
      const aheadBehindResult = await this.commandRunner.exec(
        'git',
        ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`],
        { cwd: workspacePath }
      )
      if (aheadBehindResult.code === 0) {
        const [b, a] = aheadBehindResult.stdout.trim().split(/\s+/)
        behind = parseInt(b ?? '0', 10) || 0
        ahead = parseInt(a ?? '0', 10) || 0
      }
    }

    let gitStatus: GitStatus = 'clean'
    if (modified.length > 0 || staged.length > 0) {
      gitStatus = 'dirty'
    } else if (untracked.length > 0) {
      gitStatus = 'untracked'
    }

    return {
      status: gitStatus,
      branch,
      ahead,
      behind,
      modified,
      untracked,
      hasRemote: hasOrigin.code === 0,
      staged,
    }
  }

  async pull(): Promise<GitOperationResult> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      return { success: false, message: '', error: 'No workspace selected' }
    }

    // Check if remote origin exists before pulling
    const hasOrigin = await this.commandRunner.exec(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: workspacePath }
    )

    if (hasOrigin.code !== 0) {
      return { success: true, message: 'No remote configured — nothing to pull' }
    }

    const result = await this.commandRunner.exec('git', ['pull'], {
      cwd: workspacePath,
    })

    if (result.code !== 0) {
      return {
        success: false,
        message: '',
        error: result.stderr || 'Pull failed',
      }
    }

    return {
      success: true,
      message: result.stdout.trim() || 'Already up to date.',
    }
  }

  async commitPush(message: string): Promise<GitOperationResult> {
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      return { success: false, message: '', error: 'No workspace selected' }
    }

    // Stage all tracked changes + new files in features/ and step directories
    const addResult = await this.commandRunner.exec('git', ['add', '-A'], {
      cwd: workspacePath,
    })

    if (addResult.code !== 0) {
      return {
        success: false,
        message: '',
        error: `Failed to stage changes: ${addResult.stderr}`,
      }
    }

    const commitResult = await this.commandRunner.exec('git', ['commit', '-m', message], {
      cwd: workspacePath,
    })

    if (commitResult.code !== 0) {
      if (commitResult.stdout.includes('nothing to commit')) {
        return { success: true, message: 'Nothing to commit' }
      }
      return {
        success: false,
        message: '',
        error: `Commit failed: ${commitResult.stderr || commitResult.stdout}`,
      }
    }

    // Only push if remote origin exists
    const hasOrigin = await this.commandRunner.exec(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: workspacePath }
    )

    if (hasOrigin.code === 0) {
      const pushResult = await this.commandRunner.exec('git', ['push'], {
        cwd: workspacePath,
      })

      if (pushResult.code !== 0) {
        return {
          success: true,
          message: 'Changes committed but push failed (no remote configured or push rejected)',
        }
      }

      return {
        success: true,
        message: 'Changes committed and pushed successfully',
      }
    }

    return {
      success: true,
      message: 'Changes committed successfully',
    }
  }
}

let gitServiceInstance: GitService | null = null

export function getGitService(commandRunner?: ICommandRunner): GitService {
  if (!gitServiceInstance) {
    gitServiceInstance = new GitService(commandRunner)
  }
  return gitServiceInstance
}

export function resetGitService(): void {
  gitServiceInstance = null
}
