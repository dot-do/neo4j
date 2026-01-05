/**
 * Result class for neo4j.do
 * 100% API compatible with neo4j-driver Result class
 *
 * Supports both eager (buffered) and lazy (streaming) modes:
 * - Eager mode: All records are buffered immediately
 * - Lazy mode: Records are fetched on-demand via async iteration
 */

import { Record } from './record'
import { ResultSummary, ResultSummaryMetadata } from './result-summary'

/**
 * Observer interface for subscribing to result events
 */
export interface ResultObserver<T = any> {
  onKeys?: (keys: string[]) => void
  onNext?: (record: Record) => void
  onCompleted?: (summary: ResultSummary) => void
  onError?: (error: Error) => void
}

/**
 * Options for creating a Result
 */
export interface ResultOptions {
  /**
   * When true, result operates in lazy mode (streaming)
   * When false or omitted, result operates in eager mode (buffered)
   */
  lazy?: boolean
}

/**
 * Internal state for lazy results
 */
type ResultState = 'pending' | 'streaming' | 'completed' | 'error'

/**
 * Represents the result of running a Cypher query.
 *
 * A Result can be consumed in several ways:
 * - Using async iteration: `for await (const record of result) { ... }`
 * - Using records property: `const records = await result.records`
 * - Using subscribe(): `result.subscribe({ onNext: (record) => ... })`
 */
export class Result<T extends Record<string, any> = Record<string, any>> implements AsyncIterable<Record> {
  private _keys: string[] | null = null
  private _records: Record[] = []
  private _summary: ResultSummary | null = null
  private _error: Error | null = null
  private _state: ResultState = 'pending'
  private _queryText: string
  private _parameters: Record<string, unknown>
  private _lazy: boolean

  // Promise-based resolution for async methods
  private _keysPromise: Promise<string[]>
  private _resolveKeys!: (keys: string[]) => void
  private _rejectKeys!: (error: Error) => void

  private _completionPromise: Promise<void>
  private _resolveCompletion!: () => void
  private _rejectCompletion!: (error: Error) => void

  // For lazy streaming iteration
  private _recordQueue: Record[] = []
  private _recordWaiters: Array<{
    resolve: (result: IteratorResult<Record>) => void
    reject: (error: Error) => void
  }> = []
  private _streamEnded = false

  constructor(
    queryText: string,
    parameters: Record<string, unknown> = {},
    options: ResultOptions = {}
  ) {
    this._queryText = queryText
    this._parameters = parameters
    this._lazy = options.lazy ?? false

    // Initialize keys promise with no-op catch to prevent unhandled rejection
    this._keysPromise = new Promise((resolve, reject) => {
      this._resolveKeys = resolve
      this._rejectKeys = reject
    })
    // Prevent unhandled rejection - errors will be thrown when awaited
    this._keysPromise.catch(() => {})

    // Initialize completion promise with no-op catch to prevent unhandled rejection
    this._completionPromise = new Promise((resolve, reject) => {
      this._resolveCompletion = resolve
      this._rejectCompletion = reject
    })
    // Prevent unhandled rejection - errors will be thrown when awaited
    this._completionPromise.catch(() => {})
  }

  /**
   * Returns a promise that resolves to the column names (keys) of this result.
   * This will wait until keys are available from the database.
   */
  keys(): Promise<string[]> {
    return this._keysPromise
  }

  /**
   * Property that returns a promise resolving to all records.
   * In eager mode, waits for all records to be buffered.
   * In lazy mode, consumes the entire stream and buffers all records.
   */
  get records(): Promise<Record[]> {
    return this._completionPromise.then(() => {
      if (this._error) throw this._error
      return [...this._records]
    })
  }

  /**
   * Returns a single record from the result.
   * Throws an error if there is not exactly one record.
   */
  async single(): Promise<Record> {
    const records = await this.records
    if (records.length === 0) {
      throw new Error('Expected exactly one record, but got none')
    }
    if (records.length > 1) {
      throw new Error(`Expected exactly one record, but got ${records.length}`)
    }
    return records[0]
  }

  /**
   * Returns the first record without consuming the result.
   * Returns null if no records are available.
   */
  async peek(): Promise<Record | null> {
    // In eager mode, wait for completion
    if (!this._lazy) {
      await this._completionPromise
      if (this._error) throw this._error
      return this._records[0] ?? null
    }

    // In lazy mode, peek at buffered records or wait for first one
    if (this._records.length > 0) {
      return this._records[0]
    }

    // If stream not started, wait for first record
    if (this._state === 'pending') {
      await this._keysPromise
    }

    if (this._recordQueue.length > 0) {
      return this._recordQueue[0]
    }

    if (this._streamEnded) {
      return this._records[0] ?? null
    }

    // Wait for first record in lazy mode
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (result: IteratorResult<Record>) => {
          if (result.done) {
            resolve(null)
          } else {
            // Put record back for actual consumption
            this._recordQueue.unshift(result.value)
            resolve(result.value)
          }
        },
        reject
      }
      this._recordWaiters.push(waiter)
    })
  }

  /**
   * Returns the result summary.
   * Waits for the query to complete.
   */
  async summary(): Promise<ResultSummary> {
    await this._completionPromise
    if (this._error) throw this._error

    if (!this._summary) {
      // Create default summary if none was set
      this._summary = this._createDefaultSummary()
    }
    return this._summary
  }

  /**
   * Consumes the entire result and returns the summary.
   * After calling consume(), no more records can be retrieved.
   */
  async consume(): Promise<ResultSummary> {
    return this.summary()
  }

  /**
   * Returns the first record or null if no records exist.
   */
  async first(): Promise<Record | null> {
    const records = await this.records
    return records[0] ?? null
  }

  /**
   * Subscribe to result events.
   * Callbacks are invoked as data becomes available.
   */
  subscribe(observer: ResultObserver): void {
    // Handle keys
    this._keysPromise
      .then(keys => {
        if (observer.onKeys) {
          observer.onKeys(keys)
        }
      })
      .catch(error => {
        if (observer.onError) {
          observer.onError(error)
        }
      })

    // Handle records and completion
    this._completionPromise
      .then(() => {
        if (this._error) {
          if (observer.onError) {
            observer.onError(this._error)
          }
          return
        }

        // Emit all records
        if (observer.onNext) {
          for (const record of this._records) {
            observer.onNext(record)
          }
        }

        // Emit completion
        if (observer.onCompleted) {
          const summary = this._summary || this._createDefaultSummary()
          observer.onCompleted(summary)
        }
      })
      .catch(error => {
        if (observer.onError) {
          observer.onError(error)
        }
      })
  }

  /**
   * Async iterator support for `for await...of` loops.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<Record, void, undefined> {
    if (!this._lazy) {
      // Eager mode: wait for all records and iterate
      await this._completionPromise
      if (this._error) throw this._error
      for (const record of this._records) {
        yield record
      }
    } else {
      // Lazy mode: stream records as they arrive
      while (true) {
        // Check for queued records first
        if (this._recordQueue.length > 0) {
          const record = this._recordQueue.shift()!
          this._records.push(record) // Buffer for later access
          yield record
          continue
        }

        // Check if stream has ended
        if (this._streamEnded) {
          break
        }

        // Wait for next record
        const result = await new Promise<IteratorResult<Record>>((resolve, reject) => {
          this._recordWaiters.push({ resolve, reject })
        })

        if (result.done) {
          break
        }

        this._records.push(result.value) // Buffer for later access
        yield result.value
      }

      if (this._error) throw this._error
    }
  }

  // ==================
  // Internal methods for populating the result
  // ==================

  /**
   * @internal Set the column names/keys for this result
   */
  _setKeys(keys: string[]): void {
    this._keys = keys
    this._state = 'streaming'
    this._resolveKeys(keys)
  }

  /**
   * @internal Add a record to the result
   */
  _pushRecord(record: Record): void {
    if (this._lazy) {
      // In lazy mode, queue records for streaming
      const waiter = this._recordWaiters.shift()
      if (waiter) {
        waiter.resolve({ value: record, done: false })
      } else {
        this._recordQueue.push(record)
      }
    } else {
      // In eager mode, buffer records
      this._records.push(record)
    }
  }

  /**
   * @internal Set the result summary and mark as complete
   */
  _setSummary(summary: ResultSummary): void {
    this._summary = summary
    this._state = 'completed'
    this._streamEnded = true

    // Notify any waiting iterators that stream has ended
    while (this._recordWaiters.length > 0) {
      const waiter = this._recordWaiters.shift()!
      waiter.resolve({ value: undefined as any, done: true })
    }

    this._resolveCompletion()
  }

  /**
   * @internal Set an error on the result
   */
  _setError(error: Error): void {
    this._error = error
    this._state = 'error'
    this._streamEnded = true

    // Reject all pending promises
    this._rejectKeys(error)
    this._rejectCompletion(error)

    // Notify any waiting iterators
    while (this._recordWaiters.length > 0) {
      const waiter = this._recordWaiters.shift()!
      waiter.reject(error)
    }
  }

  /**
   * @internal Complete the result without a summary
   */
  _complete(): void {
    this._state = 'completed'
    this._streamEnded = true

    // Notify any waiting iterators that stream has ended
    while (this._recordWaiters.length > 0) {
      const waiter = this._recordWaiters.shift()!
      waiter.resolve({ value: undefined as any, done: true })
    }

    this._resolveCompletion()
  }

  /**
   * Create a default summary when none is provided
   */
  private _createDefaultSummary(): ResultSummary {
    return new ResultSummary(
      this._queryText,
      this._parameters,
      {
        type: 'r',
        stats: {},
        server: { address: 'neo4j.do', version: 'neo4j.do/1.0.0' },
        resultAvailableAfter: 0,
        resultConsumedAfter: 0,
        db: { name: 'neo4j' }
      }
    )
  }

  // ==================
  // Static factory methods
  // ==================

  /**
   * Create an eager (buffered) Result from records
   */
  static fromRecords(
    keys: string[],
    records: Array<any[]>,
    queryText: string = '',
    parameters: Record<string, unknown> = {},
    summaryMetadata?: ResultSummaryMetadata
  ): Result {
    const result = new Result(queryText, parameters, { lazy: false })

    result._setKeys(keys)

    for (const values of records) {
      result._pushRecord(new Record(keys, values))
    }

    const summary = new ResultSummary(
      queryText,
      parameters,
      summaryMetadata ?? { type: 'r' }
    )
    result._setSummary(summary)

    return result
  }

  /**
   * Create an empty Result
   */
  static empty(
    queryText: string = '',
    parameters: Record<string, unknown> = {}
  ): Result {
    return Result.fromRecords([], [], queryText, parameters)
  }
}
