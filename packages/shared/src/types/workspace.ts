export interface WorkspaceInfo {
  path: string
  name: string
  isValid: boolean
  hasPackageJson: boolean
  hasFeaturesDir: boolean
  hasCucumberJson: boolean
  gitRoot?: string
}

export interface BddDetectionResult {
  candidates: string[]
}

export interface WorkspaceValidation {
  isValid: boolean
  errors: string[]
}
