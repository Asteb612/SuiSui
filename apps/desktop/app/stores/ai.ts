import { defineStore } from 'pinia'
import type { AIProviderConfig, AIProviderStatus, AIProviderType, AIGenerationKind, AIRequestContext, StepDefinition, ScenarioStep, ScenarioGenerationOutcome, DraftApplyMode } from '@suisui/shared'
import { DEFAULT_AI_PROVIDER_CONFIG, AUTO_DETECTABLE_PROVIDER_TYPES } from '@suisui/shared'
import { reconcileSuggestedStep } from '~/utils/aiMatch'
import { parseSuggestedArgs } from '~/utils/aiArgs'
import { parseScenarioResponse, selectStepsForPrompt } from '~/utils/aiScenario'

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
    /**
     * The outcome of the latest scenario generation (feature 012). Cleared at the
     * start of every generation so drafts never accumulate.
     */
    scenarioOutcome: null as ScenarioGenerationOutcome | null,
    /**
     * How an accepted draft is applied. Per-generation, never persisted —
     * `extend` is always the starting point so the non-destructive outcome is
     * the default one (FR-025).
     */
    applyMode: 'extend' as DraftApplyMode,
    /** Set when the tester cancels, so a late response cannot produce a draft. */
    scenarioCancelled: false,
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
     *
     * Ollama is probed at `ollamaBaseUrl` (the value currently in the settings field)
     * when provided, so a user-configured remote/custom Ollama host is detected instead
     * of always probing the localhost default.
     */
    async detectAll(opts: { ollamaBaseUrl?: string | null } = {}) {
      this.isDetecting = true
      try {
        await Promise.all(
          AUTO_DETECTABLE_PROVIDER_TYPES.map((t) =>
            this.detect(t, t === 'ollama' ? (opts.ollamaBaseUrl ?? this.config.baseUrl) : undefined)
          )
        )
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

      // Strip Vue reactivity so the context is structured-cloneable across IPC
      // (a Pinia/reactive proxy throws "object could not be cloned" on `invoke`).
      const plainContext: AIRequestContext = JSON.parse(JSON.stringify(context))

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

        window.api.ai.start({ requestId, kind, input, context: plainContext }).catch((err: unknown) => {
          this.error = err instanceof Error ? err.message : String(err)
          cleanup()
          resolve({ text: this.streamingDraft, finishReason: null, error: this.error })
        })
      })
    },

    /**
     * Suggest the best-matching existing step for a natural-language action (spec FR-010).
     * Streams a step-match generation, then reconciles the reply against the real steps.
     * Returns the matched `StepDefinition`, or `null` when the model finds no good match.
     */
    async suggestStep(input: string, steps: StepDefinition[]): Promise<StepDefinition | null> {
      const context: AIRequestContext = { steps, scenarioText: null, targetStep: null }
      const result = await this.generate('step-match', input, context)
      if (result.error) return null
      return reconcileSuggestedStep(result.text, steps)
    },

    /**
     * Suggest values for a parameterized step's arguments from scenario context (spec FR-011).
     * Returns a `paramName -> value` map (only real params, empty on failure); the caller
     * populates the editable arg fields so the user reviews/edits before commit.
     */
    async autoFillArgs(step: ScenarioStep, scenarioText: string | null): Promise<Record<string, string>> {
      const targetStep: StepDefinition = {
        id: step.id,
        pattern: step.pattern,
        keyword: step.keyword,
        location: '',
        args: step.args.map((a) => ({ name: a.name, type: a.type, required: true, enumValues: a.enumValues })),
      }
      const context: AIRequestContext = { steps: [], scenarioText, targetStep }
      const result = await this.generate('arg-fill', step.pattern, context)
      if (result.error) return {}
      return parseSuggestedArgs(result.text, step.args.map((a) => a.name))
    },

    /**
     * Generate a scenario draft from a description, using ONLY the given steps
     * (feature 012, US1).
     *
     * The renderer decides which steps are sent and in what order — project
     * steps first, capped to a budget — because it holds the catalog the step
     * picker already uses. The response is resolved back against that same list,
     * so a step the model names but which does not exist cannot survive.
     *
     * Always leaves `scenarioOutcome` set to one of drafted / empty / failed,
     * unless the tester cancelled.
     */
    async generateScenario(
      input: string,
      steps: StepDefinition[],
      options: { scenarioText?: string | null; requirementRef?: string | null } = {},
    ): Promise<ScenarioGenerationOutcome | null> {
      this.scenarioOutcome = null
      this.scenarioCancelled = false

      const { steps: selected, truncated } = selectStepsForPrompt(steps, input)

      const context: AIRequestContext = {
        steps: selected,
        scenarioText: options.scenarioText ?? null,
        targetStep: null,
        requirementRef: options.requirementRef ?? null,
      }

      const result = await this.generate('scenario-generate', input, context)

      // A cancelled generation produces no draft, whatever arrived late.
      if (this.scenarioCancelled) return null

      const outcome: ScenarioGenerationOutcome = result.error
        ? { status: 'failed', message: result.error }
        : parseScenarioResponse(result.text, selected)

      // Truncation is surfaced to the tester so an unexpectedly missing step is
      // explained rather than mysterious (FR-022).
      if (outcome.status === 'drafted') outcome.truncated = truncated

      this.scenarioOutcome = outcome
      return outcome
    },

    /** Cancel an in-flight scenario generation; leaves the scenario untouched. */
    cancelScenarioGeneration() {
      this.scenarioCancelled = true
      this.scenarioOutcome = null
      this.cancel()
    },

    /** Discard the current draft without applying it (FR-013). */
    clearScenarioOutcome() {
      this.scenarioOutcome = null
    },

    cancel() {
      if (this.currentRequestId) {
        void window.api.ai.cancel(this.currentRequestId)
      }
    },
  },
})
