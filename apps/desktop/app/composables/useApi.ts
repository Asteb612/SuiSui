export function useApi() {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error('Electron API not available')
  }
  return window.api
}

export function useApiSafe() {
  if (typeof window === 'undefined' || !window.api) {
    return null
  }
  return window.api
}
