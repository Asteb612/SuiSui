// Types
export * from './types/workspace'
export * from './types/feature'
export * from './types/step'
export * from './types/validation'
export * from './types/runner'
export * from './types/gitWorkspace'
export * from './types/command'
export * from './types/settings'
export * from './types/node'
export * from './types/dependency'
export * from './types/ai'
export * from './types/step-catalog'
export * from './types/recorder'
export * from './recorder/locatorSelector'

// Catalog (backward-compat adapter added in US1)
export * from './catalog/adapter'

// Patterns
export * from './patterns/processor'
export type { PatternType, PatternSegment, FormattedPattern, ArgDescription } from '@suisui/step-regex'

// Validation
export * from './validation/gitToken'

// IPC
export * from './ipc/channels'
export * from './ipc/api'
