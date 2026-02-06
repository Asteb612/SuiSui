import type { StepArgDefinition } from '../types/step'

/**
 * Description of a pattern argument for display purposes
 */
export interface ArgDescription {
  /** Argument name (arg0, arg1, etc. for enums or the named/type name for expressions) */
  name: string
  /** Type of argument */
  type: 'enum' | 'string' | 'int' | 'float' | 'any' | 'table'
  /** Possible values for enums */
  enumValues?: string[]
  /** Column names for tables */
  tableColumns?: string[]
}

/**
 * A segment of a parsed step pattern for inline editing
 */
export interface PatternSegment {
  type: 'text' | 'arg'
  value: string
  arg?: {
    name: string
    type: string
    value: string
    enumValues?: string[]
    tableColumns?: string[]
  }
}

/**
 * Result of formatting a step pattern for display
 */
export interface FormattedPattern {
  /** HTML string with styled spans for pattern variables */
  html: string
  /** Plain text version without HTML tags */
  plainText: string
  /** Descriptions of arguments with their possible values */
  argDescriptions: ArgDescription[]
}

/**
 * Extensible pattern type interface.
 * Implement this to add a new pattern type to the processor.
 */
export interface PatternType {
  name: string
  /** Detection order — lower runs first (table before enum) */
  priority: number
  /** Regex to find occurrences in a pattern string */
  regex: RegExp
  /** Convert a regex match to a capture group regex string */
  toRegex(match: RegExpExecArray): string
  /** Resolve a match with an arg value for Gherkin output */
  resolve(match: RegExpExecArray, arg: { value: string; enumValues?: string[] }): string
  /** Create a StepArgDefinition from a match */
  toArgDef(match: RegExpExecArray, index: number): StepArgDefinition
  /** Format for display — returns HTML and plain text fragments */
  format(match: RegExpExecArray, argIndex: number): { html: string; plain: string; desc: ArgDescription }
  /** Specificity score for matching priority (higher = more specific) */
  specificity: number
}
