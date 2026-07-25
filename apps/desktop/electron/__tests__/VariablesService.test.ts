import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', '')),
  },
  app: { getPath: vi.fn(() => os.tmpdir()) },
}))

import { VariablesService } from '../services/VariablesService'

describe('VariablesService', () => {
  let file: string
  let svc: VariablesService

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vars-')), 'variables.enc')
    svc = new VariablesService(file)
  })

  it('round-trips variables and encrypts them at rest', () => {
    const vars = [
      { name: 'PASSWORD', value: 'secret123', secret: true },
      { name: 'USER', value: 'a@b.com', secret: false },
    ]
    svc.setAll(vars)
    expect(svc.getAll()).toEqual(vars)
    // stored file is encrypted (mock prefixes with "enc:")
    expect(fs.readFileSync(file).toString().startsWith('enc:')).toBe(true)
  })

  it('resolveEnv returns a name → value map for the run environment', () => {
    svc.setAll([
      { name: 'PASSWORD', value: 's3cret', secret: true },
      { name: 'BASE_PATH', value: '/app', secret: false },
    ])
    expect(svc.resolveEnv()).toEqual({ PASSWORD: 's3cret', BASE_PATH: '/app' })
  })

  it('trims names and drops nameless/malformed entries', () => {
    svc.setAll([
      { name: '   ', value: 'x', secret: false },
      { name: ' PW ', value: 'y', secret: true },
    ])
    expect(svc.getAll()).toEqual([{ name: 'PW', value: 'y', secret: true }])
  })

  it('returns [] when no variables file exists', () => {
    const missing = new VariablesService(path.join(os.tmpdir(), `vars-none-${process.pid}`, 'variables.enc'))
    expect(missing.getAll()).toEqual([])
    expect(missing.resolveEnv()).toEqual({})
  })
})
