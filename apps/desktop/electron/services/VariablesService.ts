import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { WorkspaceVariable } from '@suisui/shared'
import { createLogger } from '../utils/logger'

const logger = createLogger('VariablesService')
const FILE_NAME = 'variables.enc'

/**
 * Global user-defined variables/secrets, available to every feature file. Stored
 * encrypted at rest (Electron `safeStorage`, like git/AI credentials) in the app's
 * userData dir, and injected into the test-run environment so `${NAME}` references
 * resolve. Secret values are the user's own test fixtures — returned to the
 * renderer for editing (unlike the AI provider key), but never written to a
 * .feature file.
 */
export class VariablesService {
  constructor(private readonly customPath?: string) {}

  private filePath(): string {
    return this.customPath ?? path.join(app.getPath('userData'), FILE_NAME)
  }

  getAll(): WorkspaceVariable[] {
    // Never throw — this runs in the runner hot path; a read failure just means
    // "no variables".
    try {
      const fp = this.filePath()
      if (!fs.existsSync(fp)) return []
      const buf = fs.readFileSync(fp)
      let json: string
      try {
        json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8')
      } catch {
        json = buf.toString('utf-8') // written as plaintext when encryption was unavailable
      }
      const parsed: unknown = JSON.parse(json)
      return Array.isArray(parsed) ? parsed.filter(isVariable) : []
    } catch (err) {
      logger.warn('Failed to read variables', { error: (err as Error).message })
      return []
    }
  }

  setAll(vars: WorkspaceVariable[]): void {
    // Keep only well-formed, named entries; trim names.
    const clean = vars
      .filter(isVariable)
      .map((v) => ({ name: v.name.trim(), value: v.value, secret: v.secret }))
      .filter((v) => v.name.length > 0)
    const json = JSON.stringify(clean)
    let data: Buffer
    try {
      data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf-8')
    } catch (err) {
      logger.warn('Encryption unavailable; storing variables as plaintext', { error: (err as Error).message })
      data = Buffer.from(json, 'utf-8')
    }
    const fp = this.filePath()
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, data)
  }

  /** name → value map, injected into the test-run env so `${NAME}` resolves. */
  resolveEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    for (const v of this.getAll()) {
      const name = v.name.trim()
      if (name) env[name] = v.value
    }
    return env
  }
}

function isVariable(v: unknown): v is WorkspaceVariable {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.name === 'string' && typeof r.value === 'string' && typeof r.secret === 'boolean'
}

let instance: VariablesService | null = null
export function getVariablesService(): VariablesService {
  if (!instance) instance = new VariablesService()
  return instance
}
export function resetVariablesService(): void {
  instance = null
}
