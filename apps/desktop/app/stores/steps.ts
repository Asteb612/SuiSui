import { defineStore } from 'pinia'
import type { StepDefinition, DecoratorDefinition, StepKeyword } from '@suisui/shared'

export const useStepsStore = defineStore('steps', {
  state: () => ({
    steps: [] as StepDefinition[],
    decorators: [] as DecoratorDefinition[],
    exportedAt: null as string | null,
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    givenSteps: (state) => state.steps.filter((s) => s.keyword === 'Given'),
    whenSteps: (state) => state.steps.filter((s) => s.keyword === 'When'),
    thenSteps: (state) => state.steps.filter((s) => s.keyword === 'Then'),

    // All steps are now real steps from the workspace (including generic steps from generic.steps.ts)
    allSteps: (state) => state.steps,

    stepsByKeyword:
      (state) =>
      (keyword: StepKeyword): StepDefinition[] => {
        return state.steps.filter((s) => s.keyword === keyword)
      },
  },

  actions: {
    async exportSteps() {
      this.isLoading = true
      this.error = null
      try {
        const result = await window.api.steps.export()
        this.steps = result.steps
        this.decorators = result.decorators
        this.exportedAt = result.exportedAt
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to export steps'
      } finally {
        this.isLoading = false
      }
    },

    async loadCached() {
      try {
        const cached = await window.api.steps.getCached()
        if (cached) {
          this.steps = cached.steps
          this.decorators = cached.decorators
          this.exportedAt = cached.exportedAt
        }
      } catch {
        // Ignore cache errors
      }
    },

    clearSteps() {
      this.steps = []
      this.decorators = []
      this.exportedAt = null
    },
  },
})
