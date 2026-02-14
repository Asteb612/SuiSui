import { defineStore } from 'pinia'
import type { WorkspaceInfo, FeatureFile, WorkspaceValidation, FeatureTreeNode } from '@suisui/shared'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    workspace: null as WorkspaceInfo | null,
    features: [] as FeatureFile[],
    featureTree: [] as FeatureTreeNode[],
    selectedFeature: null as FeatureFile | null,
    expandedFolders: new Set<string>(),
    isLoading: false,
    isInitializing: false,
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
          await this.loadFeatureTree()
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
          await this.loadFeatureTree()
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

      this.isInitializing = true
      this.error = null
      try {
        this.workspace = await window.api.workspace.init(this.pendingPath)
        this.pendingPath = null
        this.pendingValidation = null
        await this.loadFeatures()
        await this.loadFeatureTree()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to initialize workspace'
      } finally {
        this.isInitializing = false
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

    async loadFeatureTree() {
      if (!this.workspace) return
      try {
        this.featureTree = await window.api.features.getTree()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load feature tree'
      }
    },

    selectFeature(feature: FeatureFile | null) {
      this.selectedFeature = feature
    },

    async createFolder(parentPath: string, name: string) {
      this.error = null
      try {
        const folderPath = parentPath ? `${parentPath}/${name}` : name
        await window.api.features.createFolder(folderPath)
        await this.loadFeatureTree()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to create folder'
        throw err
      }
    },

    async renameFolder(oldPath: string, newPath: string) {
      this.error = null
      try {
        await window.api.features.renameFolder(oldPath, newPath)
        await this.loadFeatureTree()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to rename folder'
        throw err
      }
    },

    async deleteFolder(path: string) {
      this.error = null
      try {
        await window.api.features.deleteFolder(path)
        await this.loadFeatureTree()
        await this.loadFeatures()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to delete folder'
        throw err
      }
    },

    async renameFeature(oldPath: string, newPath: string) {
      this.error = null
      try {
        await window.api.features.rename(oldPath, newPath)
        await this.loadFeatureTree()
        await this.loadFeatures()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to rename feature'
        throw err
      }
    },

    async moveFeature(filePath: string, newFolderPath: string) {
      this.error = null
      try {
        await window.api.features.move(filePath, newFolderPath)
        await this.loadFeatureTree()
        await this.loadFeatures()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to move feature'
        throw err
      }
    },

    async copyFeature(sourcePath: string, targetPath: string) {
      this.error = null
      try {
        await window.api.features.copy(sourcePath, targetPath)
        await this.loadFeatureTree()
        await this.loadFeatures()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to copy feature'
        throw err
      }
    },

    async deleteFeature(path: string) {
      this.error = null
      try {
        await window.api.features.delete(path)
        await this.loadFeatureTree()
        await this.loadFeatures()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to delete feature'
        throw err
      }
    },

    expandFolder(path: string) {
      this.expandedFolders.add(path)
    },

    collapseFolder(path: string) {
      this.expandedFolders.delete(path)
    },

    async selectDirectory(): Promise<string | null> {
      // Reuses the workspace directory picker dialog, only returns the selected path
      const result = await window.api.workspace.select()
      if (!result?.selectedPath) return null
      return result.selectedPath
    },

    async setWorkspacePath(path: string) {
      this.isLoading = true
      this.error = null
      try {
        const validation = await window.api.workspace.set(path)
        if (validation.isValid) {
          this.workspace = await window.api.workspace.get()
          await this.loadFeatures()
          await this.loadFeatureTree()
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to set workspace'
      } finally {
        this.isLoading = false
      }
    },

    clearWorkspace() {
      this.workspace = null
      this.features = []
      this.featureTree = []
      this.selectedFeature = null
      this.expandedFolders.clear()
    },
  },
})
