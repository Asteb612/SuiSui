import { defineStore } from 'pinia'
import type { Scenario, ScenarioStep, StepArg, ValidationResult, StepKeyword, StepArgDefinition, ExampleTable, ExampleRow, StepDefinition } from '@suisui/shared'
import { resolvePattern, findBestMatch } from '@suisui/shared'
import { toGherkinTable, parseTableValue, parseGherkinTable, stringifyTableValue } from '~/utils/tableUtils'

function generateStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useScenarioStore = defineStore('scenario', {
  state: () => ({
    featureName: '' as string,
    featureTags: [] as string[],
    featureDescription: '' as string,
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

    addScenario(name: string = 'New Scenario', isOutline: boolean = false) {
      const scenario: Scenario = { name, tags: [], steps: [] }
      if (isOutline) {
        scenario.examples = { columns: [], rows: [] }
      }
      this.scenarios.push(scenario)
      this.activeScenarioIndex = this.scenarios.length - 1
      this.isDirty = true
    },

    setFeatureTags(tags: string[]) {
      this.featureTags = tags
      this.isDirty = true
    },

    setFeatureDescription(description: string) {
      this.featureDescription = description
      this.isDirty = true
    },

    setScenarioTags(tags: string[]) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        current.tags = tags
        this.isDirty = true
      }
    },

    toggleScenarioOutline() {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        if (current.examples) {
          // Convert from outline to regular scenario
          delete current.examples
        } else {
          // Convert to outline
          current.examples = { columns: [], rows: [] }
        }
        this.isDirty = true
      }
    },

    setExamples(examples: ExampleTable) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        current.examples = examples
        this.isDirty = true
      }
    },

    addExampleColumn(column: string) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current?.examples) {
        current.examples.columns.push(column)
        // Add empty value for the new column in existing rows
        for (const row of current.examples.rows) {
          row[column] = ''
        }
        this.isDirty = true
      }
    },

    removeExampleColumn(column: string) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current?.examples) {
        const index = current.examples.columns.indexOf(column)
        if (index !== -1) {
          current.examples.columns.splice(index, 1)
          // Remove the column from all rows
          for (const row of current.examples.rows) {
            delete row[column]
          }
          this.isDirty = true
        }
      }
    },

    addExampleRow() {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current?.examples) {
        const row: ExampleRow = {}
        for (const col of current.examples.columns) {
          row[col] = ''
        }
        current.examples.rows.push(row)
        this.isDirty = true
      }
    },

    removeExampleRow(index: number) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current?.examples && index >= 0 && index < current.examples.rows.length) {
        current.examples.rows.splice(index, 1)
        this.isDirty = true
      }
    },

    updateExampleCell(rowIndex: number, column: string, value: string) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current?.examples && current.examples.rows[rowIndex]) {
        current.examples.rows[rowIndex][column] = value
        this.isDirty = true
      }
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

    updateStepArg(stepId: string, argName: string, value: string, argType?: StepArg['type'], enumValues?: string[]) {
      const current = this.scenarios[this.activeScenarioIndex]
      if (current) {
        const step = current.steps.find((s) => s.id === stepId)
        if (step) {
          const arg = step.args.find((a) => a.name === argName)
          if (arg) {
            arg.value = value
            this.isDirty = true
          } else {
            // Arg doesn't exist yet - create it (handles regex patterns without pre-defined args)
            const newArg: StepArg = {
              name: argName,
              type: argType || 'string',
              value,
            }
            if (enumValues) {
              newArg.enumValues = enumValues
            }
            step.args.push(newArg)
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

    insertStepAt(index: number, keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
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
        current.steps.splice(index, 0, step)
        this.isDirty = true
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

    insertBackgroundStepAt(index: number, keyword: StepKeyword, pattern: string, args: StepArgDefinition[]) {
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
      this.background.splice(index, 0, step)
      this.isDirty = true
    },

    moveBackgroundStep(fromIndex: number, toIndex: number) {
      const step = this.background.splice(fromIndex, 1)[0]
      if (step) {
        this.background.splice(toIndex, 0, step)
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

    updateBackgroundStepArg(stepId: string, argName: string, value: string, argType?: StepArg['type'], enumValues?: string[]) {
      const step = this.background.find((s) => s.id === stepId)
      if (step) {
        const arg = step.args.find((a) => a.name === argName)
        if (arg) {
          arg.value = value
          this.isDirty = true
        } else {
          // Arg doesn't exist yet - create it (handles regex patterns without pre-defined args)
          const newArg: StepArg = {
            name: argName,
            type: argType || 'string',
            value,
          }
          if (enumValues) {
            newArg.enumValues = enumValues
          }
          step.args.push(newArg)
          this.isDirty = true
        }
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
          })),
          examples: current.examples ? {
            columns: [...current.examples.columns],
            rows: current.examples.rows.map(row => ({ ...row })),
          } : undefined,
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

      // Feature tags
      if (this.featureTags.length > 0) {
        lines.push(this.featureTags.map(t => `@${t}`).join(' '))
      }

      lines.push(`Feature: ${this.featureName || 'Untitled'}`)

      // Feature description
      if (this.featureDescription) {
        lines.push('')
        for (const line of this.featureDescription.split('\n')) {
          lines.push(`  ${line}`)
        }
      }

      lines.push('')

      // Add Background section if present
      if (this.background.length > 0) {
        lines.push('  Background:')
        for (const step of this.background) {
          const text = resolvePattern(step.pattern, step.args)
          lines.push(`    ${step.keyword} ${text}`)
          // Output DataTable rows for table args
          for (const arg of step.args) {
            if (arg.type === 'table' && arg.value) {
              const rows = parseTableValue(arg.value)
              const columns = arg.tableColumns || []
              if (rows.length > 0 && columns.length > 0) {
                const tableStr = toGherkinTable(rows, columns)
                for (const tableLine of tableStr.split('\n')) {
                  lines.push(`      ${tableLine}`)
                }
              }
            }
          }
        }
        lines.push('')
      }

      for (const scenario of this.scenarios) {
        // Scenario tags
        if (scenario.tags && scenario.tags.length > 0) {
          lines.push('  ' + scenario.tags.map(t => `@${t}`).join(' '))
        }

        // Scenario or Scenario Outline
        const isOutline = scenario.examples && scenario.examples.columns.length > 0
        const keyword = isOutline ? 'Scenario Outline' : 'Scenario'
        lines.push(`  ${keyword}: ${scenario.name || 'Untitled'}`)

        for (const step of scenario.steps) {
          const text = resolvePattern(step.pattern, step.args)
          lines.push(`    ${step.keyword} ${text}`)
          // Output DataTable rows for table args
          for (const arg of step.args) {
            if (arg.type === 'table' && arg.value) {
              const rows = parseTableValue(arg.value)
              const columns = arg.tableColumns || []
              if (rows.length > 0 && columns.length > 0) {
                const tableStr = toGherkinTable(rows, columns)
                for (const tableLine of tableStr.split('\n')) {
                  lines.push(`      ${tableLine}`)
                }
              }
            }
          }
        }

        // Examples table for Scenario Outline
        if (isOutline && scenario.examples) {
          lines.push('')
          lines.push('    Examples:')

          // Calculate column widths for alignment
          const { columns, rows } = scenario.examples
          const widths = columns.map(col => {
            const values = [col, ...rows.map(row => row[col] || '')]
            return Math.max(...values.map(v => v.length))
          })

          // Header row
          const header = '      | ' + columns.map((col, i) => col.padEnd(widths[i] ?? 0)).join(' | ') + ' |'
          lines.push(header)

          // Data rows
          for (const row of rows) {
            const dataRow = '      | ' + columns.map((col, i) => (row[col] || '').padEnd(widths[i] ?? 0)).join(' | ') + ' |'
            lines.push(dataRow)
          }
        }

        lines.push('')
      }

      return lines.join('\n')
    },

    async loadFromFeature(featurePath: string, stepDefinitions: StepDefinition[] = []) {
      try {
        const content = await window.api.features.read(featurePath)
        this.parseGherkin(content, stepDefinitions)
        this.currentFeaturePath = featurePath
        this.isDirty = false
      } catch {
        this.clear()
      }
    },

    parseGherkin(content: string, stepDefinitions: StepDefinition[] = []) {
      this.scenarios = []
      this.background = []
      this.featureName = ''
      this.featureTags = []
      this.featureDescription = ''
      let currentScenario: Scenario | null = null
      let parsingBackground = false
      let parsingExamples = false
      let parsingDescription = false
      let pendingTags: string[] = []
      let descriptionLines: string[] = []
      let exampleColumns: string[] = []

      // DataTable tracking for step tables
      let lastStep: ScenarioStep | null = null
      let dataTableLines: string[] = []

      const flushDataTable = () => {
        if (lastStep && dataTableLines.length > 0) {
          const tableText = dataTableLines.join('\n')
          const { columns, rows } = parseGherkinTable(tableText)
          if (columns.length > 0 && rows.length > 0) {
            // Find existing table arg or create one
            const tableArg = lastStep.args.find(a => a.type === 'table')
            if (tableArg) {
              tableArg.value = stringifyTableValue(rows)
              if (!tableArg.tableColumns || tableArg.tableColumns.length === 0) {
                tableArg.tableColumns = columns
              }
            } else {
              lastStep.args.push({
                name: 'table',
                type: 'table',
                value: stringifyTableValue(rows),
                tableColumns: columns,
              })
            }
          }
          dataTableLines = []
        }
        lastStep = null
      }

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        const trimmed = line.trim()

        // Parse tags (lines starting with @)
        if (trimmed.startsWith('@')) {
          flushDataTable()
          const tags = trimmed.split(/\s+/).filter(t => t.startsWith('@')).map(t => t.slice(1))
          pendingTags.push(...tags)
          parsingDescription = false
          continue
        }

        if (trimmed.startsWith('Feature:')) {
          flushDataTable()
          this.featureName = trimmed.replace('Feature:', '').trim()
          this.featureTags = pendingTags
          pendingTags = []
          parsingDescription = true
          descriptionLines = []
        } else if (trimmed.startsWith('Background:')) {
          flushDataTable()
          // Save description if we were collecting it
          if (parsingDescription && descriptionLines.length > 0) {
            this.featureDescription = descriptionLines.join('\n').trim()
          }
          parsingDescription = false
          parsingBackground = true
          parsingExamples = false
        } else if (trimmed.startsWith('Scenario Outline:') || trimmed.startsWith('Scenario:')) {
          flushDataTable()
          // Save description if we were collecting it
          if (parsingDescription && descriptionLines.length > 0) {
            this.featureDescription = descriptionLines.join('\n').trim()
          }
          parsingDescription = false
          parsingBackground = false
          parsingExamples = false

          // Save previous scenario if exists
          if (currentScenario) {
            this.scenarios.push(currentScenario)
          }

          const isOutline = trimmed.startsWith('Scenario Outline:')
          const name = trimmed.replace(/Scenario Outline:|Scenario:/, '').trim()

          currentScenario = {
            name,
            tags: pendingTags.length > 0 ? [...pendingTags] : [],
            steps: [],
          }

          if (isOutline) {
            currentScenario.examples = { columns: [], rows: [] }
          }

          pendingTags = []
        } else if (trimmed.startsWith('Examples:')) {
          flushDataTable()
          parsingExamples = true
          exampleColumns = []
        } else if (trimmed.startsWith('|') && parsingExamples && currentScenario?.examples) {
          // Parse Examples table row
          const cells = trimmed.split('|').slice(1, -1).map(c => c.trim())

          if (exampleColumns.length === 0) {
            // First row is headers
            exampleColumns = cells
            currentScenario.examples.columns = cells
          } else {
            // Data rows
            const row: ExampleRow = {}
            cells.forEach((cell, idx) => {
              const col = exampleColumns[idx]
              if (col) {
                row[col] = cell
              }
            })
            currentScenario.examples.rows.push(row)
          }
        } else if (trimmed.startsWith('|') && !parsingExamples && lastStep) {
          // Accumulate step DataTable lines
          dataTableLines.push(trimmed)
        } else if (trimmed.startsWith('Given ') || trimmed.startsWith('When ') || trimmed.startsWith('Then ') || trimmed.startsWith('And ') || trimmed.startsWith('But ')) {
          flushDataTable()
          parsingExamples = false
          const match = trimmed.match(/^(Given|When|Then|And|But)\s+(.*)$/)
          if (match) {
            const keyword = match[1] as StepKeyword
            const text = match[2] ?? ''

            // Try to match against known step definitions
            const { pattern, args } = findBestMatch(text, keyword, stepDefinitions)

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

            lastStep = step
          }
        } else if (parsingDescription && trimmed !== '' && !trimmed.startsWith('#')) {
          // Collect description lines (between Feature: and Background:/Scenario:)
          descriptionLines.push(trimmed)
        }
      }

      // Flush any remaining DataTable
      flushDataTable()

      // Push last scenario
      if (currentScenario) {
        this.scenarios.push(currentScenario)
      }

      // Ensure at least one scenario
      if (this.scenarios.length === 0) {
        this.scenarios.push({ name: '', tags: [], steps: [] })
      }

      this.activeScenarioIndex = 0
    },

    clear() {
      this.featureName = ''
      this.featureTags = []
      this.featureDescription = ''
      this.background = []
      this.scenarios = []
      this.activeScenarioIndex = 0
      this.validation = null
      this.isDirty = false
      this.currentFeaturePath = null
    },

    createNew(name: string) {
      this.featureName = name
      this.featureTags = []
      this.featureDescription = ''
      this.background = []
      this.scenarios = [{ name, tags: [], steps: [] }]
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
