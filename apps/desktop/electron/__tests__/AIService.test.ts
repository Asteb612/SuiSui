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
  kind: 'failure-explain',
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

  it('defaults reasoning effort to medium for a config that predates the field', async () => {
    // Persisted config with no `effort` (older schema).
    const config = { type: 'openai-codex-cli', model: null, baseUrl: null, hasApiKey: false } as AIProviderConfig
    const service = new AIService({
      provider: new FakeAIProvider(),
      settingsService: fakeSettings({ aiProvider: config }),
      credentialsService: fakeCreds(false),
    })

    expect((await service.getConfig()).effort).toBe('medium')
  })

  it('normalizes a bogus effort value to medium on save', async () => {
    const settings = fakeSettings()
    const service = new AIService({ provider: new FakeAIProvider(), settingsService: settings, credentialsService: fakeCreds(false) })
    await service.setConfig({ type: 'openai-codex-cli', model: null, baseUrl: null, hasApiKey: false, effort: 'ultra' as never })

    expect((await settings.get()).aiProvider!.effort).toBe('medium')
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


  it('step-match use case: prompt embeds the action, existing steps, and a NONE escape (FR-010)', async () => {
    const provider = new FakeAIProvider({ chunks: ['Given I am logged in as {string}'] })
    const service = new AIService({ provider, settingsService: fakeSettings(), credentialsService: fakeCreds(false) })

    await collect(
      service.stream({
        kind: 'step-match',
        input: 'sign in as an administrator',
        context: {
          steps: [{ keyword: 'Given', pattern: 'I am logged in as {string}' } as never],
          scenarioText: null,
          targetStep: null,
        },
      })
    )

    const builtPrompt = provider.callHistory[0]!.input
    expect(builtPrompt).toContain('I am logged in as {string}')
    expect(builtPrompt).toContain('sign in as an administrator')
    expect(builtPrompt).toContain('NONE')
  })

  it('arg-fill use case: prompt lists the parameters and scenario context (FR-011)', async () => {
    const provider = new FakeAIProvider({ chunks: ['{"username":"admin"}'] })
    const service = new AIService({ provider, settingsService: fakeSettings(), credentialsService: fakeCreds(false) })

    await collect(
      service.stream({
        kind: 'arg-fill',
        input: 'I log in as {string} with {string}',
        context: {
          steps: [],
          scenarioText: 'Feature: Auth\n  Scenario: admin login',
          targetStep: {
            id: 's1',
            keyword: 'When',
            pattern: 'I log in as {string} with {string}',
            location: '',
            args: [
              { name: 'username', type: 'string', required: true },
              { name: 'password', type: 'string', required: true },
            ],
          } as never,
        },
      })
    )

    const builtPrompt = provider.callHistory[0]!.input
    expect(builtPrompt).toContain('username')
    expect(builtPrompt).toContain('password')
    expect(builtPrompt).toContain('admin login')
    expect(builtPrompt.toUpperCase()).toContain('JSON')
  })

  it('failure-explain use case: prompt wraps the failed-test output and streams an explanation (FR-012)', async () => {
    const provider = new FakeAIProvider({ chunks: ['The locator ', 'timed out. ', 'Check the selector.'] })
    const service = new AIService({ provider, settingsService: fakeSettings(), credentialsService: fakeCreds(false) })

    const failureOutput = 'TimeoutError: locator.click: Timeout 30000ms exceeded\n  at login.feature:12'
    const explanation = await collect(
      service.stream({
        kind: 'failure-explain',
        input: failureOutput,
        context: { steps: [], scenarioText: null, targetStep: null },
      })
    )

    expect(explanation).toBe('The locator timed out. Check the selector.')
    const builtPrompt = provider.callHistory[0]!.input
    expect(builtPrompt).toContain(failureOutput)
    expect(builtPrompt.toLowerCase()).toContain('plain language')
  })

  it('failure-fix use case: prompt asks for a concrete fix and lists the available steps', async () => {
    const provider = new FakeAIProvider({ chunks: ['Quote the value: ', "with '<PASSWORD>'"] })
    const service = new AIService({ provider, settingsService: fakeSettings(), credentialsService: fakeCreds(false) })

    const failureOutput = "Missing step: When I fill '[data-testid=\"pw\"]' with <PASSWORD>"
    const suggestion = await collect(
      service.stream({
        kind: 'failure-fix',
        input: failureOutput,
        context: {
          steps: [{ keyword: 'When', pattern: 'I fill {string} with {string}' } as never],
          scenarioText: null,
          targetStep: null,
        },
      })
    )

    expect(suggestion).toBe("Quote the value: with '<PASSWORD>'")
    const builtPrompt = provider.callHistory[0]!.input
    expect(builtPrompt).toContain(failureOutput)
    expect(builtPrompt).toContain('I fill {string} with {string}')
    expect(builtPrompt.toLowerCase()).toContain('fix')
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

  it('setConfig rejects a non-http(s) base URL and never persists it', async () => {
    const settings = fakeSettings()
    const saveSpy = vi.spyOn(settings, 'save')
    const service = new AIService({ settingsService: settings, credentialsService: fakeCreds(false) })

    await expect(
      service.setConfig({ type: 'openai-compatible', model: 'x', baseUrl: 'file:///etc/passwd', hasApiKey: false })
    ).rejects.toThrow(/scheme/i)
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('setConfig accepts an http(s) base URL', async () => {
    const settings = fakeSettings()
    const service = new AIService({ settingsService: settings, credentialsService: fakeCreds(false) })
    await service.setConfig({ type: 'openai-compatible', model: 'x', baseUrl: 'https://api.example.com/v1', hasApiKey: false })
    expect((await settings.get()).aiProvider!.baseUrl).toBe('https://api.example.com/v1')
  })

  it('status(target) rejects a non-http(s) base URL before probing', async () => {
    const service = new AIService({ settingsService: fakeSettings(), credentialsService: fakeCreds(false) })
    await expect(service.status({ type: 'ollama', baseUrl: 'ftp://internal/api' })).rejects.toThrow(/scheme/i)
  })

  it('rejects an unknown/forward-incompatible persisted provider type with a clear error', async () => {
    const badConfig = { type: 'some-future-provider', model: null, baseUrl: null, hasApiKey: false } as unknown as AIProviderConfig
    const service = new AIService({ settingsService: fakeSettings({ aiProvider: badConfig }), credentialsService: fakeCreds(false) })
    await expect(collect(service.stream(emptyRequest()))).rejects.toThrow(/Unknown AI provider type/)
  })
})
