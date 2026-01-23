import path from 'node:path'
import fs from 'node:fs/promises'
import type { WorkspaceInfo, WorkspaceValidation } from '@suisui/shared'
import { getSettingsService } from './SettingsService'

export class WorkspaceService {
  private currentWorkspace: WorkspaceInfo | null = null

  async validate(workspacePath: string): Promise<WorkspaceValidation> {
    const errors: string[] = []

    try {
      const stat = await fs.stat(workspacePath)
      if (!stat.isDirectory()) {
        errors.push('Path is not a directory')
        return { isValid: false, errors }
      }
    } catch {
      errors.push('Directory does not exist')
      return { isValid: false, errors }
    }

    const packageJsonPath = path.join(workspacePath, 'package.json')
    let hasPackageJson = false
    try {
      await fs.access(packageJsonPath)
      hasPackageJson = true
    } catch {
      errors.push('Missing package.json')
    }

    const featuresPath = path.join(workspacePath, 'features')
    let hasFeaturesDir = false
    try {
      const stat = await fs.stat(featuresPath)
      hasFeaturesDir = stat.isDirectory()
    } catch {
      errors.push('Missing features/ directory')
    }

    return {
      isValid: hasPackageJson && hasFeaturesDir,
      errors,
    }
  }

  async set(workspacePath: string): Promise<WorkspaceValidation> {
    const validation = await this.validate(workspacePath)

    if (validation.isValid) {
      this.currentWorkspace = {
        path: workspacePath,
        name: path.basename(workspacePath),
        isValid: true,
        hasPackageJson: true,
        hasFeaturesDir: true,
      }

      const settingsService = getSettingsService()
      await settingsService.save({ workspacePath })
      await settingsService.addRecentWorkspace(workspacePath)
    }

    return validation
  }

  async get(): Promise<WorkspaceInfo | null> {
    if (this.currentWorkspace) {
      return this.currentWorkspace
    }

    const settingsService = getSettingsService()
    const settings = await settingsService.get()

    if (settings.workspacePath) {
      const validation = await this.validate(settings.workspacePath)
      if (validation.isValid) {
        this.currentWorkspace = {
          path: settings.workspacePath,
          name: path.basename(settings.workspacePath),
          isValid: true,
          hasPackageJson: true,
          hasFeaturesDir: true,
        }
        return this.currentWorkspace
      }
    }

    return null
  }

  getPath(): string | null {
    return this.currentWorkspace?.path ?? null
  }

  clear(): void {
    this.currentWorkspace = null
  }
}

let workspaceServiceInstance: WorkspaceService | null = null

export function getWorkspaceService(): WorkspaceService {
  if (!workspaceServiceInstance) {
    workspaceServiceInstance = new WorkspaceService()
  }
  return workspaceServiceInstance
}
