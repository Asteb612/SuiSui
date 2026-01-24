export type StepKeyword = 'Given' | 'When' | 'Then'

export interface StepArgDefinition {
  name: string
  type: 'string' | 'int' | 'float' | 'any'
  required: boolean
}

export interface StepDefinition {
  id: string
  pattern: string
  keyword: StepKeyword
  location: string
  args: StepArgDefinition[]
  decorator?: string
  isGeneric?: boolean
}

export interface DecoratorDefinition {
  name: string
  description?: string
  location: string
  tags?: string[]
}

export interface StepExportResult {
  steps: StepDefinition[]
  decorators: DecoratorDefinition[]
  exportedAt: string
}
