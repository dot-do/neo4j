/**
 * Neo4j Query Result
 * Represents the result of running a Cypher query
 */

import type {
  Record as Neo4jRecord,
  ResultSummary,
  RecordShape
} from '../types'

/**
 * Result class - represents the result of a Cypher query execution
 */
export class Result<T extends RecordShape = RecordShape> {
  private _keys: string[] = []
  private _records: Neo4jRecord<T>[] = []
  private _summary: ResultSummary | null = null
  private _consumed = false
  private _queryText: string
  private _parameters: Record<string, unknown>

  constructor(
    queryText: string,
    parameters: Record<string, unknown> = {}
  ) {
    this._queryText = queryText
    this._parameters = parameters
  }

  /**
   * Get the keys (field names) for this result
   */
  keys(): Promise<string[]> {
    return Promise.resolve(this._keys)
  }

  /**
   * Returns a promise that resolves to the array of records
   */
  async records(): Promise<Neo4jRecord<T>[]> {
    return this._records
  }

  /**
   * Returns the result summary
   */
  async summary(): Promise<ResultSummary> {
    if (!this._summary) {
      this._summary = this._createDefaultSummary()
    }
    return this._summary
  }

  /**
   * Consume the result - returns summary after fully consuming all records
   */
  async consume(): Promise<ResultSummary> {
    this._consumed = true
    return this.summary()
  }

  /**
   * Peek at the first record without consuming
   */
  async peek(): Promise<Neo4jRecord<T> | null> {
    return this._records[0] || null
  }

  /**
   * Subscribe to records as they arrive
   */
  subscribe(observer: {
    onKeys?: (keys: string[]) => void
    onNext?: (record: Neo4jRecord<T>) => void
    onCompleted?: (summary: ResultSummary) => void
    onError?: (error: Error) => void
  }): void {
    try {
      if (observer.onKeys) {
        observer.onKeys(this._keys)
      }

      for (const record of this._records) {
        if (observer.onNext) {
          observer.onNext(record)
        }
      }

      if (observer.onCompleted) {
        observer.onCompleted(this._summary || this._createDefaultSummary())
      }
    } catch (error) {
      if (observer.onError) {
        observer.onError(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  /**
   * Iterate over records
   */
  [Symbol.asyncIterator](): AsyncIterator<Neo4jRecord<T>> {
    let index = 0
    const records = this._records

    return {
      async next(): Promise<IteratorResult<Neo4jRecord<T>>> {
        if (index < records.length) {
          return { value: records[index++], done: false }
        }
        return { value: undefined, done: true }
      }
    }
  }

  // Internal methods for populating results
  _setKeys(keys: string[]): void {
    this._keys = keys
  }

  _addRecord(record: Neo4jRecord<T>): void {
    this._records.push(record)
  }

  _setSummary(summary: ResultSummary): void {
    this._summary = summary
  }

  private _createDefaultSummary(): ResultSummary {
    return {
      query: { text: this._queryText, parameters: this._parameters },
      queryType: 'r',
      counters: this._createDefaultQueryStatistics(),
      updateStatistics: this._createDefaultQueryStatistics(),
      notifications: [],
      server: { address: 'localhost:7687' },
      resultAvailableAfter: 0,
      resultConsumedAfter: 0,
      database: { name: 'neo4j' }
    }
  }

  private _createDefaultQueryStatistics() {
    return {
      containsUpdates: () => false,
      containsSystemUpdates: () => false,
      nodesCreated: () => 0,
      nodesDeleted: () => 0,
      relationshipsCreated: () => 0,
      relationshipsDeleted: () => 0,
      propertiesSet: () => 0,
      labelsAdded: () => 0,
      labelsRemoved: () => 0,
      indexesAdded: () => 0,
      indexesRemoved: () => 0,
      constraintsAdded: () => 0,
      constraintsRemoved: () => 0,
      systemUpdates: () => 0
    }
  }
}
