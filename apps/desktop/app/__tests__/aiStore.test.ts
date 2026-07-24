import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAiStore } from '../stores/ai'
import type { AIProviderStatus, AIStatusTarget } from '@suisui/shared'

// Mock window.api.ai — only the surface the store touches.
const statusMock = vi.fn<(target?: AIStatusTarget) => Promise<AIProviderStatus>>()
const mockApi = {
  ai: {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    setKey: vi.fn(),
    clearKey: vi.fn(),
    status: statusMock,
  },
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: mockApi })
})

const ok: AIProviderStatus = { available: true, reason: null, models: null, detail: 'running' }
const down: AIProviderStatus = { available: false, reason: 'service not running', models: null, detail: 'installed-not-running' }

describe('ai store — detection gating (FR-020/FR-021)', () => {
  it('detectAll probes only the auto-detectable providers (BYOK not probed)', async () => {
    statusMock.mockResolvedValue(ok)
    const store = useAiStore()
    await store.detectAll()

    const probed = statusMock.mock.calls.map((c) => c[0]?.type)
    expect(probed).toContain('ollama')
    expect(probed).toContain('openai-codex-cli')
    expect(probed).toContain('claude-subscription')
    expect(probed).not.toContain('openai-compatible')
  })

  it('detectAll probes Ollama at the provided base URL (not just localhost)', async () => {
    statusMock.mockResolvedValue(ok)
    const store = useAiStore()
    await store.detectAll({ ollamaBaseUrl: 'http://10.0.0.5:11434' })

    const ollamaCall = statusMock.mock.calls.find((c) => c[0]?.type === 'ollama')
    expect(ollamaCall?.[0]?.baseUrl).toBe('http://10.0.0.5:11434')
  })

  it('isSelectable: auto-detectable providers gate on detection; BYOK is always selectable', async () => {
    statusMock.mockImplementation(async (target) =>
      target?.type === 'ollama' ? ok : down
    )
    const store = useAiStore()
    await store.detectAll()

    expect(store.isSelectable('ollama')).toBe(true) // detected
    expect(store.isSelectable('claude-subscription')).toBe(false) // undetected → disabled
    expect(store.isSelectable('openai-codex-cli')).toBe(false) // undetected → disabled
    expect(store.isSelectable('openai-compatible')).toBe(true) // BYOK exempt, even before any detection
  })

  it('a provider not yet detected is not selectable', () => {
    const store = useAiStore()
    expect(store.isSelectable('ollama')).toBe(false)
    expect(store.isSelectable('openai-compatible')).toBe(true)
  })

  it('detect records a failure status without throwing', async () => {
    statusMock.mockRejectedValueOnce(new Error('boom'))
    const store = useAiStore()
    await store.detect('ollama')
    expect(store.detection.ollama?.available).toBe(false)
    expect(store.detection.ollama?.reason).toBe('boom')
  })
})

describe('ai store — entry-point gating (FR-014 / SC-004)', () => {
  it('isConfigured is false by default (no provider) so all AI entry points stay disabled', () => {
    const store = useAiStore()
    // Every AI affordance (Generate/Suggest/Auto-fill/Explain) renders behind `isConfigured`.
    expect(store.config.type).toBeNull()
    expect(store.isConfigured).toBe(false)
  })

  it('isConfigured becomes true once a provider type is set', () => {
    const store = useAiStore()
    store.config = { type: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', hasApiKey: false }
    expect(store.isConfigured).toBe(true)
  })
})
