/**
 * Definition of a single step argument parsed from a step pattern.
 */
export interface StepArgDefinition {
  name: string
  type: 'string' | 'int' | 'float' | 'word' | 'any' | 'enum' | 'table'
  required: boolean
  enumValues?: string[]
  tableColumns?: string[]
}
