/**
 * Neo4j HTTP Client SDK
 * A Neo4j-driver compatible client that works over HTTP instead of Bolt protocol.
 * Designed for use with neo4j.do instances running on Cloudflare Workers.
 */

import { HttpClient, HttpClientConfig } from './http-client'
import {
  HttpDriverError,
  DriverClosedError,
  SessionClosedError,
  NetworkError,
  ServerError,
} from './errors'
import type {
  AuthToken,
  SessionConfig,
  TransactionConfig,
  CypherResponse,
  QueryResult,
  QueryConfig,
  AccessMode,
  HttpConfig,
  SerializedRecord,
  TransactionBeginResponse,
  TransactionCommitResponse,
  ResultSummary,
  RecordShape,
} from './types'
import { Record } from '../result/record'

/**
 * Configuration for Neo4jHttpClient
 */
export interface Neo4jHttpClientConfig extends HttpConfig {
  /** Default database to use */
  database?: string
}

/**
 * Neo4j HTTP Client - the main entry point for connecting to a neo4j.do instance over HTTP.
 * Provides an API similar to the official neo4j-driver package.
 */
export class Neo4jHttpClient {
  private readonly httpClient: HttpClient
  private readonly defaultDatabase: string
  private _closed: boolean = false

  /**
   * Create a new Neo4jHttpClient instance.
   *
   * @param baseUrl - The base URL of the neo4j.do instance (e.g., "https://my-db.neo4j.do")
   * @param auth - Optional authentication token
   * @param config - Optional configuration
   */
  constructor(
    baseUrl: string,
    auth?: AuthToken,
    config?: Neo4jHttpClientConfig
  ) {
    const httpConfig: HttpClientConfig = {
      baseUrl,
      auth,
      fetch: config?.fetch,
      timeout: config?.timeout ?? config?.connectionTimeout ?? 30000,
      headers: config?.headers,
    }

    this.httpClient = new HttpClient(httpConfig)
    this.defaultDatabase = config?.database ?? 'neo4j'
  }

  /**
   * Execute a Cypher query directly.
   * This is a convenience method for simple queries without transaction management.
   *
   * @param query - The Cypher query string
   * @param params - Optional query parameters
   * @param config - Optional query configuration
   * @returns Promise resolving to the query result
   */
  async run<T extends RecordShape = RecordShape>(
    query: string,
    params?: Record<string, unknown>,
    config?: QueryConfig
  ): Promise<QueryResult<T>> {
    if (this._closed) {
      throw new DriverClosedError('query')
    }

    const database = config?.database ?? this.defaultDatabase
    const body = {
      query,
      parameters: params ?? {},
      database,
      bookmarks: config?.bookmarks,
      routing: config?.routing ?? 'WRITE',
    }

    try {
      const response = await this.httpClient.post<CypherResponse>(
        '/cypher',
        body,
        { timeout: config?.timeout }
      )

      return this.transformResponse<T>(response, query, params ?? {}, database)
    } catch (error) {
      if (error instanceof HttpDriverError) {
        throw error
      }
      throw new NetworkError(
        `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Create a new session for interacting with the database.
   * Sessions provide transaction management and causal consistency through bookmarks.
   *
   * @param config - Optional session configuration
   * @returns A new HttpSession instance
   */
  session(config?: SessionConfig): HttpSession {
    if (this._closed) {
      throw new DriverClosedError('create session')
    }

    return new HttpSession(this.httpClient, {
      database: config?.database ?? this.defaultDatabase,
      defaultAccessMode: config?.defaultAccessMode ?? 'WRITE',
      bookmarks: normalizeBookmarks(config?.bookmarks),
      fetchSize: config?.fetchSize,
      impersonatedUser: config?.impersonatedUser,
    })
  }

  /**
   * Verify connectivity to the neo4j.do instance.
   *
   * @returns Promise that resolves if the connection is successful
   */
  async verifyConnectivity(): Promise<void> {
    if (this._closed) {
      throw new DriverClosedError('verify connectivity')
    }

    try {
      await this.httpClient.get('/health')
    } catch (error) {
      throw new NetworkError(
        `Failed to verify connectivity: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get server information.
   *
   * @returns Promise resolving to server info
   */
  async getServerInfo(): Promise<{ address: string; agent?: string; protocolVersion?: string }> {
    if (this._closed) {
      throw new DriverClosedError('get server info')
    }

    try {
      return await this.httpClient.get('/info')
    } catch (error) {
      throw new NetworkError(
        `Failed to get server info: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Close the client and release resources.
   * After calling close(), the client cannot be used anymore.
   */
  async close(): Promise<void> {
    this._closed = true
  }

  /**
   * Check if the client is closed.
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Get the base URL this client is connected to.
   */
  get baseUrl(): string {
    return this.httpClient.baseUrl
  }

  /**
   * Transform a CypherResponse into a QueryResult
   */
  private transformResponse<T extends RecordShape>(
    response: CypherResponse,
    query: string,
    parameters: Record<string, unknown>,
    database: string
  ): QueryResult<T> {
    const keys = response.keys ?? []
    const records = (response.records ?? []).map((rec: SerializedRecord) => {
      const values = keys.map((key) => rec[key])
      return new Record(keys, values)
    })

    const summary = this.createSummary(response, query, parameters, database)

    return {
      records: records as unknown as T[],
      keys,
      summary,
    }
  }

  /**
   * Create a ResultSummary from a CypherResponse
   */
  private createSummary(
    response: CypherResponse,
    query: string,
    parameters: Record<string, unknown>,
    database: string
  ): ResultSummary {
    const serverSummary = response.summary ?? {}
    const counters = serverSummary.counters ?? {}

    const createCounters = () => ({
      containsUpdates: () =>
        (counters.nodesCreated ?? 0) > 0 ||
        (counters.nodesDeleted ?? 0) > 0 ||
        (counters.relationshipsCreated ?? 0) > 0 ||
        (counters.relationshipsDeleted ?? 0) > 0 ||
        (counters.propertiesSet ?? 0) > 0,
      containsSystemUpdates: () => false,
      nodesCreated: () => counters.nodesCreated ?? 0,
      nodesDeleted: () => counters.nodesDeleted ?? 0,
      relationshipsCreated: () => counters.relationshipsCreated ?? 0,
      relationshipsDeleted: () => counters.relationshipsDeleted ?? 0,
      propertiesSet: () => counters.propertiesSet ?? 0,
      labelsAdded: () => counters.labelsAdded ?? 0,
      labelsRemoved: () => counters.labelsRemoved ?? 0,
      indexesAdded: () => counters.indexesAdded ?? 0,
      indexesRemoved: () => counters.indexesRemoved ?? 0,
      constraintsAdded: () => counters.constraintsAdded ?? 0,
      constraintsRemoved: () => counters.constraintsRemoved ?? 0,
      systemUpdates: () => 0,
    })

    return {
      query: { text: query, parameters },
      queryType: serverSummary.queryType ?? 'r',
      counters: createCounters(),
      updateStatistics: createCounters(),
      notifications: [],
      server: { address: this.httpClient.baseUrl },
      resultAvailableAfter: serverSummary.resultAvailableAfter ?? 0,
      resultConsumedAfter: serverSummary.resultConsumedAfter ?? 0,
      database: { name: database },
    }
  }
}

/**
 * HTTP Session - manages transactions and causal consistency for a sequence of queries.
 */
export class HttpSession {
  private readonly httpClient: HttpClient
  private readonly database: string
  private readonly defaultAccessMode: AccessMode
  private bookmarks: string[]
  private readonly fetchSize: number
  private readonly impersonatedUser?: string
  private _closed: boolean = false
  private currentTransaction: HttpTransaction | null = null

  constructor(
    httpClient: HttpClient,
    config: {
      database: string
      defaultAccessMode: AccessMode
      bookmarks: string[]
      fetchSize?: number
      impersonatedUser?: string
    }
  ) {
    this.httpClient = httpClient
    this.database = config.database
    this.defaultAccessMode = config.defaultAccessMode
    this.bookmarks = config.bookmarks
    this.fetchSize = config.fetchSize ?? 1000
    this.impersonatedUser = config.impersonatedUser
  }

  /**
   * Run a Cypher query within an auto-commit transaction.
   *
   * @param query - The Cypher query string
   * @param params - Optional query parameters
   * @param config - Optional transaction configuration
   * @returns Promise resolving to the query result
   */
  async run<T extends RecordShape = RecordShape>(
    query: string,
    params?: Record<string, unknown>,
    config?: TransactionConfig
  ): Promise<QueryResult<T>> {
    if (this._closed) {
      throw new SessionClosedError('query')
    }

    const body = {
      query,
      parameters: params ?? {},
      database: this.database,
      bookmarks: this.bookmarks,
      routing: this.defaultAccessMode,
      impersonatedUser: this.impersonatedUser,
    }

    try {
      const response = await this.httpClient.post<CypherResponse>(
        '/cypher',
        body,
        { timeout: config?.timeout }
      )

      // Update bookmarks
      if (response.bookmarks && response.bookmarks.length > 0) {
        this.bookmarks = response.bookmarks
      }

      return this.transformResponse<T>(response, query, params ?? {})
    } catch (error) {
      if (error instanceof HttpDriverError) {
        throw error
      }
      throw new NetworkError(
        `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Begin an explicit transaction.
   *
   * @param config - Optional transaction configuration
   * @returns Promise resolving to a new HttpTransaction
   */
  async beginTransaction(config?: TransactionConfig): Promise<HttpTransaction> {
    if (this._closed) {
      throw new SessionClosedError('begin transaction')
    }

    if (this.currentTransaction && !this.currentTransaction.closed) {
      throw new Error('A transaction is already open. Close or commit it before starting a new one.')
    }

    const body = {
      database: this.database,
      bookmarks: this.bookmarks,
      accessMode: this.defaultAccessMode,
      impersonatedUser: this.impersonatedUser,
      timeout: config?.timeout,
      metadata: config?.metadata,
    }

    try {
      const response = await this.httpClient.post<TransactionBeginResponse>(
        '/tx/begin',
        body
      )

      this.currentTransaction = new HttpTransaction(
        this.httpClient,
        response.id,
        this.database,
        (newBookmarks: string[]) => {
          this.bookmarks = newBookmarks
        }
      )

      return this.currentTransaction
    } catch (error) {
      if (error instanceof HttpDriverError) {
        throw error
      }
      throw new NetworkError(
        `Failed to begin transaction: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Execute a unit of work in a read transaction with automatic retry.
   *
   * @param work - The function to execute within the transaction
   * @param config - Optional transaction configuration
   * @returns Promise resolving to the result of the work function
   */
  async executeRead<T>(
    work: (tx: HttpTransaction) => Promise<T>,
    config?: TransactionConfig
  ): Promise<T> {
    return this.executeWithRetry(work, 'READ', config)
  }

  /**
   * Execute a unit of work in a write transaction with automatic retry.
   *
   * @param work - The function to execute within the transaction
   * @param config - Optional transaction configuration
   * @returns Promise resolving to the result of the work function
   */
  async executeWrite<T>(
    work: (tx: HttpTransaction) => Promise<T>,
    config?: TransactionConfig
  ): Promise<T> {
    return this.executeWithRetry(work, 'WRITE', config)
  }

  /**
   * Execute with retry logic.
   */
  private async executeWithRetry<T>(
    work: (tx: HttpTransaction) => Promise<T>,
    accessMode: AccessMode,
    config?: TransactionConfig
  ): Promise<T> {
    const maxRetryTime = 30000 // 30 seconds
    const startTime = Date.now()
    let lastError: Error | null = null
    let retryCount = 0

    while (Date.now() - startTime < maxRetryTime) {
      // Create a temporary session-like context for this transaction
      const originalAccessMode = this.defaultAccessMode
      ;(this as { defaultAccessMode: AccessMode }).defaultAccessMode = accessMode

      const tx = await this.beginTransaction(config)
      ;(this as { defaultAccessMode: AccessMode }).defaultAccessMode = originalAccessMode

      try {
        const result = await work(tx)
        await tx.commit()
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (!tx.closed) {
          try {
            await tx.rollback()
          } catch {
            // Ignore rollback errors
          }
        }

        if (!this.isRetryableError(lastError)) {
          throw lastError
        }

        retryCount++
        const delay = Math.min(
          1000 * Math.pow(2, retryCount - 1) + Math.random() * 1000,
          5000
        )
        await this.sleep(delay)
      }
    }

    throw lastError ?? new Error('Transaction retry timeout')
  }

  /**
   * Check if an error is retryable.
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    return (
      message.includes('deadlock') ||
      message.includes('transient') ||
      message.includes('temporarily unavailable') ||
      message.includes('leader switch') ||
      message.includes('connection') ||
      (error as { code?: string }).code?.startsWith('Neo.TransientError.') === true
    )
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get the last bookmarks.
   */
  lastBookmarks(): string[] {
    return [...this.bookmarks]
  }

  /**
   * Close this session.
   */
  async close(): Promise<void> {
    if (this._closed) {
      return
    }

    if (this.currentTransaction && !this.currentTransaction.closed) {
      try {
        await this.currentTransaction.rollback()
      } catch {
        // Ignore errors when closing
      }
    }

    this._closed = true
  }

  /**
   * Check if this session is closed.
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Transform response to QueryResult.
   */
  private transformResponse<T extends RecordShape>(
    response: CypherResponse,
    query: string,
    parameters: Record<string, unknown>
  ): QueryResult<T> {
    const keys = response.keys ?? []
    const records = (response.records ?? []).map((rec: SerializedRecord) => {
      const values = keys.map((key) => rec[key])
      return new Record(keys, values)
    })

    const summary = this.createSummary(response, query, parameters)

    return {
      records: records as unknown as T[],
      keys,
      summary,
    }
  }

  /**
   * Create a ResultSummary from response.
   */
  private createSummary(
    response: CypherResponse,
    query: string,
    parameters: Record<string, unknown>
  ): ResultSummary {
    const serverSummary = response.summary ?? {}
    const counters = serverSummary.counters ?? {}

    const createCounters = () => ({
      containsUpdates: () =>
        (counters.nodesCreated ?? 0) > 0 ||
        (counters.nodesDeleted ?? 0) > 0 ||
        (counters.relationshipsCreated ?? 0) > 0 ||
        (counters.relationshipsDeleted ?? 0) > 0 ||
        (counters.propertiesSet ?? 0) > 0,
      containsSystemUpdates: () => false,
      nodesCreated: () => counters.nodesCreated ?? 0,
      nodesDeleted: () => counters.nodesDeleted ?? 0,
      relationshipsCreated: () => counters.relationshipsCreated ?? 0,
      relationshipsDeleted: () => counters.relationshipsDeleted ?? 0,
      propertiesSet: () => counters.propertiesSet ?? 0,
      labelsAdded: () => counters.labelsAdded ?? 0,
      labelsRemoved: () => counters.labelsRemoved ?? 0,
      indexesAdded: () => counters.indexesAdded ?? 0,
      indexesRemoved: () => counters.indexesRemoved ?? 0,
      constraintsAdded: () => counters.constraintsAdded ?? 0,
      constraintsRemoved: () => counters.constraintsRemoved ?? 0,
      systemUpdates: () => 0,
    })

    return {
      query: { text: query, parameters },
      queryType: serverSummary.queryType ?? 'r',
      counters: createCounters(),
      updateStatistics: createCounters(),
      notifications: [],
      server: { address: this.httpClient.baseUrl },
      resultAvailableAfter: serverSummary.resultAvailableAfter ?? 0,
      resultConsumedAfter: serverSummary.resultConsumedAfter ?? 0,
      database: { name: this.database },
    }
  }
}

/**
 * HTTP Transaction - represents an explicit transaction.
 */
export class HttpTransaction {
  private readonly httpClient: HttpClient
  private readonly transactionId: string
  private readonly database: string
  private readonly onCommit: (bookmarks: string[]) => void
  private _closed: boolean = false

  constructor(
    httpClient: HttpClient,
    transactionId: string,
    database: string,
    onCommit: (bookmarks: string[]) => void
  ) {
    this.httpClient = httpClient
    this.transactionId = transactionId
    this.database = database
    this.onCommit = onCommit
  }

  /**
   * Run a query within this transaction.
   *
   * @param query - The Cypher query string
   * @param params - Optional query parameters
   * @returns Promise resolving to the query result
   */
  async run<T extends RecordShape = RecordShape>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<QueryResult<T>> {
    if (this._closed) {
      throw new Error('Cannot run query on closed transaction')
    }

    const body = {
      query,
      parameters: params ?? {},
    }

    try {
      const response = await this.httpClient.post<CypherResponse>(
        `/tx/${this.transactionId}`,
        body
      )

      return this.transformResponse<T>(response, query, params ?? {})
    } catch (error) {
      if (error instanceof HttpDriverError) {
        throw error
      }
      throw new NetworkError(
        `Failed to execute query in transaction: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Commit this transaction.
   */
  async commit(): Promise<void> {
    if (this._closed) {
      throw new Error('Cannot commit closed transaction')
    }

    try {
      const response = await this.httpClient.post<TransactionCommitResponse>(
        `/tx/${this.transactionId}/commit`
      )

      this._closed = true

      if (response.bookmarks && response.bookmarks.length > 0) {
        this.onCommit(response.bookmarks)
      }
    } catch (error) {
      this._closed = true
      if (error instanceof HttpDriverError) {
        throw error
      }
      throw new NetworkError(
        `Failed to commit transaction: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Rollback this transaction.
   */
  async rollback(): Promise<void> {
    if (this._closed) {
      return // Already closed, nothing to rollback
    }

    try {
      await this.httpClient.post(`/tx/${this.transactionId}/rollback`)
      this._closed = true
    } catch (error) {
      this._closed = true
      if (error instanceof HttpDriverError) {
        throw error
      }
      throw new NetworkError(
        `Failed to rollback transaction: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Check if this transaction is closed.
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Check if this transaction is open.
   */
  isOpen(): boolean {
    return !this._closed
  }

  /**
   * Transform response to QueryResult.
   */
  private transformResponse<T extends RecordShape>(
    response: CypherResponse,
    query: string,
    parameters: Record<string, unknown>
  ): QueryResult<T> {
    const keys = response.keys ?? []
    const records = (response.records ?? []).map((rec: SerializedRecord) => {
      const values = keys.map((key) => rec[key])
      return new Record(keys, values)
    })

    const serverSummary = response.summary ?? {}
    const counters = serverSummary.counters ?? {}

    const createCounters = () => ({
      containsUpdates: () =>
        (counters.nodesCreated ?? 0) > 0 ||
        (counters.nodesDeleted ?? 0) > 0 ||
        (counters.relationshipsCreated ?? 0) > 0 ||
        (counters.relationshipsDeleted ?? 0) > 0 ||
        (counters.propertiesSet ?? 0) > 0,
      containsSystemUpdates: () => false,
      nodesCreated: () => counters.nodesCreated ?? 0,
      nodesDeleted: () => counters.nodesDeleted ?? 0,
      relationshipsCreated: () => counters.relationshipsCreated ?? 0,
      relationshipsDeleted: () => counters.relationshipsDeleted ?? 0,
      propertiesSet: () => counters.propertiesSet ?? 0,
      labelsAdded: () => counters.labelsAdded ?? 0,
      labelsRemoved: () => counters.labelsRemoved ?? 0,
      indexesAdded: () => counters.indexesAdded ?? 0,
      indexesRemoved: () => counters.indexesRemoved ?? 0,
      constraintsAdded: () => counters.constraintsAdded ?? 0,
      constraintsRemoved: () => counters.constraintsRemoved ?? 0,
      systemUpdates: () => 0,
    })

    const summary: ResultSummary = {
      query: { text: query, parameters },
      queryType: serverSummary.queryType ?? 'r',
      counters: createCounters(),
      updateStatistics: createCounters(),
      notifications: [],
      server: { address: this.httpClient.baseUrl },
      resultAvailableAfter: serverSummary.resultAvailableAfter ?? 0,
      resultConsumedAfter: serverSummary.resultConsumedAfter ?? 0,
      database: { name: this.database },
    }

    return {
      records: records as unknown as T[],
      keys,
      summary,
    }
  }
}

/**
 * Helper to normalize bookmarks to an array.
 */
function normalizeBookmarks(bookmarks: string[] | string | undefined): string[] {
  if (!bookmarks) {
    return []
  }
  return Array.isArray(bookmarks) ? [...bookmarks] : [bookmarks]
}

/**
 * Factory function to create a Neo4jHttpClient.
 * Similar to neo4j.driver() but for HTTP connections.
 *
 * @param baseUrl - The base URL of the neo4j.do instance
 * @param auth - Optional authentication token
 * @param config - Optional configuration
 * @returns A new Neo4jHttpClient instance
 */
export function createHttpClient(
  baseUrl: string,
  auth?: AuthToken,
  config?: Neo4jHttpClientConfig
): Neo4jHttpClient {
  return new Neo4jHttpClient(baseUrl, auth, config)
}

/**
 * Create basic authentication credentials.
 *
 * @param username - The username
 * @param password - The password
 * @returns An AuthToken for basic authentication
 */
export function basicAuth(username: string, password: string): AuthToken {
  return {
    scheme: 'basic',
    principal: username,
    credentials: password,
  }
}

/**
 * Create bearer token authentication.
 *
 * @param token - The bearer token
 * @returns An AuthToken for bearer authentication
 */
export function bearerAuth(token: string): AuthToken {
  return {
    scheme: 'bearer',
    credentials: token,
  }
}
