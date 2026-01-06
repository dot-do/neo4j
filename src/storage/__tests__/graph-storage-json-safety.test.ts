/**
 * Tests for JSON.parse error handling in graph-storage.ts
 *
 * TDD RED Phase: These tests expose unsafe JSON.parse calls without try-catch.
 *
 * The rowToNode() and rowToRelationship() functions at lines 24-46 in
 * graph-storage.ts use JSON.parse() directly without error handling.
 * This means corrupted or malformed JSON data in the database will
 * cause unhandled SyntaxError exceptions.
 *
 * These tests verify that:
 * 1. Malformed JSON in labels column throws SyntaxError (EXPECTED TO FAIL)
 * 2. Malformed JSON in properties column throws SyntaxError (EXPECTED TO FAIL)
 * 3. Null/undefined values cause errors (EXPECTED TO FAIL)
 * 4. Corrupted database entries cause crashes (EXPECTED TO FAIL)
 * 5. Error messages should be helpful (EXPECTED TO FAIL)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { GraphStorage } from '../graph-storage'
import { getSchemaInitStatements } from '../schema'
import type { SQLiteDatabase } from '../types'

/**
 * Create a wrapper around better-sqlite3 that implements our SQLiteDatabase interface
 */
function createTestDatabase(): { db: Database.Database; wrapper: SQLiteDatabase } {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')

  // Initialize schema
  const statements = getSchemaInitStatements()
  for (const sql of statements) {
    db.exec(sql)
  }

  // Create a wrapper that matches our SQLiteDatabase interface
  const wrapper: SQLiteDatabase = {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        all(...params: unknown[]) {
          return stmt.all(...params)
        },
        get(...params: unknown[]) {
          return stmt.get(...params)
        },
        run(...params: unknown[]) {
          return stmt.run(...params)
        },
        bind(...params: unknown[]) {
          // For better-sqlite3, bind returns a new bound statement
          // We need to return an object that has all/get/run methods
          return {
            all() {
              return stmt.all(...params)
            },
            get() {
              return stmt.get(...params)
            },
            run() {
              return stmt.run(...params)
            },
            bind() {
              return this
            },
          }
        },
      }
    },
    exec(sql: string) {
      db.exec(sql)
    },
  }

  return { db, wrapper }
}

describe('GraphStorage JSON.parse Safety - RED TDD Tests', () => {
  let db: Database.Database
  let wrapper: SQLiteDatabase
  let storage: GraphStorage

  beforeEach(() => {
    const testDb = createTestDatabase()
    db = testDb.db
    wrapper = testDb.wrapper
    storage = new GraphStorage(wrapper)
  })

  afterEach(() => {
    db.close()
  })

  describe('Malformed JSON in labels column', () => {
    it('should handle malformed JSON array in labels column gracefully', async () => {
      // Insert a node with malformed JSON in labels column directly via SQL
      // This simulates database corruption or external data manipulation
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('not valid json[', '{}')`)

      // This should NOT throw a SyntaxError - it should handle the error gracefully
      // Currently: THROWS SyntaxError: Unexpected token 'n'
      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should handle truncated JSON array in labels column', async () => {
      // Insert with truncated JSON - simulates data corruption
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"', '{}')`)

      // Should not throw unhandled SyntaxError
      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should handle empty string in labels column', async () => {
      // Insert with empty string instead of valid JSON
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('', '{}')`)

      // Empty string is invalid JSON, should be handled
      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should handle labels with wrong JSON type (object instead of array)', async () => {
      // Labels should be an array, but someone inserted an object
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('{"type": "Person"}', '{}')`)

      // This will parse but produce wrong type - should be validated
      const node = await storage.getNode(1)
      expect(Array.isArray(node?.labels)).toBe(true)
    })

    it('should handle findNodesByLabel with malformed labels', async () => {
      // Insert valid node first
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      // Insert corrupted node
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('corrupted{json', '{}')`)

      // findNodesByLabel reads all nodes - should handle corrupted ones
      await expect(storage.findNodesByLabel('Person')).resolves.not.toThrow()
    })

    it('should handle getAllNodes with some malformed labels', async () => {
      // Mix of valid and invalid nodes
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('invalid json', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Company"]', '{}')`)

      // getAllNodes maps all rows through rowToNode - should not crash
      await expect(storage.getAllNodes()).resolves.not.toThrow()
    })
  })

  describe('Malformed JSON in properties column', () => {
    it('should handle malformed JSON object in properties column gracefully', async () => {
      // Insert a node with malformed JSON in properties column
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{name: "Alice"}')`)

      // This should NOT throw a SyntaxError
      // Currently: THROWS SyntaxError (JSON requires quoted keys)
      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should handle truncated JSON object in properties column', async () => {
      // Insert with truncated JSON
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{"name": "Alice"')`)

      // Should not throw unhandled SyntaxError
      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should handle binary/garbage data in properties column', async () => {
      // Insert with garbage data
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', X'DEADBEEF')`)

      // Binary data is not valid JSON
      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should handle properties with wrong JSON type (array instead of object)', async () => {
      // Properties should be an object, but someone inserted an array
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '["not", "an", "object"]')`)

      // This will parse but produce wrong type - should be validated
      const node = await storage.getNode(1)
      expect(typeof node?.properties).toBe('object')
      expect(Array.isArray(node?.properties)).toBe(false)
    })
  })

  describe('Null and undefined values', () => {
    it('should handle null labels column', async () => {
      // Force NULL into labels column by bypassing NOT NULL constraint
      // This requires altering the table or using a raw insert
      // For this test, we'll create a custom table without constraints
      db.exec(`CREATE TABLE test_nodes (id INTEGER PRIMARY KEY, labels TEXT, properties TEXT)`)
      db.exec(`INSERT INTO test_nodes (labels, properties) VALUES (NULL, '{}')`)

      // Create a query that returns NULL
      const row = db.prepare('SELECT * FROM test_nodes WHERE id = 1').get() as {
        id: number
        labels: null
        properties: string
      }

      // JSON.parse(null) throws TypeError: Cannot read properties of null
      expect(row.labels).toBeNull()
      // If we had a function that processed this row, it should handle null
    })

    it('should handle node properties that parse to null', async () => {
      // JSON string "null" is valid and parses to null
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', 'null')`)

      // This will parse to null, but node.properties should be an object
      const node = await storage.getNode(1)
      expect(node?.properties).not.toBeNull()
      expect(typeof node?.properties).toBe('object')
    })

    it('should handle node labels that parse to null', async () => {
      // JSON string "null" is valid and parses to null
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('null', '{}')`)

      // This will parse to null, but node.labels should be an array
      const node = await storage.getNode(1)
      expect(node?.labels).not.toBeNull()
      expect(Array.isArray(node?.labels)).toBe(true)
    })
  })

  describe('Malformed JSON in relationship properties', () => {
    it('should handle malformed JSON in relationship properties column', async () => {
      // First create valid nodes
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)

      // Insert relationship with malformed properties JSON
      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, '{since: 2020}')`)

      // Should not throw unhandled SyntaxError
      await expect(storage.getRelationship(1)).resolves.not.toThrow()
    })

    it('should handle truncated relationship properties', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)

      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, '{"since"')`)

      await expect(storage.getRelationship(1)).resolves.not.toThrow()
    })

    it('should handle getAllRelationships with malformed properties', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)

      // Mix of valid and invalid relationships
      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, '{}')`)
      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('LIKES', 1, 2, 'not json at all')`)

      await expect(storage.getAllRelationships()).resolves.not.toThrow()
    })

    it('should handle findRelationshipsByType with malformed properties', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)

      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, '{}')`)
      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 2, 1, '{{invalid}}')`)

      await expect(storage.findRelationshipsByType('KNOWS')).resolves.not.toThrow()
    })

    it('should handle getOutgoingRelationships with malformed data', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)

      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, 'undefined')`)

      await expect(storage.getOutgoingRelationships(1)).resolves.not.toThrow()
    })

    it('should handle getIncomingRelationships with malformed data', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{}')`)

      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, 'NaN')`)

      await expect(storage.getIncomingRelationships(2)).resolves.not.toThrow()
    })
  })

  describe('Corrupted database entries - mixed scenarios', () => {
    it('should handle row with both labels and properties corrupted', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('broken[', '{broken}')`)

      await expect(storage.getNode(1)).resolves.not.toThrow()
    })

    it('should return null or error object for corrupted nodes instead of crashing', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('not json', 'also not json')`)

      const result = await storage.getNode(1)
      // Either returns null (node not found/invalid) or a safe default
      // Should NOT throw
      expect(result === null || result !== undefined).toBe(true)
    })

    it('should skip corrupted nodes and return valid ones in bulk operations', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{"name":"Alice"}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('corrupted', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["Person"]', '{"name":"Bob"}')`)

      // Should return at least the valid nodes, not crash
      const nodes = await storage.getAllNodes()
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle special JSON-like strings that are not valid JSON', async () => {
      // These look like JSON but are not valid
      const invalidJsonStrings = [
        "{'single': 'quotes'}",      // Single quotes
        '{key: value}',              // Unquoted strings
        '[1, 2, 3,]',                // Trailing comma
        '{"a": undefined}',          // undefined is not valid JSON
        '{"a": NaN}',                // NaN is not valid JSON
        '{"a": Infinity}',           // Infinity is not valid JSON
      ]

      for (const invalid of invalidJsonStrings) {
        db.exec(`DELETE FROM nodes`)
        db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '${invalid.replace(/'/g, "''")}')`)

        await expect(
          storage.getNode(1),
          `Should handle: ${invalid}`
        ).resolves.not.toThrow()
      }
    })
  })

  describe('Error messages should be helpful', () => {
    it('should provide node ID in error message when JSON parsing fails', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('invalid', '{}')`)

      try {
        await storage.getNode(1)
        // If we get here, the code handles errors gracefully (good!)
      } catch (error) {
        // If it throws, the error message should include the node ID
        expect((error as Error).message).toContain('node')
        expect((error as Error).message).toMatch(/1|id/i)
      }
    })

    it('should specify which column has malformed JSON', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('["valid"]', 'invalid')`)

      try {
        await storage.getNode(1)
      } catch (error) {
        // Error should indicate which field failed
        expect((error as Error).message).toMatch(/properties|column/i)
      }
    })

    it('should include the malformed value in error for debugging', async () => {
      const malformedValue = '{broken: json}'
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '${malformedValue}')`)

      try {
        await storage.getNode(1)
      } catch (error) {
        // Error should include or reference the malformed value
        const message = (error as Error).message.toLowerCase()
        expect(
          message.includes('broken') ||
          message.includes('json') ||
          message.includes('parse') ||
          message.includes('syntax')
        ).toBe(true)
      }
    })

    it('should provide relationship ID in error when properties parsing fails', async () => {
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '{}')`)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '{}')`)
      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id, properties)
               VALUES ('KNOWS', 1, 2, 'bad json')`)

      try {
        await storage.getRelationship(1)
      } catch (error) {
        expect((error as Error).message).toMatch(/relationship|1|id/i)
      }
    })
  })

  describe('Edge cases with valid but unexpected JSON', () => {
    it('should handle deeply nested JSON in properties', async () => {
      const deepNested = JSON.stringify({
        a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 'deep' } } } } } } } } },
      })
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '${deepNested}')`)

      const node = await storage.getNode(1)
      expect(node).not.toBeNull()
    })

    it('should handle very large JSON in properties', async () => {
      const largeObj: Record<string, string> = {}
      for (let i = 0; i < 1000; i++) {
        largeObj[`key_${i}`] = `value_${i}`
      }
      const largeJson = JSON.stringify(largeObj)
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '${largeJson}')`)

      const node = await storage.getNode(1)
      expect(node).not.toBeNull()
    })

    it('should handle special characters in JSON strings', async () => {
      const specialChars = JSON.stringify({
        name: "O'Brien",
        emoji: '\\u0000',
        newline: 'line1\\nline2',
        tab: 'col1\\tcol2',
        backslash: 'path\\\\to\\\\file',
      })
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '${specialChars.replace(/'/g, "''")}')`)

      const node = await storage.getNode(1)
      expect(node).not.toBeNull()
    })

    it('should handle unicode in JSON', async () => {
      const unicode = JSON.stringify({
        chinese: '\\u4e2d\\u6587',
        arabic: '\\u0627\\u0644\\u0639\\u0631\\u0628\\u064a\\u0629',
        emoji: '\\ud83d\\udc4d',
      })
      db.exec(`INSERT INTO nodes (labels, properties) VALUES ('[]', '${unicode.replace(/'/g, "''")}')`)

      const node = await storage.getNode(1)
      expect(node).not.toBeNull()
    })
  })
})
