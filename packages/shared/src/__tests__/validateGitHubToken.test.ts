import { describe, it, expect } from 'vitest'
import { validateGitHubToken } from '../validation/gitToken'

describe('validateGitHubToken', () => {
  it('accepts empty string (token is optional)', () => {
    expect(validateGitHubToken('')).toEqual({ valid: true })
  })

  it('accepts whitespace-only as empty (optional)', () => {
    expect(validateGitHubToken('   ')).toEqual({ valid: true })
  })

  it('accepts classic PAT with ghp_ prefix', () => {
    expect(validateGitHubToken('ghp_abc123def456ghi789jkl012mno345pqr678')).toEqual({ valid: true })
  })

  it('accepts fine-grained PAT with github_pat_ prefix', () => {
    expect(validateGitHubToken('github_pat_11ABCDEF0abcdef1234567890')).toEqual({ valid: true })
  })

  it('rejects plain password', () => {
    const result = validateGitHubToken('mypassword123')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('GitHub Personal Access Token')
  })

  it('rejects OAuth token with gho_ prefix', () => {
    const result = validateGitHubToken('gho_abc123def456')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ghp_ or github_pat_')
  })

  it('trims whitespace before validation', () => {
    expect(validateGitHubToken('  ghp_abc123  ')).toEqual({ valid: true })
  })

  it('rejects random string', () => {
    const result = validateGitHubToken('not-a-token')
    expect(result.valid).toBe(false)
  })
})
