import { defineStore } from 'pinia'
import type { Scenario, ScenarioStep, StepArg, ValidationResult, StepKeyword, StepArgDefinition } from '@suisui/shared'

function generateStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useScenarioStore = defineStore('scenario', {
  state: () => ({
    featureName: '' as string,
    background: [] as ScenarioStep[],
    scenarios: [] as Scenario[],
    activeScenarioIndex: 0 as number,
    validation: null as ValidationResult | null,
    isDirty: false,
    currentFeaturePath: null as string | null,
  }),

  getters: {
    scenario: (state): Scenario => {
      return state.scenarios[state.activeScenarioIndex] ?? { name: '', steps: [] }
    },
    scenarioCount: (state) => state.scenarios.length,
    hasSteps(): boolean {
      return this.scenario.steps.length > 0
    },
    isValid: (state) => state.validation?.isValid ?? true,
    errors: (state) => state.validation?.issues.filter((i) => i.severity === 'error') ?? [],
    warnings: (state) => state.validation?.issues.filter((i) => i.severity === 'warning') ?? [],
  },

  actions: {
    // Tab management actions
    setActiveScenario(index: number) {
      if (index >= 0 && index < this.scenarios.length) {
        this.activeScenarioIndex = index
        this.validation = null
      }
    },

    addScenario(name: string = 'New Scenario') {
      this.scenarios.push({ name, steps: [] })
      this.activeScenarioIndex = this.scenarios.length - 1
      this.isDirty = true
    },

    removeScenario(index: number) {
      if (this.scenarios.length > 1) {
        this.scenarios.splice(index, 1)
        if (this.activeScenarioIndex >= this.scenarios.length) {
          this.activeScenarioIndex = this.scenarios.length - 1
        }
        this.isDirty = true
      }
    },

    setFeatureName(name: string) {
      this.featureName = name
      this.isDirty = true
    },

    setName(name: string) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        current.name = name
        this.isDirty = true
      }
    },

    addStep(keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        const step: ScenarioStep = {
          id: generateStepId(),
          keyword,
          pattern,
          args: args.map((arg) => ({
            name: arg.name,
            type: arg.type,
            value: '',
            enumValues: arg.enumValues,
            tableColumns: arg.tableColumns,
          })),
        }
        current.steps.push(step)
        this.isDirty = true
      }
    },

    updateStep(stepId: string, updates: Partial<ScenarioStep>) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        const index = current.steps.findIndex((s) => s.id === stepId)
        if (index !== -1) {
          const existingStep = current.steps[index]!
          current.steps[index] = { ...existingStep, ...updates }
          this.isDirty = true
        }
      }
    },

    updateStepArg(stepId: string, argName: string, value: string) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        const step = current.steps.find((s) => s.id === stepId)
        if (step) {
          const arg = step.args.find((a) => a.name === argName)
          if (arg) {
            arg.value = value
            this.isDirty = true
          }
        }
      }
    },

    removeStep(stepId: string) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        const index = current.steps.findIndex((s) => s.id === stepId)
        if (index !== -1) {
          current.steps.splice(index, 1)
          this.isDirty = true
        }
      }
    },

    // Background step management
    addBackgroundStep(keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
      const step: ScenarioStep = {
        id: generateStepId(),
        keyword,
        pattern,
        args: args.map((arg) => ({
          name: arg.name,
          type: arg.type,
          value: '',
          enumValues: arg.enumValues,
          tableColumns: arg.tableColumns,
        })),
      }
      this.background.push(step)
      this.isDirty = true
    },

    removeBackgroundStep(stepId: string) {
      const index = this.background.findIndex((s) => s.id === stepId)
      if (index !== -1) {
        this.background.splice(index, 1)
        this.isDirty = true
      }
    },

    updateBackgroundStep(stepId: string, updates: Partial<ScenarioStep>) {
      const index = this.background.findIndex((s) => s.id === stepId)
      if (index !== -1) {
        const existingStep = this.background[index]!
        this.background[index] = { ...existingStep, ...updates }
        this.isDirty = true
      }
    },

    updateBackgroundStepArg(stepId: string, argName: string, value: string) {
      const step = this.background.find((s) => s.id === stepId)
      if (step) {
        const arg = step.args.find((a) => a.name === argName)
        if (arg) {
          arg.value = value
          this.isDirty = true
        }
      }
    },

    moveBackgroundStep(fromIndex: number, toIndex: number) {
      const step = this.background.splice(fromIndex, 1)[0]
      if (step) {
        this.background.splice(toIndex, 0, step)
        this.isDirty = true
      }
    },

    replaceBackgroundStep(stepId: string, keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
      const index = this.background.findIndex((s) => s.id === stepId)
      if (index !== -1) {
        const oldStep = this.background[index]!
        // Preserve argument values for matching names and types
        const newArgs = args.map((arg) => {
          const existingArg = oldStep.args.find((a) => a.name === arg.name && a.type === arg.type)
          return {
            name: arg.name,
            type: arg.type,
            value: existingArg?.value ?? '',
            enumValues: arg.enumValues,
            tableColumns: arg.tableColumns,
          }
        })

        this.background[index] = {
          id: oldStep.id,
          keyword,
          pattern,
          args: newArgs,
        }
        this.isDirty = true
      }
    },

    moveStep(fromIndex: number, toIndex: number) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        const step = current.steps.splice(fromIndex, 1)[0]
        if (step) {
          current.steps.splice(toIndex, 0, step)
          this.isDirty = true
        }
      }
    },

    async validate() {
      const current = this.scenarios[this.activeScenarioIndex]
      if (!current) return
      try {
        // Serialize the scenario to ensure it's cloneable for IPC
        const serializedScenario: Scenario = {
          name: current.name,
          steps: current.steps.map(step => ({
            id: step.id,
            keyword: step.keyword,
            pattern: step.pattern,
            args: step.args.map(arg => ({
              name: arg.name,
              type: arg.type,
              value: arg.value
            }))
          }))
        }
        
        this.validation = await window.api.validate.scenario(serializedScenario)
      } catch (error) {
        console.error('Validation failed:', error)
        let errorMessage = 'Validation service failed to respond'
        
        if (error instanceof Error) {
          errorMessage = `Validation error: ${error.message}`
        } else if (typeof error === 'string') {
          errorMessage = error
        }
        
        this.validation = {
          isValid: false,
          issues: [{ 
            severity: 'error', 
            message: errorMessage,
          }],
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
      lines.push(`Feature: ${this.featureName || 'Untitled'}`)
      lines.push('')

      // Add Background section if present
      if (this.background.length > 0) {
        lines.push('  Background:')
        for (const step of this.background) {
          let text = step.pattern
          for (const arg of step.args) {
            const placeholder = `{${arg.type}}`
            const value = arg.type === 'string' ? `"${arg.value}"` : arg.value
            text = text.replace(placeholder, value)
          }
          lines.push(`    ${step.keyword} ${text}`)
        }
        lines.push('')
      }

      for (const scenario of this.scenarios) {
        lines.push(`  Scenario: ${scenario.name || 'Untitled'}`)

        for (const step of scenario.steps) {
          let text = step.pattern
          for (const arg of step.args) {
            const placeholder = `{${arg.type}}`
            const value = arg.type === 'string' ? `"${arg.value}"` : arg.value
            text = text.replace(placeholder, value)
          }
          lines.push(`    ${step.keyword} ${text}`)
        }
        lines.push('')
      }

      return lines.join('\n')
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
      this.scenarios = []
      this.background = []
      this.featureName = ''
      let currentScenario: Scenario | null = null
      let parsingBackground = false

      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()

        if (trimmed.startsWith('Feature:')) {
          this.featureName = trimmed.replace('Feature:', '').trim()
        } else if (trimmed.startsWith('Background:')) {
          parsingBackground = true
        } else if (trimmed.startsWith('Scenario:')) {
          parsingBackground = false
          // Save previous scenario if exists
          if (currentScenario) {
            this.scenarios.push(currentScenario)
          }
          currentScenario = {
            name: trimmed.replace('Scenario:', '').trim(),
            steps: [],
          }
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

            const step: ScenarioStep = {
              id: generateStepId(),
              keyword,
              pattern,
              args,
            }

            if (parsingBackground) {
              this.background.push(step)
            } else if (currentScenario) {
              currentScenario.steps.push(step)
            }
          }
        }
      }

      // Push last scenario
      if (currentScenario) {
        this.scenarios.push(currentScenario)
      }

      // Ensure at least one scenario
      if (this.scenarios.length === 0) {
        this.scenarios.push({ name: '', steps: [] })
      }

      this.activeScenarioIndex = 0
    },

    clear() {
      this.featureName = ''
      this.background = []
      this.scenarios = []
      this.activeScenarioIndex = 0
      this.validation = null
      this.isDirty = false
      this.currentFeaturePath = null
    },

    createNew(name: string) {
      this.featureName = name
      this.background = []
      this.scenarios = [{ name, steps: [] }]
      this.activeScenarioIndex = 0
      this.validation = null
      this.isDirty = true
      this.currentFeaturePath = null
    },

    replaceStep(stepId: string, keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (!current) return

      const index = current.steps.findIndex((s) => s.id === stepId)
      if (index !== -1) {
        const oldStep = current.steps[index]!
        // Preserve argument values for matching names and types
        const newArgs = args.map((arg) => {
          const existingArg = oldStep.args.find((a) => a.name === arg.name && a.type === arg.type)
          return {
            name: arg.name,
            type: arg.type,
            value: existingArg?.value ?? '',
            enumValues: arg.enumValues,
            tableColumns: arg.tableColumns,
          }
        })

        current.steps[index] = {
          id: oldStep.id,
          keyword,
          pattern,
          args: newArgs,
        }
        this.isDirty = true
      }
    },
  },
})
