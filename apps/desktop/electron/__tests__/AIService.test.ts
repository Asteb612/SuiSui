import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userdata') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString()),
  },
}))

import type { AppSettings, AIProviderConfig } from '@suisui/shared'
import { AIService } from '../services/ai/AIService'
import { FakeAIProvider } from '../services/ai/FakeAIProvider'
import type { SettingsService } from '../services/SettingsService'
import type { AICredentialsService } from '../services/ai/AICredentialsService'
import type { AIStreamRequest } from '../services/ai/IAIProvider'

function fakeSettings(initial: Partial<AppSettings> = {}): SettingsService {
  let state: Partial<AppSettings> = { ...initial }
  return {
    get: async () => state as AppSettings,
    save: async (updates: Partial<AppSettings>) => {
      state = { ...state, ...updates }
    },
  } as unknown as SettingsService
}

function fakeCreds(hasKey: boolean): AICredentialsService {
  return {
    hasKey: async () => hasKey,
    getKey: async () => (hasKey ? 'sk-test' : null),
    setKey: async () => {},
    clearKey: async () => {},
  } as unknown as AICredentialsService
}

const emptyRequest = (input = 'hi'): AIStreamRequest => ({
  kind: 'scenario',
  input,
  context: { steps: [], scenarioText: null, targetStep: null },
})

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const c of stream) out += c
  return out
}

describe('AIService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('streams deltas from the injected provider', async () => {
    const provider = new FakeAIProvider({ chunks: ['Feature: ', 'Login', '\n'] })
    const service = new AIService({ provider, settingsService: fakeSettings(), credentialsService: fakeCreds(false) })

    expect(await collect(service.stream(emptyRequest()))).toBe('Feature: Login\n')
    expect(provider.callHistory).toHaveLength(1)
  })

  it('reports config with hasApiKey derived from the credentials store', async () => {
    const config: AIProviderConfig = { type: 'openai-compatible', model: 'gpt', baseUrl: 'https://x/v1', hasApiKey: false }
    const service = new AIService({
      provider: new FakeAIProvider(),
      settingsService: fakeSettings({ aiProvider: config }),
      credentialsService: fakeCreds(true),
    })

    const result = await service.getConfig()
    expect(result.type).toBe('openai-compatible')
    expect(result.hasApiKey).toBe(true)
  })

  it('does not persist a secret in the config', async () => {
    const settings = fakeSettings()
    const service = new AIService({ provider: new FakeAIProvider(), settingsService: settings, credentialsService: fakeCreds(true) })
    await service.setConfig({ type: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', hasApiKey: false })

    const saved = (await settings.get()).aiProvider!
    expect(saved.type).toBe('ollama')
    expect(saved).not.toHaveProperty('apiKey')
    // hasApiKey is derived, not user-supplied
    expect(saved.hasApiKey).toBe(true)
  })

  it('aborts the stream when the signal fires', async () => {
    const provider = new FakeAIProvider({ chunks: ['a', 'b', 'c'] })
    const service = new AIService({ provider, settingsService: fakeSettings(), credentialsService: fakeCreds(false) })
    const controller = new AbortController()
    controller.abort()

    await expect(collect(service.stream({ ...emptyRequest(), signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('throws when no provider is configured and none injected', async () => {
    const service = new AIService({ settingsService: fakeSettings(), credentialsService: fakeCreds(false) })
    await expect(collect(service.stream(emptyRequest()))).rejects.toThrow('No AI provider configured')
  })

  it('reports not-configured status when unconfigured', async () => {
    const service = new AIService({ settingsService: fakeSettings(), credentialsService: fakeCreds(false) })
    const status = await service.status()
    expect(status.available).toBe(false)
  })

  it('status(target) probes a provider WITHOUT persisting config (FR-021)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'llama3.2' }] }) })
    vi.stubGlobal('fetch', fetchMock)
    const configured: AIProviderConfig = { type: 'claude-subscription', model: null, baseUrl: null, hasApiKey: false }
    const settings = fakeSettings({ aiProvider: configured })
    const saveSpy = vi.spyOn(settings, 'save')
    const service = new AIService({ settingsService: settings, credentialsService: fakeCreds(false) })

    // Probe a DIFFERENT provider than the configured one.
    const status = await service.status({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434' })

    expect(status.available).toBe(true)
    expect(status.models).toEqual(['llama3.2'])
    // No config mutation: the persisted provider is still the configured one.
    expect(saveSpy).not.toHaveBeenCalled()
    expect((await settings.get()).aiProvider!.type).toBe('claude-subscription')
    vi.unstubAllGlobals()
  })
})
