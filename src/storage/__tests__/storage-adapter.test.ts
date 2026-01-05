/**
 * Tests for Dual Storage Adapter (DO SQLite + D1)
 *
 * This test file defines the interface contracts for a storage adapter
 * that supports both Durable Object SQLite and D1 storage backends.
 *
 * TDD Red Phase: These tests are expected to FAIL initially.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// These imports will fail initially - that's expected for TDD
import {
  StorageAdapter,
  StorageAdapterFactory,
  DOStorageAdapter,
  D1StorageAdapter,
  StorageAdapterType,
  StorageAdapterConfig,
  TransactionHandle,
  QueryResult,
} from '../storage-adapter'
import type { Node, Relationship } from '../types'

// Mock D1 database for testing
interface MockD1Database {
  prepare: ReturnType<typeof vi.fn>
  exec: ReturnType<typeof vi.fn>
  batch: ReturnType<typeof vi.fn>
  dump: ReturnType<typeof vi.fn>
}

// Mock Durable Object storage for testing
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

describe('StorageAdapter Interface', () => {
  describe('StorageAdapter interface definition', () => {
    it('should define the StorageAdapter interface with required methods', () => {
      // This test verifies the interface structure exists
      const adapterMethods: (keyof StorageAdapter)[] = [
        'initialize',
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
        'getType',
        'isConnected',
        'close',
      ]

      // This will compile only if the interface is defined correctly
      expect(adapterMethods).toHaveLength(16)
    })

    it('should export StorageAdapterType enum with DO and D1', () => {
      expect(StorageAdapterType.DO).toBe('do')
      expect(StorageAdapterType.D1).toBe('d1')
    })

    it('should define StorageAdapterConfig interface', () => {
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.D1,
        d1Database: createMockD1Database() as unknown as D1Database,
      }

      expect(config.type).toBe('d1')
      expect(config.d1Database).toBeDefined()
    })

    it('should define TransactionHandle interface', () => {
      const mockTxn: TransactionHandle = {
        id: 'txn-123',
        active: true,
        commit: vi.fn(),
        rollback: vi.fn(),
      }

      expect(mockTxn.id).toBe('txn-123')
      expect(mockTxn.active).toBe(true)
      expect(typeof mockTxn.commit).toBe('function')
      expect(typeof mockTxn.rollback).toBe('function')
    })

    it('should define QueryResult interface', () => {
      const result: QueryResult = {
        records: [],
        summary: {
          nodesCreated: 0,
          nodesDeleted: 0,
          relationshipsCreated: 0,
          relationshipsDeleted: 0,
          propertiesSet: 0,
          labelsAdded: 0,
          labelsRemoved: 0,
        },
      }

      expect(result.records).toEqual([])
      expect(result.summary.nodesCreated).toBe(0)
    })
  })
})

describe('StorageAdapterFactory', () => {
  describe('create()', () => {
    it('should create a DOStorageAdapter when type is DO', async () => {
      const mockStorage = createMockDOStorage()
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.DO,
        doStorage: mockStorage as unknown as DurableObjectStorage,
      }

      const adapter = StorageAdapterFactory.create(config)

      expect(adapter).toBeInstanceOf(DOStorageAdapter)
      expect(adapter.getType()).toBe(StorageAdapterType.DO)
    })

    it('should create a D1StorageAdapter when type is D1', async () => {
      const mockDb = createMockD1Database()
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.D1,
        d1Database: mockDb as unknown as D1Database,
      }

      const adapter = StorageAdapterFactory.create(config)

      expect(adapter).toBeInstanceOf(D1StorageAdapter)
      expect(adapter.getType()).toBe(StorageAdapterType.D1)
    })

    it('should throw error for invalid adapter type', () => {
      const config = {
        type: 'invalid' as StorageAdapterType,
      }

      expect(() => StorageAdapterFactory.create(config as StorageAdapterConfig)).toThrow(
        'Invalid storage adapter type: invalid'
      )
    })

    it('should throw error when D1 type is specified without d1Database', () => {
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.D1,
      }

      expect(() => StorageAdapterFactory.create(config)).toThrow(
        'D1 database is required for D1 adapter'
      )
    })

    it('should throw error when DO type is specified without doStorage', () => {
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.DO,
      }

      expect(() => StorageAdapterFactory.create(config)).toThrow(
        'Durable Object storage is required for DO adapter'
      )
    })
  })

  describe('createFromEnvironment()', () => {
    it('should create adapter based on environment variables', () => {
      const mockDb = createMockD1Database()
      const env = {
        STORAGE_TYPE: 'd1',
        DB: mockDb,
      }

      const adapter = StorageAdapterFactory.createFromEnvironment(env)

      expect(adapter.getType()).toBe(StorageAdapterType.D1)
    })

    it('should default to DO adapter when STORAGE_TYPE is not set', () => {
      const mockStorage = createMockDOStorage()
      const env = {
        DO_STORAGE: mockStorage,
      }

      const adapter = StorageAdapterFactory.createFromEnvironment(env)

      expect(adapter.getType()).toBe(StorageAdapterType.DO)
    })
  })
})

describe('DOStorageAdapter', () => {
  let adapter: DOStorageAdapter
  let mockStorage: MockDOStorage

  beforeEach(async () => {
    mockStorage = createMockDOStorage()
    adapter = new DOStorageAdapter(mockStorage as unknown as DurableObjectStorage)
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.close()
  })

  describe('initialization', () => {
    it('should initialize the storage and create tables', async () => {
      const freshStorage = createMockDOStorage()
      const freshAdapter = new DOStorageAdapter(freshStorage as unknown as DurableObjectStorage)

      await freshAdapter.initialize()

      expect(freshStorage.sql.exec).toHaveBeenCalled()
    })

    it('should be idempotent - calling initialize twice should not error', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow()
    })

    it('should report connected state after initialization', async () => {
      expect(adapter.isConnected()).toBe(true)
    })
  })

  describe('getType()', () => {
    it('should return StorageAdapterType.DO', () => {
      expect(adapter.getType()).toBe(StorageAdapterType.DO)
    })
  })

  describe('node operations', () => {
    describe('createNode()', () => {
      it('should create a node and return its id', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([{ id: 1 }]),
        })

        const id = await adapter.createNode(['Person'], { name: 'Alice' })

        expect(id).toBe(1)
      })

      it('should create a node with multiple labels', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([{ id: 1 }]),
        })

        const id = await adapter.createNode(['Person', 'Employee'], { name: 'Alice' })
        const node = await adapter.getNode(id)

        expect(node?.labels).toEqual(['Person', 'Employee'])
      })

      it('should create a node with complex properties', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([{ id: 1 }]),
        })

        const props = {
          name: 'Alice',
          age: 30,
          active: true,
          scores: [95, 87, 92],
        }

        const id = await adapter.createNode(['Person'], props)
        const node = await adapter.getNode(id)

        expect(node?.properties).toEqual(props)
      })
    })

    describe('getNode()', () => {
      it('should return null for non-existent node', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([]),
        })

        const node = await adapter.getNode(999)

        expect(node).toBeNull()
      })

      it('should return node with correct structure', async () => {
        const mockNode = {
          id: 1,
          labels: '["Person"]',
          properties: '{"name":"Alice"}',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([mockNode]),
        })

        const node = await adapter.getNode(1)

        expect(node).not.toBeNull()
        expect(node?.id).toBe(1)
        expect(node?.labels).toEqual(['Person'])
        expect(node?.properties).toEqual({ name: 'Alice' })
      })
    })

    describe('updateNode()', () => {
      it('should update node properties', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([
            {
              id: 1,
              labels: '["Person"]',
              properties: '{"name":"Bob"}',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          ]),
        })

        await adapter.updateNode(1, { name: 'Alice', age: 30 })

        expect(mockStorage.sql.exec).toHaveBeenCalled()
      })

      it('should throw for non-existent node', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([]),
        })

        await expect(adapter.updateNode(999, { name: 'Ghost' })).rejects.toThrow(
          'Node with id 999 not found'
        )
      })
    })

    describe('deleteNode()', () => {
      it('should delete a node', async () => {
        await adapter.deleteNode(1)

        expect(mockStorage.sql.exec).toHaveBeenCalled()
      })

      it('should cascade delete relationships when node is deleted', async () => {
        // Set up mock to return proper sequence of data
        let callCount = 0
        mockStorage.sql.exec.mockImplementation(() => {
          callCount++
          // First call: createNode returns id 1
          if (callCount === 1) {
            return { toArray: vi.fn().mockReturnValue([{ id: 1 }]) }
          }
          // Second call: createNode returns id 2
          if (callCount === 2) {
            return { toArray: vi.fn().mockReturnValue([{ id: 2 }]) }
          }
          // Third call: getNode for start node validation (from cache, won't be called)
          // Fourth call: getNode for end node validation (from cache, won't be called)
          // Fifth call: createRelationship INSERT
          if (callCount <= 5) {
            return { toArray: vi.fn().mockReturnValue([{ id: 1 }]) }
          }
          // Remaining calls: delete and getRelationship
          return { toArray: vi.fn().mockReturnValue([]) }
        })

        // Create relationships first
        const id1 = await adapter.createNode(['Person'], { name: 'Alice' })
        const id2 = await adapter.createNode(['Person'], { name: 'Bob' })
        await adapter.createRelationship('KNOWS', id1, id2, {})

        await adapter.deleteNode(id1)

        const rel = await adapter.getRelationship(1)
        expect(rel).toBeNull()
      })
    })
  })

  describe('relationship operations', () => {
    describe('createRelationship()', () => {
      const mockNodeRow = {
        id: 1,
        labels: '["Person"]',
        properties: '{}',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      it('should create a relationship and return its id', async () => {
        // Mock to return node data for getNode calls, then relationship id
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([mockNodeRow]),
        })

        const relId = await adapter.createRelationship('KNOWS', 1, 2, {})

        expect(relId).toBe(1)
      })

      it('should create relationship with properties', async () => {
        let callCount = 0
        mockStorage.sql.exec.mockImplementation(() => {
          callCount++
          // First two calls are for getNode (start and end), third is for INSERT RETURNING
          if (callCount <= 2) {
            return {
              toArray: vi.fn().mockReturnValue([mockNodeRow]),
            }
          }
          if (callCount === 3) {
            // INSERT RETURNING id
            return {
              toArray: vi.fn().mockReturnValue([{ id: 1 }]),
            }
          }
          // Fourth call is for getRelationship
          return {
            toArray: vi.fn().mockReturnValue([{
              id: 1,
              type: 'KNOWS',
              start_node_id: 1,
              end_node_id: 2,
              properties: '{"since":2020}',
              created_at: '2024-01-01T00:00:00Z',
            }]),
          }
        })

        const relId = await adapter.createRelationship('KNOWS', 1, 2, { since: 2020 })
        const rel = await adapter.getRelationship(relId)

        expect(rel?.properties).toEqual({ since: 2020 })
      })

      it('should throw if start node does not exist', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([]),
        })

        await expect(adapter.createRelationship('KNOWS', 999, 2, {})).rejects.toThrow(
          'Start node with id 999 not found'
        )
      })

      it('should throw if end node does not exist', async () => {
        mockStorage.sql.exec
          .mockReturnValueOnce({ toArray: vi.fn().mockReturnValue([mockNodeRow]) })
          .mockReturnValueOnce({ toArray: vi.fn().mockReturnValue([]) })

        await expect(adapter.createRelationship('KNOWS', 1, 999, {})).rejects.toThrow(
          'End node with id 999 not found'
        )
      })
    })

    describe('getRelationship()', () => {
      it('should return null for non-existent relationship', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([]),
        })

        const rel = await adapter.getRelationship(999)

        expect(rel).toBeNull()
      })

      it('should return relationship with correct structure', async () => {
        const mockRel = {
          id: 1,
          type: 'KNOWS',
          start_node_id: 1,
          end_node_id: 2,
          properties: '{"since":2020}',
          created_at: '2024-01-01T00:00:00Z',
        }
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([mockRel]),
        })

        const rel = await adapter.getRelationship(1)

        expect(rel).not.toBeNull()
        expect(rel?.id).toBe(1)
        expect(rel?.type).toBe('KNOWS')
        expect(rel?.startNodeId).toBe(1)
        expect(rel?.endNodeId).toBe(2)
        expect(rel?.properties).toEqual({ since: 2020 })
      })
    })

    describe('updateRelationship()', () => {
      it('should update relationship properties', async () => {
        // Mock getRelationship to return an existing relationship
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([{
            id: 1,
            type: 'KNOWS',
            start_node_id: 1,
            end_node_id: 2,
            properties: '{"since":2020}',
            created_at: '2024-01-01T00:00:00Z',
          }]),
        })

        await adapter.updateRelationship(1, { since: 2021 })

        expect(mockStorage.sql.exec).toHaveBeenCalled()
      })

      it('should throw for non-existent relationship', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([]),
        })

        await expect(adapter.updateRelationship(999, { since: 2020 })).rejects.toThrow(
          'Relationship with id 999 not found'
        )
      })
    })

    describe('deleteRelationship()', () => {
      it('should delete a relationship', async () => {
        await adapter.deleteRelationship(1)

        expect(mockStorage.sql.exec).toHaveBeenCalled()
      })
    })
  })

  describe('query execution', () => {
    describe('executeQuery()', () => {
      it('should execute a Cypher query and return results', async () => {
        const result = await adapter.executeQuery('MATCH (n:Person) RETURN n')

        expect(result).toBeDefined()
        expect(result.records).toBeDefined()
        expect(result.summary).toBeDefined()
      })

      it('should execute CREATE query and return created node', async () => {
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([{ id: 1 }]),
        })

        const result = await adapter.executeQuery(
          "CREATE (n:Person {name: 'Alice'}) RETURN n"
        )

        expect(result.summary.nodesCreated).toBe(1)
      })

      it('should execute query with parameters', async () => {
        const result = await adapter.executeQuery(
          'MATCH (n:Person {name: $name}) RETURN n',
          { name: 'Alice' }
        )

        expect(result.records).toBeDefined()
      })

      it('should throw on invalid Cypher syntax', async () => {
        await expect(adapter.executeQuery('INVALID CYPHER')).rejects.toThrow()
      })
    })
  })

  describe('transaction operations', () => {
    describe('beginTransaction()', () => {
      it('should begin a transaction and return a handle', async () => {
        const txn = await adapter.beginTransaction()

        expect(txn).toBeDefined()
        expect(txn.id).toBeDefined()
        expect(txn.active).toBe(true)
      })

      it('should allow nested operations within transaction', async () => {
        const txn = await adapter.beginTransaction()

        await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.createNode(['Person'], { name: 'Bob' })

        expect(txn.active).toBe(true)
      })
    })

    describe('commit()', () => {
      it('should commit the transaction', async () => {
        const txn = await adapter.beginTransaction()
        await adapter.createNode(['Person'], { name: 'Alice' })

        await adapter.commit(txn)

        expect(txn.active).toBe(false)
      })

      it('should persist changes after commit', async () => {
        const txn = await adapter.beginTransaction()
        mockStorage.sql.exec.mockReturnValue({
          toArray: vi.fn().mockReturnValue([{ id: 1 }]),
        })
        const id = await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.commit(txn)

        const node = await adapter.getNode(id)
        expect(node).not.toBeNull()
      })

      it('should throw when committing inactive transaction', async () => {
        const txn = await adapter.beginTransaction()
        await adapter.commit(txn)

        await expect(adapter.commit(txn)).rejects.toThrow('Transaction is not active')
      })
    })

    describe('rollback()', () => {
      it('should rollback the transaction', async () => {
        const txn = await adapter.beginTransaction()
        await adapter.createNode(['Person'], { name: 'Alice' })

        await adapter.rollback(txn)

        expect(txn.active).toBe(false)
      })

      it('should discard changes after rollback', async () => {
        const txn = await adapter.beginTransaction()
        const id = await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.rollback(txn)

        const node = await adapter.getNode(id)
        expect(node).toBeNull()
      })

      it('should throw when rolling back inactive transaction', async () => {
        const txn = await adapter.beginTransaction()
        await adapter.rollback(txn)

        await expect(adapter.rollback(txn)).rejects.toThrow('Transaction is not active')
      })
    })
  })

  describe('close()', () => {
    it('should close the adapter and release resources', async () => {
      await adapter.close()

      expect(adapter.isConnected()).toBe(false)
    })

    it('should be idempotent - calling close twice should not error', async () => {
      await adapter.close()
      await expect(adapter.close()).resolves.not.toThrow()
    })
  })
})

describe('D1StorageAdapter', () => {
  let adapter: D1StorageAdapter
  let mockDb: MockD1Database

  beforeEach(async () => {
    mockDb = createMockD1Database()
    adapter = new D1StorageAdapter(mockDb as unknown as D1Database)
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.close()
  })

  describe('initialization', () => {
    it('should initialize the storage and create tables', async () => {
      const freshDb = createMockD1Database()
      const freshAdapter = new D1StorageAdapter(freshDb as unknown as D1Database)

      await freshAdapter.initialize()

      expect(freshDb.exec).toHaveBeenCalled()
    })

    it('should be idempotent - calling initialize twice should not error', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow()
    })

    it('should report connected state after initialization', async () => {
      expect(adapter.isConnected()).toBe(true)
    })
  })

  describe('getType()', () => {
    it('should return StorageAdapterType.D1', () => {
      expect(adapter.getType()).toBe(StorageAdapterType.D1)
    })
  })

  describe('node operations', () => {
    describe('createNode()', () => {
      it('should create a node and return its id', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
        })

        const id = await adapter.createNode(['Person'], { name: 'Alice' })

        expect(id).toBe(1)
      })

      it('should create a node with multiple labels', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person","Employee"]',
            properties: '{"name":"Alice"}',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        const id = await adapter.createNode(['Person', 'Employee'], { name: 'Alice' })
        const node = await adapter.getNode(id)

        expect(node?.labels).toEqual(['Person', 'Employee'])
      })

      it('should create a node with complex properties', async () => {
        const props = {
          name: 'Alice',
          age: 30,
          active: true,
          scores: [95, 87, 92],
        }

        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person"]',
            properties: JSON.stringify(props),
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        const id = await adapter.createNode(['Person'], props)
        const node = await adapter.getNode(id)

        expect(node?.properties).toEqual(props)
      })
    })

    describe('getNode()', () => {
      it('should return null for non-existent node', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue(null),
        })

        const node = await adapter.getNode(999)

        expect(node).toBeNull()
      })

      it('should return node with correct structure', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person"]',
            properties: '{"name":"Alice"}',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        const node = await adapter.getNode(1)

        expect(node).not.toBeNull()
        expect(node?.id).toBe(1)
        expect(node?.labels).toEqual(['Person'])
        expect(node?.properties).toEqual({ name: 'Alice' })
      })
    })

    describe('updateNode()', () => {
      it('should update node properties', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person"]',
            properties: '{"name":"Alice"}',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        await adapter.updateNode(1, { name: 'Alice', age: 30 })

        expect(mockDb.prepare).toHaveBeenCalled()
      })

      it('should throw for non-existent node', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue(null),
        })

        await expect(adapter.updateNode(999, { name: 'Ghost' })).rejects.toThrow(
          'Node with id 999 not found'
        )
      })
    })

    describe('deleteNode()', () => {
      it('should delete a node', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        })

        await adapter.deleteNode(1)

        expect(mockDb.prepare).toHaveBeenCalled()
      })

      it('should cascade delete relationships when node is deleted', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          get: vi.fn().mockResolvedValue(null),
        })

        await adapter.deleteNode(1)

        const rel = await adapter.getRelationship(1)
        expect(rel).toBeNull()
      })
    })
  })

  describe('relationship operations', () => {
    describe('createRelationship()', () => {
      it('should create a relationship and return its id', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person"]',
            properties: '{}',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        const relId = await adapter.createRelationship('KNOWS', 1, 2, {})

        expect(relId).toBe(1)
      })

      it('should create relationship with properties', async () => {
        let callCount = 0
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockImplementation(() => {
            callCount++
            // First two calls are for getNode (start and end node)
            if (callCount <= 2) {
              return Promise.resolve({
                id: callCount,
                labels: '["Person"]',
                properties: '{}',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
              })
            }
            // Third call is for getRelationship
            return Promise.resolve({
              id: 1,
              type: 'KNOWS',
              start_node_id: 1,
              end_node_id: 2,
              properties: '{"since":2020}',
              created_at: '2024-01-01T00:00:00Z',
            })
          }),
        })

        const relId = await adapter.createRelationship('KNOWS', 1, 2, { since: 2020 })
        const rel = await adapter.getRelationship(relId)

        expect(rel?.properties).toEqual({ since: 2020 })
      })

      it('should throw if start node does not exist', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue(null),
        })

        await expect(adapter.createRelationship('KNOWS', 999, 2, {})).rejects.toThrow(
          'Start node with id 999 not found'
        )
      })

      it('should throw if end node does not exist', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi
            .fn()
            .mockResolvedValueOnce({
              id: 1,
              labels: '["Person"]',
              properties: '{}',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            })
            .mockResolvedValueOnce(null),
        })

        await expect(adapter.createRelationship('KNOWS', 1, 999, {})).rejects.toThrow(
          'End node with id 999 not found'
        )
      })
    })

    describe('getRelationship()', () => {
      it('should return null for non-existent relationship', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue(null),
        })

        const rel = await adapter.getRelationship(999)

        expect(rel).toBeNull()
      })

      it('should return relationship with correct structure', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({
            id: 1,
            type: 'KNOWS',
            start_node_id: 1,
            end_node_id: 2,
            properties: '{"since":2020}',
            created_at: '2024-01-01T00:00:00Z',
          }),
        })

        const rel = await adapter.getRelationship(1)

        expect(rel).not.toBeNull()
        expect(rel?.id).toBe(1)
        expect(rel?.type).toBe('KNOWS')
        expect(rel?.startNodeId).toBe(1)
        expect(rel?.endNodeId).toBe(2)
        expect(rel?.properties).toEqual({ since: 2020 })
      })
    })

    describe('updateRelationship()', () => {
      it('should update relationship properties', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            type: 'KNOWS',
            start_node_id: 1,
            end_node_id: 2,
            properties: '{"since":2020}',
            created_at: '2024-01-01T00:00:00Z',
          }),
        })

        await adapter.updateRelationship(1, { since: 2021 })

        expect(mockDb.prepare).toHaveBeenCalled()
      })

      it('should throw for non-existent relationship', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue(null),
        })

        await expect(adapter.updateRelationship(999, { since: 2020 })).rejects.toThrow(
          'Relationship with id 999 not found'
        )
      })
    })

    describe('deleteRelationship()', () => {
      it('should delete a relationship', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        })

        await adapter.deleteRelationship(1)

        expect(mockDb.prepare).toHaveBeenCalled()
      })
    })
  })

  describe('query execution', () => {
    describe('executeQuery()', () => {
      it('should execute a Cypher query and return results', async () => {
        const result = await adapter.executeQuery('MATCH (n:Person) RETURN n')

        expect(result).toBeDefined()
        expect(result.records).toBeDefined()
        expect(result.summary).toBeDefined()
      })

      it('should execute CREATE query and return created node', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person"]',
            properties: '{"name":"Alice"}',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        const result = await adapter.executeQuery(
          "CREATE (n:Person {name: 'Alice'}) RETURN n"
        )

        expect(result.summary.nodesCreated).toBe(1)
      })

      it('should execute query with parameters', async () => {
        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })

        const result = await adapter.executeQuery(
          'MATCH (n:Person {name: $name}) RETURN n',
          { name: 'Alice' }
        )

        expect(result.records).toBeDefined()
      })

      it('should throw on invalid Cypher syntax', async () => {
        await expect(adapter.executeQuery('INVALID CYPHER')).rejects.toThrow()
      })
    })
  })

  describe('transaction operations', () => {
    describe('beginTransaction()', () => {
      it('should begin a transaction and return a handle', async () => {
        const txn = await adapter.beginTransaction()

        expect(txn).toBeDefined()
        expect(txn.id).toBeDefined()
        expect(txn.active).toBe(true)
      })

      it('should allow nested operations within transaction', async () => {
        const txn = await adapter.beginTransaction()

        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
        })

        await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.createNode(['Person'], { name: 'Bob' })

        expect(txn.active).toBe(true)
      })
    })

    describe('commit()', () => {
      it('should commit the transaction', async () => {
        const txn = await adapter.beginTransaction()

        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
        })

        await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.commit(txn)

        expect(txn.active).toBe(false)
      })

      it('should persist changes after commit', async () => {
        const txn = await adapter.beginTransaction()

        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockResolvedValue({
            id: 1,
            labels: '["Person"]',
            properties: '{"name":"Alice"}',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        })

        const id = await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.commit(txn)

        const node = await adapter.getNode(id)
        expect(node).not.toBeNull()
      })

      it('should throw when committing inactive transaction', async () => {
        const txn = await adapter.beginTransaction()
        await adapter.commit(txn)

        await expect(adapter.commit(txn)).rejects.toThrow('Transaction is not active')
      })
    })

    describe('rollback()', () => {
      it('should rollback the transaction', async () => {
        const txn = await adapter.beginTransaction()

        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
        })

        await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.rollback(txn)

        expect(txn.active).toBe(false)
      })

      it('should discard changes after rollback', async () => {
        const txn = await adapter.beginTransaction()

        mockDb.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1, changes: 1 } }),
          get: vi.fn().mockResolvedValue(null),
        })

        const id = await adapter.createNode(['Person'], { name: 'Alice' })
        await adapter.rollback(txn)

        const node = await adapter.getNode(id)
        expect(node).toBeNull()
      })

      it('should throw when rolling back inactive transaction', async () => {
        const txn = await adapter.beginTransaction()
        await adapter.rollback(txn)

        await expect(adapter.rollback(txn)).rejects.toThrow('Transaction is not active')
      })
    })
  })

  describe('D1-specific batch operations', () => {
    describe('batch()', () => {
      it('should execute multiple statements in a batch', async () => {
        mockDb.batch.mockResolvedValue([
          { meta: { last_row_id: 1, changes: 1 } },
          { meta: { last_row_id: 2, changes: 1 } },
        ])

        const results = await adapter.batch([
          { sql: "INSERT INTO nodes (labels, properties) VALUES ('[]', '{}')" },
          { sql: "INSERT INTO nodes (labels, properties) VALUES ('[]', '{}')" },
        ])

        expect(results).toHaveLength(2)
      })
    })
  })

  describe('close()', () => {
    it('should close the adapter and release resources', async () => {
      await adapter.close()

      expect(adapter.isConnected()).toBe(false)
    })

    it('should be idempotent - calling close twice should not error', async () => {
      await adapter.close()
      await expect(adapter.close()).resolves.not.toThrow()
    })
  })
})

describe('Adapter API Compatibility', () => {
  let doAdapter: DOStorageAdapter
  let d1Adapter: D1StorageAdapter
  let mockDOStorage: MockDOStorage
  let mockD1Db: MockD1Database

  beforeEach(async () => {
    mockDOStorage = createMockDOStorage()
    mockD1Db = createMockD1Database()

    doAdapter = new DOStorageAdapter(mockDOStorage as unknown as DurableObjectStorage)
    d1Adapter = new D1StorageAdapter(mockD1Db as unknown as D1Database)

    await doAdapter.initialize()
    await d1Adapter.initialize()
  })

  afterEach(async () => {
    await doAdapter.close()
    await d1Adapter.close()
  })

  describe('both adapters should have identical method signatures', () => {
    it('should have createNode with same signature', () => {
      expect(typeof doAdapter.createNode).toBe('function')
      expect(typeof d1Adapter.createNode).toBe('function')
      expect(doAdapter.createNode.length).toBe(d1Adapter.createNode.length)
    })

    it('should have getNode with same signature', () => {
      expect(typeof doAdapter.getNode).toBe('function')
      expect(typeof d1Adapter.getNode).toBe('function')
      expect(doAdapter.getNode.length).toBe(d1Adapter.getNode.length)
    })

    it('should have updateNode with same signature', () => {
      expect(typeof doAdapter.updateNode).toBe('function')
      expect(typeof d1Adapter.updateNode).toBe('function')
      expect(doAdapter.updateNode.length).toBe(d1Adapter.updateNode.length)
    })

    it('should have deleteNode with same signature', () => {
      expect(typeof doAdapter.deleteNode).toBe('function')
      expect(typeof d1Adapter.deleteNode).toBe('function')
      expect(doAdapter.deleteNode.length).toBe(d1Adapter.deleteNode.length)
    })

    it('should have createRelationship with same signature', () => {
      expect(typeof doAdapter.createRelationship).toBe('function')
      expect(typeof d1Adapter.createRelationship).toBe('function')
      expect(doAdapter.createRelationship.length).toBe(d1Adapter.createRelationship.length)
    })

    it('should have getRelationship with same signature', () => {
      expect(typeof doAdapter.getRelationship).toBe('function')
      expect(typeof d1Adapter.getRelationship).toBe('function')
      expect(doAdapter.getRelationship.length).toBe(d1Adapter.getRelationship.length)
    })

    it('should have updateRelationship with same signature', () => {
      expect(typeof doAdapter.updateRelationship).toBe('function')
      expect(typeof d1Adapter.updateRelationship).toBe('function')
      expect(doAdapter.updateRelationship.length).toBe(d1Adapter.updateRelationship.length)
    })

    it('should have deleteRelationship with same signature', () => {
      expect(typeof doAdapter.deleteRelationship).toBe('function')
      expect(typeof d1Adapter.deleteRelationship).toBe('function')
      expect(doAdapter.deleteRelationship.length).toBe(d1Adapter.deleteRelationship.length)
    })

    it('should have executeQuery with same signature', () => {
      expect(typeof doAdapter.executeQuery).toBe('function')
      expect(typeof d1Adapter.executeQuery).toBe('function')
      expect(doAdapter.executeQuery.length).toBe(d1Adapter.executeQuery.length)
    })

    it('should have beginTransaction with same signature', () => {
      expect(typeof doAdapter.beginTransaction).toBe('function')
      expect(typeof d1Adapter.beginTransaction).toBe('function')
      expect(doAdapter.beginTransaction.length).toBe(d1Adapter.beginTransaction.length)
    })

    it('should have commit with same signature', () => {
      expect(typeof doAdapter.commit).toBe('function')
      expect(typeof d1Adapter.commit).toBe('function')
      expect(doAdapter.commit.length).toBe(d1Adapter.commit.length)
    })

    it('should have rollback with same signature', () => {
      expect(typeof doAdapter.rollback).toBe('function')
      expect(typeof d1Adapter.rollback).toBe('function')
      expect(doAdapter.rollback.length).toBe(d1Adapter.rollback.length)
    })
  })

  describe('both adapters should return compatible data types', () => {
    it('should return Node type from getNode', async () => {
      // Setup mocks
      mockDOStorage.sql.exec.mockReturnValue({
        toArray: vi.fn().mockReturnValue([{
          id: 1,
          labels: '["Person"]',
          properties: '{"name":"Alice"}',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }]),
      })
      mockD1Db.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({
          id: 1,
          labels: '["Person"]',
          properties: '{"name":"Alice"}',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }),
      })

      const doNode = await doAdapter.getNode(1)
      const d1Node = await d1Adapter.getNode(1)

      expect(doNode).toHaveProperty('id')
      expect(doNode).toHaveProperty('labels')
      expect(doNode).toHaveProperty('properties')
      expect(d1Node).toHaveProperty('id')
      expect(d1Node).toHaveProperty('labels')
      expect(d1Node).toHaveProperty('properties')
    })

    it('should return Relationship type from getRelationship', async () => {
      // Setup mocks
      mockDOStorage.sql.exec.mockReturnValue({
        toArray: vi.fn().mockReturnValue([{
          id: 1,
          type: 'KNOWS',
          start_node_id: 1,
          end_node_id: 2,
          properties: '{}',
          created_at: '2024-01-01T00:00:00Z',
        }]),
      })
      mockD1Db.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({
          id: 1,
          type: 'KNOWS',
          start_node_id: 1,
          end_node_id: 2,
          properties: '{}',
          created_at: '2024-01-01T00:00:00Z',
        }),
      })

      const doRel = await doAdapter.getRelationship(1)
      const d1Rel = await d1Adapter.getRelationship(1)

      expect(doRel).toHaveProperty('id')
      expect(doRel).toHaveProperty('type')
      expect(doRel).toHaveProperty('startNodeId')
      expect(doRel).toHaveProperty('endNodeId')
      expect(d1Rel).toHaveProperty('id')
      expect(d1Rel).toHaveProperty('type')
      expect(d1Rel).toHaveProperty('startNodeId')
      expect(d1Rel).toHaveProperty('endNodeId')
    })

    it('should return QueryResult type from executeQuery', async () => {
      const doResult = await doAdapter.executeQuery('MATCH (n) RETURN n')
      const d1Result = await d1Adapter.executeQuery('MATCH (n) RETURN n')

      expect(doResult).toHaveProperty('records')
      expect(doResult).toHaveProperty('summary')
      expect(d1Result).toHaveProperty('records')
      expect(d1Result).toHaveProperty('summary')
    })

    it('should return TransactionHandle type from beginTransaction', async () => {
      const doTxn = await doAdapter.beginTransaction()
      const d1Txn = await d1Adapter.beginTransaction()

      expect(doTxn).toHaveProperty('id')
      expect(doTxn).toHaveProperty('active')
      expect(doTxn).toHaveProperty('commit')
      expect(doTxn).toHaveProperty('rollback')
      expect(d1Txn).toHaveProperty('id')
      expect(d1Txn).toHaveProperty('active')
      expect(d1Txn).toHaveProperty('commit')
      expect(d1Txn).toHaveProperty('rollback')
    })
  })
})

describe('Configuration-based adapter selection', () => {
  describe('StorageAdapterConfig', () => {
    it('should allow configuration for D1 adapter', () => {
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.D1,
        d1Database: createMockD1Database() as unknown as D1Database,
        options: {
          maxConnections: 10,
          timeout: 5000,
        },
      }

      expect(config.type).toBe(StorageAdapterType.D1)
      expect(config.options?.maxConnections).toBe(10)
    })

    it('should allow configuration for DO adapter', () => {
      const config: StorageAdapterConfig = {
        type: StorageAdapterType.DO,
        doStorage: createMockDOStorage() as unknown as DurableObjectStorage,
        options: {
          isolationLevel: 'serializable',
        },
      }

      expect(config.type).toBe(StorageAdapterType.DO)
      expect(config.options?.isolationLevel).toBe('serializable')
    })

    it('should allow shared configuration options', () => {
      const sharedOptions = {
        enableQueryLogging: true,
        queryTimeout: 30000,
      }

      const d1Config: StorageAdapterConfig = {
        type: StorageAdapterType.D1,
        d1Database: createMockD1Database() as unknown as D1Database,
        options: sharedOptions,
      }

      const doConfig: StorageAdapterConfig = {
        type: StorageAdapterType.DO,
        doStorage: createMockDOStorage() as unknown as DurableObjectStorage,
        options: sharedOptions,
      }

      expect(d1Config.options).toEqual(doConfig.options)
    })
  })
})

describe('Adapter switching at runtime', () => {
  describe('StorageAdapterManager', () => {
    it('should allow switching adapters at runtime', async () => {
      // Import the manager (will fail initially)
      const { StorageAdapterManager } = await import('../storage-adapter')

      const mockDOStorage = createMockDOStorage()
      const mockD1Db = createMockD1Database()

      const manager = new StorageAdapterManager()

      // Start with DO adapter
      manager.setAdapter(
        StorageAdapterFactory.create({
          type: StorageAdapterType.DO,
          doStorage: mockDOStorage as unknown as DurableObjectStorage,
        })
      )

      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.DO)

      // Switch to D1 adapter
      manager.setAdapter(
        StorageAdapterFactory.create({
          type: StorageAdapterType.D1,
          d1Database: mockD1Db as unknown as D1Database,
        })
      )

      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.D1)
    })

    it('should gracefully close previous adapter when switching', async () => {
      const { StorageAdapterManager } = await import('../storage-adapter')

      const mockDOStorage = createMockDOStorage()
      const mockD1Db = createMockD1Database()

      const manager = new StorageAdapterManager()

      const doAdapter = StorageAdapterFactory.create({
        type: StorageAdapterType.DO,
        doStorage: mockDOStorage as unknown as DurableObjectStorage,
      })
      await doAdapter.initialize()

      manager.setAdapter(doAdapter)

      const d1Adapter = StorageAdapterFactory.create({
        type: StorageAdapterType.D1,
        d1Database: mockD1Db as unknown as D1Database,
      })

      await manager.switchAdapter(d1Adapter)

      expect(doAdapter.isConnected()).toBe(false)
      expect(manager.getCurrentAdapter().getType()).toBe(StorageAdapterType.D1)
    })

    it('should throw when getting adapter before one is set', async () => {
      const { StorageAdapterManager } = await import('../storage-adapter')

      const manager = new StorageAdapterManager()

      expect(() => manager.getCurrentAdapter()).toThrow('No adapter has been set')
    })

    it('should support adapter health checks', async () => {
      const { StorageAdapterManager } = await import('../storage-adapter')

      const mockDOStorage = createMockDOStorage()
      const manager = new StorageAdapterManager()

      const adapter = StorageAdapterFactory.create({
        type: StorageAdapterType.DO,
        doStorage: mockDOStorage as unknown as DurableObjectStorage,
      })
      await adapter.initialize()

      manager.setAdapter(adapter)

      const health = await manager.checkHealth()

      expect(health.connected).toBe(true)
      expect(health.type).toBe(StorageAdapterType.DO)
    })

    it('should support automatic failover between adapters', async () => {
      const { StorageAdapterManager } = await import('../storage-adapter')

      const mockDOStorage = createMockDOStorage()
      const mockD1Db = createMockD1Database()

      const manager = new StorageAdapterManager({
        enableFailover: true,
        failoverAdapterConfig: {
          type: StorageAdapterType.D1,
          d1Database: mockD1Db as unknown as D1Database,
        },
      })

      const doAdapter = StorageAdapterFactory.create({
        type: StorageAdapterType.DO,
        doStorage: mockDOStorage as unknown as DurableObjectStorage,
      })

      manager.setAdapter(doAdapter)

      // Simulate primary adapter failure
      mockDOStorage.sql.exec.mockImplementation(() => {
        throw new Error('Connection lost')
      })

      // Manager should automatically failover to D1
      const adapter = await manager.getAdapterWithFailover()

      expect(adapter.getType()).toBe(StorageAdapterType.D1)
    })
  })
})

describe('Error handling consistency', () => {
  let doAdapter: DOStorageAdapter
  let d1Adapter: D1StorageAdapter

  beforeEach(async () => {
    const mockDOStorage = createMockDOStorage()
    const mockD1Db = createMockD1Database()

    doAdapter = new DOStorageAdapter(mockDOStorage as unknown as DurableObjectStorage)
    d1Adapter = new D1StorageAdapter(mockD1Db as unknown as D1Database)
  })

  it('should throw same error type for node not found', async () => {
    const doError = await doAdapter.getNode(999).catch((e) => e)
    const d1Error = await d1Adapter.getNode(999).catch((e) => e)

    // Both should return null, not throw
    expect(doError).toBeNull()
    expect(d1Error).toBeNull()
  })

  it('should throw same error type for update non-existent node', async () => {
    await expect(doAdapter.updateNode(999, {})).rejects.toThrow('Node with id 999 not found')
    await expect(d1Adapter.updateNode(999, {})).rejects.toThrow('Node with id 999 not found')
  })

  it('should throw same error type for invalid relationship references', async () => {
    await expect(doAdapter.createRelationship('KNOWS', 999, 1, {})).rejects.toThrow(
      'Start node with id 999 not found'
    )
    await expect(d1Adapter.createRelationship('KNOWS', 999, 1, {})).rejects.toThrow(
      'Start node with id 999 not found'
    )
  })

  it('should throw same error type for transaction errors', async () => {
    const doTxn = await doAdapter.beginTransaction()
    await doAdapter.commit(doTxn)

    const d1Txn = await d1Adapter.beginTransaction()
    await d1Adapter.commit(d1Txn)

    await expect(doAdapter.commit(doTxn)).rejects.toThrow('Transaction is not active')
    await expect(d1Adapter.commit(d1Txn)).rejects.toThrow('Transaction is not active')
  })
})

// Type declarations for Cloudflare Workers types (these would normally come from @cloudflare/workers-types)
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
