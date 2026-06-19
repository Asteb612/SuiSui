import { defineStore } from 'pinia'
import type { AIProviderConfig, AIProviderStatus, AIProviderType, AIGenerationKind, AIRequestContext } from '@suisui/shared'
import { DEFAULT_AI_PROVIDER_CONFIG, AUTO_DETECTABLE_PROVIDER_TYPES } from '@suisui/shared'

export interface GenerateResult {
  text: string
  finishReason: string | null
  error: string | null
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    config: { ...DEFAULT_AI_PROVIDER_CONFIG } as AIProviderConfig,
    status: null as AIProviderStatus | null,
    /** Per-provider detection results for the settings page (spec FR-020/FR-021). */
    detection: {} as Partial<Record<AIProviderType, AIProviderStatus>>,
    isDetecting: false,
    streamingDraft: '',
    isStreaming: false,
    isCheckingStatus: false,
    error: null as string | null,
    currentRequestId: null as string | null,
  }),

  getters: {
    /** Whether AI features should be enabled in the UI (spec FR-014). */
    isConfigured: (state) => state.config.type !== null,

    /**
     * Whether a provider type is selectable in the settings UI (spec FR-020).
     * Auto-detectable providers (Ollama / Codex CLI / Claude CLI) are selectable
     * only when detection reports them available; the BYOK `openai-compatible`
     * provider is exempt (always selectable, verified on save).
     */
    isSelectable: (state) => (type: AIProviderType): boolean => {
      if (!AUTO_DETECTABLE_PROVIDER_TYPES.includes(type)) return true
      return state.detection[type]?.available ?? false
    },
  },

  actions: {
    async loadConfig() {
      try {
        this.config = await window.api.ai.getConfig()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load AI config'
      }
    },

    async saveConfig(config: AIProviderConfig) {
      await window.api.ai.setConfig(config)
      this.config = await window.api.ai.getConfig()
    },

    async setKey(apiKey: string) {
      await window.api.ai.setKey(apiKey)
      await this.loadConfig()
    },

    async clearKey() {
      await window.api.ai.clearKey()
      await this.loadConfig()
    },

    async refreshStatus() {
      this.isCheckingStatus = true
      this.error = null
      try {
        this.status = await window.api.ai.status()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to check AI status'
        this.status = { available: false, reason: this.error, models: null, detail: null }
      } finally {
        this.isCheckingStatus = false
      }
    },

    /**
     * Detect a single provider WITHOUT persisting any config change (spec FR-021),
     * storing the result under `detection[type]`. Used to gate selection in the UI.
     */
    async detect(type: AIProviderType, baseUrl?: string | null) {
      try {
        this.detection[type] = await window.api.ai.status({ type, baseUrl })
      } catch (err) {
        this.detection[type] = {
          available: false,
          reason: err instanceof Error ? err.message : 'Detection failed',
          models: null,
          detail: null,
        }
      }
    },

    /**
     * Detect all auto-detectable providers (run when the settings page opens, plus
     * on manual re-detect). No background polling (spec FR-021). The BYOK provider is
     * not probed here — it is always selectable and verified on save.
     */
    async detectAll() {
      this.isDetecting = true
      try {
        await Promise.all(AUTO_DETECTABLE_PROVIDER_TYPES.map((t) => this.detect(t)))
      } finally {
        this.isDetecting = false
      }
    },

    /**
     * Stream a generation. Accumulates deltas into `streamingDraft` and resolves
     * when the stream finishes (or errors). Correctness of any draft is enforced
     * by the caller via validation before acceptance (spec FR-008/FR-013).
     */
    async generate(kind: AIGenerationKind, input: string, context: AIRequestContext): Promise<GenerateResult> {
      const requestId = crypto.randomUUID()
      this.currentRequestId = requestId
      this.streamingDraft = ''
      this.isStreaming = true
      this.error = null

      return new Promise<GenerateResult>((resolve) => {
        const offChunk = window.api.ai.onChunk((chunk) => {
          if (chunk.requestId === requestId) this.streamingDraft += chunk.delta
        })
        const offDone = window.api.ai.onDone((done) => {
          if (done.requestId !== requestId) return
          cleanup()
          resolve({ text: this.streamingDraft, finishReason: done.finishReason, error: null })
        })
        const offError = window.api.ai.onError((err) => {
          if (err.requestId !== requestId) return
          this.error = err.message
          cleanup()
          resolve({ text: this.streamingDraft, finishReason: null, error: err.message })
        })
        const cleanup = () => {
          offChunk()
          offDone()
          offError()
          this.isStreaming = false
          this.currentRequestId = null
        }

        window.api.ai.start({ requestId, kind, input, context }).catch((err: unknown) => {
          this.error = err instanceof Error ? err.message : String(err)
          cleanup()
          resolve({ text: this.streamingDraft, finishReason: null, error: this.error })
        })
      })
    },

    cancel() {
      if (this.currentRequestId) {
        void window.api.ai.cancel(this.currentRequestId)
      }
    },
  },
})
