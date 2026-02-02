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
  steps: ScenarioStep[]
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
  type: 'string' | 'int' | 'float' | 'any' | 'enum' | 'table'
}

export interface Feature {
  name: string
  description?: string
  background?: ScenarioStep[]
  scenarios: Scenario[]
}
