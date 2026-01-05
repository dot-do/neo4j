/**
 * Neo4j Driver
 * Compatible with neo4j-driver npm package
 */

import { Session, QueryExecutor, TransactionFunctions } from './session'
import { parseUri } from './uri'
import type {
  AuthToken,
  Config,
  SessionConfig,
  TransactionConfig,
  ParsedUri,
  ResultSummary,
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
    ): Promise<{ keys: string[]; records: unknown[][]; summary: ResultSummary }> => {
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
        // In production, this would start a transaction in the Durable Object
        let committed = false
        let rolledBack = false
        const transactionId = `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`

        return {
          executeQuery: async (
            query: string,
            parameters?: Record<string, unknown>
          ) => {
            if (committed || rolledBack) {
              throw new Error('Transaction has already been closed')
            }
            return this._executeQuery(query, parameters, database)
          },
          commit: async (): Promise<string | null> => {
            if (committed || rolledBack) {
              throw new Error('Transaction has already been closed')
            }
            committed = true
            // Return a bookmark for this transaction
            return `${database}:${transactionId}`
          },
          rollback: async (): Promise<void> => {
            if (committed || rolledBack) {
              throw new Error('Transaction has already been closed')
            }
            rolledBack = true
          },
        }
      },
    }
  }

  /**
   * Execute a query (placeholder for actual implementation)
   */
  private async _executeQuery(
    query: string,
    parameters?: Record<string, unknown>,
    _database?: string
  ): Promise<{ keys: string[]; records: unknown[][]; summary: ResultSummary }> {
    // This is a placeholder implementation
    // In production, this would:
    // 1. Parse the Cypher query
    // 2. Translate to SQL for SQLite
    // 3. Execute against the Durable Object's SQL storage
    // 4. Return results

    const summary: ResultSummary = {
      query: { text: query, parameters: parameters ?? {} },
      queryType: 'r',
      counters: this._createEmptyCounters(),
      updateStatistics: this._createEmptyCounters(),
      notifications: [],
      server: {
        address: `${this._parsedUri.host}:${this._parsedUri.port}`,
      },
      resultAvailableAfter: 0,
      resultConsumedAfter: 0,
      database: { name: _database ?? this._parsedUri.database ?? 'neo4j' },
    }

    return {
      keys: [],
      records: [],
      summary,
    }
  }

  /**
   * Create empty query counters
   */
  private _createEmptyCounters() {
    return {
      containsUpdates: () => false,
      containsSystemUpdates: () => false,
      nodesCreated: () => 0,
      nodesDeleted: () => 0,
      relationshipsCreated: () => 0,
      relationshipsDeleted: () => 0,
      propertiesSet: () => 0,
      labelsAdded: () => 0,
      labelsRemoved: () => 0,
      indexesAdded: () => 0,
      indexesRemoved: () => 0,
      constraintsAdded: () => 0,
      constraintsRemoved: () => 0,
      systemUpdates: () => 0,
    }
  }

  /**
   * Verify connectivity to the database
   */
  async verifyConnectivity(options?: VerifyConnectivityOptions): Promise<void> {
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
