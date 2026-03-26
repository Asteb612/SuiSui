export interface TokenValidationResult {
  valid: boolean
  error?: string
}

export function validateGitHubToken(token: string): TokenValidationResult {
  const trimmed = token.trim()

  if (trimmed === '') {
    return { valid: true }
  }

  if (trimmed.startsWith('ghp_') || trimmed.startsWith('github_pat_')) {
    return { valid: true }
  }

  return {
    valid: false,
    error: 'Token must be a GitHub Personal Access Token (starts with ghp_ or github_pat_)',
  }
}
