import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useThrottle, useThrottleWithCancel } from '../composables/useThrottle'

describe('useThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic functionality', () => {
    it('executes immediately on first call', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled()

      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('passes arguments to the original function', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled('arg1', 'arg2')

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('does not execute immediately on subsequent calls within delay', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled()
      throttled()
      throttled()

      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('executes pending call after delay passes', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled()
      throttled()

      vi.advanceTimersByTime(1000)

      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('uses most recent arguments for delayed execution', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled('first')
      throttled('second')
      throttled('third')

      expect(mockFn).toHaveBeenCalledWith('first')

      vi.advanceTimersByTime(1000)

      expect(mockFn).toHaveBeenLastCalledWith('third')
    })
  })

  describe('timing behavior', () => {
    it('allows execution again after delay has fully passed', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled()
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1000)

      throttled()
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('schedules execution for remaining time when called mid-delay', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled()
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(500)
      throttled() // Should be scheduled for 500ms from now

      vi.advanceTimersByTime(499)
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1)
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('replaces pending call when called multiple times during delay', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled('call1')
      vi.advanceTimersByTime(200)

      throttled('call2') // Scheduled
      vi.advanceTimersByTime(200)

      throttled('call3') // Replaces call2
      vi.advanceTimersByTime(600) // Total: 1000ms from start

      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenLastCalledWith('call3')
    })

    it('handles multiple cycles of throttling', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      // Cycle 1
      throttled('a')
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1000)

      // Cycle 2
      throttled('b')
      expect(mockFn).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(1000)

      // Cycle 3
      throttled('c')
      expect(mockFn).toHaveBeenCalledTimes(3)

      expect(mockFn).toHaveBeenNthCalledWith(1, 'a')
      expect(mockFn).toHaveBeenNthCalledWith(2, 'b')
      expect(mockFn).toHaveBeenNthCalledWith(3, 'c')
    })
  })

  describe('edge cases', () => {
    it('handles zero delay', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 0)

      throttled()
      throttled()
      throttled()

      // All should execute immediately with zero delay
      expect(mockFn).toHaveBeenCalledTimes(3)
    })

    it('handles very short delays', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 10)

      throttled()
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5)
      throttled()
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5)
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('handles calls with no arguments', () => {
      const mockFn = vi.fn()
      const throttled = useThrottle(mockFn, 1000)

      throttled()

      expect(mockFn).toHaveBeenCalledWith()
    })

    it('preserves function behavior for different delays', () => {
      const mockFn1 = vi.fn()
      const mockFn2 = vi.fn()
      const throttled1 = useThrottle(mockFn1, 500)
      const throttled2 = useThrottle(mockFn2, 1000)

      throttled1()
      throttled2()

      vi.advanceTimersByTime(500)

      throttled1() // Should execute immediately
      throttled2() // Still within delay

      expect(mockFn1).toHaveBeenCalledTimes(2)
      expect(mockFn2).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(500)

      expect(mockFn2).toHaveBeenCalledTimes(2)
    })
  })
})

describe('useThrottleWithCancel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns throttled function and cancel method', () => {
    const mockFn = vi.fn()
    const result = useThrottleWithCancel(mockFn, 1000)

    expect(result.throttled).toBeTypeOf('function')
    expect(result.cancel).toBeTypeOf('function')
  })

  it('throttled function behaves like useThrottle', () => {
    const mockFn = vi.fn()
    const { throttled } = useThrottleWithCancel(mockFn, 1000)

    throttled()
    throttled()

    expect(mockFn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)

    expect(mockFn).toHaveBeenCalledTimes(2)
  })

  it('cancel method prevents pending execution', () => {
    const mockFn = vi.fn()
    const { throttled, cancel } = useThrottleWithCancel(mockFn, 1000)

    throttled()
    throttled('pending') // This should be scheduled

    expect(mockFn).toHaveBeenCalledTimes(1)

    cancel()

    vi.advanceTimersByTime(1000)

    // Pending call should have been cancelled
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('cancel is safe to call when no pending execution', () => {
    const mockFn = vi.fn()
    const { cancel } = useThrottleWithCancel(mockFn, 1000)

    // Should not throw
    expect(() => cancel()).not.toThrow()
  })

  it('allows new calls after cancel', () => {
    const mockFn = vi.fn()
    const { throttled, cancel } = useThrottleWithCancel(mockFn, 1000)

    throttled()
    throttled('pending')
    cancel()

    vi.advanceTimersByTime(1000)

    throttled('new')

    expect(mockFn).toHaveBeenCalledTimes(2)
    expect(mockFn).toHaveBeenLastCalledWith('new')
  })

  it('cancel can be called multiple times safely', () => {
    const mockFn = vi.fn()
    const { throttled, cancel } = useThrottleWithCancel(mockFn, 1000)

    throttled()
    throttled('pending')

    cancel()
    cancel()
    cancel()

    vi.advanceTimersByTime(1000)

    expect(mockFn).toHaveBeenCalledTimes(1)
  })
})
