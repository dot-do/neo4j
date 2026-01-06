/**
 * QueryExecutor - Extracted component for executing Cypher queries
 *
 * Responsible for:
 * - Parsing Cypher queries into AST
 * - Delegating SQL generation
 * - Executing SQL statements
 * - Formatting results
 *
 * This separation allows:
 * - Independent testing of query execution logic
 * - Mock injection for unit tests
 * - Clean separation from HTTP handling
 */

import type { Query } from '../cypher/ast/types'

/**
 * Query result returned by QueryExecutor
 */
export interface QueryResult {
  records: Record<string, unknown>[]
  summary: QuerySummary
}

/**
 * Query execution summary with counters
 */
export interface QuerySummary {
  counters: QueryCounters
}

/**
 * Query counters for tracking changes
 */
export interface QueryCounters {
  nodesCreated: number
  nodesDeleted: number
  relationshipsCreated: number
  relationshipsDeleted: number
  propertiesSet: number
  labelsAdded: number
  labelsRemoved: number
}

/**
 * Interface for parsing Cypher queries into AST
 * Separates parsing concerns from execution
 */
export interface QueryParser {
  parse(query: string): Query
}

/**
 * SQL statement with parameters
 */
export interface SqlStatement {
  sql: string
  params: unknown[]
}

/**
 * Interface for generating SQL from Cypher AST
 * Separates SQL generation from actual database execution
 */
export interface SqlGenerator {
  generate(ast: Query, params: Record<string, unknown>): SqlStatement[]
}

/**
 * Result from SQL execution
 */
export interface ExecutionResult {
  rows: unknown[]
  changes: QueryCounters
}

/**
 * Interface for executing SQL statements
 * Separates execution from generation
 */
export interface SqlExecutor {
  execute(statements: SqlStatement[]): ExecutionResult
}

/**
 * Transaction state
 */
export interface Transaction {
  id: string
  createdAt: number
  timeout: number
}

/**
 * Interface for managing transactions
 * Separates transaction logic from query execution
 */
export interface TransactionManager {
  begin(): Promise<string>
  commit(transactionId: string): Promise<void>
  rollback(transactionId: string): Promise<void>
  getTransaction(transactionId: string): Transaction | undefined
  isExpired(transactionId: string): boolean
}

/**
 * QueryExecutor interface for executing Cypher queries
 */
export interface IQueryExecutor {
  execute(
    query: string,
    params: Record<string, unknown>,
    transactionId?: string
  ): Promise<QueryResult>
}

/**
 * Configuration for creating a QueryExecutor
 */
export interface QueryExecutorConfig {
  parser: QueryParser
  sqlGenerator: SqlGenerator
  sqlExecutor: SqlExecutor
  transactionManager?: TransactionManager
}

/**
 * Default empty counters
 */
function emptyCounters(): QueryCounters {
  return {
    nodesCreated: 0,
    nodesDeleted: 0,
    relationshipsCreated: 0,
    relationshipsDeleted: 0,
    propertiesSet: 0,
    labelsAdded: 0,
    labelsRemoved: 0,
  }
}

/**
 * QueryExecutor class that composes parsing, generation, and execution
 *
 * Usage:
 * ```typescript
 * const executor = new QueryExecutor({
 *   parser,
 *   sqlGenerator,
 *   sqlExecutor,
 *   transactionManager, // optional
 * })
 *
 * const result = await executor.execute('MATCH (n:Person) RETURN n', {})
 * ```
 */
export class QueryExecutor implements IQueryExecutor {
  private readonly parser: QueryParser
  private readonly sqlGenerator: SqlGenerator
  private readonly sqlExecutor: SqlExecutor
  private readonly transactionManager?: TransactionManager

  constructor(config: QueryExecutorConfig) {
    this.parser = config.parser
    this.sqlGenerator = config.sqlGenerator
    this.sqlExecutor = config.sqlExecutor
    this.transactionManager = config.transactionManager
  }

  /**
   * Execute a Cypher query
   *
   * @param query - The Cypher query string
   * @param params - Parameters for the query
   * @param transactionId - Optional transaction ID for transactional execution
   * @returns QueryResult with records and summary
   */
  async execute(
    query: string,
    params: Record<string, unknown>,
    transactionId?: string
  ): Promise<QueryResult> {
    // Check transaction validity if provided
    if (transactionId && this.transactionManager) {
      if (this.transactionManager.isExpired(transactionId)) {
        throw new Error('Transaction expired')
      }
      const tx = this.transactionManager.getTransaction(transactionId)
      if (!tx) {
        throw new Error('Invalid transaction')
      }
    }

    // Parse the Cypher query into AST
    const ast = this.parser.parse(query)

    // Generate SQL statements from AST
    const statements = this.sqlGenerator.generate(ast, params)

    // Execute SQL statements
    const result = this.sqlExecutor.execute(statements)

    // Return formatted result
    return {
      records: result.rows as Record<string, unknown>[],
      summary: {
        counters: result.changes || emptyCounters(),
      },
    }
  }
}

/**
 * Factory function to create a QueryExecutor
 *
 * @param config - Configuration with parser, generator, executor, and optional transaction manager
 * @returns A new QueryExecutor instance
 */
export function createQueryExecutor(config: QueryExecutorConfig): IQueryExecutor {
  return new QueryExecutor(config)
}
