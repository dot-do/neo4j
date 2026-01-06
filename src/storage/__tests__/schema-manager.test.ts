/**
 * Tests for SchemaManager with Migrations
 *
 * These tests verify:
 * 1. SchemaManager initialization and version tracking
 * 2. Running initial schema creation (nodes, relationships tables)
 * 3. Version checking with getCurrentVersion()
 * 4. Running single migration with runMigration(migration)
 * 5. Running all pending migrations with runMigrations()
 * 6. Rollback support with rollback(version)
 * 7. Creating proper indexes on labels and relationship types
 * 8. Schema validation after migrations
 *
 * TDD Red Phase: These tests are expected to FAIL initially
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SchemaManager } from '../schema-manager'
import type { Migration, SchemaValidationResult } from '../schema-manager'

/**
 * Mock SQL query result interface
 */
interface MockSqlQueryResult {
  toArray: () => unknown[]
  run: () => void
  bind: (...params: unknown[]) => MockSqlQueryResult
}

/**
 * Mock SQL storage interface
 */
interface MockSqlStorage {
  exec: ReturnType<typeof vi.fn>
}

/**
 * Mock Durable Object storage interface
 */
interface MockDurableObjectStorage {
  sql: MockSqlStorage
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  transactionSync: ReturnType<typeof vi.fn>
}

/**
 * Create a mock storage for testing
 */
function createMockStorage(): MockDurableObjectStorage {
  const mockSql: MockSqlStorage = {
    exec: vi.fn().mockReturnValue({
      toArray: () => [],
      run: () => {},
      bind: () => mockSql.exec.mock.results[0]?.value,
    } as MockSqlQueryResult),
  }

  return {
    sql: mockSql,
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    transactionSync: vi.fn((callback: () => unknown) => callback()),
  }
}

describe('SchemaManager', () => {
  let mockStorage: MockDurableObjectStorage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should create a SchemaManager instance', () => {
      const manager = new SchemaManager(mockStorage as any)
      expect(manager).toBeInstanceOf(SchemaManager)
    })

    it('should accept storage in constructor', () => {
      expect(() => new SchemaManager(mockStorage as any)).not.toThrow()
    })

    it('should expose the SCHEMA_VERSION_KEY constant', () => {
      expect(SchemaManager.SCHEMA_VERSION_KEY).toBe('schema_version')
    })
  })

  describe('getCurrentVersion', () => {
    it('should return 0 when no version is stored', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      const version = await manager.getCurrentVersion()

      expect(version).toBe(0)
      expect(mockStorage.get).toHaveBeenCalledWith('schema_version')
    })

    it('should return stored version number', async () => {
      mockStorage.get.mockResolvedValue(3)

      const manager = new SchemaManager(mockStorage as any)
      const version = await manager.getCurrentVersion()

      expect(version).toBe(3)
    })

    it('should return the latest version after migrations run', async () => {
      mockStorage.get.mockResolvedValue(5)

      const manager = new SchemaManager(mockStorage as any)
      const version = await manager.getCurrentVersion()

      expect(version).toBe(5)
    })
  })

  describe('getLatestVersion', () => {
    it('should return the highest migration version', () => {
      const manager = new SchemaManager(mockStorage as any)
      const latestVersion = manager.getLatestVersion()

      expect(typeof latestVersion).toBe('number')
      expect(latestVersion).toBeGreaterThan(0)
    })
  })

  describe('initializeSchema', () => {
    it('should run all migrations when starting from version 0', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      // Should have executed SQL for tables and indexes
      expect(mockStorage.sql.exec).toHaveBeenCalled()
      // Should have stored the new version
      expect(mockStorage.put).toHaveBeenCalledWith(
        'schema_version',
        expect.any(Number)
      )
    })

    it('should skip migrations when already at latest version', async () => {
      const manager = new SchemaManager(mockStorage as any)
      const latestVersion = manager.getLatestVersion()
      mockStorage.get.mockResolvedValue(latestVersion)

      await manager.initializeSchema()

      // Should not execute any SQL when up to date
      expect(mockStorage.sql.exec).not.toHaveBeenCalled()
    })

    it('should create the nodes table', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const createNodesCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('nodes')
      )

      expect(createNodesCalls.length).toBeGreaterThan(0)
      const sql = createNodesCalls[0][0]
      expect(sql).toContain('id INTEGER PRIMARY KEY')
      expect(sql).toContain('labels TEXT')
      expect(sql).toContain('properties TEXT')
      expect(sql).toContain('created_at')
      expect(sql).toContain('updated_at')
    })

    it('should create the relationships table', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const createRelsCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('relationships')
      )

      expect(createRelsCalls.length).toBeGreaterThan(0)
      const sql = createRelsCalls[0][0]
      expect(sql).toContain('id INTEGER PRIMARY KEY')
      expect(sql).toContain('type TEXT')
      expect(sql).toContain('start_node_id INTEGER')
      expect(sql).toContain('end_node_id INTEGER')
      expect(sql).toContain('properties TEXT')
      expect(sql).toContain('REFERENCES nodes')
    })

    it('should create indexes on relationships', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const createIndexCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE INDEX')
      )

      expect(createIndexCalls.length).toBeGreaterThanOrEqual(3)

      // Check for start_node_id index
      const hasStartIndex = createIndexCalls.some((call: string[]) =>
        call[0].includes('start_node_id')
      )
      expect(hasStartIndex).toBe(true)

      // Check for end_node_id index
      const hasEndIndex = createIndexCalls.some((call: string[]) =>
        call[0].includes('end_node_id')
      )
      expect(hasEndIndex).toBe(true)

      // Check for type index
      const hasTypeIndex = createIndexCalls.some((call: string[]) =>
        call[0].includes('relationships') && call[0].includes('type')
      )
      expect(hasTypeIndex).toBe(true)
    })

    it('should create index on node labels', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const createIndexCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE INDEX') && call[0].includes('labels')
      )

      expect(createIndexCalls.length).toBeGreaterThan(0)
    })

    it('should create schema_version table', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const createVersionTableCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('schema_version')
      )

      expect(createVersionTableCalls.length).toBeGreaterThan(0)
    })
  })

  describe('runMigration', () => {
    it('should run a single migration', async () => {
      const mockMigration: Migration = {
        version: 1,
        description: 'Test migration',
        up: vi.fn().mockResolvedValue(undefined),
      }

      const manager = new SchemaManager(mockStorage as any)
      await manager.runMigration(mockMigration)

      expect(mockMigration.up).toHaveBeenCalledWith(mockStorage)
    })

    it('should update version after successful migration', async () => {
      const mockMigration: Migration = {
        version: 2,
        description: 'Test migration',
        up: vi.fn().mockResolvedValue(undefined),
      }

      const manager = new SchemaManager(mockStorage as any)
      await manager.runMigration(mockMigration)

      expect(mockStorage.put).toHaveBeenCalledWith('schema_version', 2)
    })

    it('should not update version if migration fails', async () => {
      const mockMigration: Migration = {
        version: 2,
        description: 'Failing migration',
        up: vi.fn().mockRejectedValue(new Error('Migration failed')),
      }

      const manager = new SchemaManager(mockStorage as any)

      await expect(manager.runMigration(mockMigration)).rejects.toThrow(
        'Migration failed'
      )
      expect(mockStorage.put).not.toHaveBeenCalled()
    })

    it('should record migration in schema_version table', async () => {
      const mockMigration: Migration = {
        version: 3,
        description: 'Test migration',
        up: vi.fn().mockResolvedValue(undefined),
      }

      const manager = new SchemaManager(mockStorage as any)
      await manager.runMigration(mockMigration)

      const insertCalls = mockStorage.sql.exec.mock.calls.filter((call: string[]) =>
        call[0].includes('INSERT INTO schema_version')
      )
      expect(insertCalls.length).toBeGreaterThan(0)
    })
  })

  describe('runMigrations', () => {
    it('should run all pending migrations', async () => {
      mockStorage.get.mockResolvedValue(0)

      const manager = new SchemaManager(mockStorage as any)
      await manager.runMigrations()

      // Should have run migrations
      expect(mockStorage.sql.exec).toHaveBeenCalled()
      // Should have updated version
      expect(mockStorage.put).toHaveBeenCalled()
    })

    it('should run migrations in order', async () => {
      mockStorage.get.mockResolvedValue(0)

      const executionOrder: number[] = []
      const mockMigrations: Migration[] = [
        {
          version: 1,
          description: 'First',
          up: vi.fn().mockImplementation(async () => {
            executionOrder.push(1)
          }),
        },
        {
          version: 2,
          description: 'Second',
          up: vi.fn().mockImplementation(async () => {
            executionOrder.push(2)
          }),
        },
        {
          version: 3,
          description: 'Third',
          up: vi.fn().mockImplementation(async () => {
            executionOrder.push(3)
          }),
        },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.runMigrations()

      expect(executionOrder).toEqual([1, 2, 3])
    })

    it('should only run migrations newer than current version', async () => {
      mockStorage.get.mockResolvedValue(2)

      const migration1 = vi.fn()
      const migration2 = vi.fn()
      const migration3 = vi.fn()

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: migration1 },
        { version: 2, description: 'Second', up: migration2 },
        { version: 3, description: 'Third', up: migration3 },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.runMigrations()

      expect(migration1).not.toHaveBeenCalled()
      expect(migration2).not.toHaveBeenCalled()
      expect(migration3).toHaveBeenCalled()
    })

    it('should stop on first failed migration', async () => {
      mockStorage.get.mockResolvedValue(0)

      const migration1 = vi.fn().mockResolvedValue(undefined)
      const migration2 = vi.fn().mockRejectedValue(new Error('Failed'))
      const migration3 = vi.fn().mockResolvedValue(undefined)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: migration1 },
        { version: 2, description: 'Failing', up: migration2 },
        { version: 3, description: 'Third', up: migration3 },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)

      await expect(manager.runMigrations()).rejects.toThrow('Failed')
      expect(migration1).toHaveBeenCalled()
      expect(migration2).toHaveBeenCalled()
      expect(migration3).not.toHaveBeenCalled()
    })

    it('should return the number of migrations run', async () => {
      mockStorage.get.mockResolvedValue(1)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() },
        { version: 3, description: 'Third', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      const count = await manager.runMigrations()

      expect(count).toBe(2)
    })
  })

  describe('getPendingMigrations', () => {
    it('should return all migrations when at version 0', async () => {
      mockStorage.get.mockResolvedValue(0)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      const pending = await manager.getPendingMigrations()

      expect(pending).toHaveLength(2)
      expect(pending.map((m) => m.version)).toEqual([1, 2])
    })

    it('should return only pending migrations', async () => {
      mockStorage.get.mockResolvedValue(2)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() },
        { version: 3, description: 'Third', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      const pending = await manager.getPendingMigrations()

      expect(pending).toHaveLength(1)
      expect(pending[0].version).toBe(3)
    })

    it('should return empty array when up to date', async () => {
      mockStorage.get.mockResolvedValue(3)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() },
        { version: 3, description: 'Third', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      const pending = await manager.getPendingMigrations()

      expect(pending).toHaveLength(0)
    })
  })

  describe('rollback', () => {
    it('should rollback to a specific version', async () => {
      mockStorage.get.mockResolvedValue(3)

      const down2 = vi.fn().mockResolvedValue(undefined)
      const down3 = vi.fn().mockResolvedValue(undefined)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn(), down: down2 },
        { version: 3, description: 'Third', up: vi.fn(), down: down3 },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.rollback(1)

      expect(down3).toHaveBeenCalled()
      expect(down2).toHaveBeenCalled()
      expect(mockStorage.put).toHaveBeenCalledWith('schema_version', 1)
    })

    it('should rollback migrations in reverse order', async () => {
      mockStorage.get.mockResolvedValue(3)

      const executionOrder: number[] = []
      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        {
          version: 2,
          description: 'Second',
          up: vi.fn(),
          down: vi.fn().mockImplementation(async () => {
            executionOrder.push(2)
          }),
        },
        {
          version: 3,
          description: 'Third',
          up: vi.fn(),
          down: vi.fn().mockImplementation(async () => {
            executionOrder.push(3)
          }),
        },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.rollback(1)

      expect(executionOrder).toEqual([3, 2])
    })

    it('should throw if migration has no down function', async () => {
      mockStorage.get.mockResolvedValue(2)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() }, // No down function
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)

      await expect(manager.rollback(1)).rejects.toThrow(
        /no down migration/i
      )
    })

    it('should throw if target version is higher than current', async () => {
      mockStorage.get.mockResolvedValue(2)

      const manager = new SchemaManager(mockStorage as any)

      await expect(manager.rollback(5)).rejects.toThrow(
        /cannot rollback.*higher/i
      )
    })

    it('should not rollback if already at target version', async () => {
      mockStorage.get.mockResolvedValue(2)

      const down = vi.fn()
      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn(), down },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.rollback(2)

      expect(down).not.toHaveBeenCalled()
    })

    it('should update schema_version table on rollback', async () => {
      mockStorage.get.mockResolvedValue(2)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn(), down: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.rollback(1)

      const deleteCalls = mockStorage.sql.exec.mock.calls.filter((call: string[]) =>
        call[0].includes('DELETE FROM schema_version')
      )
      expect(deleteCalls.length).toBeGreaterThan(0)
    })
  })

  describe('validateSchema', () => {
    it('should return valid when all tables exist', async () => {
      mockStorage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes("type='table'")) {
          return {
            toArray: () => [
              { name: 'nodes' },
              { name: 'relationships' },
              { name: 'schema_version' },
            ],
          }
        }
        if (sql.includes("type='index'")) {
          return {
            toArray: () => [
              { name: 'idx_nodes_labels' },
              { name: 'idx_relationships_start' },
              { name: 'idx_relationships_end' },
              { name: 'idx_relationships_type' },
              { name: 'idx_relationships_start_type' },
              { name: 'idx_relationships_end_type' },
            ],
          }
        }
        return { toArray: () => [] }
      })

      const manager = new SchemaManager(mockStorage as any)
      const result = await manager.validateSchema()

      expect(result.valid).toBe(true)
      expect(result.missingTables).toHaveLength(0)
      expect(result.missingIndexes).toHaveLength(0)
    })

    it('should return invalid when tables are missing', async () => {
      mockStorage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes("type='table'")) {
          return {
            toArray: () => [{ name: 'nodes' }], // Missing relationships
          }
        }
        return { toArray: () => [] }
      })

      const manager = new SchemaManager(mockStorage as any)
      const result = await manager.validateSchema()

      expect(result.valid).toBe(false)
      expect(result.missingTables).toContain('relationships')
    })

    it('should return invalid when indexes are missing', async () => {
      mockStorage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes("type='table'")) {
          return {
            toArray: () => [
              { name: 'nodes' },
              { name: 'relationships' },
              { name: 'schema_version' },
            ],
          }
        }
        if (sql.includes("type='index'")) {
          return {
            toArray: () => [{ name: 'idx_relationships_start' }], // Missing other indexes
          }
        }
        return { toArray: () => [] }
      })

      const manager = new SchemaManager(mockStorage as any)
      const result = await manager.validateSchema()

      expect(result.valid).toBe(false)
      expect(result.missingIndexes.length).toBeGreaterThan(0)
    })

    it('should include errors when validation fails', async () => {
      mockStorage.sql.exec.mockImplementation(() => {
        throw new Error('Database error')
      })

      const manager = new SchemaManager(mockStorage as any)
      const result = await manager.validateSchema()

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Database error')
    })
  })

  describe('needsMigration', () => {
    it('should return true when current version is less than latest', async () => {
      mockStorage.get.mockResolvedValue(1)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      const needs = await manager.needsMigration()

      expect(needs).toBe(true)
    })

    it('should return false when at latest version', async () => {
      mockStorage.get.mockResolvedValue(2)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 2, description: 'Second', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      const needs = await manager.needsMigration()

      expect(needs).toBe(false)
    })
  })

  describe('getMigrationHistory', () => {
    it('should return list of applied migrations', async () => {
      mockStorage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('schema_version')) {
          return {
            toArray: () => [
              { version: 1, applied_at: '2024-01-01T00:00:00Z' },
              { version: 2, applied_at: '2024-01-02T00:00:00Z' },
            ],
          }
        }
        return { toArray: () => [] }
      })

      const manager = new SchemaManager(mockStorage as any)
      const history = await manager.getMigrationHistory()

      expect(history).toHaveLength(2)
      expect(history[0].version).toBe(1)
      expect(history[1].version).toBe(2)
    })

    it('should return empty array when no migrations applied', async () => {
      mockStorage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('schema_version')) {
          return { toArray: () => [] }
        }
        return { toArray: () => [] }
      })

      const manager = new SchemaManager(mockStorage as any)
      const history = await manager.getMigrationHistory()

      expect(history).toHaveLength(0)
    })
  })

  describe('migration validation', () => {
    it('should validate migrations have sequential versions', () => {
      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 3, description: 'Third', up: vi.fn() }, // Missing version 2
      ]

      expect(() => new SchemaManager(mockStorage as any, mockMigrations)).toThrow(
        /missing migration version/i
      )
    })

    it('should validate migrations have no duplicate versions', () => {
      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
        { version: 1, description: 'Duplicate', up: vi.fn() },
      ]

      expect(() => new SchemaManager(mockStorage as any, mockMigrations)).toThrow(
        /duplicate migration version/i
      )
    })

    it('should validate migrations start at version 1', () => {
      const mockMigrations: Migration[] = [
        { version: 0, description: 'Zero', up: vi.fn() },
      ]

      expect(() => new SchemaManager(mockStorage as any, mockMigrations)).toThrow(
        /must start at version 1/i
      )
    })
  })

  describe('transactional migrations', () => {
    it('should run migrations within a transaction', async () => {
      mockStorage.get.mockResolvedValue(0)

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)
      await manager.runMigrations()

      expect(mockStorage.transactionSync).toHaveBeenCalled()
    })

    it('should rollback transaction on migration failure', async () => {
      mockStorage.get.mockResolvedValue(0)
      mockStorage.transactionSync.mockImplementation(() => {
        throw new Error('Transaction failed')
      })

      const mockMigrations: Migration[] = [
        { version: 1, description: 'First', up: vi.fn() },
      ]

      const manager = new SchemaManager(mockStorage as any, mockMigrations)

      await expect(manager.runMigrations()).rejects.toThrow('Transaction failed')
    })
  })

  describe('index creation on labels', () => {
    it('should create an index for fast label lookups', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const labelIndexCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE INDEX') &&
        call[0].includes('nodes') &&
        call[0].includes('labels')
      )

      expect(labelIndexCalls.length).toBeGreaterThan(0)
    })
  })

  describe('index creation on relationship types', () => {
    it('should create an index for fast relationship type lookups', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      const manager = new SchemaManager(mockStorage as any)
      await manager.initializeSchema()

      const execCalls = mockStorage.sql.exec.mock.calls
      const typeIndexCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE INDEX') &&
        call[0].includes('relationships') &&
        call[0].includes('type')
      )

      expect(typeIndexCalls.length).toBeGreaterThan(0)
    })
  })

  describe('default migrations', () => {
    it('should include default migrations for graph schema', () => {
      const manager = new SchemaManager(mockStorage as any)
      const migrations = manager.getMigrations()

      expect(migrations.length).toBeGreaterThan(0)
      expect(migrations[0].version).toBe(1)
      expect(migrations[0].description).toBeDefined()
    })

    it('should have initial migration that creates nodes table', async () => {
      mockStorage.get.mockResolvedValue(0)

      const manager = new SchemaManager(mockStorage as any)
      const migrations = manager.getMigrations()
      const initialMigration = migrations.find((m) => m.version === 1)

      expect(initialMigration).toBeDefined()

      // Run just the initial migration
      await initialMigration!.up(mockStorage as any)

      const execCalls = mockStorage.sql.exec.mock.calls
      const nodesTableCall = execCalls.find((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('nodes')
      )

      expect(nodesTableCall).toBeDefined()
    })

    it('should have initial migration that creates relationships table', async () => {
      mockStorage.get.mockResolvedValue(0)

      const manager = new SchemaManager(mockStorage as any)
      const migrations = manager.getMigrations()
      const initialMigration = migrations.find((m) => m.version === 1)

      expect(initialMigration).toBeDefined()

      await initialMigration!.up(mockStorage as any)

      const execCalls = mockStorage.sql.exec.mock.calls
      const relsTableCall = execCalls.find((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('relationships')
      )

      expect(relsTableCall).toBeDefined()
    })

    it('should have initial migration with down function for rollback', () => {
      const manager = new SchemaManager(mockStorage as any)
      const migrations = manager.getMigrations()
      const initialMigration = migrations.find((m) => m.version === 1)

      expect(initialMigration).toBeDefined()
      expect(initialMigration!.down).toBeDefined()
    })
  })
})

describe('Migration type exports', () => {
  it('should export Migration type', () => {
    // Type check - if this compiles, the type is exported correctly
    const migration: Migration = {
      version: 1,
      description: 'Test',
      up: async () => {},
    }
    expect(migration.version).toBe(1)
  })

  it('should export SchemaValidationResult type', () => {
    // Type check - if this compiles, the type is exported correctly
    const result: SchemaValidationResult = {
      valid: true,
      missingTables: [],
      missingIndexes: [],
      errors: [],
    }
    expect(result.valid).toBe(true)
  })
})
