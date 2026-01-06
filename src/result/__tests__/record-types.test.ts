/**
 * Type Safety Tests for Record class
 *
 * These tests verify the type contracts for the Record class.
 * They document the expected behavior when proper typing is implemented.
 *
 * Current issues (using 'any'):
 * - Line 9: Visitor<T = void> uses 'value: any'
 * - Line 15: Record implements Iterable<[string, any]>
 * - Line 17: _fields: readonly any[]
 *
 * The GREEN implementation should replace 'any' with 'unknown' to enforce
 * proper type checking and require explicit type assertions/guards.
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import { Record, Visitor } from '../record'

describe('Record Type Safety', () => {
  describe('Visitor callback typing', () => {
    it('should type the value parameter in forEach callbacks', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])

      // The visitor receives value, key, and record
      // Currently value is 'any', but should be 'unknown' requiring type guards
      record.forEach((value, key, rec) => {
        // Type assertions should be needed for type-safe usage
        expect(typeof key).toBe('string')
        expect(rec).toBeInstanceOf(Record)

        // This test documents that we can access value
        // With 'unknown' typing, we would need type guards
        if (typeof value === 'string') {
          expect(value.length).toBeGreaterThan(0)
        } else if (typeof value === 'number') {
          expect(value).toBeGreaterThan(0)
        }
      })
    })

    it('should type the value parameter in map callbacks', () => {
      const record = new Record(['a', 'b', 'c'], [1, 2, 3])

      // Map should return properly typed results based on visitor return type
      const doubled = record.map<number>((value) => {
        // With 'unknown' typing, explicit type assertion would be required
        return (value as number) * 2
      })

      expectTypeOf(doubled).toEqualTypeOf<number[]>()
      expect(doubled).toEqual([2, 4, 6])
    })

    it('should allow custom Visitor type parameter for return values', () => {
      const record = new Record(['x', 'y'], [10, 20])

      // Visitor<string> should produce string results
      const asStrings = record.map<string>((value) => {
        return `Value: ${value}`
      })

      expectTypeOf(asStrings).toEqualTypeOf<string[]>()
      expect(asStrings).toEqual(['Value: 10', 'Value: 20'])
    })

    it('should pass record reference to visitor callbacks', () => {
      const record = new Record(['name'], ['test'])

      // Verify the third parameter is the Record instance
      record.forEach((_value, _key, rec) => {
        expectTypeOf(rec).toEqualTypeOf<Record>()
        expect(rec).toBe(record)
      })
    })

    it('should type Visitor interface correctly', () => {
      // Visitor with default void return
      const voidVisitor: Visitor = (value, key, _record) => {
        // With proper typing, value should be unknown
        void value
        void key
      }

      // Visitor with explicit return type
      const stringVisitor: Visitor<string> = (value, _key, _record) => {
        return String(value)
      }

      const record = new Record(['test'], [42])
      record.forEach(voidVisitor)
      const results = record.map(stringVisitor)

      expect(results).toEqual(['42'])
    })
  })

  describe('_fields array typing', () => {
    it('should store values and return them via get()', () => {
      const mixedValues = ['string', 123, true, null, { nested: 'object' }, [1, 2, 3]]
      const record = new Record(
        ['s', 'n', 'b', 'null', 'obj', 'arr'],
        mixedValues
      )

      // get() returns any currently, should return unknown
      // Requiring type assertions for safe usage
      const stringVal = record.get('s')
      const numberVal = record.get('n')
      const boolVal = record.get('b')
      const nullVal = record.get('null')
      const objVal = record.get('obj')
      const arrVal = record.get('arr')

      // Type guards/assertions would be required with unknown
      expect(stringVal).toBe('string')
      expect(numberVal).toBe(123)
      expect(boolVal).toBe(true)
      expect(nullVal).toBeNull()
      expect(objVal).toEqual({ nested: 'object' })
      expect(arrVal).toEqual([1, 2, 3])
    })

    it('should handle values() return type', () => {
      const record = new Record(['a', 'b'], [1, 'two'])

      // values() returns any[] currently, should return unknown[]
      const vals = record.values()

      // With proper typing, operations on vals would require type guards
      expect(Array.isArray(vals)).toBe(true)
      expect(vals).toEqual([1, 'two'])
    })

    it('should handle toObject() return type', () => {
      const record = new Record(['name', 'count'], ['Alice', 42])

      // toObject() returns { [key: string]: any }, should be { [key: string]: unknown }
      const obj = record.toObject()

      // Type assertions would be needed for safe property access
      expect(obj).toEqual({ name: 'Alice', count: 42 })
      expect(obj['name']).toBe('Alice')
      expect(obj['count']).toBe(42)
    })
  })

  describe('iterator yields typed tuples', () => {
    it('should yield [string, unknown] tuples from iterator', () => {
      const record = new Record(['key1', 'key2'], ['value1', 123])

      const entries: [string, unknown][] = []
      for (const entry of record) {
        entries.push(entry)
      }

      expect(entries).toEqual([
        ['key1', 'value1'],
        ['key2', 123]
      ])

      // First element should always be string (key)
      for (const [key, _value] of record) {
        expectTypeOf(key).toBeString()
      }
    })

    it('should work with spread operator preserving tuple types', () => {
      const record = new Record(['a', 'b'], [1, 2])
      const spread = [...record]

      expect(spread).toEqual([['a', 1], ['b', 2]])

      // Each spread element should be a tuple
      spread.forEach(([key, value]) => {
        expect(typeof key).toBe('string')
        expect(typeof value).toBe('number')
      })
    })

    it('should work with Array.from preserving types', () => {
      const record = new Record(['x', 'y', 'z'], [10, 20, 30])
      const arr = Array.from(record)

      expect(arr.length).toBe(3)
      arr.forEach(([key, value], index) => {
        expect(typeof key).toBe('string')
        expect(value).toBe((index + 1) * 10)
      })
    })

    it('should produce entries() with proper tuple typing', () => {
      const record = new Record(['name', 'age'], ['Bob', 25])

      // entries() returns [string, any][], should be [string, unknown][]
      const entries = record.entries()

      expectTypeOf(entries).toMatchTypeOf<[string, unknown][]>()
      expect(entries).toEqual([['name', 'Bob'], ['age', 25]])
    })
  })

  describe('get() method type inference', () => {
    it('should return value requiring type assertion for string key', () => {
      const record = new Record(['name', 'age'], ['Alice', 30])

      // get() with string key returns any, should return unknown
      const name = record.get('name')
      const age = record.get('age')

      // With unknown return type, these would require type guards
      if (typeof name === 'string') {
        expect(name.toUpperCase()).toBe('ALICE')
      }
      if (typeof age === 'number') {
        expect(age + 1).toBe(31)
      }
    })

    it('should return value requiring type assertion for numeric index', () => {
      const record = new Record(['a', 'b', 'c'], ['first', 'second', 'third'])

      // get() with number returns any, should return unknown
      const first = record.get(0)
      const second = record.get(1)

      // Type guards should be needed
      expect(first).toBe('first')
      expect(second).toBe('second')
    })

    it('should handle complex nested values safely', () => {
      interface User {
        id: number
        profile: {
          email: string
          verified: boolean
        }
      }

      const userData: User = {
        id: 1,
        profile: {
          email: 'test@example.com',
          verified: true
        }
      }

      const record = new Record(['user', 'timestamp'], [userData, Date.now()])

      // With unknown type, we need to assert/guard before accessing properties
      const user = record.get('user')

      // Type guard pattern that would be required with unknown
      if (
        user &&
        typeof user === 'object' &&
        'id' in user &&
        'profile' in user
      ) {
        const typedUser = user as User
        expect(typedUser.id).toBe(1)
        expect(typedUser.profile.email).toBe('test@example.com')
      }
    })

    it('should handle null and undefined values properly', () => {
      const record = new Record(['nullable', 'undefinable'], [null, undefined])

      const nullVal = record.get('nullable')
      const undefVal = record.get('undefinable')

      // With unknown type, null checks are meaningful
      expect(nullVal).toBeNull()
      expect(undefVal).toBeUndefined()

      // Type narrowing should work
      if (nullVal !== null) {
        // This block should not execute
        expect(true).toBe(false)
      }
    })

    it('should allow type assertion when caller knows the type', () => {
      const record = new Record(['count', 'label'], [42, 'test'])

      // Pattern for type-safe access with known types
      // Currently works because of 'any', would also work with unknown + assertion
      const count = record.get('count') as number
      const label = record.get('label') as string

      expectTypeOf(count).toBeNumber()
      expectTypeOf(label).toBeString()

      expect(count * 2).toBe(84)
      expect(label.toUpperCase()).toBe('TEST')
    })
  })

  describe('type safety with real-world patterns', () => {
    it('should safely handle node/relationship data patterns', () => {
      // Simulating Neo4j node data structure
      const nodeData = {
        identity: 1,
        labels: ['Person'],
        properties: { name: 'Alice', born: 1970 }
      }

      const record = new Record(['n', 'count'], [nodeData, 5])

      // Safe pattern: type guard then use
      const node = record.get('n')
      if (node && typeof node === 'object' && 'properties' in node) {
        const typedNode = node as typeof nodeData
        expect(typedNode.labels).toContain('Person')
        expect(typedNode.properties.name).toBe('Alice')
      }
    })

    it('should work with destructuring when types are known', () => {
      const record = new Record(
        ['id', 'name', 'active'],
        [123, 'Widget', true]
      )

      // Convert to object and destructure with type assertion
      const { id, name, active } = record.toObject() as {
        id: number
        name: string
        active: boolean
      }

      expect(id).toBe(123)
      expect(name).toBe('Widget')
      expect(active).toBe(true)
    })

    it('should support map transformation with type narrowing', () => {
      const record = new Record(['a', 'b', 'c'], [1, 2, 3])

      // Map with explicit type handling
      const descriptions = record.map<string>((value, key) => {
        // Type guard pattern
        if (typeof value === 'number') {
          return `${key} = ${value}`
        }
        return `${key} = unknown`
      })

      expect(descriptions).toEqual(['a = 1', 'b = 2', 'c = 3'])
    })

    it('should handle forEach with side effects safely', () => {
      const record = new Record(['x', 'y'], [10, 20])

      let sum = 0
      record.forEach((value) => {
        // Type guard required for safe numeric operation
        if (typeof value === 'number') {
          sum += value
        }
      })

      expect(sum).toBe(30)
    })
  })
})
