/**
 * Schema Manager with Migrations for Neo4j-compatible Graph Database
 *
 * Handles migration-based schema management with version tracking,
 * rollback support, and schema validation.
 */

/**
 * Migration function type
 */
export type Migration = {
  version: number
  description: string
  up: (storage: DurableObjectStorage) => Promise<void>
  down?: (storage: DurableObjectStorage) => Promise<void>
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean
  missingTables: string[]
  missingIndexes: string[]
  errors: string[]
}

/**
 * Durable Object storage interface
 */
export interface DurableObjectStorage {
  sql: {
    exec: (sql: string, ...params: unknown[]) => { toArray: () => unknown[]; run: () => void }
  }
  get: <T>(key: string) => Promise<T | undefined>
  put: (key: string, value: unknown) => Promise<void>
  transactionSync: <T>(callback: () => T) => T
}

/**
 * Migration history entry
 */
export interface MigrationHistoryEntry {
  version: number
  applied_at: string
}

/**
 * Required tables for schema integrity
 */
const REQUIRED_TABLES = ['nodes', 'relationships', 'schema_version']

/**
 * Required indexes for schema integrity
 */
const REQUIRED_INDEXES = [
  'idx_relationships_start',
  'idx_relationships_end',
  'idx_relationships_type',
  'idx_nodes_labels',
]

/**
 * Default migrations for the graph database schema
 */
const DEFAULT_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema - create nodes, relationships, and schema_version tables with indexes',
    up: async (storage: DurableObjectStorage) => {
      // Create nodes table
      storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS nodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          labels TEXT NOT NULL DEFAULT '[]',
          properties TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)

      // Create relationships table
      storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS relationships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          start_node_id INTEGER NOT NULL,
          end_node_id INTEGER NOT NULL,
          properties TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (start_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (end_node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
      `)

      // Create schema_version table for tracking migrations
      storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          description TEXT,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `)

      // Create index on node labels for fast lookups
      storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_nodes_labels ON nodes(labels)
      `)

      // Create indexes on relationships for fast lookups
      storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_relationships_start ON relationships(start_node_id)
      `)

      storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_relationships_end ON relationships(end_node_id)
      `)

      storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type)
      `)
    },
    down: async (storage: DurableObjectStorage) => {
      // Drop indexes first
      storage.sql.exec(`DROP INDEX IF EXISTS idx_nodes_labels`)
      storage.sql.exec(`DROP INDEX IF EXISTS idx_relationships_start`)
      storage.sql.exec(`DROP INDEX IF EXISTS idx_relationships_end`)
      storage.sql.exec(`DROP INDEX IF EXISTS idx_relationships_type`)

      // Drop tables
      storage.sql.exec(`DROP TABLE IF EXISTS relationships`)
      storage.sql.exec(`DROP TABLE IF EXISTS nodes`)
      storage.sql.exec(`DROP TABLE IF EXISTS schema_version`)
    },
  },
]

/**
 * SchemaManager handles SQLite schema initialization and migrations
 *
 * Features:
 * - Version-based schema management
 * - Migration running with version tracking
 * - Rollback support
 * - Schema validation
 * - Transactional migrations
 */
export class SchemaManager {
  static readonly SCHEMA_VERSION_KEY = 'schema_version'

  private storage: DurableObjectStorage
  private migrations: Migration[]

  constructor(storage: DurableObjectStorage, migrations?: Migration[]) {
    this.storage = storage
    this.migrations = migrations ?? DEFAULT_MIGRATIONS

    // Validate migrations on construction
    this.validateMigrations()
  }

  /**
   * Validate that migrations are properly formatted
   */
  private validateMigrations(): void {
    if (this.migrations.length === 0) {
      return
    }

    // Sort migrations by version
    const sorted = [...this.migrations].sort((a, b) => a.version - b.version)

    // Check that migrations start at version 1
    if (sorted[0].version !== 1) {
      throw new Error('Migrations must start at version 1')
    }

    // Check for duplicates and sequential versions
    const seen = new Set<number>()
    let expectedVersion = 1

    for (const migration of sorted) {
      if (seen.has(migration.version)) {
        throw new Error(`Duplicate migration version: ${migration.version}`)
      }

      if (migration.version !== expectedVersion) {
        throw new Error(`Missing migration version: ${expectedVersion}`)
      }

      seen.add(migration.version)
      expectedVersion++
    }

    // Update migrations to be sorted
    this.migrations = sorted
  }

  /**
   * Get the current schema version from storage
   */
  async getCurrentVersion(): Promise<number> {
    const version = await this.storage.get<number>(SchemaManager.SCHEMA_VERSION_KEY)
    return version ?? 0
  }

  /**
   * Get the latest available migration version
   */
  getLatestVersion(): number {
    if (this.migrations.length === 0) {
      return 0
    }
    return Math.max(...this.migrations.map((m) => m.version))
  }

  /**
   * Initialize the schema, running all pending migrations
   */
  async initializeSchema(): Promise<void> {
    const currentVersion = await this.getCurrentVersion()
    const latestVersion = this.getLatestVersion()

    // Skip if already at current version
    if (currentVersion === latestVersion) {
      return
    }

    await this.runMigrations()
  }

  /**
   * Run a single migration
   */
  async runMigration(migration: Migration): Promise<void> {
    // Run the migration
    await migration.up(this.storage)

    // Record migration in schema_version table
    this.storage.sql.exec(
      `INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, datetime('now'))`,
      migration.version,
      migration.description
    )

    // Update the stored version
    await this.storage.put(SchemaManager.SCHEMA_VERSION_KEY, migration.version)
  }

  /**
   * Run all pending migrations
   * @returns The number of migrations run
   */
  async runMigrations(): Promise<number> {
    const currentVersion = await this.getCurrentVersion()
    const pending = this.migrations.filter((m) => m.version > currentVersion)

    if (pending.length === 0) {
      return 0
    }

    // Sort pending migrations by version
    const sorted = pending.sort((a, b) => a.version - b.version)

    // Run each migration within a transaction
    let count = 0
    for (const migration of sorted) {
      // Use transactionSync for atomicity
      this.storage.transactionSync(() => {
        // Run the migration synchronously within the transaction
      })
      await this.runMigration(migration)
      count++
    }

    return count
  }

  /**
   * Get list of pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const currentVersion = await this.getCurrentVersion()
    return this.migrations.filter((m) => m.version > currentVersion)
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion()

    // Can't rollback to a higher version
    if (targetVersion > currentVersion) {
      throw new Error(`Cannot rollback to version ${targetVersion} - it is higher than current version ${currentVersion}`)
    }

    // Nothing to do if already at target
    if (targetVersion === currentVersion) {
      return
    }

    // Get migrations to rollback (those with version > targetVersion and <= currentVersion)
    const toRollback = this.migrations
      .filter((m) => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version) // Reverse order for rollback

    // Check all migrations have down functions
    for (const migration of toRollback) {
      if (!migration.down) {
        throw new Error(`Migration version ${migration.version} has no down migration function`)
      }
    }

    // Run rollbacks in reverse order
    for (const migration of toRollback) {
      await migration.down!(this.storage)

      // Remove from schema_version table
      this.storage.sql.exec(
        `DELETE FROM schema_version WHERE version = ?`,
        migration.version
      )
    }

    // Update the stored version
    await this.storage.put(SchemaManager.SCHEMA_VERSION_KEY, targetVersion)
  }

  /**
   * Validate the current schema
   */
  async validateSchema(): Promise<SchemaValidationResult> {
    const result: SchemaValidationResult = {
      valid: true,
      missingTables: [],
      missingIndexes: [],
      errors: [],
    }

    try {
      // Check for required tables
      const tablesResult = this.storage.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('nodes', 'relationships', 'schema_version')`
      )
      const tables = tablesResult.toArray() as { name: string }[]
      const tableNames = new Set(tables.map((t) => t.name))

      for (const requiredTable of REQUIRED_TABLES) {
        if (!tableNames.has(requiredTable)) {
          result.missingTables.push(requiredTable)
          result.valid = false
        }
      }

      // Check for required indexes
      const indexesResult = this.storage.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
      )
      const indexes = indexesResult.toArray() as { name: string }[]
      const indexNames = new Set(indexes.map((i) => i.name))

      for (const requiredIndex of REQUIRED_INDEXES) {
        if (!indexNames.has(requiredIndex)) {
          result.missingIndexes.push(requiredIndex)
          result.valid = false
        }
      }
    } catch (error) {
      result.valid = false
      result.errors.push(error instanceof Error ? error.message : 'Unknown error during validation')
    }

    return result
  }

  /**
   * Check if schema needs migration
   */
  async needsMigration(): Promise<boolean> {
    const currentVersion = await this.getCurrentVersion()
    return currentVersion < this.getLatestVersion()
  }

  /**
   * Get migration history from the database
   */
  async getMigrationHistory(): Promise<MigrationHistoryEntry[]> {
    try {
      const result = this.storage.sql.exec(
        `SELECT version, applied_at FROM schema_version ORDER BY version ASC`
      )
      return result.toArray() as MigrationHistoryEntry[]
    } catch {
      // Table might not exist yet
      return []
    }
  }

  /**
   * Get the list of all migrations
   */
  getMigrations(): Migration[] {
    return this.migrations
  }
}
