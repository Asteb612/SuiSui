import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createLogger } from '../../utils/logger'

const logger = createLogger('AICredentials')

const KEY_FILE_NAME = 'ai-key.enc'

/**
 * Stores a single AI API key encrypted at rest via Electron `safeStorage`,
 * modeled on GitCredentialsService. The key is read ONLY inside the main process
 * (by providers) and is NEVER exposed to the renderer (spec FR-002, FR-003).
 */
export class AICredentialsService {
  private keyFilePath: string

  constructor(customPath?: string) {
    this.keyFilePath = customPath ?? path.join(app.getPath('userData'), KEY_FILE_NAME)
  }

  async setKey(apiKey: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system')
    }
    const encrypted = safeStorage.encryptString(apiKey)
    const dir = path.dirname(this.keyFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.keyFilePath, encrypted)
    logger.info('AI API key saved')
  }

  /** Main-process only. Returns null if no key is stored or decryption fails. */
  async getKey(): Promise<string | null> {
    try {
      if (!fs.existsSync(this.keyFilePath)) return null
      const encrypted = fs.readFileSync(this.keyFilePath)
      const key = safeStorage.decryptString(encrypted)
      return key.length > 0 ? key : null
    } catch {
      return null
    }
  }

  async hasKey(): Promise<boolean> {
    return (await this.getKey()) !== null
  }

  async clearKey(): Promise<void> {
    try {
      if (fs.existsSync(this.keyFilePath)) {
        fs.unlinkSync(this.keyFilePath)
      }
    } catch {
      // ignore
    }
    logger.info('AI API key cleared')
  }
}

let instance: AICredentialsService | null = null

export function getAICredentialsService(): AICredentialsService {
  if (!instance) instance = new AICredentialsService()
  return instance
}

export function resetAICredentialsService(): void {
  instance = null
}
