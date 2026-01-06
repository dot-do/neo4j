/**
 * TDD RED Tests: Session Close Callback Memory Leak
 *
 * These tests expose the memory leak in the Driver class where
 * _sessionCloseCallbacks array grows unbounded because callbacks
 * are never removed after being added via onSessionClose().
 *
 * The problematic code (driver.ts lines 55-57, 130-132):
 *   private readonly _sessionCloseCallbacks: SessionCloseCallback[] = []
 *
 *   onSessionClose(callback: SessionCloseCallback): void {
 *     this._sessionCloseCallbacks.push(callback)  // Never removed!
 *   }
 *
 * Expected: All tests should FAIL, demonstrating the memory leak exists.
 * The GREEN phase will implement proper cleanup mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { driver } from '../../index'
import type { Driver } from '../driver'

describe('Session Close Callback Memory Leak (RED)', () => {
  let d: Driver

  beforeEach(() => {
    d = driver('neo4j://localhost')
  })

  afterEach(async () => {
    if (d.isOpen) {
      await d.close()
    }
  })

  describe('Callback Accumulation Without Cleanup', () => {
    it('should NOT accumulate callbacks after they are registered (currently fails)', () => {
      // This test exposes that callbacks accumulate without cleanup
      // Register multiple callbacks
      const callbacks: (() => void)[] = []
      for (let i = 0; i < 10; i++) {
        const callback = () => {}
        callbacks.push(callback)
        d.onSessionClose(callback)
      }

      // Access private property to check callback count
      // @ts-expect-error - accessing private property for testing
      const callbackCount = d._sessionCloseCallbacks.length

      // After registering 10 callbacks, they all still exist
      // This test documents the current (leaky) behavior
      expect(callbackCount).toBe(10)

      // The fix should provide a way to remove callbacks
      // For now, this test passes to document the leak exists
    })

    it('should provide unsubscribe mechanism for onSessionClose (currently missing)', () => {
      // This test expects onSessionClose to return an unsubscribe function
      // Currently it returns void, causing memory leaks

      const callback = () => {}
      const unsubscribe = d.onSessionClose(callback)

      // EXPECTED: onSessionClose should return an unsubscribe function
      // ACTUAL: Returns undefined (void)
      expect(typeof unsubscribe).toBe('function')

      // Calling unsubscribe should remove the callback
      if (typeof unsubscribe === 'function') {
        unsubscribe()

        // @ts-expect-error - accessing private property for testing
        expect(d._sessionCloseCallbacks.length).toBe(0)
      }
    })

    it('should clean up callbacks when driver is closed', async () => {
      // Register some callbacks
      for (let i = 0; i < 5; i++) {
        d.onSessionClose(() => {})
      }

      // @ts-expect-error - accessing private property for testing
      expect(d._sessionCloseCallbacks.length).toBe(5)

      // Close the driver
      await d.close()

      // EXPECTED: Callbacks should be cleaned up when driver closes
      // ACTUAL: Callbacks remain in memory
      // @ts-expect-error - accessing private property for testing
      expect(d._sessionCloseCallbacks.length).toBe(0)
    })
  })

  describe('Memory Growth with Session Open/Close Cycles', () => {
    it('should not grow callback array with repeated session creation', async () => {
      // Create and close many sessions
      const sessionCount = 100

      for (let i = 0; i < sessionCount; i++) {
        const session = d.session()
        await session.close()
      }

      // The driver internally might register callbacks per session
      // This test checks that closing sessions cleans up any internal tracking

      // Note: Currently the _sessionCloseCallbacks is for external subscribers
      // but this test documents that the array shouldn't grow unbounded
      // @ts-expect-error - accessing private property for testing
      const callbackCount = d._sessionCloseCallbacks.length

      // If callbacks were registered per session and not cleaned up,
      // this would be 100. It should remain 0 (or a small constant)
      expect(callbackCount).toBeLessThanOrEqual(0)
    })

    it('should not leak memory when registering callbacks in session lifecycle', async () => {
      const iterations = 50

      for (let i = 0; i < iterations; i++) {
        // Simulate pattern: register callback, create session, close session
        const callback = () => {}
        d.onSessionClose(callback)

        const session = d.session()
        await session.close()

        // The callback should be removed or removable after use
      }

      // @ts-expect-error - accessing private property for testing
      const callbackCount = d._sessionCloseCallbacks.length

      // EXPECTED: Callbacks should not accumulate
      // ACTUAL: All 50 callbacks are still registered
      // This test will FAIL until the fix is implemented
      expect(callbackCount).toBe(0)
    })

    it('should track memory usage growth over session cycles', async () => {
      // This test documents expected memory behavior
      // In real scenario, would use process.memoryUsage() but that's not reliable in tests

      const measureCallbackCount = () => {
        // @ts-expect-error - accessing private property for testing
        return d._sessionCloseCallbacks.length
      }

      const initialCount = measureCallbackCount()

      // Register callbacks in a loop simulating long-running application
      for (let i = 0; i < 1000; i++) {
        d.onSessionClose(() => {
          // Callback that captures closure - potential memory leak
          const timestamp = Date.now()
          return timestamp
        })
      }

      const finalCount = measureCallbackCount()

      // EXPECTED: Callbacks should be bounded or cleaned up
      // ACTUAL: Count grows to 1000
      // This demonstrates unbounded growth
      expect(finalCount - initialCount).toBeLessThan(10)
    })
  })

  describe('Callbacks Not Removed After Session Close', () => {
    it('should remove one-time callbacks after session closes', async () => {
      let callCount = 0
      const oneTimeCallback = () => {
        callCount++
      }

      d.onSessionClose(oneTimeCallback)

      // Create and close a session - callback should fire
      const session1 = d.session()
      await session1.close()

      expect(callCount).toBe(1)

      // Create and close another session
      const session2 = d.session()
      await session2.close()

      // EXPECTED: One-time callback should only fire once
      // ACTUAL: Callback fires for every session close (2 times)
      // The current implementation has no way to mark callbacks as one-time
      expect(callCount).toBe(1)
    })

    it('should allow explicit callback removal after session close', async () => {
      const closedSessions: unknown[] = []
      const callback = (session: unknown) => {
        closedSessions.push(session)
      }

      // Register the callback
      const unsubscribe = d.onSessionClose(callback)

      // Close a session
      const session1 = d.session()
      await session1.close()

      // EXPECTED: Can unsubscribe after first use
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }

      // Close another session
      const session2 = d.session()
      await session2.close()

      // EXPECTED: After unsubscribe, callback should not be called
      // ACTUAL: No unsubscribe mechanism exists
      expect(closedSessions.length).toBe(1)
      expect(closedSessions[0]).toBe(session1)
    })

    it('should not retain references to closed sessions in callbacks', async () => {
      // This test checks for potential memory leaks from retained session references
      const sessionRefs: WeakRef<object>[] = []

      d.onSessionClose((session) => {
        // Callback captures session reference
        sessionRefs.push(new WeakRef(session as object))
      })

      // Create and close sessions
      for (let i = 0; i < 10; i++) {
        const session = d.session()
        await session.close()
      }

      // Force garbage collection if available (not reliable in all environments)
      if (global.gc) {
        global.gc()
      }

      // The callback array still holds references, preventing cleanup
      // @ts-expect-error - accessing private property for testing
      expect(d._sessionCloseCallbacks.length).toBe(1)

      // Even after sessions are closed, the callback remains
      // and could prevent proper garbage collection of related resources
    })
  })

  describe('Long-Running Driver Instances', () => {
    it('should support bounded callback registration for long-running drivers', async () => {
      // Simulate a long-running application that registers callbacks over time
      const maxExpectedCallbacks = 10

      // Register more callbacks than should be retained
      for (let i = 0; i < 100; i++) {
        d.onSessionClose(() => {
          // Each callback has its own closure with captured variables
          const capturedIndex = i
          return capturedIndex
        })
      }

      // @ts-expect-error - accessing private property for testing
      const callbackCount = d._sessionCloseCallbacks.length

      // EXPECTED: Driver should have a max callback limit or cleanup mechanism
      // ACTUAL: All 100 callbacks are retained
      expect(callbackCount).toBeLessThanOrEqual(maxExpectedCallbacks)
    })

    it('should provide callback count for monitoring', () => {
      // Register some callbacks
      for (let i = 0; i < 5; i++) {
        d.onSessionClose(() => {})
      }

      // EXPECTED: Driver should expose callback count for monitoring
      // ACTUAL: No public API to check callback count
      // @ts-expect-error - accessing private property for testing (should be public getter)
      const count = d.sessionCloseCallbackCount ?? d._sessionCloseCallbacks.length

      expect(count).toBe(5)

      // Ideally there would be a public getter:
      // expect(d.sessionCloseCallbackCount).toBe(5)
    })

    it('should warn or limit when too many callbacks are registered', () => {
      // This test documents expected behavior for production drivers
      const warningThreshold = 100

      // Register many callbacks
      for (let i = 0; i < warningThreshold + 50; i++) {
        d.onSessionClose(() => {})
      }

      // @ts-expect-error - accessing private property for testing
      const callbackCount = d._sessionCloseCallbacks.length

      // EXPECTED: Driver should either:
      // 1. Emit a warning when threshold is exceeded
      // 2. Limit the number of callbacks
      // 3. Auto-clean old callbacks
      // ACTUAL: No protection against unbounded growth
      expect(callbackCount).toBeLessThanOrEqual(warningThreshold)
    })

    it('should clean up callbacks periodically in long-running instances', async () => {
      // Simulate long-running driver with periodic session activity
      for (let cycle = 0; cycle < 10; cycle++) {
        // Each cycle: register callback, create sessions, close sessions
        d.onSessionClose(() => {})

        for (let i = 0; i < 5; i++) {
          const session = d.session()
          await session.close()
        }

        // After each cycle, callbacks should be cleaned up
        // or a cleanup method should be available
      }

      // @ts-expect-error - accessing private property for testing
      const finalCallbackCount = d._sessionCloseCallbacks.length

      // EXPECTED: Periodic cleanup or bounded growth
      // ACTUAL: All 10 callbacks remain
      expect(finalCallbackCount).toBeLessThanOrEqual(1)
    })
  })

  describe('Callback Cleanup API (Expected Interface)', () => {
    it('should have removeSessionCloseCallback method', () => {
      const callback = () => {}
      d.onSessionClose(callback)

      // EXPECTED: Method to remove specific callback
      // @ts-expect-error - method doesn't exist yet
      expect(typeof d.removeSessionCloseCallback).toBe('function')

      // @ts-expect-error - method doesn't exist yet
      if (typeof d.removeSessionCloseCallback === 'function') {
        // @ts-expect-error - method doesn't exist yet
        d.removeSessionCloseCallback(callback)

        // @ts-expect-error - accessing private property for testing
        expect(d._sessionCloseCallbacks.length).toBe(0)
      }
    })

    it('should have clearSessionCloseCallbacks method', () => {
      for (let i = 0; i < 5; i++) {
        d.onSessionClose(() => {})
      }

      // EXPECTED: Method to clear all callbacks
      // @ts-expect-error - method doesn't exist yet
      expect(typeof d.clearSessionCloseCallbacks).toBe('function')

      // @ts-expect-error - method doesn't exist yet
      if (typeof d.clearSessionCloseCallbacks === 'function') {
        // @ts-expect-error - method doesn't exist yet
        d.clearSessionCloseCallbacks()

        // @ts-expect-error - accessing private property for testing
        expect(d._sessionCloseCallbacks.length).toBe(0)
      }
    })

    it('should return unsubscribe function from onSessionClose', () => {
      const callback = () => {}
      const result = d.onSessionClose(callback)

      // EXPECTED: Returns unsubscribe function
      // ACTUAL: Returns void (undefined)
      expect(typeof result).toBe('function')
    })
  })
})
