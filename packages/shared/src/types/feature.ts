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
  /**
   * Verbatim comment lines immediately preceding the scenario, INCLUDING the
   * leading `#` (feature 012, FR-029 → FR-031).
   *
   * Stored raw and never re-parsed, so any text — URLs, ticket titles — round
   * trips untouched and can never be reinterpreted as a step, tag, or
   * description. Only scenario-leading comments are modelled; comments
   * elsewhere in a feature file are still lost on save.
   */
  comments?: string[]
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
