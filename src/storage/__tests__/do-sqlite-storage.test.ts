/**
 * Tests for DOSqliteStorage - Durable Object SQLite-backed Graph Storage
 *
 * These tests verify the behavior of the DOSqliteStorage class which provides
 * graph storage using Cloudflare Durable Object's native SQLite support.
 *
 * Key patterns from mongo project reference:
 * - Storage access via `this.state.storage.sql`
 * - `blockConcurrencyWhile()` for atomic initialization
 * - `transactionSync()` for atomic operations
 *
 * TDD Red Phase: These tests are written FIRST before the implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DOSqliteStorage } from '../do-sqlite-storage'
import type { Node as _Node, Relationship as _Relationship } from '../types'

/**
 * Mock SQL query result interface matching Cloudflare DO SQL API
 */
interface MockSqlQueryResult {
  toArray(): unknown[]
  one(): unknown
}

/**
 * Mock SQL storage interface matching Cloudflare DO SQL API
 */
interface MockSqlStorage {
  exec(sql: string, ...params: unknown[]): MockSqlQueryResult
}

/**
 * Mock Durable Object storage interface
 */
interface MockDOStorage {
  sql: MockSqlStorage
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  transactionSync<T>(callback: () => T): T
}

/**
 * Mock Durable Object state interface
 */
interface MockDOState {
  storage: MockDOStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): void
}

/**
 * Create a mock SQL storage that tracks executed statements
 */
function createMockSqlStorage(): MockSqlStorage & { executedStatements: string[] } {
  const executedStatements: string[] = []
  const tables = new Map<string, unknown[]>()
  const nextIds = new Map<string, number>()

  return {
    executedStatements,
    exec(sql: string, ...params: unknown[]): MockSqlQueryResult {
      executedStatements.push(sql)

      // Handle CREATE TABLE
      if (sql.includes('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
        if (match) {
          tables.set(match[1], [])
          nextIds.set(match[1], 1)
        }
      }

      // Handle INSERT with RETURNING
      if (sql.includes('INSERT INTO')) {
        const tableMatch = sql.match(/INSERT INTO (\w+)/)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const id = nextIds.get(tableName) || 1
          nextIds.set(tableName, id + 1)

          // Create a row based on table name
          if (tableName === 'nodes') {
            const labelsJson = typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0])
            const propsJson = typeof params[1] === 'string' ? params[1] : JSON.stringify(params[1])
            const row = {
              id,
              labels: labelsJson,
              properties: propsJson,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            const rows = tables.get(tableName) || []
            rows.push(row)
            tables.set(tableName, rows)
            return createMockResult([row])
          }

          if (tableName === 'relationships') {
            const row = {
              id,
              type: params[0],
              start_node_id: params[1],
              end_node_id: params[2],
              properties: typeof params[3] === 'string' ? params[3] : JSON.stringify(params[3]),
              created_at: new Date().toISOString(),
            }
            const rows = tables.get(tableName) || []
            rows.push(row)
            tables.set(tableName, rows)
            return createMockResult([row])
          }

          return createMockResult([{ id }])
        }
      }

      // Handle SELECT
      if (sql.includes('SELECT')) {
        const tableMatch = sql.match(/FROM (\w+)/)
        if (tableMatch) {
          const tableName = tableMatch[1]
          let rows = tables.get(tableName) || []

          // Filter by ID if WHERE id = ? present
          if (sql.includes('WHERE id = ?') || sql.includes('WHERE id =')) {
            const targetId = params[0] as number
            rows = rows.filter((r: unknown) => (r as { id: number }).id === targetId)
          }

          // Filter by label for findNodesByLabel
          if (sql.includes('json_each') && sql.includes('labels')) {
            const targetLabel = params[0] as string
            rows = rows.filter((r: unknown) => {
              const labels = JSON.parse((r as { labels: string }).labels)
              return Array.isArray(labels) && labels.includes(targetLabel)
            })
          }

          // Filter by type for findRelationshipsByType
          if (sql.includes('WHERE type = ?')) {
            const targetType = params[0] as string
            rows = rows.filter((r: unknown) => (r as { type: string }).type === targetType)
          }

          return createMockResult(rows)
        }
      }

      // Handle UPDATE
      if (sql.includes('UPDATE')) {
        const tableMatch = sql.match(/UPDATE (\w+)/)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const rows = tables.get(tableName) || []
          // Find target row by id (usually last param)
          const targetId = params[params.length - 1] as number
          const row = rows.find((r: unknown) => (r as { id: number }).id === targetId)
          if (row) {
            // Update properties based on what's being set
            if (sql.includes('properties =')) {
              (row as { properties: string; updated_at: string }).properties =
                typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0])
              ;(row as { properties: string; updated_at: string }).updated_at = new Date().toISOString()
            }
            if (sql.includes('labels =')) {
              (row as { labels: string; updated_at: string }).labels =
                typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0])
              ;(row as { labels: string; updated_at: string }).updated_at = new Date().toISOString()
            }
          }
          return createMockResult([])
        }
      }

      // Handle DELETE
      if (sql.includes('DELETE FROM')) {
        const tableMatch = sql.match(/DELETE FROM (\w+)/)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const rows = tables.get(tableName) || []
          if (sql.includes('WHERE id = ?')) {
            const targetId = params[0] as number
            tables.set(
              tableName,
              rows.filter((r: unknown) => (r as { id: number }).id !== targetId)
            )
          }
          // Handle cascade delete for relationships
          if (sql.includes('start_node_id = ? OR end_node_id = ?')) {
            const nodeId = params[0] as number
            tables.set(
              tableName,
              rows.filter(
                (r: unknown) =>
                  (r as { start_node_id: number }).start_node_id !== nodeId &&
                  (r as { end_node_id: number }).end_node_id !== nodeId
              )
            )
          }
          return createMockResult([])
        }
      }

      return createMockResult([])
    },
  }
}

/**
 * Create a mock query result
 */
function createMockResult(rows: unknown[]): MockSqlQueryResult {
  return {
    toArray: () => rows,
    one: () => rows[0],
  }
}

/**
 * Create a mock Durable Object state
 */
function createMockDOState(): MockDOState & { sqlStorage: ReturnType<typeof createMockSqlStorage> } {
  const sqlStorage = createMockSqlStorage()
  const kvStore = new Map<string, unknown>()

  return {
    sqlStorage,
    storage: {
      sql: sqlStorage,
      get: async <T>(key: string) => kvStore.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        kvStore.set(key, value)
      },
      transactionSync: <T>(callback: () => T) => callback(),
    },
    blockConcurrencyWhile: <T>(callback: () => Promise<T>) => {
      callback()
    },
  }
}

describe('DOSqliteStorage', () => {
  let state: MockDOState
  let storage: DOSqliteStorage

  beforeEach(() => {
    state = createMockDOState()
    storage = new DOSqliteStorage(state as unknown as DurableObjectState)
  })

  describe('initialization', () => {
    it('should initialize schema using blockConcurrencyWhile', async () => {
      const blockConcurrencyWhileSpy = vi.fn((callback) => callback())
      state.blockConcurrencyWhile = blockConcurrencyWhileSpy

      const newStorage = new DOSqliteStorage(state as unknown as DurableObjectState)
      await newStorage.initialize()

      expect(blockConcurrencyWhileSpy).toHaveBeenCalled()
    })

    it('should create nodes table on initialization', async () => {
      await storage.initialize()

      const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
      expect(sqlStorage.executedStatements.some((s) => s.includes('CREATE TABLE') && s.includes('nodes'))).toBe(true)
    })

    it('should create relationships table on initialization', async () => {
      await storage.initialize()

      const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
      expect(sqlStorage.executedStatements.some((s) => s.includes('CREATE TABLE') && s.includes('relationships'))).toBe(
        true
      )
    })

    it('should create indexes on nodes.labels column', async () => {
      await storage.initialize()

      const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
      expect(sqlStorage.executedStatements.some((s) => s.includes('CREATE INDEX') && s.includes('labels'))).toBe(true)
    })

    it('should create indexes on relationships.type column', async () => {
      await storage.initialize()

      const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
      expect(sqlStorage.executedStatements.some((s) => s.includes('CREATE INDEX') && s.includes('type'))).toBe(true)
    })

    it('should only initialize schema once even if called multiple times', async () => {
      await storage.initialize()
      const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
      const initialCount = sqlStorage.executedStatements.length

      await storage.initialize()
      expect(sqlStorage.executedStatements.length).toBe(initialCount)
    })
  })

  describe('node operations', () => {
    describe('createNode', () => {
      it('should create a node and return its id', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })

        expect(typeof id).toBe('number')
        expect(id).toBeGreaterThan(0)
      })

      it('should create nodes with incrementing ids', async () => {
        await storage.initialize()
        const id1 = await storage.createNode(['Person'], { name: 'Alice' })
        const id2 = await storage.createNode(['Person'], { name: 'Bob' })

        expect(id2).toBeGreaterThan(id1)
      })

      it('should create a node with multiple labels', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        const node = await storage.getNode(id)

        expect(node?.labels).toEqual(['Person', 'Employee'])
      })

      it('should create a node with empty labels', async () => {
        await storage.initialize()
        const id = await storage.createNode([], { name: 'Alice' })
        const node = await storage.getNode(id)

        expect(node?.labels).toEqual([])
      })

      it('should create a node with complex properties', async () => {
        await storage.initialize()
        const props = {
          name: 'Alice',
          age: 30,
          active: true,
          scores: [95, 87, 92],
          address: { city: 'NYC', zip: '10001' },
        }
        const id = await storage.createNode(['Person'], props)
        const node = await storage.getNode(id)

        expect(node?.properties).toEqual(props)
      })

      it('should store labels as JSON in SQLite', async () => {
        await storage.initialize()
        await storage.createNode(['Person', 'Developer'], { name: 'Alice' })

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        const insertStatement = sqlStorage.executedStatements.find((s) => s.includes('INSERT INTO nodes'))
        expect(insertStatement).toBeDefined()
      })

      it('should store properties as JSON in SQLite', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice', age: 30 })

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        const insertStatement = sqlStorage.executedStatements.find((s) => s.includes('INSERT INTO nodes'))
        expect(insertStatement).toBeDefined()
      })
    })

    describe('getNode', () => {
      it('should return null for non-existent node', async () => {
        await storage.initialize()
        const node = await storage.getNode(999)

        expect(node).toBeNull()
      })

      it('should return the node with correct structure', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        const node = await storage.getNode(id)

        expect(node).not.toBeNull()
        expect(node?.id).toBe(id)
        expect(node?.labels).toEqual(['Person'])
        expect(node?.properties).toEqual({ name: 'Alice' })
        expect(node?.createdAt).toBeDefined()
        expect(node?.updatedAt).toBeDefined()
      })

      it('should parse JSON labels from SQLite', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person', 'Employee', 'Manager'], { name: 'Alice' })
        const node = await storage.getNode(id)

        expect(node?.labels).toHaveLength(3)
        expect(node?.labels).toContain('Person')
        expect(node?.labels).toContain('Employee')
        expect(node?.labels).toContain('Manager')
      })

      it('should parse JSON properties from SQLite', async () => {
        await storage.initialize()
        const props = { name: 'Alice', nested: { value: 42 } }
        const id = await storage.createNode(['Person'], props)
        const node = await storage.getNode(id)

        expect(node?.properties).toEqual(props)
      })
    })

    describe('getNodesByLabel', () => {
      it('should find nodes by label', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const people = await storage.getNodesByLabel('Person')

        expect(people).toHaveLength(2)
        expect(people.map((n) => n.properties.name)).toContain('Alice')
        expect(people.map((n) => n.properties.name)).toContain('Bob')
      })

      it('should return empty array if no nodes match', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice' })

        const companies = await storage.getNodesByLabel('Company')

        expect(companies).toEqual([])
      })

      it('should find nodes with multiple labels', async () => {
        await storage.initialize()
        await storage.createNode(['Person', 'Employee'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })

        const employees = await storage.getNodesByLabel('Employee')

        expect(employees).toHaveLength(1)
        expect(employees[0].properties.name).toBe('Alice')
      })

      it('should use JSON query to search labels array', async () => {
        await storage.initialize()
        await storage.getNodesByLabel('Person')

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        // Should use json_each or similar JSON function to query labels array
        const selectStatement = sqlStorage.executedStatements.find(
          (s) => s.includes('SELECT') && s.includes('nodes') && (s.includes('json_each') || s.includes('json_extract'))
        )
        expect(selectStatement).toBeDefined()
      })
    })

    describe('updateNode', () => {
      it('should update node properties', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.updateNode(id, { name: 'Alice', age: 30 })

        const node = await storage.getNode(id)
        expect(node?.properties).toEqual({ name: 'Alice', age: 30 })
      })

      it('should replace all properties', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice', age: 25 })
        await storage.updateNode(id, { occupation: 'Engineer' })

        const node = await storage.getNode(id)
        expect(node?.properties).toEqual({ occupation: 'Engineer' })
      })

      it('should update the updatedAt timestamp', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        const node1 = await storage.getNode(id)
        const originalUpdatedAt = node1?.updatedAt

        // Small delay to ensure different timestamp
        await new Promise((resolve) => setTimeout(resolve, 10))

        await storage.updateNode(id, { name: 'Alice', age: 30 })
        const node2 = await storage.getNode(id)

        expect(node2?.updatedAt).not.toBe(originalUpdatedAt)
      })

      it('should throw for non-existent node', async () => {
        await storage.initialize()
        await expect(storage.updateNode(999, { name: 'Ghost' })).rejects.toThrow('Node with id 999 not found')
      })

      it('should use SQL UPDATE statement', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.updateNode(id, { name: 'Alice Updated' })

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('UPDATE nodes'))).toBe(true)
      })
    })

    describe('deleteNode', () => {
      it('should delete a node', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.deleteNode(id)

        const node = await storage.getNode(id)
        expect(node).toBeNull()
      })

      it('should cascade delete relationships when node is deleted', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, {})

        await storage.deleteNode(alice)

        const rel = await storage.getRelationship(relId)
        expect(rel).toBeNull()
      })

      it('should not throw for non-existent node', async () => {
        await storage.initialize()
        await expect(storage.deleteNode(999)).resolves.not.toThrow()
      })

      it('should use SQL DELETE statement', async () => {
        await storage.initialize()
        const id = await storage.createNode(['Person'], { name: 'Alice' })
        await storage.deleteNode(id)

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('DELETE FROM nodes'))).toBe(true)
      })
    })
  })

  describe('relationship operations', () => {
    describe('createRelationship', () => {
      it('should create a relationship and return its id', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        const relId = await storage.createRelationship('KNOWS', alice, bob, {})

        expect(typeof relId).toBe('number')
        expect(relId).toBeGreaterThan(0)
      })

      it('should create relationships with incrementing ids', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const charlie = await storage.createNode(['Person'], { name: 'Charlie' })

        const rel1 = await storage.createRelationship('KNOWS', alice, bob, {})
        const rel2 = await storage.createRelationship('KNOWS', bob, charlie, {})

        expect(rel2).toBeGreaterThan(rel1)
      })

      it('should create relationship with properties', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        const relId = await storage.createRelationship('KNOWS', alice, bob, {
          since: 2020,
          closeness: 0.8,
        })

        const rel = await storage.getRelationship(relId)
        expect(rel?.properties).toEqual({ since: 2020, closeness: 0.8 })
      })

      it('should throw if start node does not exist', async () => {
        await storage.initialize()
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await expect(storage.createRelationship('KNOWS', 999, bob, {})).rejects.toThrow(
          'Start node with id 999 not found'
        )
      })

      it('should throw if end node does not exist', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })

        await expect(storage.createRelationship('KNOWS', alice, 999, {})).rejects.toThrow(
          'End node with id 999 not found'
        )
      })

      it('should store relationship type and node IDs correctly', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        const relId = await storage.createRelationship('WORKS_WITH', alice, bob, {})
        const rel = await storage.getRelationship(relId)

        expect(rel?.type).toBe('WORKS_WITH')
        expect(rel?.startNodeId).toBe(alice)
        expect(rel?.endNodeId).toBe(bob)
      })
    })

    describe('getRelationship', () => {
      it('should return null for non-existent relationship', async () => {
        await storage.initialize()
        const rel = await storage.getRelationship(999)

        expect(rel).toBeNull()
      })

      it('should return the relationship with correct structure', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, { since: 2020 })

        const rel = await storage.getRelationship(relId)

        expect(rel).not.toBeNull()
        expect(rel?.id).toBe(relId)
        expect(rel?.type).toBe('KNOWS')
        expect(rel?.startNodeId).toBe(alice)
        expect(rel?.endNodeId).toBe(bob)
        expect(rel?.properties).toEqual({ since: 2020 })
        expect(rel?.createdAt).toBeDefined()
      })

      it('should parse JSON properties from SQLite', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const props = { since: 2020, metadata: { source: 'import' } }
        const relId = await storage.createRelationship('KNOWS', alice, bob, props)

        const rel = await storage.getRelationship(relId)

        expect(rel?.properties).toEqual(props)
      })
    })

    describe('getRelationshipsByType', () => {
      it('should find relationships by type', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const acme = await storage.createNode(['Company'], { name: 'Acme' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('WORKS_AT', alice, acme, {})
        await storage.createRelationship('WORKS_AT', bob, acme, {})

        const worksAt = await storage.getRelationshipsByType('WORKS_AT')

        expect(worksAt).toHaveLength(2)
      })

      it('should return empty array if no relationships match', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await storage.createRelationship('KNOWS', alice, bob, {})

        const loves = await storage.getRelationshipsByType('LOVES')

        expect(loves).toEqual([])
      })

      it('should use SQL WHERE clause on type column', async () => {
        await storage.initialize()
        await storage.getRelationshipsByType('KNOWS')

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('SELECT') && s.includes('WHERE type'))).toBe(true)
      })
    })

    describe('deleteRelationship', () => {
      it('should delete a relationship', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, {})

        await storage.deleteRelationship(relId)

        const rel = await storage.getRelationship(relId)
        expect(rel).toBeNull()
      })

      it('should not throw for non-existent relationship', async () => {
        await storage.initialize()
        await expect(storage.deleteRelationship(999)).resolves.not.toThrow()
      })

      it('should use SQL DELETE statement', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.deleteRelationship(relId)

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('DELETE FROM relationships'))).toBe(true)
      })
    })

    describe('updateRelationship', () => {
      it('should update relationship properties', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const relId = await storage.createRelationship('KNOWS', alice, bob, { since: 2020 })

        await storage.updateRelationship(relId, { since: 2020, closeness: 0.9 })

        const rel = await storage.getRelationship(relId)
        expect(rel?.properties).toEqual({ since: 2020, closeness: 0.9 })
      })

      it('should throw for non-existent relationship', async () => {
        await storage.initialize()
        await expect(storage.updateRelationship(999, { since: 2020 })).rejects.toThrow(
          'Relationship with id 999 not found'
        )
      })
    })
  })

  describe('pattern matching queries', () => {
    describe('findPattern', () => {
      it('should find nodes matching a simple node pattern (n:Person)', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const results = await storage.findPattern({ labels: ['Person'] })

        expect(results).toHaveLength(2)
      })

      it('should find nodes matching property filters', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice', age: 30 })
        await storage.createNode(['Person'], { name: 'Bob', age: 25 })

        const results = await storage.findPattern({
          labels: ['Person'],
          properties: { name: 'Alice' },
        })

        expect(results).toHaveLength(1)
        expect(results[0].properties.name).toBe('Alice')
      })

      it('should find relationships matching type pattern', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('LIKES', alice, bob, {})

        const results = await storage.findPattern({
          relationshipType: 'KNOWS',
        })

        expect(results).toHaveLength(1)
      })

      it('should find paths matching node-relationship-node pattern', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const acme = await storage.createNode(['Company'], { name: 'Acme' })
        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('WORKS_AT', alice, acme, {})

        const results = await storage.findPattern({
          startNode: { labels: ['Person'] },
          relationshipType: 'WORKS_AT',
          endNode: { labels: ['Company'] },
        })

        expect(results).toHaveLength(1)
        expect(results[0].startNode.properties.name).toBe('Alice')
        expect(results[0].endNode.properties.name).toBe('Acme')
      })
    })

    describe('getConnectedNodes', () => {
      it('should get all nodes connected to a given node', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const charlie = await storage.createNode(['Person'], { name: 'Charlie' })
        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('KNOWS', alice, charlie, {})

        const connected = await storage.getConnectedNodes(alice)

        expect(connected).toHaveLength(2)
        expect(connected.map((n) => n.properties.name)).toContain('Bob')
        expect(connected.map((n) => n.properties.name)).toContain('Charlie')
      })

      it('should filter connected nodes by relationship type', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        const acme = await storage.createNode(['Company'], { name: 'Acme' })
        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('WORKS_AT', alice, acme, {})

        const connected = await storage.getConnectedNodes(alice, { relationshipType: 'KNOWS' })

        expect(connected).toHaveLength(1)
        expect(connected[0].properties.name).toBe('Bob')
      })

      it('should support direction filtering (outgoing)', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('KNOWS', bob, alice, {})

        const outgoing = await storage.getConnectedNodes(alice, { direction: 'outgoing' })

        expect(outgoing).toHaveLength(1)
        expect(outgoing[0].properties.name).toBe('Bob')
      })

      it('should support direction filtering (incoming)', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('KNOWS', bob, alice, {})

        const incoming = await storage.getConnectedNodes(alice, { direction: 'incoming' })

        expect(incoming).toHaveLength(1)
        expect(incoming[0].properties.name).toBe('Bob')
      })
    })
  })

  describe('transaction support', () => {
    it('should support transactionSync for atomic operations', async () => {
      await storage.initialize()
      const transactionSyncSpy = vi.fn((callback) => callback())
      ;(state.storage as unknown as { transactionSync: typeof transactionSyncSpy }).transactionSync =
        transactionSyncSpy

      // Create multiple nodes atomically
      await storage.createNodesAtomic([
        { labels: ['Person'], properties: { name: 'Alice' } },
        { labels: ['Person'], properties: { name: 'Bob' } },
      ])

      expect(transactionSyncSpy).toHaveBeenCalled()
    })

    it('should rollback on error during transaction', async () => {
      await storage.initialize()
      const transactionSyncSpy = vi.fn((callback) => {
        return callback()
      })
      ;(state.storage as unknown as { transactionSync: typeof transactionSyncSpy }).transactionSync =
        transactionSyncSpy

      // Attempting to create nodes where one fails should rollback all
      await expect(
        storage.createNodesAtomic([
          { labels: ['Person'], properties: { name: 'Alice' } },
          { labels: null as unknown as string[], properties: { name: 'Bob' } }, // This should fail
        ])
      ).rejects.toThrow()
    })
  })

  describe('utility methods', () => {
    describe('getAllNodes', () => {
      it('should return all nodes', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })
        await storage.createNode(['Company'], { name: 'Acme' })

        const nodes = await storage.getAllNodes()

        expect(nodes).toHaveLength(3)
      })

      it('should return empty array if no nodes exist', async () => {
        await storage.initialize()
        const nodes = await storage.getAllNodes()

        expect(nodes).toEqual([])
      })
    })

    describe('getAllRelationships', () => {
      it('should return all relationships', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        await storage.createRelationship('KNOWS', alice, bob, {})
        await storage.createRelationship('LIKES', alice, bob, {})

        const rels = await storage.getAllRelationships()

        expect(rels).toHaveLength(2)
      })
    })

    describe('clear', () => {
      it('should clear all data from SQLite', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice' })
        await storage.createNode(['Person'], { name: 'Bob' })

        await storage.clear()

        const nodes = await storage.getAllNodes()
        const rels = await storage.getAllRelationships()
        expect(nodes).toHaveLength(0)
        expect(rels).toHaveLength(0)
      })

      it('should execute DELETE statements on all tables', async () => {
        await storage.initialize()
        await storage.clear()

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('DELETE FROM nodes'))).toBe(true)
        expect(sqlStorage.executedStatements.some((s) => s.includes('DELETE FROM relationships'))).toBe(true)
      })
    })

    describe('nodeCount', () => {
      it('should return the correct node count using SQL COUNT', async () => {
        await storage.initialize()
        expect(await storage.getNodeCount()).toBe(0)

        await storage.createNode(['Person'], { name: 'Alice' })
        expect(await storage.getNodeCount()).toBe(1)

        await storage.createNode(['Person'], { name: 'Bob' })
        expect(await storage.getNodeCount()).toBe(2)
      })
    })

    describe('relationshipCount', () => {
      it('should return the correct relationship count using SQL COUNT', async () => {
        await storage.initialize()
        const alice = await storage.createNode(['Person'], { name: 'Alice' })
        const bob = await storage.createNode(['Person'], { name: 'Bob' })

        expect(await storage.getRelationshipCount()).toBe(0)

        await storage.createRelationship('KNOWS', alice, bob, {})
        expect(await storage.getRelationshipCount()).toBe(1)
      })
    })
  })

  describe('SQL-specific features', () => {
    describe('JSON property queries', () => {
      it('should support json_extract for property queries', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice', profile: { level: 'senior' } })
        await storage.createNode(['Person'], { name: 'Bob', profile: { level: 'junior' } })

        const results = await storage.findNodesByProperty('profile.level', 'senior')

        expect(results).toHaveLength(1)
        expect(results[0].properties.name).toBe('Alice')
      })

      it('should support querying array properties', async () => {
        await storage.initialize()
        await storage.createNode(['Person'], { name: 'Alice', skills: ['TypeScript', 'Python'] })
        await storage.createNode(['Person'], { name: 'Bob', skills: ['Java', 'Go'] })

        const results = await storage.findNodesWithArrayContaining('skills', 'TypeScript')

        expect(results).toHaveLength(1)
        expect(results[0].properties.name).toBe('Alice')
      })
    })

    describe('index support', () => {
      it('should create a property index', async () => {
        await storage.initialize()
        await storage.createIndex('Person', 'email')

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('CREATE INDEX') && s.includes('email'))).toBe(true)
      })

      it('should drop a property index', async () => {
        await storage.initialize()
        await storage.createIndex('Person', 'email')
        await storage.dropIndex('Person', 'email')

        const sqlStorage = (state as unknown as { sqlStorage: { executedStatements: string[] } }).sqlStorage
        expect(sqlStorage.executedStatements.some((s) => s.includes('DROP INDEX'))).toBe(true)
      })
    })
  })
})

/**
 * Type definitions for test compatibility
 */
interface DurableObjectState {
  storage: {
    sql: MockSqlStorage
    get<T>(key: string): Promise<T | undefined>
    put(key: string, value: unknown): Promise<void>
    transactionSync<T>(callback: () => T): T
  }
  blockConcurrencyWhile<T>(callback: () => Promise<T>): void
}
