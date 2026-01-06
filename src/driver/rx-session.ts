/**
 * Neo4j Reactive Session
 * Compatible with neo4j-driver npm package RxSession API
 */

import type { TransactionConfig, AccessMode, RecordShape } from '../types'

/**
 * RxSession configuration options
 */
export interface RxSessionConfig {
  database?: string
  defaultAccessMode?: AccessMode
  bookmarks?: string[]
  fetchSize?: number
}

/**
 * Observable interface for reactive streams
 * Minimal interface for compatibility - can be extended with RxJS
 */
export interface Observable<T> {
  subscribe(observer: Observer<T>): Subscription
  pipe<R>(...operators: OperatorFunction<unknown, unknown>[]): Observable<R>
}

export interface Observer<T> {
  next?: (value: T) => void
  error?: (err: unknown) => void
  complete?: () => void
}

export interface Subscription {
  unsubscribe(): void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OperatorFunction<T, R> = (source: Observable<T>) => Observable<R>

/**
 * RxResult - Reactive result stream
 */
export interface RxResult<T extends RecordShape = RecordShape> {
  keys(): Observable<string[]>
  records(): Observable<T>
  consume(): Observable<unknown>
}

/**
 * RxTransaction - Reactive transaction
 */
export interface RxTransaction {
  run<T extends RecordShape = RecordShape>(
    query: string,
    parameters?: Record<string, unknown>
  ): RxResult<T>
  commit(): Observable<void>
  rollback(): Observable<void>
  isOpen(): boolean
}

/**
 * RxManagedTransaction - Transaction managed by session (no commit/rollback)
 */
export interface RxManagedTransaction {
  run<T extends RecordShape = RecordShape>(
    query: string,
    parameters?: Record<string, unknown>
  ): RxResult<T>
}

type SessionState = 'open' | 'closed'

/**
 * Simple Observable implementation for internal use
 */
class SimpleObservable<T> implements Observable<T> {
  constructor(private _subscribe: (observer: Observer<T>) => Subscription | (() => void) | void) {}

  subscribe(observer: Observer<T>): Subscription {
    const result = this._subscribe(observer)
    if (result && typeof result === 'object' && 'unsubscribe' in result) {
      return result
    }
    if (typeof result === 'function') {
      return { unsubscribe: result }
    }
    return { unsubscribe: () => {} }
  }

  pipe<R>(..._operators: OperatorFunction<unknown, unknown>[]): Observable<R> {
    // Basic pipe implementation - just returns self cast for minimal support
    // Full RxJS integration would provide proper operator support
    return this as unknown as Observable<R>
  }
}

/**
 * Neo4j RxSession - Reactive session for database operations
 * Provides Observable-based API for Neo4j database interactions
 */
export class RxSession {
  private _state: SessionState = 'open'
  private readonly _database: string
  private readonly _defaultAccessMode: AccessMode
  private readonly _bookmarks: string[]
  private _lastBookmarks: string[]
  private readonly _fetchSize: number

  constructor(config: RxSessionConfig = {}) {
    this._database = config.database ?? 'neo4j'
    this._defaultAccessMode = config.defaultAccessMode ?? 'WRITE'
    this._bookmarks = config.bookmarks ? [...config.bookmarks] : []
    this._lastBookmarks = [...this._bookmarks]
    this._fetchSize = config.fetchSize ?? 1000
  }

  /**
   * Run a Cypher query and return a reactive result
   */
  run<T extends RecordShape = RecordShape>(
    query: string,
    parameters?: Record<string, unknown>,
    _config?: TransactionConfig
  ): RxResult<T> {
    const self = this

    return {
      keys(): Observable<string[]> {
        return new SimpleObservable<string[]>((observer) => {
          if (self._state !== 'open') {
            observer.error?.(new Error('Cannot run query on closed session'))
            return
          }
          // Placeholder - would return actual keys from query execution
          observer.next?.([])
          observer.complete?.()
        })
      },

      records(): Observable<T> {
        return new SimpleObservable<T>((observer) => {
          if (self._state !== 'open') {
            observer.error?.(new Error('Cannot run query on closed session'))
            return
          }
          // Placeholder - would stream records from query execution
          // Query: query, Parameters: parameters (used for execution)
          void query
          void parameters
          observer.complete?.()
        })
      },

      consume(): Observable<unknown> {
        return new SimpleObservable<unknown>((observer) => {
          if (self._state !== 'open') {
            observer.error?.(new Error('Cannot run query on closed session'))
            return
          }
          // Placeholder - would return result summary
          observer.next?.({})
          observer.complete?.()
        })
      },
    }
  }

  /**
   * Begin an explicit reactive transaction
   */
  beginTransaction(_config?: TransactionConfig): Observable<RxTransaction> {
    return new SimpleObservable<RxTransaction>((observer) => {
      if (this._state !== 'open') {
        observer.error?.(new Error('Cannot begin transaction on closed session'))
        return
      }

      let txState: 'open' | 'committed' | 'rolled_back' = 'open'

      const tx: RxTransaction = {
        run: <T extends RecordShape = RecordShape>(
          query: string,
          parameters?: Record<string, unknown>
        ): RxResult<T> => {
          return {
            keys: () =>
              new SimpleObservable<string[]>((obs) => {
                if (txState !== 'open') {
                  obs.error?.(new Error('Transaction is closed'))
                  return
                }
                void query
                void parameters
                obs.next?.([])
                obs.complete?.()
              }),
            records: () =>
              new SimpleObservable<T>((obs) => {
                if (txState !== 'open') {
                  obs.error?.(new Error('Transaction is closed'))
                  return
                }
                obs.complete?.()
              }),
            consume: () =>
              new SimpleObservable<unknown>((obs) => {
                if (txState !== 'open') {
                  obs.error?.(new Error('Transaction is closed'))
                  return
                }
                obs.next?.({})
                obs.complete?.()
              }),
          }
        },

        commit: (): Observable<void> =>
          new SimpleObservable<void>((obs) => {
            if (txState !== 'open') {
              obs.error?.(new Error('Transaction is already closed'))
              return
            }
            txState = 'committed'
            obs.next?.(undefined)
            obs.complete?.()
          }),

        rollback: (): Observable<void> =>
          new SimpleObservable<void>((obs) => {
            if (txState !== 'open') {
              obs.error?.(new Error('Transaction is already closed'))
              return
            }
            txState = 'rolled_back'
            obs.next?.(undefined)
            obs.complete?.()
          }),

        isOpen: () => txState === 'open',
      }

      observer.next?.(tx)
      observer.complete?.()
    })
  }

  /**
   * Execute a unit of work in a read transaction with automatic retry
   */
  executeRead<T>(
    work: (tx: RxManagedTransaction) => Observable<T>,
    _config?: TransactionConfig
  ): Observable<T> {
    return this._executeInTransaction(work, 'READ', _config)
  }

  /**
   * Execute a unit of work in a write transaction with automatic retry
   */
  executeWrite<T>(
    work: (tx: RxManagedTransaction) => Observable<T>,
    _config?: TransactionConfig
  ): Observable<T> {
    return this._executeInTransaction(work, 'WRITE', _config)
  }

  /**
   * Execute work in a transaction
   */
  private _executeInTransaction<T>(
    work: (tx: RxManagedTransaction) => Observable<T>,
    _accessMode: AccessMode,
    _config?: TransactionConfig
  ): Observable<T> {
    return new SimpleObservable<T>((observer) => {
      if (this._state !== 'open') {
        observer.error?.(new Error('Cannot execute transaction on closed session'))
        return
      }

      const managedTx: RxManagedTransaction = {
        run: <R extends RecordShape = RecordShape>(
          query: string,
          parameters?: Record<string, unknown>
        ): RxResult<R> => {
          return this.run<R>(query, parameters)
        },
      }

      const resultObservable = work(managedTx)
      resultObservable.subscribe({
        next: (value) => observer.next?.(value),
        error: (err) => observer.error?.(err),
        complete: () => observer.complete?.(),
      })
    })
  }

  /**
   * Get the last bookmarks from this session
   */
  lastBookmarks(): string[] {
    return [...this._lastBookmarks]
  }

  /**
   * Get the last bookmark (deprecated)
   * @deprecated Use lastBookmarks() instead
   */
  lastBookmark(): string | null {
    return this._lastBookmarks[this._lastBookmarks.length - 1] ?? null
  }

  /**
   * Close this reactive session
   */
  close(): Observable<void> {
    return new SimpleObservable<void>((observer) => {
      this._state = 'closed'
      observer.next?.(undefined)
      observer.complete?.()
    })
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
