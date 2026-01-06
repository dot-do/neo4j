/**
 * Neo4jHttpDriver - A simplified HTTP-based Neo4j driver
 *
 * This provides a driver-like interface that works over HTTP instead of Bolt protocol.
 * Designed for edge computing environments like Cloudflare Workers.
 */

import type { QueryConfig, ServerInfo, RecordShape, ResultSummary } from './types'
import { Record as Neo4jRecord } from '../result/record'

/**
 * Authentication configuration for the HTTP driver
 */
export type HttpDriverAuth =
  | { username: string; password: string }
  | { token: string }

/**
 * Configuration options for Neo4jHttpDriver
 */
export interface HttpDriverConfig {
  /** Authentication credentials */
  auth?: HttpDriverAuth
  /** Maximum number of connection pool connections (informational) */
  maxConnectionPoolSize?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Custom fetch implementation */
  fetch?: typeof fetch
  /** Additional headers to send with each request */
  headers?: Record<string, string>
}

/**
 * Query result returned from executeQuery
 */
export interface DriverQueryResult<T = RecordShape> {
  records: Neo4jRecord[]
  keys: string[]
  summary: ResultSummary
}

/**
 * Session configuration for creating sessions
 */
export interface DriverSessionConfig {
  database?: string
  defaultAccessMode?: 'READ' | 'WRITE'
  bookmarks?: string[] | string
}

/**
 * Response from the server for a Cypher query
 */
interface CypherResponse {
  records: Array<{ [key: string]: unknown }>
  keys: string[]
  summary?: {
    counters?: {
      nodesCreated?: number
      nodesDeleted?: number
      relationshipsCreated?: number
      relationshipsDeleted?: number
      propertiesSet?: number
      labelsAdded?: number
      labelsRemoved?: number
      indexesAdded?: number
      indexesRemoved?: number
      constraintsAdded?: number
      constraintsRemoved?: number
    }
    queryType?: 'r' | 'w' | 'rw' | 's'
    resultAvailableAfter?: number
    resultConsumedAfter?: number
  }
  bookmarks?: string[]
}

/**
 * Neo4jHttpDriver - Main driver class for HTTP-based Neo4j connections
 *
 * @example
 * ```typescript
 * const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
 *   auth: { username: 'neo4j', password: 'password' }
 * })
 *
 * const result = await driver.executeQuery('MATCH (n:Person) RETURN n.name')
 * console.log(result.records)
 *
 * await driver.close()
 * ```
 */
export class Neo4jHttpDriver {
  readonly baseUrl: string
  readonly config: HttpDriverConfig
  private _closed = false

  /**
   * Create a new Neo4jHttpDriver instance
   *
   * @param baseUrl - The base URL of the neo4j.do instance
   * @param config - Optional configuration options
   */
  constructor(baseUrl: string, config?: HttpDriverConfig) {
    // Remove trailing slash from base URL
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.config = config ?? {}
  }

  /**
   * Check if the driver has authentication configured
   */
  get isAuthenticated(): boolean {
    return !!this.config.auth
  }

  /**
   * Check if the driver is closed
   */
  get isClosed(): boolean {
    return this._closed
  }

  /**
   * Create a new session for executing queries
   *
   * @param config - Optional session configuration
   * @returns A new HttpSession instance
   * @throws Error if the driver is closed
   */
  session(config?: DriverSessionConfig): HttpSession {
    if (this._closed) {
      throw new Error('Driver is closed')
    }
    return new HttpSession(this, config)
  }

  /**
   * Execute a Cypher query directly
   *
   * This is a convenience method that creates a session, runs the query,
   * and closes the session.
   *
   * @param query - The Cypher query string
   * @param params - Optional query parameters
   * @param _config - Optional query configuration (unused but kept for API compatibility)
   * @returns Promise resolving to the query result
   */
  async executeQuery<T = RecordShape>(
    query: string,
    params?: Record<string, unknown>,
    _config?: QueryConfig
  ): Promise<DriverQueryResult<T>> {
    const session = this.session()
    try {
      return await session.run<T>(query, params)
    } finally {
      await session.close()
    }
  }

  /**
   * Get server information
   *
   * @returns Promise resolving to server info
   */
  async getServerInfo(): Promise<ServerInfo> {
    const response = await this.fetch('/server-info')
    return response.json()
  }

  /**
   * Close the driver and release resources
   *
   * After calling close(), the driver cannot be used anymore.
   */
  async close(): Promise<void> {
    this._closed = true
  }

  /**
   * Make an HTTP request to the server
   *
   * @internal
   * @param path - The URL path to request
   * @param init - Optional fetch init options
   * @returns Promise resolving to the Response
   */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const fetchFn = this.config.fetch ?? globalThis.fetch
    const headers = this.buildHeaders()
    return fetchFn(`${this.baseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } })
  }

  /**
   * Build request headers including authentication
   *
   * @internal
   */
  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    }

    if (this.config.auth) {
      if ('token' in this.config.auth) {
        headers['Authorization'] = `Bearer ${this.config.auth.token}`
      } else {
        const { username, password } = this.config.auth
        headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`
      }
    }

    return headers
  }
}

/**
 * HttpSession - A session for executing queries with the HTTP driver
 */
export class HttpSession {
  private readonly driver: Neo4jHttpDriver
  private readonly database: string
  private readonly defaultAccessMode: 'READ' | 'WRITE'
  private bookmarks: string[]
  private _closed = false

  constructor(driver: Neo4jHttpDriver, config?: DriverSessionConfig) {
    this.driver = driver
    this.database = config?.database ?? 'neo4j'
    this.defaultAccessMode = config?.defaultAccessMode ?? 'WRITE'
    this.bookmarks = normalizeBookmarks(config?.bookmarks)
  }

  /**
   * Run a Cypher query within this session
   *
   * @param query - The Cypher query string
   * @param params - Optional query parameters
   * @returns Promise resolving to the query result
   */
  async run<T = RecordShape>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<DriverQueryResult<T>> {
    if (this._closed) {
      throw new Error('Session is closed')
    }

    const body = {
      query,
      parameters: params ?? {},
      database: this.database,
      bookmarks: this.bookmarks,
      routing: this.defaultAccessMode,
    }

    const response = await this.driver.fetch('/cypher', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(errorData.error?.message ?? `Request failed with status ${response.status}`)
    }

    const data: CypherResponse = await response.json()

    // Update bookmarks
    if (data.bookmarks && data.bookmarks.length > 0) {
      this.bookmarks = data.bookmarks
    }

    return this.transformResponse<T>(data, query, params ?? {})
  }

  /**
   * Get the last bookmarks from this session
   */
  lastBookmarks(): string[] {
    return [...this.bookmarks]
  }

  /**
   * Close this session
   */
  async close(): Promise<void> {
    this._closed = true
  }

  /**
   * Check if this session is closed
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Transform response to QueryResult
   */
  private transformResponse<T = RecordShape>(
    response: CypherResponse,
    query: string,
    parameters: Record<string, unknown>
  ): DriverQueryResult<T> {
    const keys = response.keys ?? []
    const records = (response.records ?? []).map((rec) => {
      const values = keys.map((key) => rec[key])
      return new Neo4jRecord(keys, values)
    })

    const summary = this.createSummary(response, query, parameters)

    return {
      records,
      keys,
      summary,
    }
  }

  /**
   * Create a ResultSummary from response
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
      server: { address: this.driver.baseUrl },
      resultAvailableAfter: serverSummary.resultAvailableAfter ?? 0,
      resultConsumedAfter: serverSummary.resultConsumedAfter ?? 0,
      database: { name: this.database },
    }
  }
}

/**
 * Helper to normalize bookmarks to an array
 */
function normalizeBookmarks(bookmarks: string[] | string | undefined): string[] {
  if (!bookmarks) {
    return []
  }
  return Array.isArray(bookmarks) ? [...bookmarks] : [bookmarks]
}
