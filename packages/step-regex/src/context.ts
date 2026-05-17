/**
 * A tiny per-scenario state bag. Create one context per scenario (e.g. via a
 * playwright-bdd fixture) and share it across steps — do NOT use a
 * module-global singleton (it is not parallel-worker safe).
 */
export interface ScenarioContext {
  set<T>(key: string, value: T): void
  get<T>(key: string): T | undefined
  /** Returns the stored value, or `fallback` when the key is absent. */
  getOr<T>(key: string, fallback: T): T
  /** Returns the stored value, or throws when the key is absent. */
  require<T>(key: string): T
  has(key: string): boolean
  delete(key: string): boolean
  clear(): void
  entries(): Array<[string, unknown]>
}

export function createScenarioContext(
  initial?: Record<string, unknown>,
): ScenarioContext {
  const store = new Map<string, unknown>(
    initial ? Object.entries(initial) : undefined,
  )

  return {
    set(key, value) {
      store.set(key, value)
    },
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined
    },
    getOr<T>(key: string, fallback: T): T {
      return store.has(key) ? (store.get(key) as T) : fallback
    },
    require<T>(key: string): T {
      if (!store.has(key)) {
        throw new Error(`ScenarioContext: missing key "${key}"`)
      }
      return store.get(key) as T
    },
    has(key) {
      return store.has(key)
    },
    delete(key) {
      return store.delete(key)
    },
    clear() {
      store.clear()
    },
    entries() {
      return [...store.entries()]
    },
  }
}
