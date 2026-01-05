/**
 * Comprehensive Tests for SQLite Schema
 *
 * These tests verify:
 * 1. Schema initialization creates correct tables (nodes, relationships)
 * 2. Indexes are created properly
 * 3. Foreign key constraints work correctly
 * 4. Default values are set (timestamps, etc.)
 * 5. Unique constraints are enforced
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  SCHEMA_SQL,
  CURRENT_SCHEMA_VERSION,
  getSchemaInitStatements,
  NODE_QUERIES,
  RELATIONSHIP_QUERIES,
} from '../schema'

/**
 * Helper to create an in-memory SQLite database with the schema initialized
 */
function createTestDatabase(): Database.Database {
  const db = new Database(':memory:')
  // Enable foreign key constraints (disabled by default in SQLite)
  db.pragma('foreign_keys = ON')

  // Initialize schema
  const statements = getSchemaInitStatements()
  for (const sql of statements) {
    db.exec(sql)
  }

  return db
}

/**
 * Helper to get table info from SQLite
 */
function getTableInfo(db: Database.Database, tableName: string) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }>
}

/**
 * Helper to get index info from SQLite
 */
function getIndexList(db: Database.Database, tableName: string) {
  return db.prepare(`PRAGMA index_list(${tableName})`).all() as Array<{
    seq: number
    name: string
    unique: number
    origin: string
    partial: number
  }>
}

/**
 * Helper to get foreign key info from SQLite
 */
function getForeignKeyList(db: Database.Database, tableName: string) {
  return db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as Array<{
    id: number
    seq: number
    table: string
    from: string
    to: string
    on_update: string
    on_delete: string
    match: string
  }>
}

describe('Schema SQL - String Validation', () => {
  describe('SCHEMA_SQL constants', () => {
    it('should have createNodesTable statement', () => {
      expect(SCHEMA_SQL.createNodesTable).toBeDefined()
      expect(SCHEMA_SQL.createNodesTable).toContain('CREATE TABLE IF NOT EXISTS nodes')
    })

    it('should have createRelationshipsTable statement', () => {
      expect(SCHEMA_SQL.createRelationshipsTable).toBeDefined()
      expect(SCHEMA_SQL.createRelationshipsTable).toContain(
        'CREATE TABLE IF NOT EXISTS relationships'
      )
    })

    it('should have createStartNodeIndex statement', () => {
      expect(SCHEMA_SQL.createStartNodeIndex).toBeDefined()
      expect(SCHEMA_SQL.createStartNodeIndex).toContain('CREATE INDEX IF NOT EXISTS')
      expect(SCHEMA_SQL.createStartNodeIndex).toContain('idx_relationships_start')
    })

    it('should have createEndNodeIndex statement', () => {
      expect(SCHEMA_SQL.createEndNodeIndex).toBeDefined()
      expect(SCHEMA_SQL.createEndNodeIndex).toContain('CREATE INDEX IF NOT EXISTS')
      expect(SCHEMA_SQL.createEndNodeIndex).toContain('idx_relationships_end')
    })

    it('should have createTypeIndex statement', () => {
      expect(SCHEMA_SQL.createTypeIndex).toBeDefined()
      expect(SCHEMA_SQL.createTypeIndex).toContain('CREATE INDEX IF NOT EXISTS')
      expect(SCHEMA_SQL.createTypeIndex).toContain('idx_relationships_type')
    })

    it('should have createSchemaVersionTable statement', () => {
      expect(SCHEMA_SQL.createSchemaVersionTable).toBeDefined()
      expect(SCHEMA_SQL.createSchemaVersionTable).toContain(
        'CREATE TABLE IF NOT EXISTS schema_version'
      )
    })
  })

  describe('CURRENT_SCHEMA_VERSION', () => {
    it('should be defined', () => {
      expect(CURRENT_SCHEMA_VERSION).toBeDefined()
    })

    it('should be a positive integer', () => {
      expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true)
      expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0)
    })
  })

  describe('getSchemaInitStatements', () => {
    it('should return an array of SQL statements', () => {
      const statements = getSchemaInitStatements()
      expect(Array.isArray(statements)).toBe(true)
      expect(statements.length).toBeGreaterThan(0)
    })

    it('should include all required schema statements', () => {
      const statements = getSchemaInitStatements()

      expect(statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS nodes'))).toBe(true)
      expect(statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS relationships'))).toBe(
        true
      )
      expect(statements.some((s) => s.includes('idx_relationships_start'))).toBe(true)
      expect(statements.some((s) => s.includes('idx_relationships_end'))).toBe(true)
      expect(statements.some((s) => s.includes('idx_relationships_type'))).toBe(true)
      expect(statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS schema_version'))).toBe(
        true
      )
    })

    it('should return statements in correct order (tables before indexes)', () => {
      const statements = getSchemaInitStatements()

      const nodesTableIndex = statements.findIndex((s) =>
        s.includes('CREATE TABLE IF NOT EXISTS nodes')
      )
      const relsTableIndex = statements.findIndex((s) =>
        s.includes('CREATE TABLE IF NOT EXISTS relationships')
      )
      const startIndexIndex = statements.findIndex((s) => s.includes('idx_relationships_start'))

      expect(nodesTableIndex).toBeLessThan(relsTableIndex)
      expect(relsTableIndex).toBeLessThan(startIndexIndex)
    })
  })
})

describe('Schema SQL - SQLite Integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  describe('Schema Initialization', () => {
    it('should create nodes table successfully', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'")
        .all()
      expect(tables).toHaveLength(1)
    })

    it('should create relationships table successfully', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'")
        .all()
      expect(tables).toHaveLength(1)
    })

    it('should create schema_version table successfully', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .all()
      expect(tables).toHaveLength(1)
    })

    it('should be idempotent - running schema statements twice should not error', () => {
      // Run schema statements again
      expect(() => {
        const statements = getSchemaInitStatements()
        for (const sql of statements) {
          db.exec(sql)
        }
      }).not.toThrow()
    })
  })

  describe('Nodes Table Structure', () => {
    it('should have correct columns', () => {
      const columns = getTableInfo(db, 'nodes')
      const columnNames = columns.map((c) => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('labels')
      expect(columnNames).toContain('properties')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('should have id as INTEGER PRIMARY KEY AUTOINCREMENT', () => {
      const columns = getTableInfo(db, 'nodes')
      const idColumn = columns.find((c) => c.name === 'id')

      expect(idColumn).toBeDefined()
      expect(idColumn!.type).toBe('INTEGER')
      expect(idColumn!.pk).toBe(1)
    })

    it('should have labels as TEXT NOT NULL', () => {
      const columns = getTableInfo(db, 'nodes')
      const labelsColumn = columns.find((c) => c.name === 'labels')

      expect(labelsColumn).toBeDefined()
      expect(labelsColumn!.type).toBe('TEXT')
      expect(labelsColumn!.notnull).toBe(1)
    })

    it('should have properties as TEXT NOT NULL', () => {
      const columns = getTableInfo(db, 'nodes')
      const propsColumn = columns.find((c) => c.name === 'properties')

      expect(propsColumn).toBeDefined()
      expect(propsColumn!.type).toBe('TEXT')
      expect(propsColumn!.notnull).toBe(1)
    })

    it('should have created_at as TEXT', () => {
      const columns = getTableInfo(db, 'nodes')
      const createdAtColumn = columns.find((c) => c.name === 'created_at')

      expect(createdAtColumn).toBeDefined()
      expect(createdAtColumn!.type).toBe('TEXT')
    })

    it('should have updated_at as TEXT', () => {
      const columns = getTableInfo(db, 'nodes')
      const updatedAtColumn = columns.find((c) => c.name === 'updated_at')

      expect(updatedAtColumn).toBeDefined()
      expect(updatedAtColumn!.type).toBe('TEXT')
    })
  })

  describe('Relationships Table Structure', () => {
    it('should have correct columns', () => {
      const columns = getTableInfo(db, 'relationships')
      const columnNames = columns.map((c) => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('type')
      expect(columnNames).toContain('start_node_id')
      expect(columnNames).toContain('end_node_id')
      expect(columnNames).toContain('properties')
      expect(columnNames).toContain('created_at')
    })

    it('should have id as INTEGER PRIMARY KEY AUTOINCREMENT', () => {
      const columns = getTableInfo(db, 'relationships')
      const idColumn = columns.find((c) => c.name === 'id')

      expect(idColumn).toBeDefined()
      expect(idColumn!.type).toBe('INTEGER')
      expect(idColumn!.pk).toBe(1)
    })

    it('should have type as TEXT NOT NULL', () => {
      const columns = getTableInfo(db, 'relationships')
      const typeColumn = columns.find((c) => c.name === 'type')

      expect(typeColumn).toBeDefined()
      expect(typeColumn!.type).toBe('TEXT')
      expect(typeColumn!.notnull).toBe(1)
    })

    it('should have start_node_id as INTEGER NOT NULL', () => {
      const columns = getTableInfo(db, 'relationships')
      const startNodeColumn = columns.find((c) => c.name === 'start_node_id')

      expect(startNodeColumn).toBeDefined()
      expect(startNodeColumn!.type).toBe('INTEGER')
      expect(startNodeColumn!.notnull).toBe(1)
    })

    it('should have end_node_id as INTEGER NOT NULL', () => {
      const columns = getTableInfo(db, 'relationships')
      const endNodeColumn = columns.find((c) => c.name === 'end_node_id')

      expect(endNodeColumn).toBeDefined()
      expect(endNodeColumn!.type).toBe('INTEGER')
      expect(endNodeColumn!.notnull).toBe(1)
    })

    it('should have properties as TEXT NOT NULL', () => {
      const columns = getTableInfo(db, 'relationships')
      const propsColumn = columns.find((c) => c.name === 'properties')

      expect(propsColumn).toBeDefined()
      expect(propsColumn!.type).toBe('TEXT')
      expect(propsColumn!.notnull).toBe(1)
    })
  })

  describe('Schema Version Table Structure', () => {
    it('should have correct columns', () => {
      const columns = getTableInfo(db, 'schema_version')
      const columnNames = columns.map((c) => c.name)

      expect(columnNames).toContain('version')
      expect(columnNames).toContain('applied_at')
    })

    it('should have version as INTEGER PRIMARY KEY', () => {
      const columns = getTableInfo(db, 'schema_version')
      const versionColumn = columns.find((c) => c.name === 'version')

      expect(versionColumn).toBeDefined()
      expect(versionColumn!.type).toBe('INTEGER')
      expect(versionColumn!.pk).toBe(1)
    })
  })

  describe('Indexes', () => {
    it('should create idx_relationships_start index', () => {
      const indexes = getIndexList(db, 'relationships')
      const startIndex = indexes.find((i) => i.name === 'idx_relationships_start')

      expect(startIndex).toBeDefined()
      expect(startIndex!.unique).toBe(0) // Not unique
    })

    it('should create idx_relationships_end index', () => {
      const indexes = getIndexList(db, 'relationships')
      const endIndex = indexes.find((i) => i.name === 'idx_relationships_end')

      expect(endIndex).toBeDefined()
      expect(endIndex!.unique).toBe(0) // Not unique
    })

    it('should create idx_relationships_type index', () => {
      const indexes = getIndexList(db, 'relationships')
      const typeIndex = indexes.find((i) => i.name === 'idx_relationships_type')

      expect(typeIndex).toBeDefined()
      expect(typeIndex!.unique).toBe(0) // Not unique
    })

    it('should have index on correct columns', () => {
      // Verify idx_relationships_start is on start_node_id
      const startIndexInfo = db
        .prepare('PRAGMA index_info(idx_relationships_start)')
        .all() as Array<{ seqno: number; cid: number; name: string }>
      expect(startIndexInfo).toHaveLength(1)
      expect(startIndexInfo[0].name).toBe('start_node_id')

      // Verify idx_relationships_end is on end_node_id
      const endIndexInfo = db
        .prepare('PRAGMA index_info(idx_relationships_end)')
        .all() as Array<{ seqno: number; cid: number; name: string }>
      expect(endIndexInfo).toHaveLength(1)
      expect(endIndexInfo[0].name).toBe('end_node_id')

      // Verify idx_relationships_type is on type
      const typeIndexInfo = db
        .prepare('PRAGMA index_info(idx_relationships_type)')
        .all() as Array<{ seqno: number; cid: number; name: string }>
      expect(typeIndexInfo).toHaveLength(1)
      expect(typeIndexInfo[0].name).toBe('type')
    })
  })

  describe('Foreign Key Constraints', () => {
    it('should have foreign keys defined on relationships table', () => {
      const foreignKeys = getForeignKeyList(db, 'relationships')

      expect(foreignKeys).toHaveLength(2)
    })

    it('should have foreign key from start_node_id to nodes(id)', () => {
      const foreignKeys = getForeignKeyList(db, 'relationships')
      const startFk = foreignKeys.find((fk) => fk.from === 'start_node_id')

      expect(startFk).toBeDefined()
      expect(startFk!.table).toBe('nodes')
      expect(startFk!.to).toBe('id')
    })

    it('should have foreign key from end_node_id to nodes(id)', () => {
      const foreignKeys = getForeignKeyList(db, 'relationships')
      const endFk = foreignKeys.find((fk) => fk.from === 'end_node_id')

      expect(endFk).toBeDefined()
      expect(endFk!.table).toBe('nodes')
      expect(endFk!.to).toBe('id')
    })

    it('should have ON DELETE CASCADE for foreign keys', () => {
      const foreignKeys = getForeignKeyList(db, 'relationships')

      for (const fk of foreignKeys) {
        expect(fk.on_delete).toBe('CASCADE')
      }
    })

    it('should prevent inserting relationship with non-existent start_node_id', () => {
      expect(() => {
        db.prepare(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
        ).run('KNOWS', 999, 1, '{}')
      }).toThrow()
    })

    it('should prevent inserting relationship with non-existent end_node_id', () => {
      // Create a valid start node first
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      expect(() => {
        db.prepare(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
        ).run('KNOWS', 1, 999, '{}')
      }).toThrow()
    })

    it('should cascade delete relationships when node is deleted', () => {
      // Create two nodes
      const node1Result = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{"name":"Alice"}')
      const node2Result = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{"name":"Bob"}')

      const node1Id = node1Result.lastInsertRowid
      const node2Id = node2Result.lastInsertRowid

      // Create a relationship
      db.prepare(
        `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
      ).run('KNOWS', node1Id, node2Id, '{}')

      // Verify relationship exists
      let rels = db.prepare(`SELECT * FROM relationships`).all()
      expect(rels).toHaveLength(1)

      // Delete node1
      db.prepare(`DELETE FROM nodes WHERE id = ?`).run(node1Id)

      // Verify relationship was cascaded
      rels = db.prepare(`SELECT * FROM relationships`).all()
      expect(rels).toHaveLength(0)
    })

    it('should cascade delete relationships when end node is deleted', () => {
      // Create two nodes
      const node1Result = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{"name":"Alice"}')
      const node2Result = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{"name":"Bob"}')

      const node1Id = node1Result.lastInsertRowid
      const node2Id = node2Result.lastInsertRowid

      // Create a relationship
      db.prepare(
        `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
      ).run('KNOWS', node1Id, node2Id, '{}')

      // Delete node2 (end node)
      db.prepare(`DELETE FROM nodes WHERE id = ?`).run(node2Id)

      // Verify relationship was cascaded
      const rels = db.prepare(`SELECT * FROM relationships`).all()
      expect(rels).toHaveLength(0)
    })
  })

  describe('Default Values', () => {
    it('should set default empty JSON array for labels', () => {
      // Insert without specifying labels
      db.exec(`INSERT INTO nodes (properties) VALUES ('{"name":"Test"}')`)

      const node = db.prepare(`SELECT labels FROM nodes WHERE id = 1`).get() as { labels: string }
      expect(node.labels).toBe('[]')
    })

    it('should set default empty JSON object for node properties', () => {
      // Insert without specifying properties
      db.exec(`INSERT INTO nodes (labels) VALUES ('["Test"]')`)

      const node = db.prepare(`SELECT properties FROM nodes WHERE id = 1`).get() as {
        properties: string
      }
      expect(node.properties).toBe('{}')
    })

    it('should set default empty JSON object for relationship properties', () => {
      // Create nodes first
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      // Insert relationship without properties
      db.exec(`INSERT INTO relationships (type, start_node_id, end_node_id) VALUES ('KNOWS', 1, 2)`)

      const rel = db.prepare(`SELECT properties FROM relationships WHERE id = 1`).get() as {
        properties: string
      }
      expect(rel.properties).toBe('{}')
    })

    it('should set created_at timestamp for nodes', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      const node = db.prepare(`SELECT created_at FROM nodes WHERE id = 1`).get() as {
        created_at: string
      }
      expect(node.created_at).toBeDefined()
      expect(node.created_at).not.toBeNull()

      // Verify it's a valid datetime format
      const date = new Date(node.created_at)
      expect(date.getTime()).not.toBeNaN()
    })

    it('should set updated_at timestamp for nodes', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      const node = db.prepare(`SELECT updated_at FROM nodes WHERE id = 1`).get() as {
        updated_at: string
      }
      expect(node.updated_at).toBeDefined()
      expect(node.updated_at).not.toBeNull()
    })

    it('should set created_at timestamp for relationships', () => {
      // Create nodes first
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      db.prepare(
        `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
      ).run('KNOWS', 1, 2, '{}')

      const rel = db.prepare(`SELECT created_at FROM relationships WHERE id = 1`).get() as {
        created_at: string
      }
      expect(rel.created_at).toBeDefined()
      expect(rel.created_at).not.toBeNull()
    })

    it('should set applied_at timestamp for schema_version', () => {
      db.exec(`INSERT INTO schema_version (version) VALUES (1)`)

      const version = db.prepare(`SELECT applied_at FROM schema_version WHERE version = 1`).get() as {
        applied_at: string
      }
      expect(version.applied_at).toBeDefined()
      expect(version.applied_at).not.toBeNull()
    })
  })

  describe('Unique Constraints', () => {
    it('should enforce unique primary key on nodes id', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      expect(() => {
        db.exec(`INSERT INTO nodes (id, labels, properties) VALUES (1, '["Person"]', '{}')`)
      }).toThrow()
    })

    it('should enforce unique primary key on relationships id', () => {
      // Create nodes first
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      db.prepare(
        `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
      ).run('KNOWS', 1, 2, '{}')

      expect(() => {
        db.exec(
          `INSERT INTO relationships (id, type, start_node_id, end_node_id, properties) VALUES (1, 'LIKES', 1, 2, '{}')`
        )
      }).toThrow()
    })

    it('should enforce unique primary key on schema_version version', () => {
      db.exec(`INSERT INTO schema_version (version) VALUES (1)`)

      expect(() => {
        db.exec(`INSERT INTO schema_version (version) VALUES (1)`)
      }).toThrow()
    })

    it('should allow duplicate relationships between same nodes with same type', () => {
      // This is allowed in Neo4j - multiple relationships of same type between same nodes
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      // Insert same relationship twice - should not throw
      expect(() => {
        db.prepare(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
        ).run('KNOWS', 1, 2, '{}')
        db.prepare(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
        ).run('KNOWS', 1, 2, '{}')
      }).not.toThrow()

      const rels = db.prepare(`SELECT * FROM relationships`).all()
      expect(rels).toHaveLength(2)
    })
  })

  describe('NOT NULL Constraints', () => {
    it('should reject null for relationship type', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      expect(() => {
        db.exec(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (NULL, 1, 2, '{}')`
        )
      }).toThrow()
    })

    it('should reject null for start_node_id', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      expect(() => {
        db.exec(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES ('KNOWS', NULL, 2, '{}')`
        )
      }).toThrow()
    })

    it('should reject null for end_node_id', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      expect(() => {
        db.exec(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES ('KNOWS', 1, NULL, '{}')`
        )
      }).toThrow()
    })
  })

  describe('AUTOINCREMENT Behavior', () => {
    it('should auto-increment node ids', () => {
      const result1 = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{}')
      const result2 = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{}')
      const result3 = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{}')

      expect(Number(result1.lastInsertRowid)).toBe(1)
      expect(Number(result2.lastInsertRowid)).toBe(2)
      expect(Number(result3.lastInsertRowid)).toBe(3)
    })

    it('should auto-increment relationship ids', () => {
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')

      const result1 = db
        .prepare(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
        )
        .run('KNOWS', 1, 2, '{}')
      const result2 = db
        .prepare(
          `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`
        )
        .run('LIKES', 1, 2, '{}')

      expect(Number(result1.lastInsertRowid)).toBe(1)
      expect(Number(result2.lastInsertRowid)).toBe(2)
    })

    it('should not reuse deleted node ids', () => {
      // Insert and delete a node
      db.prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`).run('["Person"]', '{}')
      db.prepare(`DELETE FROM nodes WHERE id = ?`).run(1)

      // Insert another node - should get id 2, not 1
      const result = db
        .prepare(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
        .run('["Person"]', '{}')
      expect(Number(result.lastInsertRowid)).toBe(2)
    })
  })
})

describe('Query Templates', () => {
  describe('NODE_QUERIES', () => {
    it('should have insert query', () => {
      expect(NODE_QUERIES.insert).toBeDefined()
      expect(NODE_QUERIES.insert).toContain('INSERT INTO nodes')
    })

    it('should have selectById query', () => {
      expect(NODE_QUERIES.selectById).toBeDefined()
      expect(NODE_QUERIES.selectById).toContain('SELECT')
      expect(NODE_QUERIES.selectById).toContain('FROM nodes')
      expect(NODE_QUERIES.selectById).toContain('WHERE id = ?')
    })

    it('should have update query', () => {
      expect(NODE_QUERIES.update).toBeDefined()
      expect(NODE_QUERIES.update).toContain('UPDATE nodes')
      expect(NODE_QUERIES.update).toContain('SET properties')
    })

    it('should have updateLabels query', () => {
      expect(NODE_QUERIES.updateLabels).toBeDefined()
      expect(NODE_QUERIES.updateLabels).toContain('UPDATE nodes')
      expect(NODE_QUERIES.updateLabels).toContain('SET labels')
    })

    it('should have delete query', () => {
      expect(NODE_QUERIES.delete).toBeDefined()
      expect(NODE_QUERIES.delete).toContain('DELETE FROM nodes')
    })

    it('should have selectAll query', () => {
      expect(NODE_QUERIES.selectAll).toBeDefined()
      expect(NODE_QUERIES.selectAll).toContain('SELECT')
      expect(NODE_QUERIES.selectAll).toContain('FROM nodes')
    })
  })

  describe('RELATIONSHIP_QUERIES', () => {
    it('should have insert query', () => {
      expect(RELATIONSHIP_QUERIES.insert).toBeDefined()
      expect(RELATIONSHIP_QUERIES.insert).toContain('INSERT INTO relationships')
    })

    it('should have selectById query', () => {
      expect(RELATIONSHIP_QUERIES.selectById).toBeDefined()
      expect(RELATIONSHIP_QUERIES.selectById).toContain('SELECT')
      expect(RELATIONSHIP_QUERIES.selectById).toContain('FROM relationships')
      expect(RELATIONSHIP_QUERIES.selectById).toContain('WHERE id = ?')
    })

    it('should have update query', () => {
      expect(RELATIONSHIP_QUERIES.update).toBeDefined()
      expect(RELATIONSHIP_QUERIES.update).toContain('UPDATE relationships')
      expect(RELATIONSHIP_QUERIES.update).toContain('SET properties')
    })

    it('should have delete query', () => {
      expect(RELATIONSHIP_QUERIES.delete).toBeDefined()
      expect(RELATIONSHIP_QUERIES.delete).toContain('DELETE FROM relationships')
    })

    it('should have selectByType query', () => {
      expect(RELATIONSHIP_QUERIES.selectByType).toBeDefined()
      expect(RELATIONSHIP_QUERIES.selectByType).toContain('WHERE type = ?')
    })

    it('should have selectByStartNode query', () => {
      expect(RELATIONSHIP_QUERIES.selectByStartNode).toBeDefined()
      expect(RELATIONSHIP_QUERIES.selectByStartNode).toContain('WHERE start_node_id = ?')
    })

    it('should have selectByEndNode query', () => {
      expect(RELATIONSHIP_QUERIES.selectByEndNode).toBeDefined()
      expect(RELATIONSHIP_QUERIES.selectByEndNode).toContain('WHERE end_node_id = ?')
    })

    it('should have selectAll query', () => {
      expect(RELATIONSHIP_QUERIES.selectAll).toBeDefined()
      expect(RELATIONSHIP_QUERIES.selectAll).toContain('SELECT')
      expect(RELATIONSHIP_QUERIES.selectAll).toContain('FROM relationships')
    })
  })

  describe('Query Execution with SQLite', () => {
    let db: Database.Database

    beforeEach(() => {
      db = createTestDatabase()
    })

    afterEach(() => {
      db.close()
    })

    it('should execute NODE_QUERIES.insert successfully', () => {
      const result = db.prepare(NODE_QUERIES.insert).run('["Person"]', '{"name":"Alice"}')
      expect(Number(result.lastInsertRowid)).toBe(1)
    })

    it('should execute NODE_QUERIES.selectById successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{"name":"Alice"}')

      const node = db.prepare(NODE_QUERIES.selectById).get(1) as {
        id: number
        labels: string
        properties: string
      }
      expect(node).toBeDefined()
      expect(node.id).toBe(1)
      expect(JSON.parse(node.labels)).toEqual(['Person'])
      expect(JSON.parse(node.properties)).toEqual({ name: 'Alice' })
    })

    it('should execute NODE_QUERIES.update successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{"name":"Alice"}')
      db.prepare(NODE_QUERIES.update).run('{"name":"Alice","age":30}', 1)

      const node = db.prepare(NODE_QUERIES.selectById).get(1) as { properties: string }
      expect(JSON.parse(node.properties)).toEqual({ name: 'Alice', age: 30 })
    })

    it('should execute NODE_QUERIES.updateLabels successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.updateLabels).run('["Person","Employee"]', 1)

      const node = db.prepare(NODE_QUERIES.selectById).get(1) as { labels: string }
      expect(JSON.parse(node.labels)).toEqual(['Person', 'Employee'])
    })

    it('should execute NODE_QUERIES.delete successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.delete).run(1)

      const node = db.prepare(NODE_QUERIES.selectById).get(1)
      expect(node).toBeUndefined()
    })

    it('should execute NODE_QUERIES.selectAll successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{"name":"Alice"}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{"name":"Bob"}')

      const nodes = db.prepare(NODE_QUERIES.selectAll).all()
      expect(nodes).toHaveLength(2)
    })

    it('should execute RELATIONSHIP_QUERIES.insert successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')

      const result = db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 1, 2, '{}')
      expect(Number(result.lastInsertRowid)).toBe(1)
    })

    it('should execute RELATIONSHIP_QUERIES.selectById successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 1, 2, '{"since":2020}')

      const rel = db.prepare(RELATIONSHIP_QUERIES.selectById).get(1) as {
        id: number
        type: string
        start_node_id: number
        end_node_id: number
        properties: string
      }
      expect(rel).toBeDefined()
      expect(rel.type).toBe('KNOWS')
      expect(rel.start_node_id).toBe(1)
      expect(rel.end_node_id).toBe(2)
      expect(JSON.parse(rel.properties)).toEqual({ since: 2020 })
    })

    it('should execute RELATIONSHIP_QUERIES.selectByType successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 1, 2, '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('LIKES', 1, 2, '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 2, 1, '{}')

      const knowsRels = db.prepare(RELATIONSHIP_QUERIES.selectByType).all('KNOWS')
      expect(knowsRels).toHaveLength(2)
    })

    it('should execute RELATIONSHIP_QUERIES.selectByStartNode successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 1, 2, '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 1, 3, '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 2, 3, '{}')

      const relsFromNode1 = db.prepare(RELATIONSHIP_QUERIES.selectByStartNode).all(1)
      expect(relsFromNode1).toHaveLength(2)
    })

    it('should execute RELATIONSHIP_QUERIES.selectByEndNode successfully', () => {
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(NODE_QUERIES.insert).run('["Person"]', '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 1, 3, '{}')
      db.prepare(RELATIONSHIP_QUERIES.insert).run('KNOWS', 2, 3, '{}')

      const relsToNode3 = db.prepare(RELATIONSHIP_QUERIES.selectByEndNode).all(3)
      expect(relsToNode3).toHaveLength(2)
    })
  })
})
