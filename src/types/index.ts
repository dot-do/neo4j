/**
 * Neo4j Driver Types
 * Compatible with neo4j-driver npm package
 */

// Re-export Point type and utilities
export { Point, isPoint, spatial, SRID } from './point'

// Auth token types
export interface AuthToken {
  scheme: string
  principal?: string
  credentials?: string
  realm?: string
  parameters?: Record<string, unknown>
}

// Logging configuration
export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug'
  logger?: (level: string, message: string) => void
}

// Driver configuration
export interface Config {
  maxTransactionRetryTime?: number
  connectionTimeout?: number
  maxConnectionPoolSize?: number
  connectionAcquisitionTimeout?: number
  logging?: LoggingConfig
  encrypted?: boolean | 'ENCRYPTION_ON' | 'ENCRYPTION_OFF'
  trust?: 'TRUST_ALL_CERTIFICATES' | 'TRUST_CUSTOM_CA_SIGNED_CERTIFICATES' | 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES'
  trustedCertificates?: string[]
  resolver?: (address: string) => string[] | Promise<string[]>
  userAgent?: string
}

// Session configuration
export interface SessionConfig {
  database?: string
  defaultAccessMode?: 'READ' | 'WRITE'
  bookmarks?: string[] | string
  fetchSize?: number
  impersonatedUser?: string
}

// Transaction configuration
export interface TransactionConfig {
  timeout?: number
  metadata?: Record<string, unknown>
}

// Access modes
export type AccessMode = 'READ' | 'WRITE'

// Parsed URI
export interface ParsedUri {
  scheme: string
  host: string
  port: number
  database?: string
  encrypted: boolean
}

// Server info
export interface ServerInfo {
  address: string
  agent?: string
  protocolVersion?: number
}

// Notification types
export interface Notification {
  code: string
  title: string
  description: string
  severity: 'WARNING' | 'INFORMATION'
  position?: {
    offset: number
    line: number
    column: number
  }
}

// Query statistics
export interface QueryStatistics {
  containsUpdates(): boolean
  containsSystemUpdates(): boolean
  nodesCreated(): number
  nodesDeleted(): number
  relationshipsCreated(): number
  relationshipsDeleted(): number
  propertiesSet(): number
  labelsAdded(): number
  labelsRemoved(): number
  indexesAdded(): number
  indexesRemoved(): number
  constraintsAdded(): number
  constraintsRemoved(): number
  systemUpdates(): number
}

// Result summary
export interface ResultSummary {
  query: { text: string; parameters: Record<string, unknown> }
  queryType: 'r' | 'w' | 'rw' | 's'
  counters: QueryStatistics
  updateStatistics: QueryStatistics
  plan?: object
  profile?: object
  notifications: Notification[]
  server: ServerInfo
  resultAvailableAfter: number
  resultConsumedAfter: number
  database: { name: string }
}

// Record type
export interface RecordShape {
  [key: string]: unknown
}

export interface Record<T extends RecordShape = RecordShape> {
  keys: string[]
  length: number
  get<K extends keyof T>(key: K): T[K]
  get(key: string | number): unknown
  toObject(): T
  forEach(visitor: (value: unknown, key: string, record: Record<T>) => void): void
  map<R>(fn: (value: unknown, key: string, record: Record<T>) => R): R[]
  has(key: string): boolean
}
