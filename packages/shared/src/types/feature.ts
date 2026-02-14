export interface FeatureFile {
  path: string
  name: string
  relativePath: string
  content?: string
}

export interface FeatureTreeNode {
  type: 'folder' | 'file'
  name: string
  relativePath: string
  children?: FeatureTreeNode[] // For folders
  feature?: FeatureFile // For files
}

export interface Scenario {
  name: string
  tags?: string[]
  steps: ScenarioStep[]
  /** Examples table for Scenario Outline - when present, this is a Scenario Outline */
  examples?: ExampleTable
}

export interface ExampleTable {
  columns: string[]
  rows: ExampleRow[]
}

export interface ExampleRow {
  [column: string]: string
}

export interface ScenarioStep {
  id: string
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But'
  pattern: string
  args: StepArg[]
}

export interface StepArg {
  name: string
  value: string
  type: 'string' | 'int' | 'float' | 'word' | 'any' | 'enum' | 'table'
  enumValues?: string[]
  tableColumns?: string[]
}

export interface Feature {
  name: string
  description?: string
  tags?: string[]
  background?: ScenarioStep[]
  scenarios: Scenario[]
}
