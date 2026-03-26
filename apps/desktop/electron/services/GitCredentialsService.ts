import { safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { GitCredentials } from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('GitCredentials')

const CREDENTIALS_FILE_NAME = 'credentials.enc'

function getCredentialsFilePath(workspacePath: string): string {
  return path.join(workspacePath, '.app', CREDENTIALS_FILE_NAME)
}

export class GitCredentialsService {
  async saveCredentials(workspacePath: string, credentials: GitCredentials): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system')
    }
    const json = JSON.stringify(credentials)
    const encrypted = safeStorage.encryptString(json)
    const filePath = getCredentialsFilePath(workspacePath)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, encrypted)
    logger.info('Git credentials saved', { workspacePath })
  }

  async getCredentials(workspacePath: string): Promise<GitCredentials | null> {
    const filePath = getCredentialsFilePath(workspacePath)
    try {
      if (!fs.existsSync(filePath)) return null
      const encrypted = fs.readFileSync(filePath)
      const json = safeStorage.decryptString(encrypted)
      const parsed = JSON.parse(json)
      if (!parsed.token) return null
      return parsed as GitCredentials
    } catch {
      return null
    }
  }

  async deleteCredentials(workspacePath: string): Promise<void> {
    const filePath = getCredentialsFilePath(workspacePath)
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // ignore
    }
    logger.info('Git credentials deleted', { workspacePath })
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
