/**
 * Tests for Neo4jDatabase Durable Object
 *
 * These tests verify the behavior of the Neo4jDatabase Durable Object
 * which provides persistent graph storage using SQLite.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Neo4jDatabase } from '../neo4j-database'
import type { DurableObjectState } from '@cloudflare/workers-types'

/**
 * Mock implementation of SqlStorage that behaves like Durable Object SQL API
 */
class MockSqlStorage {
  private tables: Map<string, unknown[]> = new Map()
  private nextId: Map<string, number> = new Map()
  public executedStatements: string[] = []

  exec(sql: string): SqlStorageCursor {
    this.executedStatements.push(sql)

    // Handle CREATE TABLE statements
    if (sql.includes('CREATE TABLE')) {
      const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, [])
          this.nextId.set(tableName, 1)
        }
      }
    }

    // Handle INSERT with RETURNING
    if (sql.includes('INSERT INTO')) {
      const tableMatch = sql.match(/INSERT INTO (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const id = this.nextId.get(tableName) || 1
        this.nextId.set(tableName, id + 1)

        // Parse VALUES from SQL and store the row
        const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i)
        if (valuesMatch && tableName === 'nodes') {
          // Extract labels and properties from SQL
          const labelsMatch = sql.match(/'(\[.*?\])'/)
          const propsMatch = sql.match(/'(\{.*?\})'/)
          const row = {
            id,
            labels: labelsMatch ? labelsMatch[1] : '[]',
            properties: propsMatch ? propsMatch[1] : '{}',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          if (!this.tables.has(tableName)) {
            this.tables.set(tableName, [])
          }
          this.tables.get(tableName)!.push(row)
          return this.createCursor([row])
        } else if (valuesMatch && tableName === 'relationships') {
          // Parse relationship data - VALUES ('TYPE', startId, endId, 'props')
          const parts = sql.match(/VALUES\s*\('([^']*)',\s*(\d+),\s*(\d+),\s*'([^']*)'\)/i)
          const row = {
            id,
            type: parts ? parts[1] : '',
            start_node_id: parts ? parseInt(parts[2], 10) : 1,
            end_node_id: parts ? parseInt(parts[3], 10) : 2,
            properties: parts ? parts[4] : '{}',
            created_at: new Date().toISOString()
          }
          if (!this.tables.has(tableName)) {
            this.tables.set(tableName, [])
          }
          this.tables.get(tableName)!.push(row)
          return this.createCursor([row])
        }

        // Return iterator with the inserted row
        const row = { id }
        return this.createCursor([row])
      }
    }

    // Handle SELECT
    if (sql.includes('SELECT')) {
      const tableMatch = sql.match(/FROM (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        let rows = this.tables.get(tableName) || []

        // Filter by ID if WHERE clause present
        const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
        if (idMatch) {
          const targetId = parseInt(idMatch[1], 10)
          rows = rows.filter((r: any) => r.id === targetId)
        }

        return this.createCursor(rows)
      }
    }

    // Handle UPDATE
    if (sql.includes('UPDATE')) {
      const tableMatch = sql.match(/UPDATE (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
        const propsMatch = sql.match(/properties\s*=\s*'([^']+)'/i)
        if (idMatch && propsMatch) {
          const targetId = parseInt(idMatch[1], 10)
          const rows = this.tables.get(tableName) || []
          const row = rows.find((r: any) => r.id === targetId)
          if (row) {
            (row as any).properties = propsMatch[1]
            ;(row as any).updated_at = new Date().toISOString()
          }
        }
      }
      return this.createCursor([])
    }

    // Handle DELETE
    if (sql.includes('DELETE FROM')) {
      const tableMatch = sql.match(/DELETE FROM (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
        if (idMatch) {
          const targetId = parseInt(idMatch[1], 10)
          const rows = this.tables.get(tableName) || []
          this.tables.set(tableName, rows.filter((r: any) => r.id !== targetId))
        }
      }
      return this.createCursor([])
    }

    return this.createCursor([])
  }

  private createCursor(rows: unknown[]): SqlStorageCursor {
    let index = 0
    return {
      [Symbol.iterator](): Iterator<unknown> {
        return {
          next(): IteratorResult<unknown> {
            if (index < rows.length) {
              return { value: rows[index++], done: false }
            }
            return { value: undefined, done: true }
          }
        }
      },
      raw(): RawRowIterator {
        return {
          [Symbol.iterator](): Iterator<unknown[]> {
            let rawIndex = 0
            return {
              next(): IteratorResult<unknown[]> {
                if (rawIndex < rows.length) {
                  const row = rows[rawIndex++]
                  return { value: Object.values(row as object), done: false }
                }
                return { value: undefined, done: true }
              }
            }
          }
        }
      },
      toArray(): unknown[] {
        return rows
      },
      one(): unknown {
        return rows[0]
      },
      columnNames: [],
      rowsRead: rows.length,
      rowsWritten: 0,
    } as unknown as SqlStorageCursor
  }

  // Store data for testing
  insertRow(tableName: string, row: unknown): void {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, [])
    }
    this.tables.get(tableName)!.push(row)
  }

  getRows(tableName: string): unknown[] {
    return this.tables.get(tableName) || []
  }
}

interface SqlStorageCursor extends Iterable<unknown> {
  raw(): RawRowIterator
  toArray(): unknown[]
  one(): unknown
  columnNames: string[]
  rowsRead: number
  rowsWritten: number
}

type RawRowIterator = Iterable<unknown[]>

/**
 * Create a mock Durable Object state for testing
 */
function createMockState(): DurableObjectState {
  const sqlStorage = new MockSqlStorage()

  return {
    id: {
      toString: () => 'test-do-id',
      equals: (other: DurableObjectId) => other.toString() === 'test-do-id',
      name: 'test-database',
    } as DurableObjectId,
    storage: {
      sql: sqlStorage,
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      getAlarm: vi.fn(),
      setAlarm: vi.fn(),
      deleteAlarm: vi.fn(),
      sync: vi.fn(),
      transaction: vi.fn(),
      transactionSync: vi.fn(),
      deleteAll: vi.fn(),
      getCurrentBookmark: vi.fn(),
      getBookmarkForTime: vi.fn(),
      onNextSessionRestoreBookmark: vi.fn(),
    } as unknown as DurableObjectStorage,
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn((fn) => fn()),
    abort: vi.fn(),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponseTimestamp: vi.fn(),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(),
    getTags: vi.fn(),
  } as unknown as DurableObjectState
}

interface DurableObjectId {
  toString(): string
  equals(other: DurableObjectId): boolean
  name?: string
}

interface DurableObjectStorage {
  sql: MockSqlStorage
  get: unknown
  put: unknown
  delete: unknown
  list: unknown
  getAlarm: unknown
  setAlarm: unknown
  deleteAlarm: unknown
  sync: unknown
  transaction: unknown
  transactionSync: unknown
  deleteAll: unknown
  getCurrentBookmark: unknown
  getBookmarkForTime: unknown
  onNextSessionRestoreBookmark: unknown
}

describe('Neo4jDatabase Durable Object', () => {
  let state: DurableObjectState
  let env: Env

  beforeEach(() => {
    state = createMockState()
    env = {} as Env
  })

  describe('Initialization', () => {
    it('should be instantiable', () => {
      const db = new Neo4jDatabase(state, env)
      expect(db).toBeInstanceOf(Neo4jDatabase)
    })

    it('should initialize SQLite schema on first use', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      expect(sqlStorage.executedStatements.length).toBeGreaterThan(0)
      expect(sqlStorage.executedStatements.some((s: string) => s.includes('CREATE TABLE'))).toBe(true)
    })

    it('should create nodes table on initialization', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      expect(sqlStorage.executedStatements.some((s: string) =>
        s.includes('CREATE TABLE') && s.includes('nodes')
      )).toBe(true)
    })

    it('should create relationships table on initialization', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      expect(sqlStorage.executedStatements.some((s: string) =>
        s.includes('CREATE TABLE') && s.includes('relationships')
      )).toBe(true)
    })

    it('should only initialize once even if called multiple times', async () => {
      const db = new Neo4jDatabase(state, env)

      await db.initialize()
      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      const initialCount = sqlStorage.executedStatements.length

      await db.initialize()
      expect(sqlStorage.executedStatements.length).toBe(initialCount)
    })
  })

  describe('Node Operations', () => {
    it('should create a node and return its ID', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode(['Person'], { name: 'Alice', age: 30 })

      expect(typeof nodeId).toBe('number')
      expect(nodeId).toBeGreaterThan(0)
    })

    it('should create a node with multiple labels', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode(['Person', 'Employee'], { name: 'Bob' })

      expect(nodeId).toBeGreaterThan(0)
    })

    it('should create a node with empty labels', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode([], { data: 'test' })

      expect(nodeId).toBeGreaterThan(0)
    })

    it('should retrieve a node by ID', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode(['Person'], { name: 'Charlie' })

      const node = await db.getNode(nodeId)

      expect(node).not.toBeNull()
      expect(node?.id).toBe(nodeId)
      expect(node?.labels).toContain('Person')
      expect(node?.properties.name).toBe('Charlie')
    })

    it('should return null for non-existent node', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      const node = await db.getNode(99999)

      expect(node).toBeNull()
    })

    it('should update a node properties', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode(['Person'], { name: 'David' })

      await db.updateNode(nodeId, { name: 'David Updated', age: 25 })
      const node = await db.getNode(nodeId)

      expect(node?.properties.name).toBe('David Updated')
      expect(node?.properties.age).toBe(25)
    })

    it('should delete a node', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode(['Person'], { name: 'Eve' })

      await db.deleteNode(nodeId)
      const node = await db.getNode(nodeId)

      expect(node).toBeNull()
    })
  })

  describe('Relationship Operations', () => {
    it('should create a relationship and return its ID', async () => {
      const db = new Neo4jDatabase(state, env)
      const node1 = await db.createNode(['Person'], { name: 'Alice' })
      const node2 = await db.createNode(['Person'], { name: 'Bob' })

      const relId = await db.createRelationship('KNOWS', node1, node2, { since: 2020 })

      expect(typeof relId).toBe('number')
      expect(relId).toBeGreaterThan(0)
    })

    it('should retrieve a relationship by ID', async () => {
      const db = new Neo4jDatabase(state, env)
      const node1 = await db.createNode(['Person'], { name: 'Alice' })
      const node2 = await db.createNode(['Person'], { name: 'Bob' })
      const relId = await db.createRelationship('KNOWS', node1, node2, { since: 2020 })

      const rel = await db.getRelationship(relId)

      expect(rel).not.toBeNull()
      expect(rel?.id).toBe(relId)
      expect(rel?.type).toBe('KNOWS')
      expect(rel?.startNodeId).toBe(node1)
      expect(rel?.endNodeId).toBe(node2)
      expect(rel?.properties.since).toBe(2020)
    })

    it('should return null for non-existent relationship', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      const rel = await db.getRelationship(99999)

      expect(rel).toBeNull()
    })

    it('should delete a relationship', async () => {
      const db = new Neo4jDatabase(state, env)
      const node1 = await db.createNode(['Person'], { name: 'Alice' })
      const node2 = await db.createNode(['Person'], { name: 'Bob' })
      const relId = await db.createRelationship('KNOWS', node1, node2, {})

      await db.deleteRelationship(relId)
      const rel = await db.getRelationship(relId)

      expect(rel).toBeNull()
    })
  })

  describe('Query Operations', () => {
    it('should execute a Cypher query', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      const result = await db.runCypher('MATCH (n) RETURN n')

      expect(result).toBeDefined()
      expect(result.records).toBeDefined()
      expect(Array.isArray(result.records)).toBe(true)
    })

    it('should execute a parameterized Cypher query', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.createNode(['Person'], { name: 'Alice' })

      const result = await db.runCypher('MATCH (n:Person {name: $name}) RETURN n', { name: 'Alice' })

      expect(result).toBeDefined()
      expect(result.records).toBeDefined()
    })

    it('should return query summary with counters', async () => {
      const db = new Neo4jDatabase(state, env)

      const result = await db.runCypher('CREATE (n:Person {name: "Test"}) RETURN n')

      expect(result.summary).toBeDefined()
      expect(result.summary.counters).toBeDefined()
    })
  })

  describe('HTTP Fetch Handler', () => {
    it('should handle POST /cypher requests', async () => {
      const db = new Neo4jDatabase(state, env)

      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MATCH (n) RETURN n' })
      })

      const response = await db.fetch(request)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toBeDefined()
    })

    it('should reject non-POST requests to /cypher', async () => {
      const db = new Neo4jDatabase(state, env)

      const request = new Request('http://localhost/cypher', { method: 'GET' })
      const response = await db.fetch(request)

      expect(response.status).toBe(405)
    })

    it('should handle errors gracefully', async () => {
      const db = new Neo4jDatabase(state, env)

      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      })

      const response = await db.fetch(request)

      expect(response.status).toBeGreaterThanOrEqual(400)
    })

    it('should return 404 for unknown paths', async () => {
      const db = new Neo4jDatabase(state, env)

      const request = new Request('http://localhost/unknown', { method: 'GET' })
      const response = await db.fetch(request)

      expect(response.status).toBe(404)
    })

    it('should return API info on GET /', async () => {
      const db = new Neo4jDatabase(state, env)

      const request = new Request('http://localhost/', { method: 'GET' })
      const response = await db.fetch(request)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.name).toBe('neo4j.do')
    })
  })

  describe('RPC Methods', () => {
    it('should expose createNode as RPC method', async () => {
      const db = new Neo4jDatabase(state, env)

      // RPC methods should be directly callable
      expect(typeof db.createNode).toBe('function')
    })

    it('should expose getNode as RPC method', async () => {
      const db = new Neo4jDatabase(state, env)

      expect(typeof db.getNode).toBe('function')
    })

    it('should expose createRelationship as RPC method', async () => {
      const db = new Neo4jDatabase(state, env)

      expect(typeof db.createRelationship).toBe('function')
    })

    it('should expose runCypher as RPC method', async () => {
      const db = new Neo4jDatabase(state, env)

      expect(typeof db.runCypher).toBe('function')
    })
  })
})

/**
 * Env interface for Worker bindings
 */
interface Env {
  NEO4J_DATABASE?: DurableObjectNamespace
}
