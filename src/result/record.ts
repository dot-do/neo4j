/**
 * Record class for neo4j.do
 * 100% API compatible with neo4j-driver Record class
 *
 * A Record represents a single row in a query result set.
 * Values can be accessed by column name or by position (0-indexed).
 */

import type { RecordShape } from '../types'

export type Visitor<R = void, T extends RecordShape = RecordShape> = (value: unknown, key: string, record: Record<T>) => R

/**
 * Represents a single row in a query result.
 * Each Record is a collection of named fields with values.
 */
export class Record<T extends RecordShape = RecordShape> implements Iterable<[string, unknown]> {
  private readonly _keys: readonly string[]
  private readonly _fields: readonly unknown[]
  private readonly _fieldLookup: Map<string, number>

  /**
   * Create a new Record.
   *
   * @param keys - Array of field/column names
   * @param fields - Array of corresponding values
   * @param fieldLookup - Optional pre-built lookup map for field name to index
   */
  constructor(
    keys: string[],
    fields: unknown[],
    fieldLookup?: Map<string, number>
  ) {
    this._keys = Object.freeze([...keys])
    this._fields = Object.freeze([...fields])

    if (fieldLookup) {
      this._fieldLookup = fieldLookup
    } else {
      this._fieldLookup = new Map()
      for (let i = 0; i < keys.length; i++) {
        this._fieldLookup.set(keys[i], i)
      }
    }
  }

  /**
   * Get the field keys (column names) in order of appearance.
   * Returns a frozen array.
   */
  get keys(): readonly string[] {
    return this._keys
  }

  /**
   * Get the number of fields in this record.
   */
  get length(): number {
    return this._fields.length
  }

  /**
   * Get a value by key (column name) or by index (0-indexed position).
   *
   * @param key - The column name or numeric index
   * @returns The value at the specified key/index
   * @throws Error if the key doesn't exist or index is out of bounds
   */
  get<K extends keyof T>(key: K): T[K]
  get(key: string | number): unknown
  get(key: string | number): unknown {
    if (typeof key === 'number') {
      return this._getByIndex(key)
    }
    return this._getByKey(key)
  }

  /**
   * Get a value by numeric index (0-indexed position).
   * @internal
   */
  private _getByIndex(index: number): unknown {
    // Validate that the index is an integer
    if (!Number.isInteger(index)) {
      throw new Error(
        `This record index must be an integer, got '${index}'`
      )
    }

    const length = this._fields.length
    if (index < 0 || index >= length) {
      const rangeMsg = length === 0
        ? 'This record is empty'
        : `Valid indices are 0..${length - 1}`
      throw new Error(
        `This record has no field with index '${index}'. ${rangeMsg}`
      )
    }
    return this._fields[index]
  }

  /**
   * Get a value by key (column name).
   * @internal
   */
  private _getByKey(key: string): unknown {
    const index = this._fieldLookup.get(key)
    if (index === undefined) {
      throw new Error(
        `This record has no field with key '${key}'. ` +
        `Available keys: [${this._keys.join(', ')}]`
      )
    }
    return this._fields[index]
  }

  /**
   * Check if this record contains a field with the given key.
   *
   * @param key - The column name to check
   * @returns true if the field exists, false otherwise
   */
  has(key: string): boolean {
    return this._fieldLookup.has(key)
  }

  /**
   * Iterate over all fields in this record.
   *
   * @param visitor - Function called for each field with (value, key, record)
   */
  forEach(visitor: Visitor<void, T>): void {
    for (let i = 0; i < this._keys.length; i++) {
      visitor(this._fields[i], this._keys[i], this)
    }
  }

  /**
   * Transform all fields using a visitor function.
   *
   * @param visitor - Function called for each field, returning the transformed value
   * @returns Array of transformed values
   */
  map<R>(visitor: Visitor<R, T>): R[] {
    const result: R[] = []
    for (let i = 0; i < this._keys.length; i++) {
      result.push(visitor(this._fields[i], this._keys[i], this))
    }
    return result
  }

  /**
   * Convert this record to a plain JavaScript object.
   *
   * @returns An object with keys as property names and fields as values
   */
  toObject(): T {
    const obj: RecordShape = {}
    for (let i = 0; i < this._keys.length; i++) {
      obj[this._keys[i]] = this._fields[i]
    }
    return obj as T
  }

  /**
   * Get all values in this record as an array.
   *
   * @returns Array of all field values in order
   */
  values(): unknown[] {
    return [...this._fields]
  }

  /**
   * Get all key-value pairs as an array of tuples.
   *
   * @returns Array of [key, value] tuples
   */
  entries(): [string, unknown][] {
    const result: [string, unknown][] = []
    for (let i = 0; i < this._keys.length; i++) {
      result.push([this._keys[i], this._fields[i]])
    }
    return result
  }

  /**
   * Make Record iterable with for...of loops.
   * Yields [key, value] tuples.
   */
  *[Symbol.iterator](): Iterator<[string, unknown]> {
    for (let i = 0; i < this._keys.length; i++) {
      yield [this._keys[i], this._fields[i]]
    }
  }
}
