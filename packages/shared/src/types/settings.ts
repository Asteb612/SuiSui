export interface AppSettings {
  workspacePath: string | null
  recentWorkspaces: string[]
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  autoSave: boolean
  showLineNumbers: boolean
  baseUrl: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  workspacePath: null,
  recentWorkspaces: [],
  theme: 'system',
  editorFontSize: 14,
  autoSave: true,
  showLineNumbers: true,
  baseUrl: null,
}
