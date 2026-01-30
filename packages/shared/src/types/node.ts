export interface NodeRuntimeInfo {
  version: string
  extractedAt: string
  platform: NodeJS.Platform
  arch: string
  path: string
}

export interface NodeExtractionResult {
  success: boolean
  runtimeInfo?: NodeRuntimeInfo
  error?: string
}
