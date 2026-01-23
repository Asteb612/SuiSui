import { defineStore } from 'pinia'
import type { Scenario, ScenarioStep, StepArg, ValidationResult, StepKeyword, StepArgDefinition } from '@suisui/shared'

function generateStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useScenarioStore = defineStore('scenario', {
  state: () => ({
    scenario: {
      name: '',
      steps: [],
    } as Scenario,
    validation: null as ValidationResult | null,
    isDirty: false,
    currentFeaturePath: null as string | null,
  }),

  getters: {
    hasSteps: (state) => state.scenario.steps.length > 0,
    isValid: (state) => state.validation?.isValid ?? true,
    errors: (state) => state.validation?.issues.filter((i) => i.severity === 'error') ?? [],
    warnings: (state) => state.validation?.issues.filter((i) => i.severity === 'warning') ?? [],
  },

  actions: {
    setName(name: string) {
      this.scenario.name = name
      this.isDirty = true
    },

    addStep(keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
      const step: ScenarioStep = {
        id: generateStepId(),
        keyword,
        pattern,
        args: args.map((arg) => ({ name: arg.name, type: arg.type, value: '' })),
      }
      this.scenario.steps.push(step)
      this.isDirty = true
    },

    updateStep(stepId: string, updates: Partial<ScenarioStep>) {
      const index = this.scenario.steps.findIndex((s) => s.id === stepId)
      if (index !== -1) {
        const existingStep = this.scenario.steps[index]!
        this.scenario.steps[index] = { ...existingStep, ...updates }
        this.isDirty = true
      }
    },

    updateStepArg(stepId: string, argName: string, value: string) {
      const step = this.scenario.steps.find((s) => s.id === stepId)
      if (step) {
        const arg = step.args.find((a) => a.name === argName)
        if (arg) {
          arg.value = value
          this.isDirty = true
        }
      }
    },

    removeStep(stepId: string) {
      const index = this.scenario.steps.findIndex((s) => s.id === stepId)
      if (index !== -1) {
        this.scenario.steps.splice(index, 1)
        this.isDirty = true
      }
    },

    moveStep(fromIndex: number, toIndex: number) {
      const step = this.scenario.steps.splice(fromIndex, 1)[0]
      if (step) {
        this.scenario.steps.splice(toIndex, 0, step)
        this.isDirty = true
      }
    },

    async validate() {
      try {
        this.validation = await window.api.validate.scenario(this.scenario)
      } catch {
        this.validation = {
          isValid: false,
          issues: [{ severity: 'error', message: 'Validation failed' }],
        }
      }
    },

    async save(featurePath: string) {
      const gherkin = this.toGherkin()
      await window.api.features.write(featurePath, gherkin)
      this.currentFeaturePath = featurePath
      this.isDirty = false
    },

    toGherkin(): string {
      const lines: string[] = []
      lines.push(`Feature: ${this.scenario.name || 'Untitled'}`)
      lines.push('')
      lines.push(`  Scenario: ${this.scenario.name || 'Untitled'}`)

      for (const step of this.scenario.steps) {
        let text = step.pattern
        for (const arg of step.args) {
          const placeholder = `{${arg.type}}`
          const value = arg.type === 'string' ? `"${arg.value}"` : arg.value
          text = text.replace(placeholder, value)
        }
        lines.push(`    ${step.keyword} ${text}`)
      }

      return lines.join('\n') + '\n'
    },

    async loadFromFeature(featurePath: string) {
      try {
        const content = await window.api.features.read(featurePath)
        this.parseGherkin(content)
        this.currentFeaturePath = featurePath
        this.isDirty = false
      } catch {
        this.clear()
      }
    },

    parseGherkin(content: string) {
      this.scenario = { name: '', steps: [] }

      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()

        if (trimmed.startsWith('Scenario:')) {
          this.scenario.name = trimmed.replace('Scenario:', '').trim()
        } else if (trimmed.startsWith('Given ') || trimmed.startsWith('When ') || trimmed.startsWith('Then ') || trimmed.startsWith('And ') || trimmed.startsWith('But ')) {
          const match = trimmed.match(/^(Given|When|Then|And|But)\s+(.*)$/)
          if (match) {
            const keyword = match[1] as StepKeyword
            const text = match[2] ?? ''

            const args: StepArg[] = []
            const stringMatches = text.match(/"([^"]*)"/g)
            if (stringMatches) {
              stringMatches.forEach((m, i) => {
                args.push({
                  name: `arg${i}`,
                  value: m.slice(1, -1),
                  type: 'string',
                })
              })
            }

            const pattern = text.replace(/"[^"]*"/g, '{string}').replace(/\d+/g, '{int}')

            this.scenario.steps.push({
              id: generateStepId(),
              keyword,
              pattern,
              args,
            })
          }
        }
      }
    },

    clear() {
      this.scenario = { name: '', steps: [] }
      this.validation = null
      this.isDirty = false
      this.currentFeaturePath = null
    },
  },
})
