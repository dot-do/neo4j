/**
 * Storage utilities for Durable Object SQLite access
 *
 * Provides helper functions and type definitions for working with
 * Cloudflare Durable Object SQL storage.
 */

import type { SqlStorage, SqlCursor } from './cypher-execution-engine'

/**
 * Extended DurableObjectStorage interface with SQL support
 */
export interface DurableObjectStorageWithSql extends DurableObjectStorage {
  sql: SqlStorage
}

/**
 * Type guard to check if storage has SQL support
 */
export function hasSqlStorage(storage: DurableObjectStorage): storage is DurableObjectStorageWithSql {
  return (
    'sql' in storage &&
    storage.sql !== null &&
    storage.sql !== undefined &&
    typeof (storage.sql as SqlStorage).exec === 'function'
  )
}

/**
 * Get SqlStorage from DurableObjectStorage with runtime validation
 */
export function getSqlStorage(storage: DurableObjectStorage): SqlStorage {
  if (!hasSqlStorage(storage)) {
    throw new Error('SqlStorage not available on state.storage. Ensure the Durable Object is configured with SQL support.')
  }
  return storage.sql
}

/**
 * Result type for count queries
 */
interface CountResult {
  count: number
}

/**
 * Result type for max ID queries
 */
interface MaxIdResult {
  maxId: number | null
}

/**
 * Safely execute a count query and return the count
 */
export function safeGetCount(sql: SqlStorage, tableName: string): number {
  const result = sql.exec<CountResult>(`SELECT COUNT(*) as count FROM ${tableName}`).toArray()
  const row = result[0]
  if (!row || typeof row.count !== 'number') {
    if (row && typeof row.count === 'bigint') {
      return Number(row.count)
    }
    if (row && typeof row.count === 'string') {
      const parsed = parseInt(row.count, 10)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }
  return row.count
}

/**
 * Safely execute a max ID query and return the max ID
 */
export function safeGetMaxId(sql: SqlStorage, tableName: string): number {
  const result = sql.exec<MaxIdResult>(`SELECT MAX(id) as maxId FROM ${tableName}`).toArray()
  const row = result[0]
  if (!row || row.maxId === null || row.maxId === undefined) {
    return 0
  }
  if (typeof row.maxId === 'number') {
    return row.maxId
  }
  if (typeof row.maxId === 'bigint') {
    return Number(row.maxId)
  }
  if (typeof row.maxId === 'string') {
    const parsed = parseInt(row.maxId, 10)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Initialize the graph database schema
 */
export function initializeSchema(sql: SqlStorage): void {
  // Create tables
  sql.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      labels TEXT NOT NULL DEFAULT '[]',
      properties TEXT NOT NULL DEFAULT '{}'
    )
  `)

  sql.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      start_node_id INTEGER NOT NULL,
      end_node_id INTEGER NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (start_node_id) REFERENCES nodes(id),
      FOREIGN KEY (end_node_id) REFERENCES nodes(id)
    )
  `)

  // Create indexes
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_labels ON nodes(labels)`)
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type)`)
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_start ON relationships(start_node_id)`)
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_end ON relationships(end_node_id)`)
}
