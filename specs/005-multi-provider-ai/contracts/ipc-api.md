# Contract: IPC channels & `ElectronAPI` additions

**Feature**: 005-multi-provider-ai

All five IPC touchpoints must be updated together (Constitution Principle II + IPC Change Checklist), then the shared package rebuilt.

## New channels — `packages/shared/src/ipc/channels.ts`

```ts
// AI config & credentials (request/response — invoke)
AI_CONFIG_GET: 'ai:configGet',          // () => AIProviderConfig
AI_CONFIG_SET: 'ai:configSet',          // (config: AIProviderConfig) => void
AI_KEY_SET:    'ai:keySet',             // (apiKey: string) => void           (key never returned)
AI_KEY_CLEAR:  'ai:keyClear',           // () => void
AI_STATUS:     'ai:status',             // () => AIProviderStatus             (detect / test connection)

// AI generation (streaming)
AI_START:      'ai:start',              // (req: AIGenerationRequest) => { accepted: true }
AI_CANCEL:     'ai:cancel',             // (requestId: string) => void

// Main → renderer stream events (webContents.send)
AI_CHUNK:      'ai:chunk',              // AIStreamChunk
AI_DONE:       'ai:done',               // AIStreamDone
AI_ERROR:      'ai:error',              // AIStreamError
```

## `ElectronAPI` additions — `packages/shared/src/ipc/api.ts`

```ts
ai: {
  // config / credentials / status (invoke)
  getConfig(): Promise<AIProviderConfig>
  setConfig(config: AIProviderConfig): Promise<void>
  setKey(apiKey: string): Promise<void>      // write-only; key never read back to renderer
  clearKey(): Promise<void>
  status(): Promise<AIProviderStatus>

  // streaming generation
  start(req: AIGenerationRequest): Promise<{ accepted: true }>
  cancel(requestId: string): Promise<void>

  // subscriptions (return an unsubscribe fn — call on onUnmounted)
  onChunk(cb: (chunk: AIStreamChunk) => void): () => void
  onDone(cb: (done: AIStreamDone) => void): () => void
  onError(cb: (err: AIStreamError) => void): () => void
}
```

## Handler registration — `apps/desktop/electron/ipc/handlers.ts`

- `AI_*` invoke handlers delegate to `getAIService()` / `getAICredentialsService()`.
- `AI_START` records an `AbortController` in a `Map<requestId, AbortController>`, returns `{ accepted: true }` immediately, then drives `getAIService().stream(req)` asynchronously, calling `webContents.send(AI_CHUNK | AI_DONE | AI_ERROR, ...)`. Coalesce chunks (~16–50ms). Guard `webContents.isDestroyed()`. Delete the controller in `finally`.
- `AI_CANCEL` looks up the controller and calls `.abort()`.
- **Test mode** (`isTestMode`): register handlers backed by `FakeAIProvider` / no-op credentials, exactly as the existing `GIT_CRED_*` handlers do — never touch a real model/CLI.

## Preload — `apps/desktop/electron/preload.ts`

- `invoke`-based methods wrap `ipcRenderer.invoke(IPC_CHANNELS.AI_*)`.
- `onChunk`/`onDone`/`onError` register an `ipcRenderer.on` listener that strips the Electron `event` arg and **return an unsubscribe function** (`removeListener`) — prevents the listener-leak footgun.

## Contract rules

- **C1**: `setKey` is write-only; no channel ever returns a secret to the renderer (FR-002).
- **C2**: With `config.type === null`, the renderer disables AI entry points; `status()` reflects "not configured" (FR-014).
- **C3**: Streaming uses the event-channel pattern, not `invoke`, so intermediate tokens can be emitted (FR-018); each stream is correlated by `requestId`.
- **C4**: After editing the shared package, run `pnpm --filter @suisui/shared build` before typecheck/test (Shared Package Rebuild Rule).
