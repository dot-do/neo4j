/**
 * Neo4j Record Implementation
 * Represents a single record (row) from a query result
 */

import type { Record as Neo4jRecord, RecordShape } from '../types'

/**
 * Record class - represents a single record from query results
 */
export class Record<T extends RecordShape = RecordShape> implements Neo4jRecord<T> {
  readonly keys: string[]
  readonly length: number
  private _values: unknown[]
  private _fieldLookup: Map<string, number>

  constructor(keys: string[], values: unknown[]) {
    if (keys.length !== values.length) {
      throw new Error(
        `Record keys/values length mismatch: ${keys.length} keys, ${values.length} values`
      )
    }

    this.keys = keys
    this._values = values
    this.length = keys.length

    // Build lookup map for O(1) field access
    this._fieldLookup = new Map()
    for (let i = 0; i < keys.length; i++) {
      this._fieldLookup.set(keys[i], i)
    }
  }

  /**
   * Get value by key name or index
   */
  get<K extends keyof T>(key: K): T[K]
  get(key: string | number): unknown
  get(key: string | number): unknown {
    if (typeof key === 'number') {
      if (key < 0 || key >= this.length) {
        throw new Error(
          `Index out of bounds: ${key} (record has ${this.length} fields)`
        )
      }
      return this._values[key]
    }

    const index = this._fieldLookup.get(key)
    if (index === undefined) {
      throw new Error(
        `No field "${key}" in record. Available fields: ${this.keys.join(', ')}`
      )
    }
    return this._values[index]
  }

  /**
   * Check if a field exists
   */
  has(key: string): boolean {
    return this._fieldLookup.has(key)
  }

  /**
   * Convert record to plain object
   */
  toObject(): T {
    const obj: RecordShape = {}
    for (let i = 0; i < this.keys.length; i++) {
      obj[this.keys[i]] = this._values[i]
    }
    return obj as T
  }

  /**
   * Iterate over each field
   */
  forEach(visitor: (value: unknown, key: string, record: Neo4jRecord<T>) => void): void {
    for (let i = 0; i < this.keys.length; i++) {
      visitor(this._values[i], this.keys[i], this)
    }
  }

  /**
   * Map over each field
   */
  map<R>(fn: (value: unknown, key: string, record: Neo4jRecord<T>) => R): R[] {
    const result: R[] = []
    for (let i = 0; i < this.keys.length; i++) {
      result.push(fn(this._values[i], this.keys[i], this))
    }
    return result
  }

  /**
   * Get values array
   */
  values(): unknown[] {
    return [...this._values]
  }

  /**
   * Get entries as [key, value] pairs
   */
  entries(): [string, unknown][] {
    return this.keys.map((key, i) => [key, this._values[i]])
  }
}
