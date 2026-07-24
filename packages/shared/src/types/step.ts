import type { StepArgDefinition } from '@suisui/step-regex'

export type { StepArgDefinition } from '@suisui/step-regex'

export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But'

export interface StepDefinition {
  id: string
  pattern: string
  keyword: StepKeyword
  location: string
  args: StepArgDefinition[]
  decorator?: string
  isGeneric?: boolean
}
