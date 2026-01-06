/**
 * Tests for JSON.parse error handling in Neo4jDatabase
 *
 * GREEN TDD: These tests verify safe JSON parsing with graceful error handling.
 * The implementation uses safeJsonParse to handle corrupted data without crashing.
 *
 * Target locations (now using safeJsonParse):
 * - getNode: parses labels and properties with fallback to [] and {}
 * - getRelationship: parses properties with fallback to {}
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Neo4jDatabase } from '../neo4j-database'
import type { DurableObjectState } from '@cloudflare/workers-types'

/**
 * Mock SqlStorage that can inject corrupted JSON data
 * Supports parameterized queries with ? placeholders and ...bindings
 */
class CorruptedDataMockSqlStorage {
  private tables: Map<string, unknown[]> = new Map()
  private nextId: Map<string, number> = new Map()
  public executedStatements: string[] = []

  // Configuration for injecting corrupted data
  public corruptedLabels: string | null = null
  public corruptedNodeProperties: string | null = null
  public corruptedRelationshipProperties: string | null = null

  exec(sql: string, ...bindings: unknown[]): SqlStorageCursor {
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

    // Handle INSERT with RETURNING for nodes
    if (sql.includes('INSERT INTO nodes')) {
      const id = this.nextId.get('nodes') || 1
      this.nextId.set('nodes', id + 1)

      // For parameterized query: bindings[0] = labels, bindings[1] = properties
      let labels = '[]'
      let properties = '{}'

      if (bindings.length >= 2) {
        labels = String(bindings[0])
        properties = String(bindings[1])
      } else {
        const labelsMatch = sql.match(/'(\[.*?\])'/)
        const propsMatch = sql.match(/'(\{.*?\})'/)
        labels = labelsMatch ? labelsMatch[1] : '[]'
        properties = propsMatch ? propsMatch[1] : '{}'
      }

      const row = {
        id,
        // Use corrupted data if configured, otherwise use parsed values
        labels: this.corruptedLabels ?? labels,
        properties: this.corruptedNodeProperties ?? properties,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (!this.tables.has('nodes')) {
        this.tables.set('nodes', [])
      }
      this.tables.get('nodes')!.push(row)
      return this.createCursor([row])
    }

    // Handle INSERT with RETURNING for relationships
    if (sql.includes('INSERT INTO relationships')) {
      const id = this.nextId.get('relationships') || 1
      this.nextId.set('relationships', id + 1)

      // For parameterized query: bindings[0] = type, bindings[1] = start_node_id,
      // bindings[2] = end_node_id, bindings[3] = properties
      let type = ''
      let start_node_id = 1
      let end_node_id = 2
      let properties = '{}'

      if (bindings.length >= 4) {
        type = String(bindings[0])
        start_node_id = Number(bindings[1])
        end_node_id = Number(bindings[2])
        properties = String(bindings[3])
      } else {
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
        // Use corrupted data if configured
        properties: this.corruptedRelationshipProperties ?? properties,
        created_at: new Date().toISOString()
      }

      if (!this.tables.has('relationships')) {
        this.tables.set('relationships', [])
      }
      this.tables.get('relationships')!.push(row)
      return this.createCursor([row])
    }

    // Handle SELECT from nodes
    if (sql.includes('SELECT') && sql.includes('FROM nodes')) {
      let rows = this.tables.get('nodes') || []

      // Support parameterized ID lookup
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

    // Handle SELECT from relationships
    if (sql.includes('SELECT') && sql.includes('FROM relationships')) {
      let rows = this.tables.get('relationships') || []

      // Support parameterized ID lookup
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

    return this.createCursor([])
  }

  private createCursor(rows: unknown[]): SqlStorageCursor {
    return {
      [Symbol.iterator](): Iterator<unknown> {
        let index = 0
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
   * Directly insert a row with corrupted data for testing
   */
  insertCorruptedNode(id: number, labels: string, properties: string): void {
    if (!this.tables.has('nodes')) {
      this.tables.set('nodes', [])
    }
    this.tables.get('nodes')!.push({
      id,
      labels,
      properties,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }

  /**
   * Directly insert a relationship with corrupted data for testing
   */
  insertCorruptedRelationship(
    id: number,
    type: string,
    startNodeId: number,
    endNodeId: number,
    properties: string
  ): void {
    if (!this.tables.has('relationships')) {
      this.tables.set('relationships', [])
    }
    this.tables.get('relationships')!.push({
      id,
      type,
      start_node_id: startNodeId,
      end_node_id: endNodeId,
      properties,
      created_at: new Date().toISOString()
    })
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
  sql: CorruptedDataMockSqlStorage
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
 * Create a mock state with corrupted data injection support
 */
function createMockStateWithCorruptedData(): {
  state: DurableObjectState
  sqlStorage: CorruptedDataMockSqlStorage
} {
  const sqlStorage = new CorruptedDataMockSqlStorage()

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

  return { state, sqlStorage }
}

/**
 * Env interface for Worker bindings
 */
interface Env {
  NEO4J_DATABASE?: DurableObjectNamespace
}

describe('Neo4jDatabase JSON.parse Safety', () => {
  let state: DurableObjectState
  let sqlStorage: CorruptedDataMockSqlStorage
  let env: Env

  beforeEach(() => {
    const mock = createMockStateWithCorruptedData()
    state = mock.state
    sqlStorage = mock.sqlStorage
    env = {} as Env
  })

  describe('Corrupted labels in database (Line 130)', () => {
    it('should handle corrupted labels JSON gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Insert a node with invalid JSON in labels field
      sqlStorage.insertCorruptedNode(
        1,
        'not valid json [broken',  // Corrupted labels
        '{"name": "Alice"}'        // Valid properties
      )

      // Should not throw - returns node with empty labels array as fallback
      const node = await db.getNode(1)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual([])
      expect(node?.properties).toEqual({ name: 'Alice' })
    })

    it('should handle truncated labels array gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Simulate data corruption from truncated write
      sqlStorage.insertCorruptedNode(
        2,
        '["Person", "Employee',    // Truncated JSON array
        '{"name": "Bob"}'
      )

      const node = await db.getNode(2)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual([])
    })

    it('should handle null byte in labels gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Null bytes can corrupt JSON parsing
      sqlStorage.insertCorruptedNode(
        3,
        '["Person\x00Label"]',     // Null byte in string
        '{"name": "Charlie"}'
      )

      // Should handle gracefully - either parse successfully or fallback to empty array
      const node = await db.getNode(3)
      expect(node).toBeDefined()
      expect(node).not.toBeNull()
      expect(Array.isArray(node?.labels)).toBe(true)
    })

    it('should handle JavaScript code injection attempt in labels', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Malformed JSON that looks like code
      sqlStorage.insertCorruptedNode(
        4,
        'eval("malicious")',       // Not valid JSON
        '{"safe": true}'
      )

      // Should not throw or execute - returns empty labels
      const node = await db.getNode(4)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual([])
    })
  })

  describe('Corrupted properties in database (Line 131)', () => {
    it('should handle corrupted properties JSON gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        10,
        '["Person"]',              // Valid labels
        '{name: "Alice"}'          // Invalid JSON (unquoted key)
      )

      const node = await db.getNode(10)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual(['Person'])
      expect(node?.properties).toEqual({})
    })

    it('should handle node properties with trailing comma gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        11,
        '["Person"]',
        '{"name": "Bob", "age": 30,}'  // Trailing comma - invalid JSON
      )

      const node = await db.getNode(11)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })

    it('should handle node properties with single quotes gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        12,
        '["Person"]',
        "{'name': 'Charlie'}"      // Single quotes - invalid JSON
      )

      const node = await db.getNode(12)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })

    it('should handle completely malformed node properties gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        13,
        '["Person"]',
        'undefined'                // Not valid JSON
      )

      const node = await db.getNode(13)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })

    it('should handle node properties with unescaped newlines gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Literal newline in string value is invalid JSON
      sqlStorage.insertCorruptedNode(
        14,
        '["Person"]',
        '{"bio": "Line 1\nLine 2"}'  // Unescaped newline
      )

      const node = await db.getNode(14)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })
  })

  describe('Corrupted relationship properties (Line 210)', () => {
    it('should handle corrupted relationship properties JSON gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedRelationship(
        100,
        'KNOWS',
        1,
        2,
        '{since: 2020}'            // Invalid JSON (unquoted key)
      )

      const rel = await db.getRelationship(100)
      expect(rel).not.toBeNull()
      expect(rel?.type).toBe('KNOWS')
      expect(rel?.properties).toEqual({})
    })

    it('should handle truncated relationship properties gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedRelationship(
        101,
        'FOLLOWS',
        1,
        2,
        '{"weight": 0.75, "created":'  // Truncated JSON
      )

      const rel = await db.getRelationship(101)
      expect(rel).not.toBeNull()
      expect(rel?.properties).toEqual({})
    })

    it('should handle relationship properties with invalid escape gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedRelationship(
        102,
        'LIKES',
        1,
        2,
        '{"note": "test\\x invalid"}'  // Invalid escape sequence
      )

      const rel = await db.getRelationship(102)
      expect(rel).not.toBeNull()
      expect(rel?.properties).toEqual({})
    })

    it('should handle empty string relationship properties gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedRelationship(
        103,
        'WORKS_WITH',
        1,
        2,
        ''                         // Empty string - not valid JSON
      )

      const rel = await db.getRelationship(103)
      expect(rel).not.toBeNull()
      expect(rel?.properties).toEqual({})
    })
  })

  describe('Recovery/Fallback behavior', () => {
    it('should provide fallback empty array for corrupted labels', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        200,
        'CORRUPTED',
        '{"valid": true}'
      )

      // Should return node with fallback empty labels array
      const node = await db.getNode(200)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual([])
      expect(node?.properties).toEqual({ valid: true })
    })

    it('should provide fallback empty object for corrupted properties', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        201,
        '["Person"]',
        'CORRUPTED'
      )

      // Should return node with fallback empty properties
      const node = await db.getNode(201)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual(['Person'])
      expect(node?.properties).toEqual({})
    })

    it('should gracefully handle mixed valid/invalid data', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Insert one valid node
      sqlStorage.insertCorruptedNode(
        300,
        '["Valid"]',
        '{"ok": true}'
      )

      // Insert one corrupted node
      sqlStorage.insertCorruptedNode(
        301,
        'BROKEN',
        '{"ok": true}'
      )

      // Valid node should work normally
      const validNode = await db.getNode(300)
      expect(validNode).not.toBeNull()
      expect(validNode?.labels).toContain('Valid')

      // Corrupted node should return with fallback values
      const corruptedNode = await db.getNode(301)
      expect(corruptedNode).not.toBeNull()
      expect(corruptedNode?.labels).toEqual([])
      expect(corruptedNode?.properties).toEqual({ ok: true })
    })

    it('should isolate errors per operation', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedRelationship(
        400,
        'ERROR_REL',
        1,
        2,
        '{broken}'
      )

      // Error is isolated - operation succeeds with fallback
      const rel = await db.getRelationship(400)
      expect(rel).not.toBeNull()
      expect(rel?.type).toBe('ERROR_REL')
      expect(rel?.properties).toEqual({})
    })

    it('should not crash request on JSON errors', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Even with corrupted data, request should succeed
      sqlStorage.insertCorruptedNode(
        500,
        'NOT_JSON',
        '{"test": 1}'
      )

      // The getNode method should not throw
      const node = await db.getNode(500)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual([])
    })
  })

  describe('Edge cases for JSON parsing', () => {
    it('should handle BOM character in labels gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // UTF-8 BOM prefix
      sqlStorage.insertCorruptedNode(
        600,
        '\uFEFF["Person"]',
        '{}'
      )

      // BOM causes JSON.parse to fail - should fallback to empty array
      const node = await db.getNode(600)
      expect(node).not.toBeNull()
      expect(node?.labels).toEqual([])
    })

    it('should handle nested corrupted JSON gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      sqlStorage.insertCorruptedNode(
        601,
        '["Person"]',
        '{"nested": {"broken": value}}'  // Unquoted value
      )

      const node = await db.getNode(601)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })

    it('should handle very deep nesting with truncation gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // Create deeply nested but truncated JSON
      const deepNested = '{"a":'.repeat(100) + '"value"' + '}'.repeat(50)  // Missing closing braces

      sqlStorage.insertCorruptedNode(
        602,
        '["Person"]',
        deepNested
      )

      const node = await db.getNode(602)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })

    it('should handle NaN in properties gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // NaN is not valid JSON
      sqlStorage.insertCorruptedNode(
        603,
        '["Person"]',
        '{"value": NaN}'
      )

      const node = await db.getNode(603)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })

    it('should handle undefined in properties gracefully', async () => {
      const db = new Neo4jDatabase(state, env)
      await db.initialize()

      // undefined is not valid JSON
      sqlStorage.insertCorruptedNode(
        604,
        '["Person"]',
        '{"value": undefined}'
      )

      const node = await db.getNode(604)
      expect(node).not.toBeNull()
      expect(node?.properties).toEqual({})
    })
  })
})
