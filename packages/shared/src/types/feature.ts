export interface FeatureFile {
  path: string
  name: string
  relativePath: string
  content?: string
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
  type: 'string' | 'int' | 'float' | 'any'
}

export interface Feature {
  name: string
  description?: string
  scenarios: Scenario[]
}
