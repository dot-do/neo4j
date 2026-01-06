/**
 * GraphDO Durable Object - Neo4j-compatible graph database
 *
 * A thin HTTP request handler that delegates to:
 * - TransactionManager for transaction lifecycle
 * - CypherExecutionEngine for Cypher execution
 * - StorageUtils for SQL storage access
 *
 * Architecture:
 * ```
 * GraphDO (HTTP Handler ~350 LOC)
 * ├── HTTP request parsing and response formatting
 * ├── CypherExecutionEngine (parse Cypher, generate SQL, execute)
 * ├── TransactionManager (transaction lifecycle)
 * └── StorageUtils (DO SQLite helpers)
 * ```
 */

import { ParserError } from '../cypher/parser'
import { LexerError } from '../cypher/lexer'
import { TransactionManager } from './transaction-manager'
import {
  CypherExecutionEngine,
  CypherError,
  type TransactionWorkBuffer,
  type NodeRecord,
} from './cypher-execution-engine'
import {
  getSqlStorage,
  safeGetCount,
  safeGetMaxId,
  initializeSchema,
} from './storage-utils'

/** Environment bindings */
interface Env {
  GRAPH_DO?: DurableObjectNamespace
}

/** Schema version for migrations */
const SCHEMA_VERSION = 1

/**
 * GraphDO Durable Object
 *
 * A thin HTTP request handler that provides Neo4j-compatible graph database API.
 * Delegates to TransactionManager and CypherExecutionEngine.
 */
export class GraphDO {
  private state: DurableObjectState
  private env: Env
  private initializationState: 'not_started' | 'initializing' | 'ready' | 'failed' = 'not_started'
  private initializationPromise: Promise<void> | null = null

  // Extracted components
  private transactionManager: TransactionManager = new TransactionManager()
  private transactionWorkBuffers: Map<string, TransactionWorkBuffer> = new Map()
  private executionEngine: CypherExecutionEngine | null = null

  // ID counters
  private nextNodeId: number = 1
  private nextRelationshipId: number = 1

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    this.initializationPromise = this.state.blockConcurrencyWhile(async () => {
      this.initializationState = 'initializing'
      try {
        await this.initializeDatabase()
        this.initializationState = 'ready'
      } catch (error) {
        this.initializationState = 'failed'
        throw error
      }
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise
    }
    if (this.initializationState !== 'ready') {
      throw new Error('GraphDO initialization failed')
    }
  }

  private get initialized(): boolean {
    return this.initializationState === 'ready'
  }

  /** Initialize the SQLite schema and execution engine */
  private async initializeDatabase(): Promise<void> {
    const sql = getSqlStorage(this.state.storage)

    // Initialize schema
    initializeSchema(sql)

    // Initialize ID counters
    this.nextNodeId = safeGetMaxId(sql, 'nodes') + 1
    this.nextRelationshipId = safeGetMaxId(sql, 'relationships') + 1

    // Initialize execution engine with ID generator
    this.executionEngine = new CypherExecutionEngine(sql, {
      nextNodeId: () => this.nextNodeId++,
      nextRelationshipId: () => this.nextRelationshipId++,
    })
  }

  /** Handle incoming fetch requests - main HTTP router */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    try {
      this.cleanupExpiredTransactions()

      // Health check
      if (path === '/health' && method === 'GET') {
        return this.handleHealth()
      }

      // Cypher query endpoint
      if (path === '/cypher') {
        if (method !== 'POST') {
          return this.jsonResponse({ error: 'Method not allowed' }, 405)
        }
        return this.handleCypher(request)
      }

      // Transaction endpoints
      if (path === '/transaction/begin' && method === 'POST') {
        return this.handleBeginTransaction(request)
      }
      if (path === '/transaction/commit' && method === 'POST') {
        return this.handleCommitTransaction(request)
      }
      if (path === '/transaction/rollback' && method === 'POST') {
        return this.handleRollbackTransaction(request)
      }

      // Node endpoint
      const nodeMatch = path.match(/^\/node\/(\d+)$/)
      if (nodeMatch && method === 'GET') {
        return this.handleGetNode(parseInt(nodeMatch[1], 10))
      }

      return this.jsonResponse({ error: 'Not found' }, 404)
    } catch (error) {
      return this.handleError(error)
    }
  }

  private handleHealth(): Response {
    const sql = getSqlStorage(this.state.storage)

    return this.jsonResponse({
      status: 'healthy',
      initialized: this.initialized,
      schemaVersion: SCHEMA_VERSION,
      nodeCount: safeGetCount(sql, 'nodes'),
      relationshipCount: safeGetCount(sql, 'relationships'),
    })
  }

  private async handleCypher(request: Request): Promise<Response> {
    let body: { query?: string; parameters?: Record<string, unknown> }

    try {
      body = await request.json() as typeof body
    } catch {
      return this.jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { query, parameters = {} } = body

    if (!query || typeof query !== 'string') {
      return this.jsonResponse({ error: 'Missing required field: query' }, 400)
    }

    if (query.trim() === '') {
      return this.jsonResponse({ error: 'Query cannot be empty' }, 400)
    }

    // Check for transaction
    const transactionId = request.headers.get('X-Transaction-Id')
    let workBuffer: TransactionWorkBuffer | undefined

    if (transactionId) {
      if (!this.transactionManager.isActive(transactionId)) {
        const state = this.transactionManager.getState(transactionId)
        if (state === 'expired') {
          this.transactionWorkBuffers.delete(transactionId)
          return this.jsonResponse({ error: 'Transaction has expired' }, 400)
        }
        return this.jsonResponse({ error: 'Invalid transaction ID (may have expired)' }, 400)
      }
      workBuffer = this.transactionWorkBuffers.get(transactionId)
    }

    try {
      if (!this.executionEngine) {
        throw new Error('Execution engine not initialized')
      }
      const result = this.executionEngine.execute(query, parameters, workBuffer)
      return this.jsonResponse(result)
    } catch (error) {
      if (error instanceof LexerError || error instanceof ParserError) {
        return this.jsonResponse({
          error: error.message,
          code: 'Neo.ClientError.Statement.SyntaxError',
          message: error.message,
        }, 400)
      }
      if (error instanceof CypherError) {
        return this.jsonResponse({
          error: error.message,
          code: error.code,
          message: error.message,
        }, 400)
      }
      throw error
    }
  }

  private async handleBeginTransaction(request: Request): Promise<Response> {
    let body: { timeout?: number } = {}

    try {
      const text = await request.text()
      if (text) body = JSON.parse(text)
    } catch {
      // Ignore parsing errors for empty body
    }

    const timeout = body.timeout ?? 30000
    const transactionId = this.transactionManager.begin({ timeout })

    this.transactionWorkBuffers.set(transactionId, {
      nodes: new Map(),
      relationships: new Map(),
      createdNodeIds: new Set(),
      createdRelationshipIds: new Set(),
      deletedNodeIds: new Set(),
      deletedRelationshipIds: new Set(),
    })

    return this.jsonResponse({ transactionId })
  }

  private async handleCommitTransaction(request: Request): Promise<Response> {
    let body: { transactionId?: string }

    try {
      body = await request.json() as typeof body
    } catch {
      return this.jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { transactionId } = body

    if (!transactionId) {
      return this.jsonResponse({ error: 'Missing transactionId' }, 400)
    }

    if (!this.transactionManager.isActive(transactionId)) {
      return this.jsonResponse({ error: 'Invalid transaction ID' }, 400)
    }

    const workBuffer = this.transactionWorkBuffers.get(transactionId)
    if (!workBuffer) {
      return this.jsonResponse({ error: 'Invalid transaction ID' }, 400)
    }

    const sql = getSqlStorage(this.state.storage)

    // Persist created nodes
    for (const nodeId of workBuffer.createdNodeIds) {
      const node = workBuffer.nodes.get(nodeId)
      if (node) {
        sql.exec('INSERT INTO nodes (id, labels, properties) VALUES (?, ?, ?)',
          node.id, node.labels, node.properties)
      }
    }

    // Persist created relationships
    for (const relId of workBuffer.createdRelationshipIds) {
      const rel = workBuffer.relationships.get(relId)
      if (rel) {
        sql.exec('INSERT INTO relationships (id, type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?, ?)',
          rel.id, rel.type, rel.start_node_id, rel.end_node_id, rel.properties)
      }
    }

    // Delete nodes and relationships
    for (const nodeId of workBuffer.deletedNodeIds) {
      sql.exec('DELETE FROM nodes WHERE id = ?', nodeId)
    }
    for (const relId of workBuffer.deletedRelationshipIds) {
      sql.exec('DELETE FROM relationships WHERE id = ?', relId)
    }

    try {
      await this.transactionManager.commit(transactionId)
    } catch {
      // Already committed above
    }
    this.transactionWorkBuffers.delete(transactionId)

    return this.jsonResponse({ success: true })
  }

  private async handleRollbackTransaction(request: Request): Promise<Response> {
    let body: { transactionId?: string }

    try {
      body = await request.json() as typeof body
    } catch {
      return this.jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { transactionId } = body

    if (!transactionId) {
      return this.jsonResponse({ error: 'Missing transactionId' }, 400)
    }

    if (!this.transactionManager.isActive(transactionId)) {
      return this.jsonResponse({ error: 'Invalid transaction ID' }, 400)
    }

    try {
      await this.transactionManager.rollback(transactionId)
    } catch {
      // Ignore
    }
    this.transactionWorkBuffers.delete(transactionId)

    return this.jsonResponse({ success: true })
  }

  private handleGetNode(nodeId: number): Response {
    const sql = getSqlStorage(this.state.storage)

    const result = sql.exec<NodeRecord>(
      'SELECT id, labels, properties FROM nodes WHERE id = ?',
      nodeId
    ).toArray()

    if (result.length === 0) {
      return this.jsonResponse({ error: 'Node not found' }, 404)
    }

    const node = result[0]
    return this.jsonResponse({
      id: node.id,
      labels: JSON.parse(node.labels),
      properties: JSON.parse(node.properties),
    })
  }

  private cleanupExpiredTransactions(): void {
    this.transactionManager.cleanupExpired()

    for (const txId of this.transactionWorkBuffers.keys()) {
      if (!this.transactionManager.isActive(txId)) {
        this.transactionWorkBuffers.delete(txId)
      }
    }
  }

  private handleError(error: unknown): Response {
    if (error instanceof CypherError) {
      return this.jsonResponse({
        error: error.message,
        code: error.code,
        message: error.message,
      }, 400)
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    return this.jsonResponse({
      error: message,
      code: 'Neo.DatabaseError.General.UnknownError',
      message,
    }, 500)
  }

  private jsonResponse(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
