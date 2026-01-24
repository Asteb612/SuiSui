import { defineStore } from 'pinia'
import type { WorkspaceInfo, FeatureFile, WorkspaceValidation } from '@suisui/shared'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    workspace: null as WorkspaceInfo | null,
    features: [] as FeatureFile[],
    selectedFeature: null as FeatureFile | null,
    isLoading: false,
    error: null as string | null,
    // For workspace initialization flow
    pendingPath: null as string | null,
    pendingValidation: null as WorkspaceValidation | null,
  }),

  getters: {
    hasWorkspace: (state) => state.workspace !== null,
    featureCount: (state) => state.features.length,
    needsInit: (state) => state.pendingPath !== null && state.pendingValidation !== null && !state.pendingValidation.isValid,
  },

  actions: {
    async loadWorkspace() {
      this.isLoading = true
      this.error = null
      try {
        this.workspace = await window.api.workspace.get()
        if (this.workspace) {
          await this.loadFeatures()
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load workspace'
      } finally {
        this.isLoading = false
      }
    },

    async selectWorkspace() {
      this.isLoading = true
      this.error = null
      this.pendingPath = null
      this.pendingValidation = null
      try {
        const result = await window.api.workspace.select()
        // Handle null/undefined result (dialog canceled or error)
        if (!result) {
          return
        }
        if (result.workspace) {
          this.workspace = result.workspace
          await this.loadFeatures()
        } else if (result.selectedPath && result.validation && !result.validation.isValid) {
          // Folder selected but validation failed - store for potential initialization
          this.pendingPath = result.selectedPath
          this.pendingValidation = result.validation
          this.error = `Invalid workspace: ${result.validation.errors.join(', ')}`
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to select workspace'
      } finally {
        this.isLoading = false
      }
    },

    async initWorkspace() {
      if (!this.pendingPath) return

      this.isLoading = true
      this.error = null
      try {
        this.workspace = await window.api.workspace.init(this.pendingPath)
        this.pendingPath = null
        this.pendingValidation = null
        await this.loadFeatures()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to initialize workspace'
      } finally {
        this.isLoading = false
      }
    },

    clearPending() {
      this.pendingPath = null
      this.pendingValidation = null
      this.error = null
    },

    async loadFeatures() {
      if (!this.workspace) return
      try {
        this.features = await window.api.features.list()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load features'
      }
    },

    selectFeature(feature: FeatureFile | null) {
      this.selectedFeature = feature
    },

    clearWorkspace() {
      this.workspace = null
      this.features = []
      this.selectedFeature = null
    },
  },
})
