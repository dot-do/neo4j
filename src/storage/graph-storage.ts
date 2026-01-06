/**
 * GraphStorage - SQLite-based storage for graph database
 *
 * This class provides CRUD operations for nodes and relationships
 * using SQLite as the underlying storage engine. Compatible with
 * Cloudflare D1 and Durable Objects.
 */

import { getSchemaInitStatements, NODE_QUERIES, RELATIONSHIP_QUERIES } from './schema'
import type {
  IGraphStorage,
  Node,
  NodeRow,
  Relationship,
  RelationshipRow,
  SQLiteDatabase,
  SQLiteResult,
  SQLiteRunResult,
} from './types'

/**
 * Custom error class for storage-related errors
 */
export class StorageError extends Error {
  readonly cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'StorageError'
    this.cause = options?.cause
  }
}

/**
 * Safely parse JSON with error handling
 * @param json - The JSON string to parse
 * @param context - Context information for error messages (e.g., "node[1].labels")
 * @param fallback - Optional fallback value to use on parse failure
 * @returns The parsed value or fallback
 * @throws StorageError if parsing fails and no fallback provided
 */
function safeJsonParse<T>(json: string | null | undefined, context: string, fallback?: T): T {
  // Handle null/undefined/empty string
  if (json === null || json === undefined || json === '') {
    if (fallback !== undefined) {
      return fallback
    }
    throw new StorageError(
      `Failed to parse JSON in ${context}: value is empty or null`,
      { cause: new Error('Empty or null JSON value') }
    )
  }

  try {
    const parsed = JSON.parse(json)
    // Handle JSON "null" value
    if (parsed === null) {
      if (fallback !== undefined) {
        return fallback
      }
    }
    return parsed
  } catch (error) {
    if (fallback !== undefined) {
      return fallback
    }
    throw new StorageError(
      `Failed to parse JSON in ${context}: ${(error as Error).message}`,
      { cause: error }
    )
  }
}

/**
 * Safely parse labels JSON, ensuring it returns an array
 */
function safeParseLabels(json: string | null | undefined, nodeId: number): string[] | null {
  try {
    const parsed = safeJsonParse<unknown>(json, `node[${nodeId}].labels`, null)
    if (parsed === null) {
      return []
    }
    // Ensure labels is an array
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as string[]
  } catch {
    return null // Signal parsing failure
  }
}

/**
 * Safely parse properties JSON, ensuring it returns an object
 */
function safeParseProperties(json: string | null | undefined, entityType: string, entityId: number): Record<string, unknown> | null {
  try {
    const parsed = safeJsonParse<unknown>(json, `${entityType}[${entityId}].properties`, null)
    if (parsed === null) {
      return {}
    }
    // Ensure properties is an object (not array)
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return null // Signal parsing failure
  }
}

/**
 * Convert a raw node row from SQLite to a Node object
 * Returns null if JSON parsing fails
 */
function rowToNode(row: NodeRow): Node | null {
  const labels = safeParseLabels(row.labels, row.id)
  if (labels === null) {
    return null
  }

  const properties = safeParseProperties(row.properties, 'node', row.id)
  if (properties === null) {
    return null
  }

  return {
    id: row.id,
    labels,
    properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Convert a raw relationship row from SQLite to a Relationship object
 * Returns null if JSON parsing fails
 */
function rowToRelationship(row: RelationshipRow): Relationship | null {
  const properties = safeParseProperties(row.properties, 'relationship', row.id)
  if (properties === null) {
    return null
  }

  return {
    id: row.id,
    type: row.type,
    startNodeId: row.start_node_id,
    endNodeId: row.end_node_id,
    properties,
    createdAt: row.created_at,
  }
}

/**
 * Extract results from SQLite query response
 * Handles both D1 format and better-sqlite3 format
 */
function extractResults(result: SQLiteResult | unknown[]): unknown[] {
  if (Array.isArray(result)) {
    return result
  }
  return result.results || result.rows || []
}

/**
 * Extract last row ID from SQLite run result
 * Handles both D1 format and better-sqlite3 format
 */
function extractLastRowId(result: SQLiteRunResult): number {
  if (result.meta?.last_row_id !== undefined) {
    return result.meta.last_row_id
  }
  if (result.lastRowId !== undefined) {
    return result.lastRowId
  }
  throw new Error('Could not extract last row ID from result')
}

/**
 * GraphStorage provides SQLite-based storage for graph data
 */
export class GraphStorage implements IGraphStorage {
  private db: SQLiteDatabase
  private initialized: boolean = false

  /**
   * Create a new GraphStorage instance
   * @param db - SQLite database instance (D1 or better-sqlite3 compatible)
   */
  constructor(db: SQLiteDatabase) {
    this.db = db
  }

  /**
   * Initialize the database schema
   * Creates tables and indexes if they don't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const statements = getSchemaInitStatements()
    for (const sql of statements) {
      await this.db.exec(sql)
    }

    this.initialized = true
  }

  /**
   * Create a new node with the given labels and properties
   * @param labels - Array of labels for the node
   * @param properties - Key-value properties for the node
   * @returns The ID of the created node
   */
  async createNode(labels: string[], properties: Record<string, unknown>): Promise<number> {
    const labelsJson = JSON.stringify(labels)
    const propertiesJson = JSON.stringify(properties)

    const stmt = this.db.prepare(NODE_QUERIES.insert)
    const result = (await stmt.bind(labelsJson, propertiesJson).run()) as SQLiteRunResult

    return extractLastRowId(result)
  }

  /**
   * Get a node by its ID
   * @param id - The node ID
   * @returns The node if found, null otherwise
   */
  async getNode(id: number): Promise<Node | null> {
    const stmt = this.db.prepare(NODE_QUERIES.selectById)
    const row = (await stmt.bind(id).get()) as NodeRow | undefined

    if (!row) {
      return null
    }

    return rowToNode(row)
  }

  /**
   * Update a node's properties
   * @param id - The node ID
   * @param properties - New properties to set
   */
  async updateNode(id: number, properties: Record<string, unknown>): Promise<void> {
    const propertiesJson = JSON.stringify(properties)

    const stmt = this.db.prepare(NODE_QUERIES.update)
    await stmt.bind(propertiesJson, id).run()
  }

  /**
   * Delete a node by its ID
   * Note: This will cascade delete all relationships connected to this node
   * @param id - The node ID
   */
  async deleteNode(id: number): Promise<void> {
    const stmt = this.db.prepare(NODE_QUERIES.delete)
    await stmt.bind(id).run()
  }

  /**
   * Create a new relationship between two nodes
   * @param type - The relationship type
   * @param startId - The source node ID
   * @param endId - The target node ID
   * @param properties - Key-value properties for the relationship
   * @returns The ID of the created relationship
   */
  async createRelationship(
    type: string,
    startId: number,
    endId: number,
    properties: Record<string, unknown>
  ): Promise<number> {
    const propertiesJson = JSON.stringify(properties)

    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.insert)
    const result = (await stmt.bind(type, startId, endId, propertiesJson).run()) as SQLiteRunResult

    return extractLastRowId(result)
  }

  /**
   * Get a relationship by its ID
   * @param id - The relationship ID
   * @returns The relationship if found, null otherwise
   */
  async getRelationship(id: number): Promise<Relationship | null> {
    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.selectById)
    const row = (await stmt.bind(id).get()) as RelationshipRow | undefined

    if (!row) {
      return null
    }

    return rowToRelationship(row)
  }

  /**
   * Delete a relationship by its ID
   * @param id - The relationship ID
   */
  async deleteRelationship(id: number): Promise<void> {
    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.delete)
    await stmt.bind(id).run()
  }

  /**
   * Find all nodes with a specific label
   * Uses JSON functions to search within the labels array
   * @param label - The label to search for
   * @returns Array of nodes with the label
   */
  async findNodesByLabel(label: string): Promise<Node[]> {
    // Use a query that searches for the label within the JSON array
    // Only search nodes with valid JSON labels
    const sql = `
      SELECT id, labels, properties, created_at, updated_at
      FROM nodes
      WHERE json_valid(labels) AND EXISTS (
        SELECT 1 FROM json_each(labels)
        WHERE json_each.value = ?
      )
    `
    const stmt = this.db.prepare(sql)
    const result = await stmt.bind(label).all()
    const rows = extractResults(result) as NodeRow[]

    return rows.map(rowToNode).filter((node): node is Node => node !== null)
  }

  /**
   * Find all relationships of a specific type
   * @param type - The relationship type to search for
   * @returns Array of relationships of the type
   */
  async findRelationshipsByType(type: string): Promise<Relationship[]> {
    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.selectByType)
    const result = await stmt.bind(type).all()
    const rows = extractResults(result) as RelationshipRow[]

    return rows.map(rowToRelationship).filter((rel): rel is Relationship => rel !== null)
  }

  /**
   * Get all nodes in the database
   * @returns Array of all nodes
   */
  async getAllNodes(): Promise<Node[]> {
    const stmt = this.db.prepare(NODE_QUERIES.selectAll)
    const result = await stmt.all()
    const rows = extractResults(result) as NodeRow[]

    return rows.map(rowToNode).filter((node): node is Node => node !== null)
  }

  /**
   * Get all relationships in the database
   * @returns Array of all relationships
   */
  async getAllRelationships(): Promise<Relationship[]> {
    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.selectAll)
    const result = await stmt.all()
    const rows = extractResults(result) as RelationshipRow[]

    return rows.map(rowToRelationship).filter((rel): rel is Relationship => rel !== null)
  }

  /**
   * Get all relationships starting from a specific node
   * @param nodeId - The source node ID
   * @returns Array of outgoing relationships
   */
  async getOutgoingRelationships(nodeId: number): Promise<Relationship[]> {
    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.selectByStartNode)
    const result = await stmt.bind(nodeId).all()
    const rows = extractResults(result) as RelationshipRow[]

    return rows.map(rowToRelationship).filter((rel): rel is Relationship => rel !== null)
  }

  /**
   * Get all relationships ending at a specific node
   * @param nodeId - The target node ID
   * @returns Array of incoming relationships
   */
  async getIncomingRelationships(nodeId: number): Promise<Relationship[]> {
    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.selectByEndNode)
    const result = await stmt.bind(nodeId).all()
    const rows = extractResults(result) as RelationshipRow[]

    return rows.map(rowToRelationship).filter((rel): rel is Relationship => rel !== null)
  }

  /**
   * Update a node's labels
   * @param id - The node ID
   * @param labels - New labels to set
   */
  async updateNodeLabels(id: number, labels: string[]): Promise<void> {
    const labelsJson = JSON.stringify(labels)

    const stmt = this.db.prepare(NODE_QUERIES.updateLabels)
    await stmt.bind(labelsJson, id).run()
  }

  /**
   * Update a relationship's properties
   * @param id - The relationship ID
   * @param properties - New properties to set
   */
  async updateRelationship(id: number, properties: Record<string, unknown>): Promise<void> {
    const propertiesJson = JSON.stringify(properties)

    const stmt = this.db.prepare(RELATIONSHIP_QUERIES.update)
    await stmt.bind(propertiesJson, id).run()
  }
}
