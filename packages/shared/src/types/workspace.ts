export interface WorkspaceInfo {
  path: string
  name: string
  isValid: boolean
  hasPackageJson: boolean
  hasFeaturesDir: boolean
}

export interface WorkspaceValidation {
  isValid: boolean
  errors: string[]
}
