import type { ElectronAPI } from '@suisui/shared'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
