/**
 * Security Tests for Neo4jDatabase Durable Object
 *
 * RED TDD Tests: These tests demonstrate SQL injection vulnerabilities
 * in the current neo4j-database.ts implementation that uses string
 * interpolation instead of parameterized queries.
 *
 * Expected behavior: Tests should FAIL initially, proving the vulnerability exists.
 * The GREEN phase will fix these by implementing parameterized queries.
 *
 * Target vulnerable locations in neo4j-database.ts:
 * - Line 100: createNode - labels/properties interpolation
 * - Line 114: getNode - id interpolation
 * - Line 146: updateNode - properties/id interpolation
 * - Line 174: createRelationship - type/properties interpolation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Neo4jDatabase } from '../neo4j-database'
import type { DurableObjectState } from '@cloudflare/workers-types'

/**
 * Enhanced Mock SqlStorage that tracks SQL injection attempts
 * This mock detects when malicious SQL is embedded in queries
 */
class SecurityMockSqlStorage {
  private tables: Map<string, unknown[]> = new Map()
  private nextId: Map<string, number> = new Map()
  public executedStatements: string[] = []
  public injectionAttempts: { statement: string; payload: string }[] = []

  /**
   * SQL injection patterns to detect
   */
  private readonly injectionPatterns = [
    /'\s*;\s*DROP\s+TABLE/i,
    /'\s*;\s*DELETE\s+FROM/i,
    /'\s*;\s*INSERT\s+INTO/i,
    /'\s*;\s*UPDATE\s+/i,
    /'\s*OR\s+'1'\s*=\s*'1/i,
    /'\s*OR\s+1\s*=\s*1/i,
    /'\s*--/,
    /'\s*;\s*SELECT/i,
    /UNION\s+SELECT/i,
  ]

  exec(sql: string, ...bindings: unknown[]): SqlStorageCursor {
    // For parameterized queries, we record the SQL template (which should be safe)
    // and track bindings separately. The key security check is that
    // user data should NOT be in the SQL string itself but in bindings.
    //
    // With parameterized queries using ?, the actual SQL sent to the database
    // contains placeholders, NOT the user data. The user data is passed separately
    // as bindings and never interpolated into the SQL string.
    //
    // This is the key to SQL injection prevention: user data NEVER becomes part
    // of the SQL command string itself.

    // Store the SQL template as-is (this is what actually gets executed)
    // For parameterized queries, this will contain ? placeholders, not user data
    this.executedStatements.push(sql)

    // Check for SQL injection patterns ONLY in the SQL template, not the bindings
    // Parameterized queries keep user data in bindings, so they're safe even if
    // bindings contain SQL-like strings
    for (const pattern of this.injectionPatterns) {
      // Only check the SQL template for injection patterns
      // Bindings are handled safely by the parameterization
      if (pattern.test(sql)) {
        this.injectionAttempts.push({
          statement: sql,
          payload: sql.match(pattern)?.[0] || 'unknown'
        })
      }
    }

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

    // Handle INSERT with RETURNING - use bindings for parameterized queries
    if (sql.includes('INSERT INTO')) {
      const tableMatch = sql.match(/INSERT INTO (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const id = this.nextId.get(tableName) || 1
        this.nextId.set(tableName, id + 1)

        // Parse VALUES from SQL and store the row
        if (tableName === 'nodes') {
          // For parameterized query: INSERT INTO nodes (labels, properties) VALUES (?, ?)
          // bindings[0] = labels JSON, bindings[1] = properties JSON
          let labels = '[]'
          let properties = '{}'

          if (bindings.length >= 2) {
            // Parameterized query - get values from bindings
            labels = String(bindings[0])
            properties = String(bindings[1])
          } else {
            // Legacy interpolated query - parse from SQL string
            const labelsMatch = sql.match(/VALUES\s*\('([\s\S]*?)',\s*'/)
            const propsMatch = sql.match(/VALUES\s*\('[^']*',\s*'([\s\S]*?)'\)\s*RETURNING/i)
            labels = labelsMatch ? labelsMatch[1] : '[]'
            properties = propsMatch ? propsMatch[1] : '{}'
          }

          const row = {
            id,
            labels,
            properties,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          if (!this.tables.has(tableName)) {
            this.tables.set(tableName, [])
          }
          this.tables.get(tableName)!.push(row)
          return this.createCursor([row])
        } else if (tableName === 'relationships') {
          // For parameterized query: INSERT INTO relationships (...) VALUES (?, ?, ?, ?)
          // bindings[0] = type, bindings[1] = start_node_id, bindings[2] = end_node_id, bindings[3] = properties
          let type = ''
          let start_node_id = 1
          let end_node_id = 2
          let properties = '{}'

          if (bindings.length >= 4) {
            // Parameterized query - get values from bindings
            type = String(bindings[0])
            start_node_id = Number(bindings[1])
            end_node_id = Number(bindings[2])
            properties = String(bindings[3])
          } else {
            // Legacy interpolated query - parse from SQL string
            const parts = sql.match(/VALUES\s*\('([^']*)',\s*(\d+),\s*(\d+),\s*'([^']*)'\)/i)
            type = parts ? parts[1] : ''
            start_node_id = parts ? parseInt(parts[2], 10) : 1
            end_node_id = parts ? parseInt(parts[3], 10) : 2
            properties = parts ? parts[4] : '{}'
          }

          const row = {
            id,
            type,
            start_node_id,
            end_node_id,
            properties,
            created_at: new Date().toISOString()
          }
          if (!this.tables.has(tableName)) {
            this.tables.set(tableName, [])
          }
          this.tables.get(tableName)!.push(row)
          return this.createCursor([row])
        }

        const row = { id }
        return this.createCursor([row])
      }
    }

    // Handle SELECT with parameterized ID
    if (sql.includes('SELECT')) {
      const tableMatch = sql.match(/FROM (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        let rows = this.tables.get(tableName) || []

        // Filter by ID - check bindings first, then fallback to SQL parsing
        if (sql.includes('WHERE id = ?') && bindings.length > 0) {
          const targetId = Number(bindings[0])
          rows = rows.filter((r: unknown) => (r as { id: number }).id === targetId)
        } else {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
          if (idMatch) {
            const targetId = parseInt(idMatch[1], 10)
            rows = rows.filter((r: unknown) => (r as { id: number }).id === targetId)
          }
        }

        return this.createCursor(rows)
      }
    }

    // Handle UPDATE with parameterized queries
    if (sql.includes('UPDATE')) {
      const tableMatch = sql.match(/UPDATE (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        let targetId: number | null = null
        let newProps: string | null = null

        // For parameterized: UPDATE nodes SET properties = ?, ... WHERE id = ?
        // bindings[0] = properties, bindings[1] = id
        if (sql.includes('WHERE id = ?') && bindings.length >= 2) {
          newProps = String(bindings[0])
          targetId = Number(bindings[1])
        } else {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
          const propsMatch = sql.match(/properties\s*=\s*'([^']+)'/i)
          if (idMatch) targetId = parseInt(idMatch[1], 10)
          if (propsMatch) newProps = propsMatch[1]
        }

        if (targetId !== null && newProps !== null) {
          const rows = this.tables.get(tableName) || []
          const row = rows.find((r: unknown) => (r as { id: number }).id === targetId)
          if (row) {
            (row as { properties: string }).properties = newProps
            ;(row as { updated_at: string }).updated_at = new Date().toISOString()
          }
        }
      }
      return this.createCursor([])
    }

    // Handle DELETE with parameterized ID
    if (sql.includes('DELETE FROM')) {
      const tableMatch = sql.match(/DELETE FROM (\w+)/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        let targetId: number | null = null

        // For parameterized: DELETE FROM nodes WHERE id = ?
        if (sql.includes('WHERE id = ?') && bindings.length > 0) {
          targetId = Number(bindings[0])
        } else {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*(\d+)/i)
          if (idMatch) targetId = parseInt(idMatch[1], 10)
        }

        if (targetId !== null) {
          const rows = this.tables.get(tableName) || []
          this.tables.set(tableName, rows.filter((r: unknown) => (r as { id: number }).id !== targetId))
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

  /**
   * Check if any SQL injection was detected in executed statements
   */
  hasInjectionAttempts(): boolean {
    return this.injectionAttempts.length > 0
  }

  /**
   * Check if a specific malicious payload appears unescaped in any executed SQL
   */
  containsUnescapedPayload(payload: string): boolean {
    return this.executedStatements.some(stmt => stmt.includes(payload))
  }

  /**
   * Get the raw SQL statements for inspection
   */
  getStatements(): string[] {
    return [...this.executedStatements]
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

interface DurableObjectId {
  toString(): string
  equals(other: DurableObjectId): boolean
  name?: string
}

interface DurableObjectStorage {
  sql: SecurityMockSqlStorage
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
 * Create a mock Durable Object state for security testing
 */
function createSecurityMockState(): { state: DurableObjectState; sqlStorage: SecurityMockSqlStorage } {
  const sqlStorage = new SecurityMockSqlStorage()

  const state = {
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
    blockConcurrencyWhile: vi.fn((fn: () => unknown) => fn()),
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

  return { state, sqlStorage }
}

/**
 * Env interface for Worker bindings
 */
interface Env {
  NEO4J_DATABASE?: DurableObjectNamespace
}

describe('Neo4jDatabase Security Tests - SQL Injection Vulnerabilities', () => {
  let state: DurableObjectState
  let sqlStorage: SecurityMockSqlStorage
  let env: Env

  beforeEach(() => {
    const mock = createSecurityMockState()
    state = mock.state
    sqlStorage = mock.sqlStorage
    env = {} as Env
  })

  describe('SQL Injection through Node Labels (Line 100)', () => {
    it('should NOT allow SQL injection through malicious node labels', async () => {
      const db = new Neo4jDatabase(state, env)

      // Attempt SQL injection through label
      // If vulnerable, this will inject: '); DROP TABLE nodes; --
      const maliciousLabel = "Person'); DROP TABLE nodes; --"
      await db.createNode([maliciousLabel], { name: 'Hacker' })

      // Check if the malicious payload was passed through unescaped
      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      // The test FAILS if the raw SQL contains the unescaped injection payload
      // A secure implementation would escape or parameterize the input
      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("'); DROP TABLE nodes; --")
    })

    it('should NOT allow SQL escape sequences in labels to break out of string context', async () => {
      const db = new Neo4jDatabase(state, env)

      // Attempt to break out of JSON string context with escape sequences
      const maliciousLabel = "Admin', '{}'); DELETE FROM nodes WHERE '1'='1"
      await db.createNode([maliciousLabel], {})

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      // Should NOT contain unescaped DELETE command
      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("DELETE FROM nodes")
    })

    it('should safely handle single quotes in node labels', async () => {
      const db = new Neo4jDatabase(state, env)

      // Simple quote injection attempt
      const labelWithQuote = "O'Brien"
      await db.createNode([labelWithQuote], { role: 'user' })

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      // The label should be properly escaped - not causing syntax issues
      // A vulnerable system would break the SQL query structure
      expect(insertStatement).toBeDefined()

      // Check that quotes are properly escaped (doubled or parameterized)
      // Vulnerable: contains unescaped O'Brien which breaks SQL
      const containsUnescapedQuote = insertStatement!.includes("O'Brien") &&
        !insertStatement!.includes("O''Brien") &&
        !insertStatement!.includes("O\\'Brien")

      expect(containsUnescapedQuote).toBe(false)
    })
  })

  describe('SQL Injection through Properties with Quotes (Line 100, 146)', () => {
    it('should NOT allow SQL injection through malicious property values', async () => {
      const db = new Neo4jDatabase(state, env)

      // Attempt SQL injection through property value
      const maliciousProps = {
        name: "'; DROP TABLE nodes; --",
        role: 'admin'
      }
      await db.createNode(['User'], maliciousProps)

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      // The test FAILS if the malicious payload appears unescaped
      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("'; DROP TABLE nodes; --")
    })

    it('should NOT allow SQL injection through property keys', async () => {
      const db = new Neo4jDatabase(state, env)

      // Attempt injection through property key
      // JSON.stringify should handle this, but let's verify
      const maliciousProps = {
        ["name'; DROP TABLE nodes; --"]: 'value'
      }
      await db.createNode(['User'], maliciousProps)

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      // Should not contain raw DROP TABLE
      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("DROP TABLE nodes")
    })

    it('should NOT allow SQL injection through updateNode properties', async () => {
      const db = new Neo4jDatabase(state, env)

      // First create a node
      const nodeId = await db.createNode(['User'], { name: 'Alice' })

      // Attempt SQL injection through update
      const maliciousUpdate = {
        name: "Bob'; UPDATE nodes SET properties='{}' WHERE '1'='1"
      }
      await db.updateNode(nodeId, maliciousUpdate)

      const statements = sqlStorage.getStatements()
      const updateStatement = statements.find(s => s.includes('UPDATE nodes SET properties'))

      // Should not contain a second UPDATE command from injection
      expect(updateStatement).toBeDefined()

      // With parameterized queries, the SQL template should use placeholders
      // The malicious payload is safely contained in the bindings, not in the SQL string
      // The SQL should be: UPDATE nodes SET properties = ?, updated_at = ... WHERE id = ?
      expect(updateStatement).toContain('properties = ?')
      expect(updateStatement).toContain('WHERE id = ?')

      // The actual SQL template should NOT contain the injection payload
      expect(updateStatement).not.toContain("UPDATE nodes SET properties='{}'")
      expect(updateStatement).not.toContain("WHERE '1'='1")
    })

    it('should handle nested objects with malicious values safely', async () => {
      const db = new Neo4jDatabase(state, env)

      const maliciousProps = {
        metadata: {
          nested: "value'); DROP TABLE relationships; --"
        }
      }
      await db.createNode(['Config'], maliciousProps)

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("DROP TABLE relationships")
    })
  })

  describe('SQL Injection through Relationship Type (Line 174)', () => {
    it('should NOT allow SQL injection through malicious relationship type', async () => {
      const db = new Neo4jDatabase(state, env)

      // Create nodes first
      const node1 = await db.createNode(['Person'], { name: 'Alice' })
      const node2 = await db.createNode(['Person'], { name: 'Bob' })

      // Attempt SQL injection through relationship type
      const maliciousType = "KNOWS'); DELETE FROM relationships; --"
      await db.createRelationship(maliciousType, node1, node2, {})

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO relationships'))

      // Should not contain unescaped DELETE command
      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("DELETE FROM relationships")
    })

    it('should NOT allow SQL injection through relationship properties', async () => {
      const db = new Neo4jDatabase(state, env)

      const node1 = await db.createNode(['Person'], { name: 'Alice' })
      const node2 = await db.createNode(['Person'], { name: 'Bob' })

      // Attempt injection through relationship properties
      const maliciousProps = {
        since: "2020'); DROP TABLE nodes; --"
      }
      await db.createRelationship('KNOWS', node1, node2, maliciousProps)

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO relationships'))

      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain("DROP TABLE nodes")
    })

    it('should handle single quotes in relationship type safely', async () => {
      const db = new Neo4jDatabase(state, env)

      const node1 = await db.createNode(['Person'], { name: 'Alice' })
      const node2 = await db.createNode(['Person'], { name: 'Bob' })

      // Relationship type with quote
      const typeWithQuote = "FRIEND_OF_O'REILLY"
      await db.createRelationship(typeWithQuote, node1, node2, {})

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO relationships'))

      expect(insertStatement).toBeDefined()

      // Check that the quote is properly escaped
      const containsUnescapedQuote = insertStatement!.includes("O'REILLY") &&
        !insertStatement!.includes("O''REILLY") &&
        !insertStatement!.includes("O\\'REILLY")

      expect(containsUnescapedQuote).toBe(false)
    })
  })

  describe('ID Parameter Manipulation (Lines 114, 146, 156, 189, 222)', () => {
    it('should NOT allow SQL injection through getNode ID parameter', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Create a node first
      await db.createNode(['User'], { name: 'Alice' })

      // Attempt to inject via ID (though ID is typed as number, JS allows coercion)
      // In JavaScript, this would be: "1 OR 1=1" becoming NaN or being coerced
      // But let's test the raw SQL generation
      const maliciousId = 1 // Normal ID first to establish baseline

      await db.getNode(maliciousId)

      const statements = sqlStorage.getStatements()
      const selectStatement = statements.find(s =>
        s.includes('SELECT') && s.includes('FROM nodes') && s.includes('WHERE')
      )

      // With parameterized queries, the ID should be passed as a parameter
      // The SQL template should use a placeholder, not the actual ID value
      expect(selectStatement).toBeDefined()
      expect(selectStatement).toContain('WHERE id = ?')
    })

    it('should use parameterized queries for node ID to prevent injection', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Even with a valid ID, the query should use parameters, not interpolation
      await db.getNode(42)

      const statements = sqlStorage.getStatements()
      const selectStatement = statements.find(s =>
        s.includes('SELECT') && s.includes('FROM nodes')
      )

      // A secure implementation would use: WHERE id = ? or WHERE id = $1
      // Not: WHERE id = 42
      expect(selectStatement).toBeDefined()

      // This test FAILS if the ID is directly interpolated into the SQL string
      // A secure implementation would use parameterized queries
      const usesDirectInterpolation = selectStatement!.includes('WHERE id = 42')
      expect(usesDirectInterpolation).toBe(false)
    })

    it('should use parameterized queries for deleteNode ID', async () => {
      const db = new Neo4jDatabase(state, env)
      const nodeId = await db.createNode(['Test'], {})

      await db.deleteNode(nodeId)

      const statements = sqlStorage.getStatements()
      const deleteStatement = statements.find(s =>
        s.includes('DELETE FROM nodes')
      )

      expect(deleteStatement).toBeDefined()

      // Check for direct interpolation (vulnerable)
      const usesDirectInterpolation = deleteStatement!.includes(`WHERE id = ${nodeId}`)
      expect(usesDirectInterpolation).toBe(false)
    })

    it('should use parameterized queries for relationship ID operations', async () => {
      const db = new Neo4jDatabase(state, env)
      const node1 = await db.createNode(['A'], {})
      const node2 = await db.createNode(['B'], {})
      const relId = await db.createRelationship('REL', node1, node2, {})

      await db.getRelationship(relId)

      const statements = sqlStorage.getStatements()
      const selectStatement = statements.find(s =>
        s.includes('SELECT') && s.includes('FROM relationships')
      )

      expect(selectStatement).toBeDefined()

      // Should use parameterized query, not direct interpolation
      const usesDirectInterpolation = selectStatement!.includes(`WHERE id = ${relId}`)
      expect(usesDirectInterpolation).toBe(false)
    })
  })

  describe('Combined Attack Vectors', () => {
    it('should prevent multi-statement injection attacks', async () => {
      const db = new Neo4jDatabase(state, env)

      // Attempt to execute multiple statements
      const multiStatementPayload = "Test'); INSERT INTO nodes (labels, properties) VALUES ('[]', '{\"admin\":true}'); --"
      await db.createNode([multiStatementPayload], {})

      const statements = sqlStorage.getStatements()

      // Count INSERT statements - should only be one legitimate one for nodes table
      const nodeInserts = statements.filter(s =>
        s.includes('INSERT INTO nodes')
      )

      // If vulnerable, there might be an injected INSERT
      // The test checks that malicious INSERT isn't executed as separate statement
      expect(nodeInserts.length).toBe(1)
    })

    it('should prevent UNION-based injection attacks', async () => {
      const db = new Neo4jDatabase(state, env)

      // UNION attack to extract data from other tables
      const unionPayload = "User' UNION SELECT id, labels, properties, created_at, updated_at FROM nodes WHERE '1'='1"
      await db.createNode([unionPayload], {})

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      expect(insertStatement).toBeDefined()
      expect(insertStatement).not.toContain('UNION SELECT')
    })

    it('should prevent comment-based injection to bypass logic', async () => {
      const db = new Neo4jDatabase(state, env)

      // Use SQL comment to bypass rest of query
      const commentPayload = "Admin'--"
      await db.createNode([commentPayload], { verified: false })

      const statements = sqlStorage.getStatements()
      const insertStatement = statements.find(s => s.includes('INSERT INTO nodes'))

      expect(insertStatement).toBeDefined()

      // With parameterized queries, the SQL template uses placeholders
      // Both labels and properties are passed as bindings, not in the SQL string
      // The SQL should be: INSERT INTO nodes (labels, properties) VALUES (?, ?) RETURNING id
      expect(insertStatement).toContain('VALUES (?, ?)')

      // The malicious payload with SQL comment should NOT appear in the SQL template
      expect(insertStatement).not.toContain("Admin'--")
      expect(insertStatement).not.toContain('--')
    })
  })

  describe('Input Sanitization Verification', () => {
    it('should properly escape or parameterize all user inputs in createNode', async () => {
      const db = new Neo4jDatabase(state, env)

      // Test various special characters
      const specialChars = ["'", '"', '\\', ';', '--', '/*', '*/', '\x00']

      for (const char of specialChars) {
        const testLabel = `Test${char}Label`
        const testProp = { name: `Test${char}Value` }

        await db.createNode([testLabel], testProp)
      }

      const statements = sqlStorage.getStatements()
      const insertStatements = statements.filter(s => s.includes('INSERT INTO nodes'))

      // Each insert should have properly handled special characters
      expect(insertStatements.length).toBe(specialChars.length)

      // No injection attempts should have been detected
      expect(sqlStorage.hasInjectionAttempts()).toBe(false)
    })

    it('should properly escape or parameterize all user inputs in createRelationship', async () => {
      const db = new Neo4jDatabase(state, env)

      const node1 = await db.createNode(['A'], {})
      const node2 = await db.createNode(['B'], {})

      // Test various special characters in relationship type
      const specialChars = ["'", '"', '\\', ';']

      for (const char of specialChars) {
        const testType = `REL${char}TYPE`
        await db.createRelationship(testType, node1, node2, {})
      }

      const statements = sqlStorage.getStatements()
      const relInserts = statements.filter(s => s.includes('INSERT INTO relationships'))

      // All relationships should have been created safely
      expect(relInserts.length).toBe(specialChars.length)
    })
  })
})

describe('Documentation of Vulnerable Code Patterns', () => {
  /**
   * This describe block documents the specific vulnerable patterns
   * found in neo4j-database.ts for reference during the GREEN phase.
   */

  it('documents createNode vulnerability at line 100', () => {
    // Vulnerable pattern in createNode (line 100):
    // sql.exec(`INSERT INTO nodes (labels, properties) VALUES ('${labelsJson}', '${propsJson}') RETURNING id`)
    //
    // The labelsJson and propsJson are created via JSON.stringify() but then
    // directly interpolated into the SQL string. If the input contains
    // characters that break out of the JSON/SQL string context, injection is possible.
    //
    // Fix: Use parameterized queries:
    // sql.exec('INSERT INTO nodes (labels, properties) VALUES (?, ?) RETURNING id', [labelsJson, propsJson])

    expect(true).toBe(true) // Documentation test
  })

  it('documents getNode vulnerability at line 114', () => {
    // Vulnerable pattern in getNode (line 114):
    // sql.exec(`SELECT ... FROM nodes WHERE id = ${id}`)
    //
    // The id parameter is directly interpolated. While id is typed as number,
    // TypeScript types aren't enforced at runtime, and JavaScript's type coercion
    // could potentially allow string-based injection in edge cases.
    //
    // Fix: Use parameterized queries:
    // sql.exec('SELECT ... FROM nodes WHERE id = ?', [id])

    expect(true).toBe(true) // Documentation test
  })

  it('documents updateNode vulnerability at line 146', () => {
    // Vulnerable pattern in updateNode (line 146):
    // sql.exec(`UPDATE nodes SET properties = '${propsJson}', ... WHERE id = ${id}`)
    //
    // Both propsJson and id are directly interpolated.
    //
    // Fix: Use parameterized queries:
    // sql.exec('UPDATE nodes SET properties = ?, updated_at = datetime(\'now\') WHERE id = ?', [propsJson, id])

    expect(true).toBe(true) // Documentation test
  })

  it('documents createRelationship vulnerability at line 174', () => {
    // Vulnerable pattern in createRelationship (line 174):
    // sql.exec(`INSERT INTO relationships (type, ...) VALUES ('${type}', ${startNodeId}, ${endNodeId}, '${propsJson}') ...`)
    //
    // Multiple parameters are directly interpolated: type, startNodeId, endNodeId, propsJson
    //
    // Fix: Use parameterized queries:
    // sql.exec('INSERT INTO relationships (type, ...) VALUES (?, ?, ?, ?) RETURNING id',
    //          [type, startNodeId, endNodeId, propsJson])

    expect(true).toBe(true) // Documentation test
  })
})
