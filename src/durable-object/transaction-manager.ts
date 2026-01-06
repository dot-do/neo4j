/**
 * TransactionManager - Manages transaction lifecycle for the graph database
 *
 * Handles:
 * - Transaction creation with configurable timeout
 * - Transaction commit semantics
 * - Transaction rollback semantics
 * - Transaction timeout handling
 * - Transaction state machine
 */

/**
 * Transaction options for begin()
 */
export interface TransactionOptions {
  /** Transaction timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Optional metadata to attach to the transaction */
  metadata?: Record<string, unknown>
}

/**
 * Transaction state enum
 */
export type TransactionState = 'active' | 'committed' | 'rolled_back' | 'expired'

/**
 * Transaction metadata
 */
export interface TransactionMetadata {
  id: string
  state: TransactionState
  createdAt: number
  timeout: number
  expiresAt: number
  metadata?: Record<string, unknown>
}

/**
 * Internal transaction record
 */
interface TransactionRecord {
  state: TransactionState
  createdAt: number
  timeout: number
  metadata?: Record<string, unknown>
  work: Array<() => Promise<void>>
}

/**
 * TransactionManager handles all transaction lifecycle operations
 */
export class TransactionManager {
  private transactions: Map<string, TransactionRecord> = new Map()

  /**
   * Begin a new transaction
   * @param options Optional configuration for the transaction
   * @returns The transaction ID
   */
  begin(options?: TransactionOptions): string {
    const txId = crypto.randomUUID()
    const timeout = options?.timeout ?? 30000
    this.transactions.set(txId, {
      state: 'active',
      createdAt: Date.now(),
      timeout,
      metadata: options?.metadata,
      work: []
    })
    return txId
  }

  /**
   * Commit a transaction, persisting all changes
   * @param txId The transaction ID to commit
   * @throws Error if transaction is invalid, expired, or already finalized
   */
  async commit(txId: string): Promise<void> {
    const tx = this.transactions.get(txId)
    if (!tx) {
      throw new Error('Transaction not found')
    }
    if (tx.state !== 'active') {
      throw new Error(`Cannot commit transaction in state: ${tx.state}`)
    }
    if (Date.now() > tx.createdAt + tx.timeout) {
      tx.state = 'expired'
      throw new Error('Transaction has expired')
    }
    // Execute all pending work
    for (const work of tx.work) {
      await work()
    }
    tx.state = 'committed'
  }

  /**
   * Rollback a transaction, discarding all changes
   * @param txId The transaction ID to rollback
   * @throws Error if transaction is invalid or already finalized
   */
  async rollback(txId: string): Promise<void> {
    const tx = this.transactions.get(txId)
    if (!tx) {
      throw new Error('Transaction not found')
    }
    if (tx.state !== 'active') {
      throw new Error(`Cannot rollback transaction in state: ${tx.state}`)
    }
    tx.state = 'rolled_back'
  }

  /**
   * Execute work within a transaction context
   * @param txId The transaction ID
   * @param work The work function to execute
   * @returns The result of the work function
   * @throws Error if transaction is invalid, expired, or not active
   */
  async execute<T>(txId: string, work: () => Promise<T>): Promise<T> {
    const tx = this.transactions.get(txId)
    if (!tx) {
      throw new Error('Transaction not found')
    }
    if (tx.state !== 'active') {
      throw new Error(`Cannot execute in transaction with state: ${tx.state}`)
    }
    if (Date.now() > tx.createdAt + tx.timeout) {
      tx.state = 'expired'
      throw new Error('Transaction has expired')
    }
    return work()
  }

  /**
   * Get the current state of a transaction
   * @param txId The transaction ID
   * @returns The transaction state, or undefined if transaction doesn't exist
   */
  getState(txId: string): TransactionState | undefined {
    const tx = this.transactions.get(txId)
    if (!tx) return undefined
    // Check for expiration
    if (tx.state === 'active' && Date.now() > tx.createdAt + tx.timeout) {
      tx.state = 'expired'
    }
    return tx.state
  }

  /**
   * Check if a transaction exists and is active
   * @param txId The transaction ID
   * @returns true if transaction exists and is active
   */
  isActive(txId: string): boolean {
    return this.getState(txId) === 'active'
  }

  /**
   * Get transaction metadata
   * @param txId The transaction ID
   * @returns Transaction metadata or undefined
   */
  getMetadata(txId: string): TransactionMetadata | undefined {
    const tx = this.transactions.get(txId)
    if (!tx) return undefined
    return {
      id: txId,
      state: this.getState(txId)!,
      createdAt: tx.createdAt,
      timeout: tx.timeout,
      expiresAt: tx.createdAt + tx.timeout,
      metadata: tx.metadata
    }
  }

  /**
   * Clean up expired transactions
   * @returns Number of transactions cleaned up
   */
  cleanupExpired(): number {
    const now = Date.now()
    let cleaned = 0
    for (const [txId, tx] of this.transactions) {
      if (tx.state === 'active' && now > tx.createdAt + tx.timeout) {
        tx.state = 'expired'
        this.transactions.delete(txId)
        cleaned++
      } else if (tx.state === 'committed' || tx.state === 'rolled_back' || tx.state === 'expired') {
        this.transactions.delete(txId)
        cleaned++
      }
    }
    return cleaned
  }
}
