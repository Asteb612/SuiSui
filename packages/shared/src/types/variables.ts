/**
 * A named value available to every feature file at run time. The runner injects
 * these as environment variables, so a `${NAME}` reference in a scenario (e.g. a
 * recorded secret) resolves to the variable's value during a test run.
 *
 * Defined in the Settings panel; secret values are encrypted at rest.
 */
export interface WorkspaceVariable {
  /** The variable name, used as `${NAME}` in feature files (and as the env var). */
  name: string
  /** The value the reference resolves to at run time. */
  value: string
  /** Secret values are encrypted on disk and shown masked in the UI. */
  secret: boolean
}
