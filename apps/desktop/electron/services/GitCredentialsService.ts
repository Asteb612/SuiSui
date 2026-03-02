import { safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { GitCredentials } from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('GitCredentials')

const CREDENTIALS_FILE_NAME = 'git-credentials.enc'

function getCredentialsFilePath(): string {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE_NAME)
}

export class GitCredentialsService {
  async saveCredentials(credentials: GitCredentials): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system')
    }
    const json = JSON.stringify(credentials)
    const encrypted = safeStorage.encryptString(json)
    fs.writeFileSync(getCredentialsFilePath(), encrypted)
    logger.info('Git credentials saved')
  }

  async getCredentials(): Promise<GitCredentials | null> {
    const filePath = getCredentialsFilePath()
    try {
      if (!fs.existsSync(filePath)) return null
      const encrypted = fs.readFileSync(filePath)
      const json = safeStorage.decryptString(encrypted)
      return JSON.parse(json) as GitCredentials
    } catch {
      return null
    }
  }

  async deleteCredentials(): Promise<void> {
    const filePath = getCredentialsFilePath()
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // ignore
    }
    logger.info('Git credentials deleted')
  }
}

let instance: GitCredentialsService | null = null

export function getGitCredentialsService(): GitCredentialsService {
  if (!instance) instance = new GitCredentialsService()
  return instance
}

export function resetGitCredentialsService(): void {
  instance = null
}
