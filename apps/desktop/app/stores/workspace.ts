import { defineStore } from 'pinia'
import type { WorkspaceInfo, FeatureFile } from '@suisui/shared'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    workspace: null as WorkspaceInfo | null,
    features: [] as FeatureFile[],
    selectedFeature: null as FeatureFile | null,
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    hasWorkspace: (state) => state.workspace !== null,
    featureCount: (state) => state.features.length,
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
      try {
        const workspace = await window.api.workspace.select()
        if (workspace) {
          this.workspace = workspace
          await this.loadFeatures()
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to select workspace'
      } finally {
        this.isLoading = false
      }
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
