import { defineStore } from 'pinia'
import type { UpdateState, UpdatePreferences, UpdatePhase } from '@suisui/shared'

/** Unsubscribe handle for the main→renderer state push (one subscription app-wide). */
let unsubscribe: (() => void) | null = null

interface UpdateStoreState {
  state: UpdateState | null
  preferences: UpdatePreferences | null
  initialized: boolean
}

export const useUpdateStore = defineStore('update', {
  state: (): UpdateStoreState => ({
    state: null,
    preferences: null,
    initialized: false,
  }),

  getters: {
    phase: (s): UpdatePhase => s.state?.phase ?? 'idle',
    currentVersion: (s): string => s.state?.currentVersion ?? '',
    info: (s) => s.state?.info ?? null,
    progress: (s) => s.state?.progress ?? null,
    error: (s) => s.state?.error ?? null,
    capability: (s) => s.state?.capability ?? null,
    lastCheckedAt: (s) => s.state?.lastCheckedAt ?? null,
    justUpdatedFrom: (s) => s.state?.justUpdatedFrom ?? null,

    isChecking: (s): boolean => s.state?.phase === 'checking',
    isDownloading: (s): boolean => s.state?.phase === 'downloading',
    isReady: (s): boolean => s.state?.phase === 'downloaded',
    hasError: (s): boolean => s.state?.phase === 'error',
    /** True while a newer version is available/downloading/ready. */
    updateAvailable: (s): boolean =>
      s.state?.phase === 'available' ||
      s.state?.phase === 'downloading' ||
      s.state?.phase === 'downloaded',
    canSelfUpdate: (s): boolean => s.state?.capability?.canSelfUpdate ?? false,
    /** Notify-only install (deb/dev): show a manual-download link instead of self-update. */
    isNotifyOnly: (s): boolean => s.state?.capability?.canSelfUpdate === false,

    /** Human-readable status for the manual "Check for updates" UI (US2). */
    statusLabel(): string {
      switch (this.phase) {
        case 'checking':
          return 'Checking for updates…'
        case 'up-to-date':
          return "You're up to date"
        case 'available':
          return `Update available: ${this.info?.version ?? ''}`
        case 'downloading':
          return `Downloading update… ${Math.round(this.progress?.percent ?? 0)}%`
        case 'downloaded':
          return `Update ready: ${this.info?.version ?? ''}`
        case 'unsupported':
          return 'Automatic updates are unavailable for this install'
        case 'error':
          return this.error?.message ?? 'Update check failed'
        default:
          return ''
      }
    },
  },

  actions: {
    /** Pull the current snapshot and subscribe to pushes. Safe to call repeatedly. */
    async init() {
      if (this.initialized) return
      this.initialized = true
      this.state = await window.api.update.getState()
      this.preferences = await window.api.update.getPreferences()
      unsubscribe = window.api.update.onStateChanged((state) => {
        this.state = state
      })
    },

    teardown() {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
      this.initialized = false
    },

    async check() {
      this.state = await window.api.update.check()
    },

    async download() {
      this.state = await window.api.update.download()
    },

    async quitAndInstall() {
      await window.api.update.quitAndInstall()
    },

    async setPreferences(prefs: Partial<UpdatePreferences>) {
      this.preferences = await window.api.update.setPreferences(prefs)
    },
  },
})
