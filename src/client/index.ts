/**
 * Neo4j HTTP Client SDK
 *
 * A Neo4j-driver compatible client that works over HTTP instead of Bolt protocol.
 * Designed for use with neo4j.do instances running on Cloudflare Workers.
 *
 * @example
 * ```typescript
 * import { createHttpClient, basicAuth } from 'neo4j.do/client'
 *
 * // Create a client
 * const client = createHttpClient(
 *   'https://my-db.neo4j.do',
 *   basicAuth('neo4j', 'password')
 * )
 *
 * // Simple query
 * const result = await client.run('MATCH (n:Person) RETURN n.name')
 *
 * // Using sessions for transaction management
 * const session = client.session()
 * try {
 *   await session.executeWrite(async (tx) => {
 *     await tx.run('CREATE (n:Person {name: $name})', { name: 'Alice' })
 *   })
 * } finally {
 *   await session.close()
 * }
 *
 * // Close the client when done
 * await client.close()
 * ```
 */

// Main client exports
export {
  Neo4jHttpClient,
  HttpSession,
  HttpTransaction,
  createHttpClient,
  basicAuth,
  bearerAuth,
  type Neo4jHttpClientConfig,
} from './neo4j-http-client'

// Low-level HTTP client (for advanced use cases)
export { HttpClient, type HttpClientConfig, type RequestOptions } from './http-client'

// HTTP Driver (alternative simplified interface)
export {
  Neo4jHttpDriver,
  HttpSession as DriverHttpSession,
  type HttpDriverConfig,
  type HttpDriverAuth,
  type DriverQueryResult,
  type DriverSessionConfig,
} from './http-driver'

// Error classes
export {
  HttpDriverError,
  DriverClosedError,
  SessionClosedError,
  TransactionStateError,
  NetworkError,
  TimeoutError,
  AuthenticationError,
  ServerError,
  TransactionNotFoundError,
  createErrorFromResponse,
} from './errors'

// Types
export type {
  AuthToken,
  SessionConfig,
  TransactionConfig,
  HttpConfig,
  ServerInfo,
  CypherResponse,
  SerializedRecord,
  QuerySummary,
  TransactionBeginResponse,
  TransactionCommitResponse,
  HttpErrorResponse,
  QueryResult,
  QueryConfig,
  AccessMode,
  ResultSummary,
  RecordShape,
} from './types'
