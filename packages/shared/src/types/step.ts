export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But'

export interface StepArgDefinition {
  name: string
  type: 'string' | 'int' | 'float' | 'word' | 'any' | 'enum' | 'table'
  required: boolean
  enumValues?: string[]
  tableColumns?: string[]
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
