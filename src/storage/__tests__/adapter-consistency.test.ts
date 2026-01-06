/**
 * Adapter Consistency Tests
 *
 * This test file demonstrates that DOStorageAdapter and D1StorageAdapter
 * share the same behavior and can be swapped without behavior changes.
 *
 * These tests prove:
 * 1. Both adapters implement the same StorageAdapter interface
 * 2. Transaction behavior is consistent across adapters
 * 3. CRUD operations produce the same results
 * 4. Error handling is consistent
 * 5. Both can be swapped without behavior change
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  StorageAdapter,
  DOStorageAdapter,
  D1StorageAdapter,
  StorageAdapterType,
  StorageAdapterFactory,
  StorageAdapterManager,
  TransactionHandle,
  QueryResult,
} from '../storage-adapter'

// ============================================================================
// Mock Factories
// ============================================================================

interface MockD1Database {
  prepare: ReturnType<typeof vi.fn>
  exec: ReturnType<typeof vi.fn>
  batch: ReturnType<typeof vi.fn>
  dump: ReturnType<typeof vi.fn>
}

interface MockDOStorage {
  sql: {
    exec: ReturnType<typeof vi.fn>
  }
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

function createMockD1Database(): MockD1Database {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
      get: vi.fn().mockResolvedValue(null),
    }),
    exec: vi.fn().mockResolvedValue(undefined),
    batch: vi.fn().mockResolvedValue([]),
    dump: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  }
}

function createMockDOStorage(): MockDOStorage {
  return {
    sql: {
      exec: vi.fn().mockReturnValue({
        toArray: vi.fn().mockReturnValue([]),
      }),
    },
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue(new Map()),
    transaction: vi.fn().mockImplementation(async (fn) => fn()),
  }
}

// ============================================================================
// Adapter Creation Helpers
// ============================================================================

type AdapterFactory = () => Promise<{
  adapter: StorageAdapter
  cleanup: () => Promise<void>
}>

const createDOAdapter: AdapterFactory = async () => {
  const mockStorage = createMockDOStorage()
  const adapter = new DOStorageAdapter(mockStorage as unknown as DurableObjectStorage)
  await adapter.initialize()
  return {
    adapter,
    cleanup: async () => {
      await adapter.close()
    },
  }
}

const createD1Adapter: AdapterFactory = async () => {
  const mockDb = createMockD1Database()
  const adapter = new D1StorageAdapter(mockDb as unknown as D1Database)
  await adapter.initialize()
  return {
    adapter,
    cleanup: async () => {
      await adapter.close()
    },
  }
}

// ============================================================================
// 1. Interface Implementation Tests
// ============================================================================

describe('Adapter Interface Consistency', () => {
  describe('Both adapters implement StorageAdapter interface', () => {
    const expectedMethods: (keyof StorageAdapter)[] = [
      'initialize',
      'close',
      'isConnected',
      'getType',
      'createNode',
      'getNode',
      'updateNode',
      'deleteNode',
      'createRelationship',
      'getRelationship',
      'updateRelationship',
      'deleteRelationship',
      'executeQuery',
      'beginTransaction',
      'commit',
      'rollback',
    ]

    it('DOStorageAdapter implements all required methods', async () => {
      const { adapter, cleanup } = await createDOAdapter()

      for (const method of expectedMethods) {
        expect(typeof adapter[method]).toBe('function')
      }

      await cleanup()
    })

    it('D1StorageAdapter implements all required methods', async () => {
      const { adapter, cleanup } = await createD1Adapter()

      for (const method of expectedMethods) {
        expect(typeof adapter[method]).toBe('function')
      }

      await cleanup()
    })

    it('both adapters have identical method signatures', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      for (const method of expectedMethods) {
        const doMethod = doAdapter[method] as Function
        const d1Method = d1Adapter[method] as Function
        expect(doMethod.length).toBe(d1Method.length)
      }

      await doCleanup()
      await d1Cleanup()
    })

    it('both adapters can be assigned to StorageAdapter type', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      // TypeScript compilation proves interface compliance
      const adapters: StorageAdapter[] = [doAdapter, d1Adapter]
      expect(adapters).toHaveLength(2)

      await doCleanup()
      await d1Cleanup()
    })
  })
})

// ============================================================================
// 2. Transaction Behavior Consistency Tests
// ============================================================================

describe('Transaction Behavior Consistency', () => {
  describe.each([
    ['DOStorageAdapter', createDOAdapter],
    ['D1StorageAdapter', createD1Adapter],
  ])('%s transaction behavior', (adapterName, createAdapter) => {
    let adapter: StorageAdapter
    let cleanup: () => Promise<void>

    beforeEach(async () => {
      const result = await createAdapter()
      adapter = result.adapter
      cleanup = result.cleanup
    })

    afterEach(async () => {
      await cleanup()
    })

    it('beginTransaction returns a TransactionHandle', async () => {
      const txn = await adapter.beginTransaction()

      expect(txn).toBeDefined()
      expect(txn.id).toBeDefined()
      expect(typeof txn.id).toBe('string')
      expect(txn.active).toBe(true)
      expect(typeof txn.commit).toBe('function')
      expect(typeof txn.rollback).toBe('function')
    })

    it('commit sets transaction to inactive', async () => {
      const txn = await adapter.beginTransaction()
      expect(txn.active).toBe(true)

      await adapter.commit(txn)

      expect(txn.active).toBe(false)
    })

    it('rollback sets transaction to inactive', async () => {
      const txn = await adapter.beginTransaction()
      expect(txn.active).toBe(true)

      await adapter.rollback(txn)

      expect(txn.active).toBe(false)
    })

    it('commit on inactive transaction throws error', async () => {
      const txn = await adapter.beginTransaction()
      await adapter.commit(txn)

      await expect(adapter.commit(txn)).rejects.toThrow('Transaction is not active')
    })

    it('rollback on inactive transaction throws error', async () => {
      const txn = await adapter.beginTransaction()
      await adapter.rollback(txn)

      await expect(adapter.rollback(txn)).rejects.toThrow('Transaction is not active')
    })

    it('TransactionHandle.commit() delegates to adapter.commit()', async () => {
      const txn = await adapter.beginTransaction()

      await txn.commit()

      expect(txn.active).toBe(false)
    })

    it('TransactionHandle.rollback() delegates to adapter.rollback()', async () => {
      const txn = await adapter.beginTransaction()

      await txn.rollback()

      expect(txn.active).toBe(false)
    })
  })

  describe('Transaction behavior is identical across adapters', () => {
    it('both adapters generate unique transaction IDs', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doTxn1 = await doAdapter.beginTransaction()
      const doTxn2 = await doAdapter.beginTransaction()
      const d1Txn1 = await d1Adapter.beginTransaction()
      const d1Txn2 = await d1Adapter.beginTransaction()

      // All transaction IDs should be unique
      const ids = [doTxn1.id, doTxn2.id, d1Txn1.id, d1Txn2.id]
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(4)

      // All should start with 'txn-'
      for (const id of ids) {
        expect(id).toMatch(/^txn-/)
      }

      await doCleanup()
      await d1Cleanup()
    })
  })
})

// ============================================================================
// 3. CRUD Operations Consistency Tests
// ============================================================================

describe('CRUD Operations Consistency', () => {
  describe.each([
    ['DOStorageAdapter', createDOAdapter],
    ['D1StorageAdapter', createD1Adapter],
  ])('%s CRUD operations', (adapterName, createAdapter) => {
    let adapter: StorageAdapter
    let cleanup: () => Promise<void>

    beforeEach(async () => {
      const result = await createAdapter()
      adapter = result.adapter
      cleanup = result.cleanup
    })

    afterEach(async () => {
      await cleanup()
    })

    // Node Operations
    describe('Node Operations', () => {
      it('createNode returns a numeric id', async () => {
        const id = await adapter.createNode(['Person'], { name: 'Alice' })
        expect(typeof id).toBe('number')
      })

      it('getNode returns null for non-existent node', async () => {
        const node = await adapter.getNode(99999)
        expect(node).toBeNull()
      })

      it('updateNode throws for non-existent node', async () => {
        await expect(adapter.updateNode(99999, { name: 'Bob' })).rejects.toThrow(
          'Node with id 99999 not found'
        )
      })

      it('deleteNode completes without error', async () => {
        await expect(adapter.deleteNode(1)).resolves.not.toThrow()
      })
    })

    // Relationship Operations
    describe('Relationship Operations', () => {
      it('getRelationship returns null for non-existent relationship', async () => {
        const rel = await adapter.getRelationship(99999)
        expect(rel).toBeNull()
      })

      it('updateRelationship throws for non-existent relationship', async () => {
        await expect(adapter.updateRelationship(99999, { since: 2020 })).rejects.toThrow(
          'Relationship with id 99999 not found'
        )
      })

      it('createRelationship throws for non-existent start node', async () => {
        await expect(adapter.createRelationship('KNOWS', 99999, 1, {})).rejects.toThrow(
          'Start node with id 99999 not found'
        )
      })

      it('deleteRelationship completes without error', async () => {
        await expect(adapter.deleteRelationship(1)).resolves.not.toThrow()
      })
    })

    // Query Execution
    describe('Query Execution', () => {
      it('executeQuery returns QueryResult structure', async () => {
        const result = await adapter.executeQuery('MATCH (n) RETURN n')

        expect(result).toHaveProperty('records')
        expect(result).toHaveProperty('summary')
        expect(Array.isArray(result.records)).toBe(true)
        expect(result.summary).toHaveProperty('nodesCreated')
        expect(result.summary).toHaveProperty('nodesDeleted')
        expect(result.summary).toHaveProperty('relationshipsCreated')
        expect(result.summary).toHaveProperty('relationshipsDeleted')
        expect(result.summary).toHaveProperty('propertiesSet')
        expect(result.summary).toHaveProperty('labelsAdded')
        expect(result.summary).toHaveProperty('labelsRemoved')
      })

      it('executeQuery throws on invalid Cypher syntax', async () => {
        await expect(adapter.executeQuery('INVALID CYPHER')).rejects.toThrow()
      })
    })
  })

  describe('CRUD results are identical across adapters', () => {
    it('getNode returns same structure from both adapters', async () => {
      // Create mocks that return the same data
      const nodeData = {
        id: 1,
        labels: '["Person"]',
        properties: '{"name":"Alice","age":30}',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const doStorage = createMockDOStorage()
      doStorage.sql.exec.mockReturnValue({
        toArray: vi.fn().mockReturnValue([nodeData]),
      })

      const d1Db = createMockD1Database()
      d1Db.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue(nodeData),
      })

      const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
      const d1Adapter = new D1StorageAdapter(d1Db as unknown as D1Database)

      await doAdapter.initialize()
      await d1Adapter.initialize()

      const doNode = await doAdapter.getNode(1)
      const d1Node = await d1Adapter.getNode(1)

      // Both should have identical structure
      expect(doNode).toEqual(d1Node)
      expect(doNode).toEqual({
        id: 1,
        labels: ['Person'],
        properties: { name: 'Alice', age: 30 },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })

      await doAdapter.close()
      await d1Adapter.close()
    })

    it('getRelationship returns same structure from both adapters', async () => {
      const relData = {
        id: 1,
        type: 'KNOWS',
        start_node_id: 1,
        end_node_id: 2,
        properties: '{"since":2020}',
        created_at: '2024-01-01T00:00:00Z',
      }

      const doStorage = createMockDOStorage()
      doStorage.sql.exec.mockReturnValue({
        toArray: vi.fn().mockReturnValue([relData]),
      })

      const d1Db = createMockD1Database()
      d1Db.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue(relData),
      })

      const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
      const d1Adapter = new D1StorageAdapter(d1Db as unknown as D1Database)

      await doAdapter.initialize()
      await d1Adapter.initialize()

      const doRel = await doAdapter.getRelationship(1)
      const d1Rel = await d1Adapter.getRelationship(1)

      // Both should have identical structure
      expect(doRel).toEqual(d1Rel)
      expect(doRel).toEqual({
        id: 1,
        type: 'KNOWS',
        startNodeId: 1,
        endNodeId: 2,
        properties: { since: 2020 },
        createdAt: '2024-01-01T00:00:00Z',
      })

      await doAdapter.close()
      await d1Adapter.close()
    })

    it('executeQuery returns same summary structure from both adapters', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doResult = await doAdapter.executeQuery('MATCH (n) RETURN n')
      const d1Result = await d1Adapter.executeQuery('MATCH (n) RETURN n')

      // Summary structure should be identical
      expect(Object.keys(doResult.summary).sort()).toEqual(
        Object.keys(d1Result.summary).sort()
      )

      await doCleanup()
      await d1Cleanup()
    })
  })
})

// ============================================================================
// 4. Error Handling Consistency Tests
// ============================================================================

describe('Error Handling Consistency', () => {
  describe('Both adapters throw same error messages', () => {
    it('updateNode throws identical error for non-existent node', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doError = await doAdapter.updateNode(99999, {}).catch((e) => e.message)
      const d1Error = await d1Adapter.updateNode(99999, {}).catch((e) => e.message)

      expect(doError).toBe(d1Error)
      expect(doError).toBe('Node with id 99999 not found')

      await doCleanup()
      await d1Cleanup()
    })

    it('updateRelationship throws identical error for non-existent relationship', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doError = await doAdapter.updateRelationship(99999, {}).catch((e) => e.message)
      const d1Error = await d1Adapter.updateRelationship(99999, {}).catch((e) => e.message)

      expect(doError).toBe(d1Error)
      expect(doError).toBe('Relationship with id 99999 not found')

      await doCleanup()
      await d1Cleanup()
    })

    it('createRelationship throws identical error for missing start node', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doError = await doAdapter
        .createRelationship('KNOWS', 99999, 1, {})
        .catch((e) => e.message)
      const d1Error = await d1Adapter
        .createRelationship('KNOWS', 99999, 1, {})
        .catch((e) => e.message)

      expect(doError).toBe(d1Error)
      expect(doError).toBe('Start node with id 99999 not found')

      await doCleanup()
      await d1Cleanup()
    })

    it('commit throws identical error for inactive transaction', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doTxn = await doAdapter.beginTransaction()
      const d1Txn = await d1Adapter.beginTransaction()

      await doAdapter.commit(doTxn)
      await d1Adapter.commit(d1Txn)

      const doError = await doAdapter.commit(doTxn).catch((e) => e.message)
      const d1Error = await d1Adapter.commit(d1Txn).catch((e) => e.message)

      expect(doError).toBe(d1Error)
      expect(doError).toBe('Transaction is not active')

      await doCleanup()
      await d1Cleanup()
    })

    it('rollback throws identical error for inactive transaction', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doTxn = await doAdapter.beginTransaction()
      const d1Txn = await d1Adapter.beginTransaction()

      await doAdapter.rollback(doTxn)
      await d1Adapter.rollback(d1Txn)

      const doError = await doAdapter.rollback(doTxn).catch((e) => e.message)
      const d1Error = await d1Adapter.rollback(d1Txn).catch((e) => e.message)

      expect(doError).toBe(d1Error)
      expect(doError).toBe('Transaction is not active')

      await doCleanup()
      await d1Cleanup()
    })

    it('executeQuery throws on invalid Cypher from both adapters', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doError = await doAdapter.executeQuery('INVALID CYPHER').catch((e) => e.message)
      const d1Error = await d1Adapter.executeQuery('INVALID CYPHER').catch((e) => e.message)

      expect(doError).toBe(d1Error)
      expect(doError).toContain('Invalid Cypher syntax')

      await doCleanup()
      await d1Cleanup()
    })
  })

  describe('Both adapters handle null/undefined consistently', () => {
    it('getNode returns null for non-existent id', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doResult = await doAdapter.getNode(99999)
      const d1Result = await d1Adapter.getNode(99999)

      expect(doResult).toBeNull()
      expect(d1Result).toBeNull()

      await doCleanup()
      await d1Cleanup()
    })

    it('getRelationship returns null for non-existent id', async () => {
      const { adapter: doAdapter, cleanup: doCleanup } = await createDOAdapter()
      const { adapter: d1Adapter, cleanup: d1Cleanup } = await createD1Adapter()

      const doResult = await doAdapter.getRelationship(99999)
      const d1Result = await d1Adapter.getRelationship(99999)

      expect(doResult).toBeNull()
      expect(d1Result).toBeNull()

      await doCleanup()
      await d1Cleanup()
    })
  })
})

// ============================================================================
// 5. Adapter Swapping Tests
// ============================================================================

describe('Adapter Swapping Without Behavior Change', () => {
  describe('StorageAdapterFactory creates interchangeable adapters', () => {
    it('factory creates DO adapter with correct type', () => {
      const mockStorage = createMockDOStorage()
      const adapter = StorageAdapterFactory.create({
        type: StorageAdapterType.DO,
        doStorage: mockStorage as unknown as DurableObjectStorage,
      })

      expect(adapter.getType()).toBe(StorageAdapterType.DO)
      expect(adapter).toBeInstanceOf(DOStorageAdapter)
    })

    it('factory creates D1 adapter with correct type', () => {
      const mockDb = createMockD1Database()
      const adapter = StorageAdapterFactory.create({
        type: StorageAdapterType.D1,
        d1Database: mockDb as unknown as D1Database,
      })

      expect(adapter.getType()).toBe(StorageAdapterType.D1)
      expect(adapter).toBeInstanceOf(D1StorageAdapter)
    })
  })

  describe('StorageAdapterManager allows runtime swapping', () => {
    it('can set and get current adapter', () => {
      const manager = new StorageAdapterManager()
      const mockStorage = createMockDOStorage()
      const adapter = new DOStorageAdapter(mockStorage as unknown as DurableObjectStorage)

      manager.setAdapter(adapter)

      expect(manager.getCurrentAdapter()).toBe(adapter)
    })

    it('can switch from DO to D1 adapter', async () => {
      const manager = new StorageAdapterManager()

      const doStorage = createMockDOStorage()
      const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
      await doAdapter.initialize()
      manager.setAdapter(doAdapter)

      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.DO)

      const d1Db = createMockD1Database()
      const d1Adapter = new D1StorageAdapter(d1Db as unknown as D1Database)
      await manager.switchAdapter(d1Adapter)

      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.D1)
      expect(doAdapter.isConnected()).toBe(false) // Previous adapter closed
    })

    it('can switch from D1 to DO adapter', async () => {
      const manager = new StorageAdapterManager()

      const d1Db = createMockD1Database()
      const d1Adapter = new D1StorageAdapter(d1Db as unknown as D1Database)
      await d1Adapter.initialize()
      manager.setAdapter(d1Adapter)

      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.D1)

      const doStorage = createMockDOStorage()
      const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
      await manager.switchAdapter(doAdapter)

      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.DO)
      expect(d1Adapter.isConnected()).toBe(false) // Previous adapter closed
    })

    it('throws when getting adapter before one is set', () => {
      const manager = new StorageAdapterManager()

      expect(() => manager.getCurrentAdapter()).toThrow('No adapter has been set')
    })
  })

  describe('Adapters are polymorphically usable', () => {
    async function performOperations(adapter: StorageAdapter): Promise<{
      connected: boolean
      type: StorageAdapterType
      txnCreated: boolean
      queryResultShape: string[]
    }> {
      await adapter.initialize()

      const connected = adapter.isConnected()
      const type = adapter.getType()

      const txn = await adapter.beginTransaction()
      const txnCreated = txn.active
      await adapter.commit(txn)

      const queryResult = await adapter.executeQuery('MATCH (n) RETURN n')
      const queryResultShape = Object.keys(queryResult)

      await adapter.close()

      return { connected, type, txnCreated, queryResultShape }
    }

    it('DO adapter works through generic StorageAdapter interface', async () => {
      const mockStorage = createMockDOStorage()
      const adapter: StorageAdapter = new DOStorageAdapter(
        mockStorage as unknown as DurableObjectStorage
      )

      const result = await performOperations(adapter)

      expect(result.connected).toBe(true)
      expect(result.type).toBe(StorageAdapterType.DO)
      expect(result.txnCreated).toBe(true)
      expect(result.queryResultShape).toContain('records')
      expect(result.queryResultShape).toContain('summary')
    })

    it('D1 adapter works through generic StorageAdapter interface', async () => {
      const mockDb = createMockD1Database()
      const adapter: StorageAdapter = new D1StorageAdapter(mockDb as unknown as D1Database)

      const result = await performOperations(adapter)

      expect(result.connected).toBe(true)
      expect(result.type).toBe(StorageAdapterType.D1)
      expect(result.txnCreated).toBe(true)
      expect(result.queryResultShape).toContain('records')
      expect(result.queryResultShape).toContain('summary')
    })

    it('both adapters produce identical results through interface', async () => {
      const doStorage = createMockDOStorage()
      const d1Db = createMockD1Database()

      const doAdapter: StorageAdapter = new DOStorageAdapter(
        doStorage as unknown as DurableObjectStorage
      )
      const d1Adapter: StorageAdapter = new D1StorageAdapter(d1Db as unknown as D1Database)

      const doResult = await performOperations(doAdapter)
      const d1Result = await performOperations(d1Adapter)

      // Results should be structurally identical (except for type)
      expect(doResult.connected).toBe(d1Result.connected)
      expect(doResult.txnCreated).toBe(d1Result.txnCreated)
      expect(doResult.queryResultShape).toEqual(d1Result.queryResultShape)
    })
  })

  describe('Code using StorageAdapter interface works with both implementations', () => {
    class GraphService {
      constructor(private adapter: StorageAdapter) {}

      async init(): Promise<void> {
        await this.adapter.initialize()
      }

      isReady(): boolean {
        return this.adapter.isConnected()
      }

      getBackendType(): StorageAdapterType {
        return this.adapter.getType()
      }

      async executeInTransaction<T>(
        operation: (adapter: StorageAdapter) => Promise<T>
      ): Promise<T> {
        const txn = await this.adapter.beginTransaction()
        try {
          const result = await operation(this.adapter)
          await this.adapter.commit(txn)
          return result
        } catch (error) {
          await this.adapter.rollback(txn)
          throw error
        }
      }

      async cleanup(): Promise<void> {
        await this.adapter.close()
      }
    }

    it('GraphService works with DOStorageAdapter', async () => {
      const mockStorage = createMockDOStorage()
      const adapter = new DOStorageAdapter(mockStorage as unknown as DurableObjectStorage)
      const service = new GraphService(adapter)

      await service.init()

      expect(service.isReady()).toBe(true)
      expect(service.getBackendType()).toBe(StorageAdapterType.DO)

      await service.cleanup()
    })

    it('GraphService works with D1StorageAdapter', async () => {
      const mockDb = createMockD1Database()
      const adapter = new D1StorageAdapter(mockDb as unknown as D1Database)
      const service = new GraphService(adapter)

      await service.init()

      expect(service.isReady()).toBe(true)
      expect(service.getBackendType()).toBe(StorageAdapterType.D1)

      await service.cleanup()
    })

    it('GraphService can swap adapters at runtime', async () => {
      const doStorage = createMockDOStorage()
      const d1Db = createMockD1Database()

      const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
      let service = new GraphService(doAdapter)
      await service.init()

      expect(service.getBackendType()).toBe(StorageAdapterType.DO)

      // Swap to D1
      await service.cleanup()
      const d1Adapter = new D1StorageAdapter(d1Db as unknown as D1Database)
      service = new GraphService(d1Adapter)
      await service.init()

      expect(service.getBackendType()).toBe(StorageAdapterType.D1)

      await service.cleanup()
    })
  })
})

// ============================================================================
// Lifecycle Consistency Tests
// ============================================================================

describe('Lifecycle Consistency', () => {
  describe.each([
    ['DOStorageAdapter', createDOAdapter],
    ['D1StorageAdapter', createD1Adapter],
  ])('%s lifecycle', (adapterName, createAdapter) => {
    it('initialize is idempotent', async () => {
      const { adapter, cleanup } = await createAdapter()

      // Should not throw when called multiple times
      await expect(adapter.initialize()).resolves.not.toThrow()
      await expect(adapter.initialize()).resolves.not.toThrow()

      await cleanup()
    })

    it('isConnected returns true after initialize', async () => {
      const { adapter, cleanup } = await createAdapter()

      expect(adapter.isConnected()).toBe(true)

      await cleanup()
    })

    it('isConnected returns false after close', async () => {
      const { adapter } = await createAdapter()

      await adapter.close()

      expect(adapter.isConnected()).toBe(false)
    })

    it('close is idempotent', async () => {
      const { adapter } = await createAdapter()

      await expect(adapter.close()).resolves.not.toThrow()
      await expect(adapter.close()).resolves.not.toThrow()
    })
  })
})

// ============================================================================
// Health Check Consistency Tests
// ============================================================================

describe('Health Check Consistency', () => {
  it('StorageAdapterManager health check returns consistent structure', async () => {
    const doStorage = createMockDOStorage()
    const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
    await doAdapter.initialize()

    const manager = new StorageAdapterManager()
    manager.setAdapter(doAdapter)

    const health = await manager.checkHealth()

    expect(health).toHaveProperty('connected')
    expect(health).toHaveProperty('type')
    expect(typeof health.connected).toBe('boolean')

    await doAdapter.close()
  })

  it('health check reports correct adapter type', async () => {
    const manager = new StorageAdapterManager()

    // Check DO adapter
    const doStorage = createMockDOStorage()
    const doAdapter = new DOStorageAdapter(doStorage as unknown as DurableObjectStorage)
    await doAdapter.initialize()
    manager.setAdapter(doAdapter)

    let health = await manager.checkHealth()
    expect(health.type).toBe(StorageAdapterType.DO)

    // Switch to D1 and check
    const d1Db = createMockD1Database()
    const d1Adapter = new D1StorageAdapter(d1Db as unknown as D1Database)
    await manager.switchAdapter(d1Adapter)

    health = await manager.checkHealth()
    expect(health.type).toBe(StorageAdapterType.D1)

    await d1Adapter.close()
  })
})

// Type declarations for global Cloudflare types
declare global {
  interface D1Database {
    prepare(sql: string): D1PreparedStatement
    exec(sql: string): Promise<D1ExecResult>
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
    dump(): Promise<ArrayBuffer>
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    first<T = unknown>(colName?: string): Promise<T | null>
    get<T = unknown>(): Promise<T | null>
    run(): Promise<D1Result>
    all<T = unknown>(): Promise<D1Result<T>>
    raw<T = unknown>(): Promise<T[]>
  }

  interface D1Result<T = unknown> {
    results?: T[]
    success: boolean
    meta: {
      duration: number
      last_row_id: number
      changes: number
      served_by: string
      internal_stats: unknown
    }
    error?: string
  }

  interface D1ExecResult {
    count: number
    duration: number
  }

  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>
    get<T = unknown>(keys: string[]): Promise<Map<string, T>>
    put<T>(key: string, value: T): Promise<void>
    put<T>(entries: Record<string, T>): Promise<void>
    delete(key: string): Promise<boolean>
    delete(keys: string[]): Promise<number>
    list<T = unknown>(options?: DurableObjectStorageListOptions): Promise<Map<string, T>>
    transaction<T>(closure: () => Promise<T>): Promise<T>
    sql: SqlStorage
  }

  interface DurableObjectStorageListOptions {
    start?: string
    startAfter?: string
    end?: string
    prefix?: string
    reverse?: boolean
    limit?: number
  }

  interface SqlStorage {
    exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T>
  }

  interface SqlStorageCursor<T = Record<string, unknown>> {
    toArray(): T[]
    one(): T | null
    raw<R = unknown[]>(): R[]
    columnNames: string[]
    rowsRead: number
    rowsWritten: number
  }
}

export {}
