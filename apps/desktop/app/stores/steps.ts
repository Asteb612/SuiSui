import { defineStore } from 'pinia'
import type {
  StepDefinition,
  StepKeyword,
  CatalogStep,
  CatalogDiagnostic,
  GenerateCatalogOptions,
} from '@suisui/shared'
import { catalogStepToStepDefinition } from '@suisui/shared'

export const useStepsStore = defineStore('steps', {
  state: () => ({
    steps: [] as StepDefinition[],
    exportedAt: null as string | null,
    isLoading: false,
    error: null as string | null,
    // Native structured catalog (feature 006-step-catalog)
    catalog: [] as CatalogStep[],
    catalogDiagnostics: [] as CatalogDiagnostic[],
    catalogGeneratedAt: null as string | null,
  }),

  getters: {
    givenSteps: (state) => state.steps.filter((s) => s.keyword === 'Given'),
    whenSteps: (state) => state.steps.filter((s) => s.keyword === 'When'),
    thenSteps: (state) => state.steps.filter((s) => s.keyword === 'Then'),

    // All steps come from the workspace catalog (including default generic steps).
    allSteps: (state) => state.steps,

    stepsByKeyword:
      (state) =>
      (keyword: StepKeyword): StepDefinition[] => {
        return state.steps.filter((s) => s.keyword === keyword)
      },

    /** Rich catalog entry for a given adapted step id. */
    catalogStepById:
      (state) =>
      (id: string): CatalogStep | undefined =>
        state.catalog.find((s) => s.id === id),

    /** Distinct categories present in the catalog (sorted). */
    catalogCategories: (state): string[] =>
      [...new Set(state.catalog.map((s) => s.category).filter((c): c is string => !!c))].sort(),

    /** Distinct tags present in the catalog (sorted). */
    catalogTags: (state): string[] =>
      [...new Set(state.catalog.flatMap((s) => s.tags))].sort(),

    /** Distinct parameter types present across catalog steps (sorted). */
    catalogParameterTypes: (state): string[] =>
      [...new Set(state.catalog.flatMap((s) => s.parameters.map((p) => p.type)))].sort(),

    /** Distinct precision levels present in the catalog. */
    catalogPrecisions: (state): string[] =>
      [...new Set(state.catalog.map((s) => s.precision))].sort(),
  },

  actions: {
    /**
     * Generate (or refresh) the native structured step catalog. Stores the rich
     * catalog for the UI and mirrors it into `steps` (adapted StepDefinition[])
     * so the existing scenario/Gherkin flow keeps working unchanged.
     */
    async generateCatalog(options?: GenerateCatalogOptions) {
      this.isLoading = true
      this.error = null
      try {
        const result = await window.api.stepCatalog.generate(options)
        this.applyCatalog(result.steps, result.diagnostics, result.generatedAt)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to generate step catalog'
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Load steps for the active workspace: use the cached catalog if present,
     * otherwise generate it.
     */
    async ensureStepsLoaded() {
      await this.loadCatalogCached()
      if (this.catalog.length > 0) return
      await this.generateCatalog()
    },

    /** Load a previously generated catalog from the main process, if any. */
    async loadCatalogCached() {
      try {
        const result = await window.api.stepCatalog.getCached()
        if (result) {
          this.applyCatalog(result.steps, result.diagnostics, result.generatedAt)
        }
      } catch {
        // Ignore cache errors
      }
    },

    applyCatalog(catalog: CatalogStep[], diagnostics: CatalogDiagnostic[], generatedAt: string) {
      this.catalog = catalog
      this.catalogDiagnostics = diagnostics
      this.catalogGeneratedAt = generatedAt
      this.steps = catalog.map(catalogStepToStepDefinition)
      this.exportedAt = generatedAt
    },

    clearSteps() {
      this.steps = []
      this.exportedAt = null
      this.catalog = []
      this.catalogDiagnostics = []
      this.catalogGeneratedAt = null
    },
  },
})
