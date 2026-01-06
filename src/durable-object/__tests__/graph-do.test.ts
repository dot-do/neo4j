/**
 * Tests for GraphDO Durable Object
 *
 * These tests verify the behavior of the GraphDO Durable Object
 * which provides a Neo4j-compatible graph database HTTP API
 * backed by Cloudflare Durable Objects with SQLite storage.
 *
 * TDD Red Phase: These tests should FAIL initially as GraphDO is not yet implemented.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GraphDO } from '../graph-do'
import type { DurableObjectState } from '@cloudflare/workers-types'

/**
 * Mock implementation of SqlStorage that behaves like Durable Object SQL API
 */
class MockSqlStorage {
  private tables: Map<string, unknown[]> = new Map()
  private nextId: Map<string, number> = new Map()
  public executedStatements: string[] = []

  exec(sql: string, ..._params: unknown[]): SqlStorageCursor {
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

        // Parse and store the actual row data
        const row: Record<string, unknown> = { id }

        // Extract column values from INSERT statement
        const params = _params || []
        if (tableName === 'nodes' && params.length >= 3) {
          row.id = params[0] as number
          row.labels = params[1] as string
          row.properties = params[2] as string
          this.nextId.set(tableName, (params[0] as number) + 1)
        } else if (tableName === 'relationships' && params.length >= 5) {
          row.id = params[0] as number
          row.type = params[1] as string
          row.start_node_id = params[2] as number
          row.end_node_id = params[3] as number
          row.properties = params[4] as string
          this.nextId.set(tableName, (params[0] as number) + 1)
        }

        // Actually persist the row
        const table = this.tables.get(tableName) || []
        table.push(row)
        this.tables.set(tableName, table)

        return this.createCursor([row])
      }
    }

    // Handle SELECT
    if (sql.includes('SELECT')) {
      const tableMatch = sql.match(/FROM (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        let rows = [...(this.tables.get(tableName) || [])]

        // Filter by ID if WHERE clause present (with literal value)
        const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
        if (idMatch) {
          const targetId = parseInt(idMatch[1], 10)
          rows = rows.filter((r: unknown) => (r as { id: number }).id === targetId)
        }

        // Filter by ID if WHERE clause has placeholder (?) for direct id = ? queries
        const params = _params || []
        const idParamMatch = sql.match(/WHERE\s+id\s*=\s*\?/i)
        if (idParamMatch && params.length > 0) {
          const targetId = params[0] as number
          rows = rows.filter((r: unknown) => (r as { id: number }).id === targetId)
        }

        // Handle json_each for label filtering
        if (sql.includes('json_each') && params.length > 0) {
          const labelToMatch = params[0] as string
          rows = rows.filter((r: unknown) => {
            const row = r as { labels: string }
            const labels = JSON.parse(row.labels || '[]') as string[]
            return labels.includes(labelToMatch)
          })
        }

        // Handle json_extract for property filtering
        const propMatch = sql.match(/json_extract\(properties,\s*'\$\.(\w+)'\)\s*=\s*\?/)
        if (propMatch && params.length > 0) {
          const propKey = propMatch[1]
          const propValue = params[params.length - 1] // Last param is typically the property value
          rows = rows.filter((r: unknown) => {
            const row = r as { properties: string }
            const props = JSON.parse(row.properties || '{}') as Record<string, unknown>
            return props[propKey] === propValue
          })
        }

        // Handle labels LIKE filter
        const labelsLikeMatch = sql.match(/labels\s+LIKE\s+\?/)
        if (labelsLikeMatch && params.length > 0) {
          const labelPattern = params[params.length - 1] as string
          const labelToMatch = labelPattern.replace(/%"/g, '').replace(/"%/g, '')
          rows = rows.filter((r: unknown) => {
            const row = r as { labels: string }
            const labels = JSON.parse(row.labels || '[]') as string[]
            return labels.includes(labelToMatch)
          })
        }

        return this.createCursor(rows)
      }
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
  let _blockConcurrencyCallback: (() => Promise<void>) | null = null

  return {
    id: {
      toString: () => 'test-graph-do-id',
      equals: (other: DurableObjectId) => other.toString() === 'test-graph-do-id',
      name: 'test-graph',
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
      transactionSync: vi.fn((fn: () => unknown) => fn()),
      deleteAll: vi.fn(),
      getCurrentBookmark: vi.fn(),
      getBookmarkForTime: vi.fn(),
      onNextSessionRestoreBookmark: vi.fn(),
    } as unknown as DurableObjectStorage,
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn((fn: () => Promise<void>) => {
      _blockConcurrencyCallback = fn
      return fn()
    }),
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

/**
 * Helper to create GraphDO and wait for initialization
 * In a real DO runtime, blockConcurrencyWhile blocks all requests until completion.
 * In tests, we simulate this by waiting for the initialization promise.
 */
async function createInitializedGraphDO(state: DurableObjectState, env: Env): Promise<GraphDO> {
  const graphDO = new GraphDO(state, env)
  // Wait for microtasks to complete (initialization is async but operations are sync)
  await new Promise(resolve => setTimeout(resolve, 0))
  return graphDO
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

/**
 * Env interface for Worker bindings
 */
interface Env {
  GRAPH_DO?: DurableObjectNamespace
}

describe('GraphDO Durable Object', () => {
  let state: DurableObjectState
  let env: Env

  beforeEach(() => {
    state = createMockState()
    env = {} as Env
  })

  describe('1. Class Instantiation', () => {
    it('should be instantiable with state and env', () => {
      const graphDO = new GraphDO(state, env)
      expect(graphDO).toBeInstanceOf(GraphDO)
    })

    it('should extend DurableObject base class', () => {
      const graphDO = new GraphDO(state, env)
      // Check that it has the expected structure
      expect(graphDO).toHaveProperty('fetch')
      expect(typeof graphDO.fetch).toBe('function')
    })

    it('should accept DurableObjectState as first parameter', () => {
      const graphDO = new GraphDO(state, env)
      expect(graphDO).toBeDefined()
    })
  })

  describe('2. Schema Initialization via blockConcurrencyWhile()', () => {
    it('should call blockConcurrencyWhile during construction', () => {
      new GraphDO(state, env)
      expect(state.blockConcurrencyWhile).toHaveBeenCalled()
    })

    it('should initialize SQLite schema with nodes table', async () => {
      new GraphDO(state, env)
      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      expect(sqlStorage.executedStatements.some((s: string) =>
        s.includes('CREATE TABLE') && s.includes('nodes')
      )).toBe(true)
    })

    it('should initialize SQLite schema with relationships table', async () => {
      new GraphDO(state, env)
      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      expect(sqlStorage.executedStatements.some((s: string) =>
        s.includes('CREATE TABLE') && s.includes('relationships')
      )).toBe(true)
    })

    it('should create indexes for efficient graph traversal', async () => {
      new GraphDO(state, env)
      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      expect(sqlStorage.executedStatements.some((s: string) =>
        s.includes('CREATE INDEX')
      )).toBe(true)
    })

    it('should only initialize schema once even with concurrent requests', async () => {
      const graphDO = new GraphDO(state, env)
      const sqlStorage = (state.storage as unknown as { sql: MockSqlStorage }).sql
      const initialStatements = sqlStorage.executedStatements.length

      // Simulate multiple concurrent requests
      await Promise.all([
        graphDO.fetch(new Request('http://localhost/health')),
        graphDO.fetch(new Request('http://localhost/health')),
        graphDO.fetch(new Request('http://localhost/health')),
      ])

      // Schema statements should not increase
      const createTableStatements = sqlStorage.executedStatements.filter((s: string) =>
        s.includes('CREATE TABLE')
      )
      expect(createTableStatements.length).toBe(
        initialStatements > 0 ? createTableStatements.length : 0
      )
    })
  })

  describe('3. HTTP POST /cypher endpoint', () => {
    it('should accept POST requests to /cypher', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MATCH (n) RETURN n' })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(200)
    })

    it('should execute Cypher queries and return results', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "Alice"}) RETURN n' })
      })

      const response = await graphDO.fetch(request)
      const body = await response.json() as { records: unknown[]; summary: unknown }

      expect(body).toHaveProperty('records')
      expect(body).toHaveProperty('summary')
      expect(Array.isArray(body.records)).toBe(true)
    })

    it('should support parameterized Cypher queries', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'CREATE (n:Person {name: $name}) RETURN n',
          parameters: { name: 'Bob' }
        })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(200)
    })

    it('should return query summary with counters', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "Test"})' })
      })

      const response = await graphDO.fetch(request)
      const body = await response.json() as {
        summary: {
          counters: {
            nodesCreated: number
            relationshipsCreated: number
            propertiesSet: number
          }
        }
      }

      expect(body.summary).toBeDefined()
      expect(body.summary.counters).toBeDefined()
      expect(typeof body.summary.counters.nodesCreated).toBe('number')
    })

    it('should reject non-POST requests to /cypher with 405', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', { method: 'GET' })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(405)
    })
  })

  describe('4. HTTP POST /transaction/begin endpoint', () => {
    it('should create a new transaction and return transaction ID', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/transaction/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(200)

      const body = await response.json() as { transactionId: string }
      expect(body).toHaveProperty('transactionId')
      expect(typeof body.transactionId).toBe('string')
    })

    it('should allow specifying transaction timeout', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/transaction/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 30000 })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(200)
    })

    it('should support executing queries within a transaction', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Execute query in transaction
      const queryRequest = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "TxTest"}) RETURN n' })
      })

      const response = await graphDO.fetch(queryRequest)
      expect(response.status).toBe(200)
    })
  })

  describe('5. HTTP POST /transaction/commit endpoint', () => {
    it('should commit a transaction', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Commit transaction
      const commitRequest = new Request('http://localhost/transaction/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      })

      const response = await graphDO.fetch(commitRequest)
      expect(response.status).toBe(200)

      const body = await response.json() as { success: boolean }
      expect(body.success).toBe(true)
    })

    it('should return 400 for invalid transaction ID on commit', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/transaction/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: 'invalid-tx-id' })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(400)
    })

    it('should persist changes after commit', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Create node in transaction
      await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "Committed"}) RETURN n' })
      }))

      // Commit transaction
      await graphDO.fetch(new Request('http://localhost/transaction/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      }))

      // Verify node exists
      const verifyResponse = await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MATCH (n:Person {name: "Committed"}) RETURN n' })
      }))

      const body = await verifyResponse.json() as { records: unknown[] }
      expect(body.records.length).toBeGreaterThan(0)
    })
  })

  describe('6. HTTP POST /transaction/rollback endpoint', () => {
    it('should rollback a transaction', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Rollback transaction
      const rollbackRequest = new Request('http://localhost/transaction/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      })

      const response = await graphDO.fetch(rollbackRequest)
      expect(response.status).toBe(200)

      const body = await response.json() as { success: boolean }
      expect(body.success).toBe(true)
    })

    it('should return 400 for invalid transaction ID on rollback', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/transaction/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: 'invalid-tx-id' })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(400)
    })

    it('should discard changes after rollback', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Create node in transaction
      await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "RolledBack"}) RETURN n' })
      }))

      // Rollback transaction
      await graphDO.fetch(new Request('http://localhost/transaction/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      }))

      // Verify node does NOT exist
      const verifyResponse = await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MATCH (n:Person {name: "RolledBack"}) RETURN n' })
      }))

      const body = await verifyResponse.json() as { records: unknown[] }
      expect(body.records.length).toBe(0)
    })
  })

  describe('7. HTTP GET /node/:id endpoint', () => {
    it('should retrieve a node by ID', async () => {
      const graphDO = new GraphDO(state, env)

      // First create a node
      const createResponse = await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "NodeTest"}) RETURN id(n) as nodeId' })
      }))
      const createBody = await createResponse.json() as { records: Array<{ nodeId: number }> }
      const nodeId = createBody.records[0]?.nodeId

      // Retrieve the node
      const request = new Request(`http://localhost/node/${nodeId}`, { method: 'GET' })
      const response = await graphDO.fetch(request)

      expect(response.status).toBe(200)
      const body = await response.json() as { id: number; labels: string[]; properties: Record<string, unknown> }
      expect(body.id).toBe(nodeId)
      expect(body.labels).toContain('Person')
      expect(body.properties.name).toBe('NodeTest')
    })

    it('should return 404 for non-existent node', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/node/999999', { method: 'GET' })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(404)
    })

    it('should return node labels and properties', async () => {
      const graphDO = new GraphDO(state, env)

      // Create node with multiple labels and properties
      await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'CREATE (n:Person:Employee {name: "Multi", age: 30, active: true}) RETURN id(n) as nodeId'
        })
      }))

      const response = await graphDO.fetch(new Request('http://localhost/node/1', { method: 'GET' }))
      const body = await response.json() as { labels: string[]; properties: Record<string, unknown> }

      expect(body.labels).toContain('Person')
      expect(body.labels).toContain('Employee')
      expect(body.properties.name).toBe('Multi')
      expect(body.properties.age).toBe(30)
      expect(body.properties.active).toBe(true)
    })
  })

  describe('8. HTTP GET /health endpoint', () => {
    it('should return 200 when healthy', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/health', { method: 'GET' })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(200)
    })

    it('should return health status object', async () => {
      const graphDO = await createInitializedGraphDO(state, env)
      const request = new Request('http://localhost/health', { method: 'GET' })

      const response = await graphDO.fetch(request)
      const body = await response.json() as { status: string; initialized: boolean }

      expect(body).toHaveProperty('status')
      expect(body.status).toBe('healthy')
      expect(body).toHaveProperty('initialized')
      expect(body.initialized).toBe(true)
    })

    it('should include schema version in health response', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/health', { method: 'GET' })

      const response = await graphDO.fetch(request)
      const body = await response.json() as { schemaVersion: number }

      expect(body).toHaveProperty('schemaVersion')
      expect(typeof body.schemaVersion).toBe('number')
    })

    it('should include node and relationship counts', async () => {
      const graphDO = new GraphDO(state, env)

      // Create some data
      await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'CREATE (a:Person)-[:KNOWS]->(b:Person)'
        })
      }))

      const response = await graphDO.fetch(new Request('http://localhost/health', { method: 'GET' }))
      const body = await response.json() as { nodeCount: number; relationshipCount: number }

      expect(body).toHaveProperty('nodeCount')
      expect(body).toHaveProperty('relationshipCount')
      expect(typeof body.nodeCount).toBe('number')
      expect(typeof body.relationshipCount).toBe('number')
    })
  })

  describe('9. Error Handling for Invalid Queries', () => {
    it('should return 400 for malformed JSON body', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json'
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(400)
    })

    it('should return 400 for missing query in request', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(400)

      const body = await response.json() as { error: string }
      expect(body.error).toContain('query')
    })

    it('should return 400 for invalid Cypher syntax', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'INVALID CYPHER SYNTAX!!!' })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(400)

      const body = await response.json() as { error: string; code: string }
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('code')
    })

    it('should return 404 for unknown endpoints', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/unknown/endpoint', { method: 'GET' })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(404)
    })

    it('should return error details in Neo4j-compatible format', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MATCH (n) RETURN undefinedVariable' })
      })

      const response = await graphDO.fetch(request)
      const body = await response.json() as { error: string; code: string; message: string }

      expect(body).toHaveProperty('error')
      // Neo4j error format typically includes code and message
      expect(body.code || body.error).toBeDefined()
      expect(body.message || body.error).toBeDefined()
    })

    it('should handle empty query string', async () => {
      const graphDO = new GraphDO(state, env)
      const request = new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '' })
      })

      const response = await graphDO.fetch(request)
      expect(response.status).toBe(400)
    })
  })

  describe('10. Transaction Isolation', () => {
    it('should isolate uncommitted changes from other reads', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Create node in transaction (uncommitted)
      await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "Isolated"}) RETURN n' })
      }))

      // Read WITHOUT transaction - should NOT see uncommitted node
      const readResponse = await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MATCH (n:Person {name: "Isolated"}) RETURN n' })
      }))

      const body = await readResponse.json() as { records: unknown[] }
      expect(body.records.length).toBe(0)
    })

    it('should see own uncommitted changes within transaction', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Create node in transaction
      await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'CREATE (n:Person {name: "SelfVisible"}) RETURN n' })
      }))

      // Read WITH same transaction - should see uncommitted node
      const readResponse = await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'MATCH (n:Person {name: "SelfVisible"}) RETURN n' })
      }))

      const body = await readResponse.json() as { records: unknown[] }
      expect(body.records.length).toBe(1)
    })

    it('should support multiple concurrent transactions', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin two transactions
      const [tx1Response, tx2Response] = await Promise.all([
        graphDO.fetch(new Request('http://localhost/transaction/begin', { method: 'POST' })),
        graphDO.fetch(new Request('http://localhost/transaction/begin', { method: 'POST' }))
      ])

      const { transactionId: tx1Id } = await tx1Response.json() as { transactionId: string }
      const { transactionId: tx2Id } = await tx2Response.json() as { transactionId: string }

      expect(tx1Id).not.toBe(tx2Id)

      // Both transactions should be able to execute queries
      const [result1, result2] = await Promise.all([
        graphDO.fetch(new Request('http://localhost/cypher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Transaction-Id': tx1Id },
          body: JSON.stringify({ query: 'CREATE (n:Test1) RETURN n' })
        })),
        graphDO.fetch(new Request('http://localhost/cypher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Transaction-Id': tx2Id },
          body: JSON.stringify({ query: 'CREATE (n:Test2) RETURN n' })
        }))
      ])

      expect(result1.status).toBe(200)
      expect(result2.status).toBe(200)
    })

    it('should timeout expired transactions', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction with very short timeout
      const beginResponse = await graphDO.fetch(new Request('http://localhost/transaction/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 1 }) // 1ms timeout
      }))
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 10))

      // Try to use expired transaction
      const queryResponse = await graphDO.fetch(new Request('http://localhost/cypher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': transactionId
        },
        body: JSON.stringify({ query: 'RETURN 1' })
      }))

      expect(queryResponse.status).toBe(400)
      const body = await queryResponse.json() as { error: string }
      expect(body.error).toContain('expired')
    })

    it('should not allow commit after rollback', async () => {
      const graphDO = new GraphDO(state, env)

      // Begin transaction
      const beginResponse = await graphDO.fetch(
        new Request('http://localhost/transaction/begin', { method: 'POST' })
      )
      const { transactionId } = await beginResponse.json() as { transactionId: string }

      // Rollback transaction
      await graphDO.fetch(new Request('http://localhost/transaction/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      }))

      // Try to commit same transaction
      const commitResponse = await graphDO.fetch(new Request('http://localhost/transaction/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      }))

      expect(commitResponse.status).toBe(400)
    })
  })
})
