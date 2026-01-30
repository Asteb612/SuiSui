export interface InstallState {
  lockfileHash: string
  installedAt: string
  nodeVersion: string
  npmVersion: string
}

export interface DependencyStatus {
  needsInstall: boolean
  reason?: 'missing' | 'lockfile_changed'
  lastInstallState?: InstallState
}

export interface DependencyInstallResult {
  success: boolean
  duration: number
  stdout: string
  stderr: string
  error?: string
}

export interface RequiredDependency {
  name: string
  version: string
  type: 'dependencies' | 'devDependencies'
}

export interface PackageJsonCheckResult {
  isValid: boolean
  missingDeps: RequiredDependency[]
  packageJsonExists: boolean
  wasModified: boolean
}
