/**
 * Neo4j Driver
 * Compatible with neo4j-driver npm package
 */

import { Session, QueryExecutor, TransactionFunctions } from './session'
import { RxSession, RxSessionConfig } from './rx-session'
import { parseUri } from './uri'
import { CypherExecutor } from '../cypher/executor'
import { ResultSummary as ResultSummaryImpl } from '../result/result-summary'
import type {
  AuthToken,
  Config,
  SessionConfig,
  TransactionConfig,
  ParsedUri,
  ServerInfo,
} from '../types'

const DEFAULT_MAX_TRANSACTION_RETRY_TIME = 30000
const DEFAULT_CONNECTION_TIMEOUT = 30000
const DEFAULT_MAX_CONNECTION_POOL_SIZE = 100
const DEFAULT_CONNECTION_ACQUISITION_TIMEOUT = 60000

type DriverState = 'open' | 'closed'

/**
 * Options for verifying connectivity
 */
export interface VerifyConnectivityOptions {
  database?: string
}

/**
 * Session close callback type
 */
export type SessionCloseCallback = (session: Session) => void

/**
 * Neo4j Driver - the main entry point for connecting to a Neo4j database
 */
export class Driver {
  private _state: DriverState = 'open'
  private readonly _uri: string
  private readonly _parsedUri: ParsedUri
  private readonly _authToken?: AuthToken
  private readonly _config: Required<
    Pick<
      Config,
      | 'maxTransactionRetryTime'
      | 'connectionTimeout'
      | 'maxConnectionPoolSize'
      | 'connectionAcquisitionTimeout'
    >
  > & Omit<Config, 'maxTransactionRetryTime' | 'connectionTimeout' | 'maxConnectionPoolSize' | 'connectionAcquisitionTimeout'>

  // Session tracking
  private readonly _activeSessions: Set<Session> = new Set()
  private readonly _sessionCloseCallbacks: SessionCloseCallback[] = []

  // Cypher executor for query execution
  private readonly _executor: CypherExecutor

  constructor(uri: string, authToken?: AuthToken, config?: Config) {
    this._uri = uri
    this._parsedUri = parseUri(uri)
    this._authToken = authToken

    // Validate config
    if (config?.maxTransactionRetryTime !== undefined && config.maxTransactionRetryTime < 0) {
      throw new Error('maxTransactionRetryTime must be non-negative')
    }
    if (config?.connectionTimeout !== undefined && config.connectionTimeout < 0) {
      throw new Error('connectionTimeout must be non-negative')
    }

    this._config = {
      maxTransactionRetryTime: config?.maxTransactionRetryTime ?? DEFAULT_MAX_TRANSACTION_RETRY_TIME,
      connectionTimeout: config?.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
      maxConnectionPoolSize: config?.maxConnectionPoolSize ?? DEFAULT_MAX_CONNECTION_POOL_SIZE,
      connectionAcquisitionTimeout:
        config?.connectionAcquisitionTimeout ?? DEFAULT_CONNECTION_ACQUISITION_TIMEOUT,
      ...config,
    }

    // Initialize the Cypher executor
    this._executor = new CypherExecutor()
  }

  /**
   * Create a new session for interacting with the database
   */
  session(config?: SessionConfig): Session {
    if (this._state !== 'open') {
      throw new Error('Cannot create session on closed driver')
    }

    const sessionConfig: SessionConfig = {
      database: config?.database ?? this._parsedUri.database,
      defaultAccessMode: config?.defaultAccessMode ?? 'WRITE',
      bookmarks: config?.bookmarks,
      fetchSize: config?.fetchSize,
      impersonatedUser: config?.impersonatedUser,
    }

    const session = new Session(
      sessionConfig,
      this._createQueryExecutor(),
      this._createTransactionFunctions(),
      this._config.maxTransactionRetryTime,
      // Session close callback for tracking
      () => this._onSessionClosed(session)
    )

    // Track this session
    this._activeSessions.add(session)

    return session
  }

  /**
   * Create a new reactive session for interacting with the database
   */
  rxSession(config?: RxSessionConfig): RxSession {
    if (this._state !== 'open') {
      throw new Error('Cannot create session on closed driver')
    }

    const rxSessionConfig: RxSessionConfig = {
      database: config?.database ?? this._parsedUri.database,
      defaultAccessMode: config?.defaultAccessMode ?? 'WRITE',
      bookmarks: config?.bookmarks,
      fetchSize: config?.fetchSize,
    }

    return new RxSession(rxSessionConfig)
  }

  /**
   * Handle session closed event
   */
  private _onSessionClosed(session: Session): void {
    this._activeSessions.delete(session)
    for (const callback of this._sessionCloseCallbacks) {
      try {
        callback(session)
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Register a callback to be notified when sessions are closed
   */
  onSessionClose(callback: SessionCloseCallback): void {
    this._sessionCloseCallbacks.push(callback)
  }

  /**
   * Get all active sessions
   */
  get activeSessions(): Session[] {
    return Array.from(this._activeSessions)
  }

  /**
   * Get the count of active sessions
   */
  get activeSessionCount(): number {
    return this._activeSessions.size
  }

  /**
   * Create a query executor for the session
   */
  private _createQueryExecutor(): QueryExecutor {
    return async (
      query: string,
      parameters?: Record<string, unknown>,
      _config?: TransactionConfig
    ): Promise<{ keys: string[]; records: unknown[][]; summary: ResultSummaryImpl }> => {
      // This is a placeholder implementation
      // In production, this would execute the query against the Durable Object
      return this._executeQuery(query, parameters)
    }
  }

  /**
   * Create transaction functions for the session
   */
  private _createTransactionFunctions(): TransactionFunctions {
    return {
      begin: async (
        database: string,
        _bookmarks: string[],
        _config: TransactionConfig
      ) => {
        // Track transaction state and pending operations
        let committed = false
        let rolledBack = false
        const transactionId = `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`

        // Track created nodes and relationships for rollback
        const createdNodeIds: number[] = []
        const createdRelationshipIds: number[] = []

        // Get the storage for tracking changes during the transaction
        const storage = this._executor.getStorage()

        return {
          executeQuery: async (
            query: string,
            parameters?: Record<string, unknown>
          ) => {
            if (committed || rolledBack) {
              throw new Error('Transaction has already been closed')
            }

            // Track storage state before execution
            const beforeNodeCount = storage.nodeCount
            const beforeRelCount = storage.relationshipCount

            const result = await this._executeQuery(query, parameters, database)

            // Track new nodes/relationships created
            const afterNodeCount = storage.nodeCount
            const afterRelCount = storage.relationshipCount

            // If nodes were created, track the IDs (approximate by counting)
            if (afterNodeCount > beforeNodeCount) {
              // Get newly created node IDs (they are sequential)
              for (let i = beforeNodeCount + 1; i <= afterNodeCount; i++) {
                createdNodeIds.push(i)
              }
            }
            if (afterRelCount > beforeRelCount) {
              for (let i = beforeRelCount + 1; i <= afterRelCount; i++) {
                createdRelationshipIds.push(i)
              }
            }

            return result
          },
          commit: async (): Promise<string | null> => {
            if (committed || rolledBack) {
              throw new Error('Transaction has already been closed')
            }
            committed = true
            // Data is already persisted, nothing to do
            return `${database}:${transactionId}`
          },
          rollback: async (): Promise<void> => {
            if (committed || rolledBack) {
              throw new Error('Transaction has already been closed')
            }
            rolledBack = true

            // Delete created relationships first (due to foreign key constraints)
            for (const relId of createdRelationshipIds.reverse()) {
              try {
                await storage.deleteRelationship(relId)
              } catch {
                // Ignore errors - relationship may already be deleted
              }
            }

            // Delete created nodes
            for (const nodeId of createdNodeIds.reverse()) {
              try {
                await storage.deleteNode(nodeId)
              } catch {
                // Ignore errors - node may already be deleted
              }
            }
          },
        }
      },
    }
  }

  /**
   * Execute a query against the Cypher executor
   */
  private async _executeQuery(
    query: string,
    parameters?: Record<string, unknown>,
    _database?: string
  ): Promise<{ keys: string[]; records: unknown[][]; summary: ResultSummaryImpl }> {
    const startTime = Date.now()

    // Execute the query using the CypherExecutor
    const result = await this._executor.execute(query, parameters ?? {})

    const endTime = Date.now()
    const executionTime = endTime - startTime

    // Determine query type based on what was executed
    const queryType = this._determineQueryType(query, result.summary)

    const summary = new ResultSummaryImpl(
      query,
      parameters ?? {},
      {
        type: queryType,
        stats: result.summary,
        notifications: [],
        server: {
          address: `${this._parsedUri.host}:${this._parsedUri.port}`,
          version: 'neo4j.do/1.0.0',
        },
        resultAvailableAfter: executionTime,
        resultConsumedAfter: executionTime,
        db: { name: _database ?? this._parsedUri.database ?? 'neo4j' },
      }
    )

    return {
      keys: result.keys,
      records: result.records,
      summary,
    }
  }

  /**
   * Determine query type based on the query and results
   */
  private _determineQueryType(
    query: string,
    summary: {
      nodesCreated: number
      nodesDeleted: number
      relationshipsCreated: number
      relationshipsDeleted: number
      propertiesSet: number
      labelsAdded: number
      labelsRemoved: number
    }
  ): 'r' | 'w' | 'rw' | 's' {
    const upperQuery = query.toUpperCase()
    const hasWrite =
      summary.nodesCreated > 0 ||
      summary.nodesDeleted > 0 ||
      summary.relationshipsCreated > 0 ||
      summary.relationshipsDeleted > 0 ||
      summary.propertiesSet > 0 ||
      summary.labelsAdded > 0 ||
      summary.labelsRemoved > 0 ||
      upperQuery.includes('CREATE') ||
      upperQuery.includes('DELETE') ||
      upperQuery.includes('SET') ||
      upperQuery.includes('MERGE') ||
      upperQuery.includes('REMOVE')

    const hasRead = upperQuery.includes('MATCH') || upperQuery.includes('RETURN')

    if (hasWrite && hasRead) return 'rw'
    if (hasWrite) return 'w'
    return 'r'
  }

  /**
   * Verify connectivity to the database
   */
  async verifyConnectivity(_options?: VerifyConnectivityOptions): Promise<void> {
    if (this._state !== 'open') {
      throw new Error('Driver is closed')
    }
    // In production, this would ping the Durable Object
    // For now, we just verify the connection is open
    // The options.database parameter would be used to verify connectivity to a specific database
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<ServerInfo> {
    if (this._state !== 'open') {
      throw new Error('Driver is closed')
    }
    return {
      address: `${this._parsedUri.host}:${this._parsedUri.port}`,
      agent: 'neo4j.do/1.0.0',
      protocolVersion: 4.4,
    }
  }

  /**
   * Verify authentication credentials
   */
  async verifyAuthentication(): Promise<boolean> {
    if (this._state !== 'open') {
      throw new Error('Driver is closed')
    }
    // In production, this would verify credentials with the server
    return this._authToken !== undefined
  }

  /**
   * Close the driver and release all resources
   */
  async close(): Promise<void> {
    if (this._state === 'closed') {
      return
    }

    // Close all active sessions
    const closePromises = Array.from(this._activeSessions).map(async (session) => {
      try {
        await session.close()
      } catch {
        // Ignore errors when closing sessions during driver shutdown
      }
    })

    await Promise.all(closePromises)

    this._state = 'closed'
  }

  /**
   * Check if encryption is enabled
   */
  get encrypted(): boolean {
    return this._parsedUri.encrypted
  }

  /**
   * Check if the server supports multi-database
   */
  get supportsMultiDb(): boolean {
    // Neo4j 4.0+ supports multi-database
    return true
  }

  /**
   * Check if the server supports transaction config
   */
  get supportsTransactionConfig(): boolean {
    // Neo4j 3.1+ supports transaction config
    return true
  }

  /**
   * Get the URI this driver was created with
   */
  get uri(): string {
    return this._uri
  }

  /**
   * Get the parsed URI components
   */
  get parsedUri(): ParsedUri {
    return { ...this._parsedUri }
  }

  /**
   * Check if the driver is open
   */
  get isOpen(): boolean {
    return this._state === 'open'
  }
}

/**
 * Create a new Driver instance
 */
export function createDriver(uri: string, authToken?: AuthToken, config?: Config): Driver {
  return new Driver(uri, authToken, config)
}
