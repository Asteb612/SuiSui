/**
 * Single source of truth for the env vars that would redirect a subscription CLI to
 * per-token API billing instead of the user's subscription (spec FR-006, epic #59).
 *
 * The providers spawn their CLIs with a sanitized env (see `buildSanitizedEnv` /
 * `buildSanitizedCodexEnv`). But the Claude path goes through the Agent SDK, which
 * manages its OWN subprocess and may inherit `process.env` — so we ALSO strip these
 * keys from the main-process env at startup (`stripBillingEnv`). The app never uses
 * them itself (BYOK keys live in `safeStorage`), so removing them is safe and closes
 * the gap regardless of the SDK's internal env handling.
 */

/** Redirects the `claude` CLI / Agent SDK to API billing instead of the subscription. */
export const CLAUDE_BILLING_ENV_KEYS: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]

/**
 * Redirects the `codex` CLI to API billing instead of the subscription.
 * - `OPENAI_API_KEY`: auto-discovered and silently billed.
 * - `CODEX_API_KEY`: the documented way to FORCE api-key billing for `codex exec`.
 */
export const CODEX_BILLING_ENV_KEYS: readonly string[] = ['OPENAI_API_KEY', 'CODEX_API_KEY']

/** Union of every billing-redirecting key across all subscription providers. */
export const ALL_BILLING_ENV_KEYS: readonly string[] = [
  ...new Set<string>([...CLAUDE_BILLING_ENV_KEYS, ...CODEX_BILLING_ENV_KEYS]),
]

/**
 * Remove every API-billing env var from `env` in place. Called once at main-process
 * startup so no descendant process (including the Agent SDK's self-managed `claude`
 * subprocess) can silently bill the user's API account (spec FR-006).
 */
export function stripBillingEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of ALL_BILLING_ENV_KEYS) {
    delete env[key]
  }
}
