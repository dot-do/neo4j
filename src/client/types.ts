/**
 * HTTP Client SDK Types
 * Types for the Neo4j HTTP client that works in any JavaScript environment
 */

import type { AuthToken, SessionConfig, TransactionConfig, ResultSummary, RecordShape } from '../types'

/**
 * HTTP driver configuration
 */
export interface HttpConfig {
  /** Custom fetch implementation (for environments without global fetch) */
  fetch?: typeof fetch
  /** Request timeout in milliseconds */
  timeout?: number
  /** Additional headers to send with each request */
  headers?: Record<string, string>
  /** Maximum number of connection pool connections (informational for HTTP) */
  maxConnectionPoolSize?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
}

/**
 * Server information returned from the server
 */
export interface ServerInfo {
  address: string
  agent?: string
  protocolVersion?: string
  connectionId?: string
}

/**
 * Response from the server for a Cypher query
 */
export interface CypherResponse {
  /** Array of serialized records */
  records: SerializedRecord[]
  /** Column keys */
  keys: string[]
  /** Query summary */
  summary?: QuerySummary
  /** Bookmarks for causal consistency */
  bookmarks?: string[]
}

/**
 * Serialized record from the server
 */
export interface SerializedRecord {
  [key: string]: unknown
}

/**
 * Query summary from the server
 */
export interface QuerySummary {
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

/**
 * Transaction begin response
 */
export interface TransactionBeginResponse {
  id: string
  accessMode: 'READ' | 'WRITE'
  expiresAt?: string
}

/**
 * Transaction commit response
 */
export interface TransactionCommitResponse {
  bookmarks: string[]
}

/**
 * HTTP error response from the server
 */
export interface HttpErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/**
 * Query result that can be consumed
 */
export interface QueryResult<T = RecordShape> {
  records: T[]
  keys: string[]
  summary: ResultSummary
}

/**
 * Query execution config
 */
export interface QueryConfig {
  database?: string
  bookmarks?: string[]
  timeout?: number
  routing?: 'READ' | 'WRITE'
}

/**
 * Access mode for transactions
 */
export type AccessMode = 'READ' | 'WRITE'

export type { AuthToken, SessionConfig, TransactionConfig, ResultSummary, RecordShape }
