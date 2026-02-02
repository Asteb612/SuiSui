export interface WorkspaceInfo {
  path: string
  name: string
  isValid: boolean
  hasPackageJson: boolean
  hasFeaturesDir: boolean
  hasCucumberJson: boolean
}

export interface WorkspaceValidation {
  isValid: boolean
  errors: string[]
}
