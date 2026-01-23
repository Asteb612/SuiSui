import { defineStore } from 'pinia'
import type { StepDefinition, DecoratorDefinition, StepKeyword } from '@suisui/shared'
import { GENERIC_STEPS } from '@suisui/shared'

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

    allStepsWithGeneric: (state) => {
      const genericStepDefs: StepDefinition[] = GENERIC_STEPS.map((gs) => ({
        id: gs.id,
        keyword: gs.keyword,
        pattern: gs.pattern,
        location: 'generic',
        args: gs.args,
        isGeneric: true,
      }))
      return [...state.steps, ...genericStepDefs]
    },

    stepsByKeyword:
      (state) =>
      (keyword: StepKeyword): StepDefinition[] => {
        const projectSteps = state.steps.filter((s) => s.keyword === keyword)
        const genericSteps = GENERIC_STEPS.filter((s) => s.keyword === keyword).map((gs) => ({
          id: gs.id,
          keyword: gs.keyword,
          pattern: gs.pattern,
          location: 'generic',
          args: gs.args,
          isGeneric: true,
        }))
        return [...projectSteps, ...genericSteps]
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
