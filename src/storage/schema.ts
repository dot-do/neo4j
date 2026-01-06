/**
 * SQLite Schema for Neo4j-compatible Graph Database
 *
 * This schema stores graph data (nodes and relationships) in SQLite,
 * compatible with Cloudflare D1 and Durable Objects.
 *
 * Schema Overview:
 * - nodes: Stores graph nodes with labels (JSON array) and properties (JSON object)
 * - relationships: Stores edges between nodes with type and properties
 * - schema_version: Tracks applied migrations for schema versioning
 *
 * Index Strategy:
 * - idx_nodes_labels: Speeds up label-based node lookups (common in Cypher MATCH)
 * - idx_relationships_start: Speeds up outgoing relationship traversal
 * - idx_relationships_end: Speeds up incoming relationship traversal
 * - idx_relationships_type: Speeds up relationship type filtering
 * - idx_relationships_start_type: Composite index for typed outgoing traversal
 * - idx_relationships_end_type: Composite index for typed incoming traversal
 */

/**
 * SQL statements for creating the graph database schema
 */
export const SCHEMA_SQL = {
  /**
   * Create the nodes table
   * - id: Auto-incrementing primary key
   * - labels: JSON array of labels (e.g., ["Person", "Employee"])
   * - properties: JSON object for node properties
   * - created_at: Timestamp when node was created
   * - updated_at: Timestamp when node was last updated
   */
  createNodesTable: `
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      labels TEXT NOT NULL DEFAULT '[]',
      properties TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `,

  /**
   * Create the relationships table
   * - id: Auto-incrementing primary key
   * - type: Relationship type (e.g., "KNOWS", "WORKS_AT")
   * - start_node_id: Foreign key to source node
   * - end_node_id: Foreign key to target node
   * - properties: JSON object for relationship properties
   * - created_at: Timestamp when relationship was created
   */
  createRelationshipsTable: `
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      start_node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      end_node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      properties TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `,

  /**
   * Create index on node labels for label-based lookups
   * Used by: findNodesByLabel, MATCH (n:Label) queries
   */
  createLabelsIndex: `
    CREATE INDEX IF NOT EXISTS idx_nodes_labels ON nodes(labels);
  `,

  /**
   * Create index on relationship start_node_id for efficient traversal
   * Used by: getOutgoingRelationships, MATCH (n)-[r]->() queries
   */
  createStartNodeIndex: `
    CREATE INDEX IF NOT EXISTS idx_relationships_start ON relationships(start_node_id);
  `,

  /**
   * Create index on relationship end_node_id for efficient traversal
   * Used by: getIncomingRelationships, MATCH ()-[r]->(n) queries
   */
  createEndNodeIndex: `
    CREATE INDEX IF NOT EXISTS idx_relationships_end ON relationships(end_node_id);
  `,

  /**
   * Create index on relationship type for type-based queries
   * Used by: findRelationshipsByType, MATCH ()-[r:TYPE]->() queries
   */
  createTypeIndex: `
    CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
  `,

  /**
   * Create composite index for typed outgoing traversal
   * Optimizes: MATCH (n)-[r:TYPE]->() - common graph traversal pattern
   */
  createStartTypeIndex: `
    CREATE INDEX IF NOT EXISTS idx_relationships_start_type ON relationships(start_node_id, type);
  `,

  /**
   * Create composite index for typed incoming traversal
   * Optimizes: MATCH ()-[r:TYPE]->(n) - common graph traversal pattern
   */
  createEndTypeIndex: `
    CREATE INDEX IF NOT EXISTS idx_relationships_end_type ON relationships(end_node_id, type);
  `,

  /**
   * Create schema_version table for migration tracking
   * - version: Migration version number (primary key)
   * - description: Human-readable description of the migration
   * - applied_at: Timestamp when migration was applied
   */
  createSchemaVersionTable: `
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `,
} as const

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * Returns all SQL statements needed to initialize the database schema
 * in the correct order.
 *
 * Order is important:
 * 1. Create tables first (nodes before relationships due to FK constraints)
 * 2. Create indexes after tables exist
 * 3. Create schema_version table last (for migration tracking)
 */
export function getSchemaInitStatements(): string[] {
  return [
    // Tables (order matters for foreign key references)
    SCHEMA_SQL.createNodesTable,
    SCHEMA_SQL.createRelationshipsTable,

    // Node indexes
    SCHEMA_SQL.createLabelsIndex,

    // Relationship indexes (single column)
    SCHEMA_SQL.createStartNodeIndex,
    SCHEMA_SQL.createEndNodeIndex,
    SCHEMA_SQL.createTypeIndex,

    // Relationship indexes (composite for common traversal patterns)
    SCHEMA_SQL.createStartTypeIndex,
    SCHEMA_SQL.createEndTypeIndex,

    // Migration tracking
    SCHEMA_SQL.createSchemaVersionTable,
  ]
}

/**
 * SQL queries for node operations
 */
export const NODE_QUERIES = {
  insert: `
    INSERT INTO nodes (labels, properties)
    VALUES (?, ?)
  `,

  selectById: `
    SELECT id, labels, properties, created_at, updated_at
    FROM nodes
    WHERE id = ?
  `,

  update: `
    UPDATE nodes
    SET properties = ?, updated_at = datetime('now')
    WHERE id = ?
  `,

  updateLabels: `
    UPDATE nodes
    SET labels = ?, updated_at = datetime('now')
    WHERE id = ?
  `,

  delete: `
    DELETE FROM nodes WHERE id = ?
  `,

  /**
   * Select nodes by label using JSON functions
   * Note: This query searches the JSON labels array for a matching value
   */
  selectByLabel: `
    SELECT id, labels, properties, created_at, updated_at
    FROM nodes
    WHERE json_valid(labels) AND EXISTS (
      SELECT 1 FROM json_each(labels)
      WHERE json_each.value = ?
    )
  `,

  selectAll: `
    SELECT id, labels, properties, created_at, updated_at
    FROM nodes
  `,
} as const

/**
 * SQL queries for relationship operations
 */
export const RELATIONSHIP_QUERIES = {
  insert: `
    INSERT INTO relationships (type, start_node_id, end_node_id, properties)
    VALUES (?, ?, ?, ?)
  `,

  selectById: `
    SELECT id, type, start_node_id, end_node_id, properties, created_at
    FROM relationships
    WHERE id = ?
  `,

  update: `
    UPDATE relationships
    SET properties = ?
    WHERE id = ?
  `,

  delete: `
    DELETE FROM relationships WHERE id = ?
  `,

  selectByType: `
    SELECT id, type, start_node_id, end_node_id, properties, created_at
    FROM relationships
    WHERE type = ?
  `,

  selectByStartNode: `
    SELECT id, type, start_node_id, end_node_id, properties, created_at
    FROM relationships
    WHERE start_node_id = ?
  `,

  selectByEndNode: `
    SELECT id, type, start_node_id, end_node_id, properties, created_at
    FROM relationships
    WHERE end_node_id = ?
  `,

  selectAll: `
    SELECT id, type, start_node_id, end_node_id, properties, created_at
    FROM relationships
  `,
} as const
