/**
 * Neo4jDatabase Durable Object
 *
 * Provides persistent graph storage using SQLite in Cloudflare Durable Objects.
 * Implements Neo4j-compatible graph operations.
 */

import { getSchemaInitStatements } from '../storage/schema'

/**
 * Node representation
 */
export interface GraphNode {
  id: number
  labels: string[]
  properties: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

/**
 * Relationship representation
 */
export interface GraphRelationship {
  id: number
  type: string
  startNodeId: number
  endNodeId: number
  properties: Record<string, unknown>
  created_at?: string
}

/**
 * Query result
 */
export interface QueryResult {
  records: Record<string, unknown>[]
  summary: {
    counters: {
      nodesCreated: number
      nodesDeleted: number
      relationshipsCreated: number
      relationshipsDeleted: number
      propertiesSet: number
      labelsAdded: number
      labelsRemoved: number
    }
  }
}

/**
 * Environment bindings
 */
interface Env {
  NEO4J_DATABASE?: DurableObjectNamespace
}

/**
 * Neo4jDatabase Durable Object
 */
export class Neo4jDatabase {
  private state: DurableObjectState
  private env: Env
  private initialized = false

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  /**
   * Initialize the database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const sql = this.state.storage.sql

    // Execute all schema initialization statements
    for (const statement of getSchemaInitStatements()) {
      sql.exec(statement)
    }

    this.initialized = true
  }

  /**
   * Create a node with labels and properties
   */
  async createNode(labels: string[], properties: Record<string, unknown>): Promise<number> {
    await this.initialize()

    const sql = this.state.storage.sql
    const labelsJson = JSON.stringify(labels)
    const propsJson = JSON.stringify(properties)

    const cursor = sql.exec(
      `INSERT INTO nodes (labels, properties) VALUES ('${labelsJson}', '${propsJson}') RETURNING id`
    )

    const row = cursor.one() as { id: number } | undefined
    return row?.id ?? 0
  }

  /**
   * Get a node by ID
   */
  async getNode(id: number): Promise<GraphNode | null> {
    await this.initialize()

    const sql = this.state.storage.sql
    const cursor = sql.exec(`SELECT id, labels, properties, created_at, updated_at FROM nodes WHERE id = ${id}`)

    const row = cursor.one() as {
      id: number
      labels: string
      properties: string
      created_at: string
      updated_at: string
    } | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      labels: JSON.parse(row.labels),
      properties: JSON.parse(row.properties),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  /**
   * Update node properties
   */
  async updateNode(id: number, properties: Record<string, unknown>): Promise<void> {
    await this.initialize()

    const sql = this.state.storage.sql
    const propsJson = JSON.stringify(properties)

    sql.exec(`UPDATE nodes SET properties = '${propsJson}', updated_at = datetime('now') WHERE id = ${id}`)
  }

  /**
   * Delete a node
   */
  async deleteNode(id: number): Promise<void> {
    await this.initialize()

    const sql = this.state.storage.sql
    sql.exec(`DELETE FROM nodes WHERE id = ${id}`)
  }

  /**
   * Create a relationship between two nodes
   */
  async createRelationship(
    type: string,
    startNodeId: number,
    endNodeId: number,
    properties: Record<string, unknown>
  ): Promise<number> {
    await this.initialize()

    const sql = this.state.storage.sql
    const propsJson = JSON.stringify(properties)

    const cursor = sql.exec(
      `INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES ('${type}', ${startNodeId}, ${endNodeId}, '${propsJson}') RETURNING id`
    )

    const row = cursor.one() as { id: number } | undefined
    return row?.id ?? 0
  }

  /**
   * Get a relationship by ID
   */
  async getRelationship(id: number): Promise<GraphRelationship | null> {
    await this.initialize()

    const sql = this.state.storage.sql
    const cursor = sql.exec(
      `SELECT id, type, start_node_id, end_node_id, properties, created_at FROM relationships WHERE id = ${id}`
    )

    const row = cursor.one() as {
      id: number
      type: string
      start_node_id: number
      end_node_id: number
      properties: string
      created_at: string
    } | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      type: row.type,
      startNodeId: row.start_node_id,
      endNodeId: row.end_node_id,
      properties: JSON.parse(row.properties),
      created_at: row.created_at,
    }
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(id: number): Promise<void> {
    await this.initialize()

    const sql = this.state.storage.sql
    sql.exec(`DELETE FROM relationships WHERE id = ${id}`)
  }

  /**
   * Run a Cypher query
   */
  async runCypher(query: string, parameters?: Record<string, unknown>): Promise<QueryResult> {
    await this.initialize()

    // For now, return a basic result structure
    // Full Cypher parsing and execution will be implemented later
    return {
      records: [],
      summary: {
        counters: {
          nodesCreated: 0,
          nodesDeleted: 0,
          relationshipsCreated: 0,
          relationshipsDeleted: 0,
          propertiesSet: 0,
          labelsAdded: 0,
          labelsRemoved: 0,
        },
      },
    }
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Root path - API info
      if (path === '/' && request.method === 'GET') {
        return Response.json({
          name: 'neo4j.do',
          version: '0.1.0',
          endpoints: {
            cypher: '/cypher',
          },
        })
      }

      // Cypher endpoint
      if (path === '/cypher') {
        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', { status: 405 })
        }

        const body = await request.json() as { query: string; parameters?: Record<string, unknown> }
        const result = await this.runCypher(body.query, body.parameters)

        return Response.json(result)
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return Response.json({ error: message }, { status: 400 })
    }
  }
}
