/**
 * Type definitions for the Graph Storage layer
 */

/**
 * Represents a node in the graph database
 */
export interface Node {
  /** Unique identifier for the node */
  id: number
  /** Array of labels assigned to the node */
  labels: string[]
  /** Key-value properties of the node */
  properties: Record<string, unknown>
  /** Timestamp when the node was created */
  createdAt: string
  /** Timestamp when the node was last updated */
  updatedAt: string
}

/**
 * Represents a relationship between two nodes
 */
export interface Relationship {
  /** Unique identifier for the relationship */
  id: number
  /** Type of the relationship (e.g., "KNOWS", "WORKS_AT") */
  type: string
  /** ID of the source node */
  startNodeId: number
  /** ID of the target node */
  endNodeId: number
  /** Key-value properties of the relationship */
  properties: Record<string, unknown>
  /** Timestamp when the relationship was created */
  createdAt: string
}

/**
 * Raw node row from SQLite database
 */
export interface NodeRow {
  id: number
  labels: string
  properties: string
  created_at: string
  updated_at: string
}

/**
 * Raw relationship row from SQLite database
 */
export interface RelationshipRow {
  id: number
  type: string
  start_node_id: number
  end_node_id: number
  properties: string
  created_at: string
}

/**
 * Interface for storage implementations
 */
export interface IGraphStorage {
  /**
   * Initialize the storage (create tables, indexes, etc.)
   */
  initialize(): Promise<void>

  /**
   * Create a new node with the given labels and properties
   * @param labels - Array of labels for the node
   * @param properties - Key-value properties for the node
   * @returns The ID of the created node
   */
  createNode(labels: string[], properties: Record<string, unknown>): Promise<number>

  /**
   * Get a node by its ID
   * @param id - The node ID
   * @returns The node if found, null otherwise
   */
  getNode(id: number): Promise<Node | null>

  /**
   * Update a node's properties
   * @param id - The node ID
   * @param properties - New properties to set
   */
  updateNode(id: number, properties: Record<string, unknown>): Promise<void>

  /**
   * Delete a node by its ID
   * @param id - The node ID
   */
  deleteNode(id: number): Promise<void>

  /**
   * Create a new relationship between two nodes
   * @param type - The relationship type
   * @param startId - The source node ID
   * @param endId - The target node ID
   * @param properties - Key-value properties for the relationship
   * @returns The ID of the created relationship
   */
  createRelationship(
    type: string,
    startId: number,
    endId: number,
    properties: Record<string, unknown>
  ): Promise<number>

  /**
   * Get a relationship by its ID
   * @param id - The relationship ID
   * @returns The relationship if found, null otherwise
   */
  getRelationship(id: number): Promise<Relationship | null>

  /**
   * Delete a relationship by its ID
   * @param id - The relationship ID
   */
  deleteRelationship(id: number): Promise<void>

  /**
   * Find all nodes with a specific label
   * @param label - The label to search for
   * @returns Array of nodes with the label
   */
  findNodesByLabel(label: string): Promise<Node[]>

  /**
   * Find all relationships of a specific type
   * @param type - The relationship type to search for
   * @returns Array of relationships of the type
   */
  findRelationshipsByType(type: string): Promise<Relationship[]>
}

/**
 * SQLite database interface compatible with D1 and better-sqlite3
 * This provides a minimal interface that works with both sync and async APIs
 */
export interface SQLiteDatabase {
  /**
   * Execute a SQL statement that returns rows
   */
  prepare(sql: string): SQLiteStatement

  /**
   * Execute raw SQL (for schema creation)
   */
  exec(sql: string): void | Promise<void>
}

/**
 * SQLite prepared statement interface
 */
export interface SQLiteStatement {
  /**
   * Bind parameters and execute, returning all rows
   */
  all(...params: unknown[]): SQLiteResult | Promise<SQLiteResult>

  /**
   * Bind parameters and execute, returning first row
   */
  get(...params: unknown[]): unknown | Promise<unknown>

  /**
   * Bind parameters and execute, returning run result
   */
  run(...params: unknown[]): SQLiteRunResult | Promise<SQLiteRunResult>

  /**
   * Bind parameters to the statement
   */
  bind(...params: unknown[]): SQLiteStatement
}

/**
 * Result from a SELECT query
 */
export interface SQLiteResult {
  results?: unknown[]
  rows?: unknown[]
}

/**
 * Result from INSERT/UPDATE/DELETE
 */
export interface SQLiteRunResult {
  lastRowId?: number
  meta?: {
    last_row_id: number
    changes: number
  }
  changes?: number
}
