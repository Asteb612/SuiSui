/**
 * Throttle utility composable
 *
 * Creates a throttled version of a function that limits how often
 * the function can be called. The first call executes immediately,
 * subsequent calls within the delay period are queued and executed
 * after the delay.
 */

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `delay` milliseconds. Subsequent calls within the delay window
 * will replace pending calls.
 *
 * @param func - The function to throttle
 * @param delay - The minimum time between invocations in milliseconds
 * @returns A throttled version of the function
 *
 * @example
 * ```ts
 * const throttledSave = useThrottle(() => saveData(), 1000)
 *
 * // First call executes immediately
 * throttledSave()
 *
 * // Calls within 1000ms are queued
 * throttledSave() // queued
 * throttledSave() // replaces previous queued call
 * ```
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastRan = 0

  return function throttled(...args: Parameters<T>) {
    const now = Date.now()

    // Clear any pending timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    // If enough time has passed, execute immediately
    if (now - lastRan >= delay) {
      func(...args)
      lastRan = now
    } else {
      // Otherwise, schedule execution after remaining delay
      const remainingDelay = delay - (now - lastRan)
      timeoutId = setTimeout(() => {
        func(...args)
        lastRan = Date.now()
        timeoutId = null
      }, remainingDelay)
    }
  }
}

/**
 * Creates a throttled function with a cancel method
 *
 * @param func - The function to throttle
 * @param delay - The minimum time between invocations in milliseconds
 * @returns Object with throttled function and cancel method
 */
export function useThrottleWithCancel<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): {
  throttled: (...args: Parameters<T>) => void
  cancel: () => void
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastRan = 0

  function throttled(...args: Parameters<T>) {
    const now = Date.now()

    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (now - lastRan >= delay) {
      func(...args)
      lastRan = now
    } else {
      const remainingDelay = delay - (now - lastRan)
      timeoutId = setTimeout(() => {
        func(...args)
        lastRan = Date.now()
        timeoutId = null
      }, remainingDelay)
    }
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return { throttled, cancel }
}
