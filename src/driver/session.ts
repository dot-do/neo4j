/**
 * Neo4j Session
 * Compatible with neo4j-driver npm package
 */

import { Result, Record } from '../result'
import { Transaction, ManagedTransaction } from './transaction'
import type {
  SessionConfig,
  TransactionConfig,
  AccessMode,
  RecordShape,
  ResultSummary,
} from '../types'

const DEFAULT_MAX_TRANSACTION_RETRY_TIME = 30000 // 30 seconds

type SessionState = 'open' | 'closed'

/**
 * Internal query executor type
 */
export type QueryExecutor = (
  query: string,
  parameters?: Record<string, unknown>,
  config?: TransactionConfig
) => Promise<{ keys: string[]; records: unknown[][]; summary: ResultSummary }>

/**
 * Internal transaction functions type
 */
export interface TransactionFunctions {
  begin: (
    database: string,
    bookmarks: string[],
    config: TransactionConfig
  ) => Promise<{
    executeQuery: QueryExecutor
    commit: () => Promise<string | null>
    rollback: () => Promise<void>
  }>
}

/**
 * Session close callback type
 */
export type SessionCloseCallback = () => void

/**
 * Neo4j Session - represents a logical connection to the database
 */
export class Session {
  private _state: SessionState = 'open'
  private readonly _database: string
  private readonly _defaultAccessMode: AccessMode
  private readonly _bookmarks: string[]
  private _lastBookmarks: string[]
  private readonly _fetchSize: number
  private readonly _impersonatedUser?: string
  private readonly _maxTransactionRetryTime: number
  private readonly _executeQuery: QueryExecutor
  private readonly _transactionFunctions: TransactionFunctions
  private _currentTransaction: Transaction | null = null
  private readonly _onClose?: SessionCloseCallback

  constructor(
    config: SessionConfig,
    executeQuery: QueryExecutor,
    transactionFunctions: TransactionFunctions,
    maxTransactionRetryTime: number = DEFAULT_MAX_TRANSACTION_RETRY_TIME,
    onClose?: SessionCloseCallback
  ) {
    this._database = config.database ?? 'neo4j'
    this._defaultAccessMode = config.defaultAccessMode ?? 'WRITE'

    // Normalize bookmarks to array
    if (config.bookmarks) {
      this._bookmarks = Array.isArray(config.bookmarks)
        ? [...config.bookmarks]
        : [config.bookmarks]
    } else {
      this._bookmarks = []
    }
    this._lastBookmarks = [...this._bookmarks]

    this._fetchSize = config.fetchSize ?? 1000
    this._impersonatedUser = config.impersonatedUser
    this._maxTransactionRetryTime = maxTransactionRetryTime
    this._executeQuery = executeQuery
    this._transactionFunctions = transactionFunctions
    this._onClose = onClose
  }

  /**
   * Run a Cypher query within an auto-commit transaction
   */
  run<T extends RecordShape = RecordShape>(
    query: string,
    parameters?: Record<string, unknown>,
    config?: TransactionConfig
  ): Result<T> {
    if (this._state !== 'open') {
      const result = new Result<T>()
      result._setError(new Error('Cannot run query on closed session'))
      return result
    }

    const result = new Result<T>()

    // Execute query asynchronously
    this._executeQuery(query, parameters, config)
      .then(({ keys, records, summary }) => {
        result._setKeys(keys)
        for (const values of records) {
          result._pushRecord(new Record<T>(keys, values))
        }
        result._setSummary(summary)
      })
      .catch((error) => {
        result._setError(error instanceof Error ? error : new Error(String(error)))
      })

    return result
  }

  /**
   * Begin an explicit transaction
   */
  async beginTransaction(config?: TransactionConfig): Promise<Transaction> {
    if (this._state !== 'open') {
      throw new Error('Cannot begin transaction on closed session')
    }

    if (this._currentTransaction?.isOpen()) {
      throw new Error('A transaction is already open. Close or commit it before starting a new one.')
    }

    const { executeQuery, commit, rollback } = await this._transactionFunctions.begin(
      this._database,
      this._lastBookmarks,
      config ?? {}
    )

    this._currentTransaction = new Transaction(
      this._database,
      this._lastBookmarks,
      config ?? {},
      executeQuery,
      async () => {
        const bookmark = await commit()
        if (bookmark) {
          this._lastBookmarks = [bookmark]
        }
        return bookmark
      },
      rollback
    )

    return this._currentTransaction
  }

  /**
   * Execute a unit of work in a read transaction with automatic retry
   * @deprecated Use executeRead instead
   */
  async readTransaction<T>(
    work: (tx: Transaction) => Promise<T>,
    config?: TransactionConfig
  ): Promise<T> {
    return this._executeWithRetry(work, 'READ', config)
  }

  /**
   * Execute a unit of work in a write transaction with automatic retry
   * @deprecated Use executeWrite instead
   */
  async writeTransaction<T>(
    work: (tx: Transaction) => Promise<T>,
    config?: TransactionConfig
  ): Promise<T> {
    return this._executeWithRetry(work, 'WRITE', config)
  }

  /**
   * Execute a unit of work in a read transaction with automatic retry
   */
  async executeRead<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
    config?: TransactionConfig
  ): Promise<T> {
    return this._executeWithRetry(work, 'READ', config)
  }

  /**
   * Execute a unit of work in a write transaction with automatic retry
   */
  async executeWrite<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
    config?: TransactionConfig
  ): Promise<T> {
    return this._executeWithRetry(work, 'WRITE', config)
  }

  /**
   * Execute a unit of work with automatic retry on transient errors
   */
  private async _executeWithRetry<T>(
    work: (tx: ManagedTransaction | Transaction) => Promise<T>,
    _accessMode: AccessMode,
    config?: TransactionConfig
  ): Promise<T> {
    if (this._state !== 'open') {
      throw new Error('Cannot execute transaction on closed session')
    }

    const startTime = Date.now()
    let lastError: Error | null = null
    let retryCount = 0

    while (Date.now() - startTime < this._maxTransactionRetryTime) {
      const tx = await this.beginTransaction(config)

      try {
        const result = await work(tx)
        await tx.commit()
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // If transaction is still open, roll it back
        if (tx.isOpen()) {
          try {
            await tx.rollback()
          } catch {
            // Ignore rollback errors
          }
        }

        // Check if error is retryable
        if (!this._isRetryableError(lastError)) {
          throw lastError
        }

        // Exponential backoff with jitter
        retryCount++
        const delay = Math.min(
          1000 * Math.pow(2, retryCount - 1) + Math.random() * 1000,
          5000
        )
        await this._sleep(delay)
      }
    }

    throw lastError ?? new Error('Transaction retry timeout')
  }

  /**
   * Check if an error is retryable
   */
  private _isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    return (
      message.includes('deadlock') ||
      message.includes('transient') ||
      message.includes('temporarily unavailable') ||
      message.includes('leader switch') ||
      message.includes('connection') ||
      // Neo4j error codes for transient failures
      (error as { code?: string }).code?.startsWith('Neo.TransientError.') === true
    )
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get the last bookmark (deprecated)
   * @deprecated Use lastBookmarks() instead
   */
  lastBookmark(): string | null {
    return this._lastBookmarks[this._lastBookmarks.length - 1] ?? null
  }

  /**
   * Get the last bookmarks
   */
  lastBookmarks(): string[] {
    return [...this._lastBookmarks]
  }

  /**
   * Close this session
   */
  async close(): Promise<void> {
    if (this._state === 'closed') {
      return
    }

    // Close any open transaction
    if (this._currentTransaction?.isOpen()) {
      try {
        await this._currentTransaction.rollback()
      } catch {
        // Ignore errors when closing
      }
    }

    this._state = 'closed'

    // Notify driver that this session is closed
    if (this._onClose) {
      try {
        this._onClose()
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Get the database this session is connected to
   */
  get database(): string {
    return this._database
  }

  /**
   * Get the default access mode
   */
  get defaultAccessMode(): AccessMode {
    return this._defaultAccessMode
  }

  /**
   * Get the fetch size
   */
  get fetchSize(): number {
    return this._fetchSize
  }

  /**
   * Check if this session is closed
   */
  get closed(): boolean {
    return this._state === 'closed'
  }
}
