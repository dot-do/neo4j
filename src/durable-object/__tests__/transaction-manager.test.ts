/**
 * TransactionManager Interface Contract Tests
 *
 * TDD Green Phase: These tests verify the TransactionManager implementation
 * extracted from GraphDO.
 *
 * The TransactionManager handles all transaction lifecycle operations:
 * - Transaction creation/begin
 * - Transaction commit semantics
 * - Transaction rollback semantics
 * - Transaction timeout handling
 * - Concurrent transaction isolation
 * - Transaction state machine
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { TransactionManager } from '../transaction-manager'

describe('TransactionManager Interface Contract', () => {
  let manager: TransactionManager

  beforeEach(() => {
    manager = new TransactionManager()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('1. Transaction Creation/Begin', () => {
    it('should create a new transaction and return a unique ID', () => {
      const txId = manager.begin()

      expect(txId).toBeDefined()
      expect(typeof txId).toBe('string')
      expect(txId.length).toBeGreaterThan(0)
    })

    it('should create transactions with unique IDs', () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()
      const txId3 = manager.begin()

      expect(txId1).not.toBe(txId2)
      expect(txId2).not.toBe(txId3)
      expect(txId1).not.toBe(txId3)
    })

    it('should initialize transaction in active state', () => {
      const txId = manager.begin()

      expect(manager.getState(txId)).toBe('active')
      expect(manager.isActive(txId)).toBe(true)
    })

    it('should accept optional timeout configuration', () => {
      const txId = manager.begin({ timeout: 60000 })

      const metadata = manager.getMetadata(txId)
      expect(metadata?.timeout).toBe(60000)
    })

    it('should use default timeout of 30000ms if not specified', () => {
      const txId = manager.begin()

      const metadata = manager.getMetadata(txId)
      expect(metadata?.timeout).toBe(30000)
    })

    it('should accept optional metadata', () => {
      const customMetadata = { userId: 'user-123', operation: 'bulk-import' }
      const txId = manager.begin({ metadata: customMetadata })

      const metadata = manager.getMetadata(txId)
      expect(metadata?.metadata).toEqual(customMetadata)
    })

    it('should set createdAt timestamp', () => {
      const before = Date.now()
      const txId = manager.begin()
      const after = Date.now()

      const metadata = manager.getMetadata(txId)
      expect(metadata?.createdAt).toBeGreaterThanOrEqual(before)
      expect(metadata?.createdAt).toBeLessThanOrEqual(after)
    })

    it('should calculate correct expiresAt timestamp', () => {
      const timeout = 5000
      const txId = manager.begin({ timeout })

      const metadata = manager.getMetadata(txId)
      expect(metadata?.expiresAt).toBe(metadata!.createdAt + timeout)
    })
  })

  describe('2. Commit Semantics', () => {
    it('should successfully commit an active transaction', async () => {
      const txId = manager.begin()

      await expect(manager.commit(txId)).resolves.toBeUndefined()
      expect(manager.getState(txId)).toBe('committed')
    })

    it('should transition state from active to committed', async () => {
      const txId = manager.begin()
      expect(manager.getState(txId)).toBe('active')

      await manager.commit(txId)
      expect(manager.getState(txId)).toBe('committed')
    })

    it('should throw error when committing non-existent transaction', async () => {
      await expect(manager.commit('non-existent-tx')).rejects.toThrow('Transaction not found')
    })

    it('should throw error when committing already committed transaction', async () => {
      const txId = manager.begin()
      await manager.commit(txId)

      await expect(manager.commit(txId)).rejects.toThrow()
    })

    it('should throw error when committing rolled back transaction', async () => {
      const txId = manager.begin()
      await manager.rollback(txId)

      await expect(manager.commit(txId)).rejects.toThrow()
    })

    it('should throw error when committing expired transaction', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      // Advance time past expiration
      vi.advanceTimersByTime(150)

      await expect(manager.commit(txId)).rejects.toThrow('expired')
    })

    it('should not allow operations after commit', async () => {
      const txId = manager.begin()
      await manager.commit(txId)

      expect(manager.isActive(txId)).toBe(false)
    })

    it('should be idempotent for the final state', async () => {
      const txId = manager.begin()
      await manager.commit(txId)

      // State should remain committed even after failed re-commit attempt
      try {
        await manager.commit(txId)
      } catch {
        // Expected to throw
      }
      expect(manager.getState(txId)).toBe('committed')
    })
  })

  describe('3. Rollback Semantics', () => {
    it('should successfully rollback an active transaction', async () => {
      const txId = manager.begin()

      await expect(manager.rollback(txId)).resolves.toBeUndefined()
      expect(manager.getState(txId)).toBe('rolled_back')
    })

    it('should transition state from active to rolled_back', async () => {
      const txId = manager.begin()
      expect(manager.getState(txId)).toBe('active')

      await manager.rollback(txId)
      expect(manager.getState(txId)).toBe('rolled_back')
    })

    it('should throw error when rolling back non-existent transaction', async () => {
      await expect(manager.rollback('non-existent-tx')).rejects.toThrow('Transaction not found')
    })

    it('should throw error when rolling back already rolled back transaction', async () => {
      const txId = manager.begin()
      await manager.rollback(txId)

      await expect(manager.rollback(txId)).rejects.toThrow()
    })

    it('should throw error when rolling back committed transaction', async () => {
      const txId = manager.begin()
      await manager.commit(txId)

      await expect(manager.rollback(txId)).rejects.toThrow()
    })

    it('should discard all pending changes', async () => {
      const txId = manager.begin()
      let executed = false

      // Simulate work that should be discarded
      await manager.execute(txId, async () => {
        // This work would normally be tracked
        executed = true
      })

      expect(executed).toBe(true)

      // After rollback, state should indicate changes were discarded
      await manager.rollback(txId)
      expect(manager.getState(txId)).toBe('rolled_back')
    })

    it('should not allow operations after rollback', async () => {
      const txId = manager.begin()
      await manager.rollback(txId)

      expect(manager.isActive(txId)).toBe(false)
    })

    it('should be faster than commit (no persistence needed)', async () => {
      const txId = manager.begin()

      const start = Date.now()
      await manager.rollback(txId)
      const duration = Date.now() - start

      // Rollback should be nearly instantaneous (< 10ms)
      expect(duration).toBeLessThan(10)
    })
  })

  describe('4. Timeout Handling', () => {
    it('should expire transaction after timeout', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      expect(manager.getState(txId)).toBe('active')

      // Advance time past expiration
      vi.advanceTimersByTime(150)

      expect(manager.getState(txId)).toBe('expired')
    })

    it('should allow operations before timeout', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 1000 })

      vi.advanceTimersByTime(500)

      // Should still be able to execute
      await expect(
        manager.execute(txId, async () => 'result')
      ).resolves.toBe('result')
    })

    it('should reject operations after timeout', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      vi.advanceTimersByTime(150)

      await expect(
        manager.execute(txId, async () => 'result')
      ).rejects.toThrow('expired')
    })

    it('should handle zero timeout', () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 0 })

      vi.advanceTimersByTime(1)

      expect(manager.getState(txId)).toBe('expired')
    })

    it('should handle very long timeout', () => {
      const txId = manager.begin({ timeout: 3600000 }) // 1 hour

      const metadata = manager.getMetadata(txId)
      expect(metadata?.timeout).toBe(3600000)
      expect(manager.isActive(txId)).toBe(true)
    })

    it('should correctly report remaining time', () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 10000 })

      vi.advanceTimersByTime(3000)

      const metadata = manager.getMetadata(txId)
      const remaining = metadata!.expiresAt - Date.now()
      expect(remaining).toBe(7000)
    })

    it('should mark transaction as expired on state check', () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      vi.advanceTimersByTime(150)

      // Calling getState should detect and mark as expired
      const state = manager.getState(txId)
      expect(state).toBe('expired')
    })

    it('should prevent commit of expired transaction', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      vi.advanceTimersByTime(150)

      await expect(manager.commit(txId)).rejects.toThrow('expired')
    })
  })

  describe('5. Concurrent Transaction Isolation', () => {
    it('should support multiple concurrent active transactions', () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()
      const txId3 = manager.begin()

      expect(manager.isActive(txId1)).toBe(true)
      expect(manager.isActive(txId2)).toBe(true)
      expect(manager.isActive(txId3)).toBe(true)
    })

    it('should isolate transaction states', async () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()

      await manager.commit(txId1)

      expect(manager.getState(txId1)).toBe('committed')
      expect(manager.getState(txId2)).toBe('active')
    })

    it('should allow independent commit/rollback of transactions', async () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()
      const txId3 = manager.begin()

      await manager.commit(txId1)
      await manager.rollback(txId2)
      // txId3 remains active

      expect(manager.getState(txId1)).toBe('committed')
      expect(manager.getState(txId2)).toBe('rolled_back')
      expect(manager.getState(txId3)).toBe('active')
    })

    it('should handle concurrent commits', async () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()

      await Promise.all([
        manager.commit(txId1),
        manager.commit(txId2)
      ])

      expect(manager.getState(txId1)).toBe('committed')
      expect(manager.getState(txId2)).toBe('committed')
    })

    it('should handle concurrent rollbacks', async () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()

      await Promise.all([
        manager.rollback(txId1),
        manager.rollback(txId2)
      ])

      expect(manager.getState(txId1)).toBe('rolled_back')
      expect(manager.getState(txId2)).toBe('rolled_back')
    })

    it('should handle mixed concurrent operations', async () => {
      const txId1 = manager.begin()
      const txId2 = manager.begin()
      const txId3 = manager.begin()

      await Promise.all([
        manager.commit(txId1),
        manager.rollback(txId2),
        manager.execute(txId3, async () => 'work')
      ])

      expect(manager.getState(txId1)).toBe('committed')
      expect(manager.getState(txId2)).toBe('rolled_back')
      expect(manager.getState(txId3)).toBe('active')
    })

    it('should maintain individual timeout per transaction', async () => {
      vi.useFakeTimers()

      const txId1 = manager.begin({ timeout: 100 })
      const txId2 = manager.begin({ timeout: 500 })

      vi.advanceTimersByTime(200)

      expect(manager.getState(txId1)).toBe('expired')
      expect(manager.getState(txId2)).toBe('active')
    })

    it('should handle high concurrency without issues', async () => {
      const transactions = Array.from({ length: 100 }, () => manager.begin())

      // All should be active
      expect(transactions.every(txId => manager.isActive(txId))).toBe(true)

      // Commit half, rollback half
      const commits = transactions.slice(0, 50).map(txId => manager.commit(txId))
      const rollbacks = transactions.slice(50).map(txId => manager.rollback(txId))

      await Promise.all([...commits, ...rollbacks])

      // Verify final states
      transactions.slice(0, 50).forEach(txId => {
        expect(manager.getState(txId)).toBe('committed')
      })
      transactions.slice(50).forEach(txId => {
        expect(manager.getState(txId)).toBe('rolled_back')
      })
    })
  })

  describe('6. Transaction State Machine', () => {
    /**
     * Valid state transitions:
     * - active -> committed (via commit)
     * - active -> rolled_back (via rollback)
     * - active -> expired (via timeout)
     * - committed -> (terminal, no transitions)
     * - rolled_back -> (terminal, no transitions)
     * - expired -> (terminal, no transitions)
     */

    it('should start in active state', () => {
      const txId = manager.begin()
      expect(manager.getState(txId)).toBe('active')
    })

    it('should transition active -> committed', async () => {
      const txId = manager.begin()
      expect(manager.getState(txId)).toBe('active')

      await manager.commit(txId)
      expect(manager.getState(txId)).toBe('committed')
    })

    it('should transition active -> rolled_back', async () => {
      const txId = manager.begin()
      expect(manager.getState(txId)).toBe('active')

      await manager.rollback(txId)
      expect(manager.getState(txId)).toBe('rolled_back')
    })

    it('should transition active -> expired', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })
      expect(manager.getState(txId)).toBe('active')

      vi.advanceTimersByTime(150)
      expect(manager.getState(txId)).toBe('expired')
    })

    it('should not transition from committed to any other state', async () => {
      const txId = manager.begin()
      await manager.commit(txId)

      // Attempt invalid transitions
      await expect(manager.commit(txId)).rejects.toThrow()
      await expect(manager.rollback(txId)).rejects.toThrow()

      expect(manager.getState(txId)).toBe('committed')
    })

    it('should not transition from rolled_back to any other state', async () => {
      const txId = manager.begin()
      await manager.rollback(txId)

      // Attempt invalid transitions
      await expect(manager.commit(txId)).rejects.toThrow()
      await expect(manager.rollback(txId)).rejects.toThrow()

      expect(manager.getState(txId)).toBe('rolled_back')
    })

    it('should not transition from expired to any other state', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })
      vi.advanceTimersByTime(150)

      // Verify expired
      expect(manager.getState(txId)).toBe('expired')

      // Attempt invalid transitions
      await expect(manager.commit(txId)).rejects.toThrow()
      // Note: rollback on expired might be allowed (cleanup) - test actual behavior
    })

    it('should return undefined state for non-existent transaction', () => {
      expect(manager.getState('non-existent')).toBeUndefined()
    })

    it('should track state independently for each transaction', async () => {
      const active = manager.begin()
      const committed = manager.begin()
      const rolledBack = manager.begin()

      await manager.commit(committed)
      await manager.rollback(rolledBack)

      expect(manager.getState(active)).toBe('active')
      expect(manager.getState(committed)).toBe('committed')
      expect(manager.getState(rolledBack)).toBe('rolled_back')
    })

    it('should only allow execute in active state', async () => {
      const txId = manager.begin()

      // Execute should work in active state
      await expect(manager.execute(txId, async () => 'ok')).resolves.toBe('ok')

      await manager.commit(txId)

      // Execute should fail in committed state
      await expect(manager.execute(txId, async () => 'fail')).rejects.toThrow()
    })

    it('should properly report isActive for all states', async () => {
      vi.useFakeTimers()

      const active = manager.begin()
      const committed = manager.begin()
      const rolledBack = manager.begin()
      const expired = manager.begin({ timeout: 100 })

      await manager.commit(committed)
      await manager.rollback(rolledBack)
      vi.advanceTimersByTime(150)

      expect(manager.isActive(active)).toBe(true)
      expect(manager.isActive(committed)).toBe(false)
      expect(manager.isActive(rolledBack)).toBe(false)
      expect(manager.isActive(expired)).toBe(false)
      expect(manager.isActive('non-existent')).toBe(false)
    })
  })

  describe('7. Execute Within Transaction', () => {
    it('should execute work and return result', async () => {
      const txId = manager.begin()

      const result = await manager.execute(txId, async () => {
        return { data: 'test', value: 42 }
      })

      expect(result).toEqual({ data: 'test', value: 42 })
    })

    it('should pass through errors from work function', async () => {
      const txId = manager.begin()

      await expect(
        manager.execute(txId, async () => {
          throw new Error('Work failed')
        })
      ).rejects.toThrow('Work failed')
    })

    it('should execute work synchronously within transaction', async () => {
      const txId = manager.begin()
      const order: number[] = []

      await manager.execute(txId, async () => {
        order.push(1)
        await Promise.resolve()
        order.push(2)
      })

      order.push(3)

      expect(order).toEqual([1, 2, 3])
    })

    it('should reject execute on expired transaction', async () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      vi.advanceTimersByTime(150)

      await expect(
        manager.execute(txId, async () => 'result')
      ).rejects.toThrow('expired')
    })

    it('should support nested async operations', async () => {
      const txId = manager.begin()

      const result = await manager.execute(txId, async () => {
        const a = await Promise.resolve(1)
        const b = await Promise.resolve(2)
        return a + b
      })

      expect(result).toBe(3)
    })

    it('should maintain transaction state after successful execute', async () => {
      const txId = manager.begin()

      await manager.execute(txId, async () => 'work')

      expect(manager.getState(txId)).toBe('active')
      expect(manager.isActive(txId)).toBe(true)
    })

    it('should maintain transaction state after failed execute', async () => {
      const txId = manager.begin()

      try {
        await manager.execute(txId, async () => {
          throw new Error('Failed')
        })
      } catch {
        // Expected
      }

      // Transaction should still be active after work error
      expect(manager.getState(txId)).toBe('active')
    })
  })

  describe('8. Cleanup Expired Transactions', () => {
    it('should clean up expired transactions', () => {
      vi.useFakeTimers()

      manager.begin({ timeout: 100 })
      manager.begin({ timeout: 100 })

      vi.advanceTimersByTime(150)

      const cleaned = manager.cleanupExpired()
      expect(cleaned).toBe(2)
    })

    it('should not clean up active transactions', () => {
      manager.begin({ timeout: 100000 })
      manager.begin({ timeout: 100000 })

      const cleaned = manager.cleanupExpired()
      expect(cleaned).toBe(0)
    })

    it('should clean up committed transactions', async () => {
      const txId = manager.begin()
      await manager.commit(txId)

      const cleaned = manager.cleanupExpired()
      expect(cleaned).toBe(1)
    })

    it('should clean up rolled back transactions', async () => {
      const txId = manager.begin()
      await manager.rollback(txId)

      const cleaned = manager.cleanupExpired()
      expect(cleaned).toBe(1)
    })

    it('should return undefined state after cleanup', () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 100 })

      vi.advanceTimersByTime(150)
      manager.cleanupExpired()

      expect(manager.getState(txId)).toBeUndefined()
    })

    it('should handle mixed transaction states', async () => {
      vi.useFakeTimers()

      const active = manager.begin({ timeout: 100000 })
      const committed = manager.begin()
      const rolledBack = manager.begin()
      const expired = manager.begin({ timeout: 100 })

      await manager.commit(committed)
      await manager.rollback(rolledBack)
      vi.advanceTimersByTime(150)

      const cleaned = manager.cleanupExpired()
      expect(cleaned).toBe(3) // committed, rolled_back, expired

      // Only active should remain
      expect(manager.getState(active)).toBe('active')
      expect(manager.getState(committed)).toBeUndefined()
      expect(manager.getState(rolledBack)).toBeUndefined()
      expect(manager.getState(expired)).toBeUndefined()
    })

    it('should be safe to call repeatedly', () => {
      vi.useFakeTimers()

      manager.begin({ timeout: 100 })
      vi.advanceTimersByTime(150)

      const cleaned1 = manager.cleanupExpired()
      const cleaned2 = manager.cleanupExpired()
      const cleaned3 = manager.cleanupExpired()

      expect(cleaned1).toBe(1)
      expect(cleaned2).toBe(0)
      expect(cleaned3).toBe(0)
    })
  })

  describe('9. Edge Cases and Error Handling', () => {
    it('should handle empty string transaction ID', async () => {
      expect(manager.getState('')).toBeUndefined()
      await expect(manager.commit('')).rejects.toThrow()
      await expect(manager.rollback('')).rejects.toThrow()
    })

    it('should handle special characters in metadata', () => {
      const metadata = {
        'key-with-dash': 'value',
        'key.with.dots': 'value',
        'unicode': '日本語',
        'emoji': '🎉'
      }
      const txId = manager.begin({ metadata })

      expect(manager.getMetadata(txId)?.metadata).toEqual(metadata)
    })

    it('should handle rapid begin/commit cycles', async () => {
      for (let i = 0; i < 100; i++) {
        const txId = manager.begin()
        await manager.commit(txId)
      }
      // Should complete without error
    })

    it('should handle rapid begin/rollback cycles', async () => {
      for (let i = 0; i < 100; i++) {
        const txId = manager.begin()
        await manager.rollback(txId)
      }
      // Should complete without error
    })

    it('should handle very small timeout values', () => {
      vi.useFakeTimers()
      const txId = manager.begin({ timeout: 1 })

      vi.advanceTimersByTime(2)
      expect(manager.getState(txId)).toBe('expired')
    })

    it('should handle metadata with nested objects', () => {
      const metadata = {
        user: {
          id: '123',
          profile: {
            name: 'Test User',
            settings: {
              theme: 'dark'
            }
          }
        }
      }
      const txId = manager.begin({ metadata })

      expect(manager.getMetadata(txId)?.metadata).toEqual(metadata)
    })

    it('should maintain consistency under error conditions', async () => {
      const txId = manager.begin()

      // Simulate error in work
      try {
        await manager.execute(txId, async () => {
          throw new Error('Simulated error')
        })
      } catch {
        // Expected
      }

      // Transaction should still be valid
      expect(manager.isActive(txId)).toBe(true)

      // Should still be able to commit or rollback
      await manager.rollback(txId)
      expect(manager.getState(txId)).toBe('rolled_back')
    })
  })
})
