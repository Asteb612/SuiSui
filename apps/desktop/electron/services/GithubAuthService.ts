import { safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  DeviceFlowResponse,
  DeviceFlowPollResult,
  GithubUser,
  GithubRepo,
} from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('GithubAuth')

const TOKEN_FILE_NAME = 'github-token.enc'

function getTokenFilePath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE_NAME)
}

// GitHub OAuth App client ID for device flow
// Users can override via GITHUB_CLIENT_ID env var
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? 'Ov23liVKPHpMKQFSqbOx'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResponse = Record<string, any>

export class GithubAuthService {
  async saveToken(token: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system')
    }
    const encrypted = safeStorage.encryptString(token)
    fs.writeFileSync(getTokenFilePath(), encrypted)
    logger.info('GitHub token saved')
  }

  async getToken(): Promise<string | null> {
    const filePath = getTokenFilePath()
    try {
      if (!fs.existsSync(filePath)) return null
      const encrypted = fs.readFileSync(filePath)
      return safeStorage.decryptString(encrypted)
    } catch {
      return null
    }
  }

  async deleteToken(): Promise<void> {
    const filePath = getTokenFilePath()
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // ignore
    }
    logger.info('GitHub token deleted')
  }

  async validateToken(token: string): Promise<GithubUser> {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'SuiSui',
      },
    })

    if (!res.ok) {
      throw new Error(`Token validation failed: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as JsonResponse
    return {
      login: data.login,
      name: data.name ?? null,
      avatarUrl: data.avatar_url,
    }
  }

  async deviceFlowStart(): Promise<DeviceFlowResponse> {
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo',
      }),
    })

    if (!res.ok) {
      throw new Error(`Device flow start failed: ${res.status}`)
    }

    const data = (await res.json()) as JsonResponse
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
    }
  }

  async deviceFlowPoll(deviceCode: string): Promise<DeviceFlowPollResult> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    if (!res.ok) {
      return { status: 'error', error: `Poll failed: ${res.status}` }
    }

    const data = (await res.json()) as JsonResponse

    if (data.access_token) {
      return { status: 'success', accessToken: data.access_token }
    }

    if (data.error === 'authorization_pending') {
      return { status: 'pending' }
    }

    if (data.error === 'slow_down') {
      return { status: 'slow_down' }
    }

    if (data.error === 'expired_token') {
      return { status: 'expired' }
    }

    if (data.error === 'access_denied') {
      return { status: 'access_denied' }
    }

    return { status: 'error', error: data.error_description ?? data.error ?? 'Unknown error' }
  }

  async getUser(token: string): Promise<GithubUser> {
    return this.validateToken(token)
  }

  async listRepos(token: string): Promise<GithubRepo[]> {
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'SuiSui',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to list repos: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as JsonResponse[]
    return data.map((repo) => ({
      owner: (repo.owner as JsonResponse)?.login as string,
      name: repo.name as string,
      fullName: repo.full_name as string,
      cloneUrl: repo.clone_url as string,
      defaultBranch: repo.default_branch as string,
      private: repo.private as boolean,
    }))
  }
}

let instance: GithubAuthService | null = null

export function getGithubAuthService(): GithubAuthService {
  if (!instance) instance = new GithubAuthService()
  return instance
}

export function resetGithubAuthService(): void {
  instance = null
}
