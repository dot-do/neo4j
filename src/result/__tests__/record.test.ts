import { describe, it, expect } from 'vitest'
import { Record } from '../record'

describe('Record', () => {
  describe('constructor', () => {
    it('should create a Record with keys and fields', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record).toBeInstanceOf(Record)
    })

    it('should accept optional fieldLookup parameter', () => {
      const fieldLookup = new Map<string, number>([['name', 0], ['age', 1]])
      const record = new Record(['name', 'age'], ['Alice', 30], fieldLookup)
      expect(record).toBeInstanceOf(Record)
    })

    it('should create an empty Record', () => {
      const record = new Record([], [])
      expect(record.length).toBe(0)
      expect(record.keys).toEqual([])
    })
  })

  describe('keys property', () => {
    it('should return the field keys', () => {
      const record = new Record(['name', 'age', 'city'], ['Alice', 30, 'NYC'])
      expect(record.keys).toEqual(['name', 'age', 'city'])
    })

    it('should return the keys in order of appearance', () => {
      const record = new Record(['z', 'a', 'm'], [1, 2, 3])
      expect(record.keys).toEqual(['z', 'a', 'm'])
    })

    it('should return a frozen array', () => {
      const record = new Record(['name'], ['Alice'])
      expect(Object.isFrozen(record.keys)).toBe(true)
    })
  })

  describe('length property', () => {
    it('should return the number of fields', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record.length).toBe(2)
    })

    it('should return 0 for empty record', () => {
      const record = new Record([], [])
      expect(record.length).toBe(0)
    })

    it('should be immutable', () => {
      const record = new Record(['name'], ['Alice'])
      expect(() => {
        // @ts-expect-error - Testing immutability
        record.length = 100
      }).toThrow()
    })
  })

  describe('get(key: string)', () => {
    it('should get value by column name', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record.get('name')).toBe('Alice')
      expect(record.get('age')).toBe(30)
    })

    it('should throw for non-existent key', () => {
      const record = new Record(['name'], ['Alice'])
      expect(() => record.get('nonexistent')).toThrow()
    })

    it('should handle null and undefined values', () => {
      const record = new Record(['a', 'b'], [null, undefined])
      expect(record.get('a')).toBeNull()
      expect(record.get('b')).toBeUndefined()
    })

    it('should throw with helpful error message listing available keys', () => {
      const record = new Record(['name', 'age', 'city'], ['Alice', 30, 'NYC'])
      expect(() => record.get('country')).toThrow("Available keys: [name, age, city]")
    })

    it('should handle keys with special characters', () => {
      const record = new Record(['user.name', 'user-age', 'user_id'], ['Alice', 30, 123])
      expect(record.get('user.name')).toBe('Alice')
      expect(record.get('user-age')).toBe(30)
      expect(record.get('user_id')).toBe(123)
    })

    it('should handle keys with spaces', () => {
      const record = new Record(['first name', 'last name'], ['Alice', 'Smith'])
      expect(record.get('first name')).toBe('Alice')
      expect(record.get('last name')).toBe('Smith')
    })

    it('should handle empty string as a key', () => {
      const record = new Record(['', 'name'], ['empty', 'Alice'])
      expect(record.get('')).toBe('empty')
    })

    it('should be case-sensitive for keys', () => {
      const record = new Record(['Name', 'NAME', 'name'], ['A', 'B', 'C'])
      expect(record.get('Name')).toBe('A')
      expect(record.get('NAME')).toBe('B')
      expect(record.get('name')).toBe('C')
    })

    it('should use pre-built fieldLookup for faster access', () => {
      const fieldLookup = new Map<string, number>([['name', 0], ['age', 1]])
      const record = new Record(['name', 'age'], ['Alice', 30], fieldLookup)
      expect(record.get('name')).toBe('Alice')
      expect(record.get('age')).toBe(30)
    })

    it('should handle numeric string keys differently from numeric indices', () => {
      const record = new Record(['0', '1', '2'], ['a', 'b', 'c'])
      // String '0' as key vs numeric 0 as index
      expect(record.get('0')).toBe('a')
      expect(record.get(0)).toBe('a')
    })
  })

  describe('get(index: number)', () => {
    it('should get value by position', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record.get(0)).toBe('Alice')
      expect(record.get(1)).toBe(30)
    })

    it('should throw for out of bounds index', () => {
      const record = new Record(['name'], ['Alice'])
      expect(() => record.get(5)).toThrow()
    })

    it('should throw for negative index', () => {
      const record = new Record(['name'], ['Alice'])
      expect(() => record.get(-1)).toThrow()
    })

    it('should get value at index 0 for single-field record', () => {
      const record = new Record(['only'], ['value'])
      expect(record.get(0)).toBe('value')
    })

    it('should get value at last index for multi-field record', () => {
      const record = new Record(['a', 'b', 'c', 'd'], [1, 2, 3, 4])
      expect(record.get(3)).toBe(4)
    })

    it('should throw for index equal to length', () => {
      const record = new Record(['a', 'b'], [1, 2])
      expect(() => record.get(2)).toThrow(/index '2'/)
    })

    it('should throw for empty record with any index', () => {
      const record = new Record([], [])
      expect(() => record.get(0)).toThrow('This record is empty')
    })

    it('should throw for non-integer numeric indices', () => {
      const record = new Record(['a', 'b'], [1, 2])
      // Non-integer indices should throw an error
      expect(() => record.get(0.5)).toThrow()
      expect(() => record.get(1.9)).toThrow()
    })

    it('should work with integer values passed as number type', () => {
      const record = new Record(['a', 'b'], [1, 2])
      // Integer values should work fine
      expect(record.get(0.0)).toBe(1)  // 0.0 is effectively 0
      expect(record.get(1.0)).toBe(2)  // 1.0 is effectively 1
    })

    it('should provide helpful error message with valid index range', () => {
      const record = new Record(['a', 'b', 'c'], [1, 2, 3])
      expect(() => record.get(10)).toThrow('Valid indices are 0..2')
    })
  })

  describe('has(key)', () => {
    it('should return true for existing key', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record.has('name')).toBe(true)
      expect(record.has('age')).toBe(true)
    })

    it('should return false for non-existing key', () => {
      const record = new Record(['name'], ['Alice'])
      expect(record.has('city')).toBe(false)
    })

    it('should work with numeric keys as strings', () => {
      const record = new Record(['0', '1'], ['a', 'b'])
      expect(record.has('0')).toBe(true)
    })
  })

  describe('forEach(callback)', () => {
    it('should iterate over all fields', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      const collected: Array<{ value: any; key: string }> = []

      record.forEach((value, key, rec) => {
        collected.push({ value, key })
        expect(rec).toBe(record)
      })

      expect(collected).toEqual([
        { value: 'Alice', key: 'name' },
        { value: 30, key: 'age' }
      ])
    })

    it('should not call callback for empty record', () => {
      const record = new Record([], [])
      const callback = vi.fn()
      record.forEach(callback)
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('map(visitor)', () => {
    it('should transform all fields', () => {
      const record = new Record(['a', 'b', 'c'], [1, 2, 3])
      const result = record.map((value) => value * 2)
      expect(result).toEqual([2, 4, 6])
    })

    it('should provide key and record to visitor', () => {
      const record = new Record(['name'], ['Alice'])
      const result = record.map((value, key, rec) => {
        expect(key).toBe('name')
        expect(rec).toBe(record)
        return value.toUpperCase()
      })
      expect(result).toEqual(['ALICE'])
    })

    it('should return empty array for empty record', () => {
      const record = new Record([], [])
      const result = record.map((v) => v)
      expect(result).toEqual([])
    })
  })

  describe('toObject()', () => {
    it('should convert record to plain object', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record.toObject()).toEqual({ name: 'Alice', age: 30 })
    })

    it('should handle complex values', () => {
      const nested = { inner: [1, 2, 3] }
      const record = new Record(['data', 'list'], [nested, [1, 2]])
      expect(record.toObject()).toEqual({ data: nested, list: [1, 2] })
    })

    it('should return empty object for empty record', () => {
      const record = new Record([], [])
      expect(record.toObject()).toEqual({})
    })
  })

  describe('values()', () => {
    it('should return array of values', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      expect(record.values()).toEqual(['Alice', 30])
    })

    it('should return values in order', () => {
      const record = new Record(['c', 'b', 'a'], [3, 2, 1])
      expect(record.values()).toEqual([3, 2, 1])
    })

    it('should return empty array for empty record', () => {
      const record = new Record([], [])
      expect(record.values()).toEqual([])
    })
  })

  describe('entries()', () => {
    it('should return key-value pairs', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      const entries = record.entries()
      expect(entries).toEqual([['name', 'Alice'], ['age', 30]])
    })

    it('should return entries in order', () => {
      const record = new Record(['z', 'a'], [1, 2])
      expect(record.entries()).toEqual([['z', 1], ['a', 2]])
    })

    it('should return empty array for empty record', () => {
      const record = new Record([], [])
      expect(record.entries()).toEqual([])
    })
  })

  describe('Symbol.iterator', () => {
    it('should be iterable', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])
      const entries: Array<[string, any]> = []

      for (const entry of record) {
        entries.push(entry)
      }

      expect(entries).toEqual([['name', 'Alice'], ['age', 30]])
    })

    it('should work with spread operator', () => {
      const record = new Record(['a', 'b'], [1, 2])
      const spread = [...record]
      expect(spread).toEqual([['a', 1], ['b', 2]])
    })

    it('should work with Array.from', () => {
      const record = new Record(['x'], [42])
      const arr = Array.from(record)
      expect(arr).toEqual([['x', 42]])
    })
  })

  describe('type safety', () => {
    it('should handle various value types', () => {
      const record = new Record(
        ['string', 'number', 'boolean', 'null', 'object', 'array'],
        ['text', 123, true, null, { key: 'value' }, [1, 2, 3]]
      )

      expect(record.get('string')).toBe('text')
      expect(record.get('number')).toBe(123)
      expect(record.get('boolean')).toBe(true)
      expect(record.get('null')).toBeNull()
      expect(record.get('object')).toEqual({ key: 'value' })
      expect(record.get('array')).toEqual([1, 2, 3])
    })
  })
})
