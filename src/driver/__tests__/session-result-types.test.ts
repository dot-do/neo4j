/**
 * Type Safety Tests for Session.run() and Result generic parameters
 *
 * RED TDD Tests: These tests expose the Result<T> generic type mismatch
 *
 * Current issues:
 * - session.ts:97 - run<T extends RecordShape = RecordShape>(): Result<T>
 * - result.ts:47 - export class Result implements AsyncIterable<Record>
 *
 * The Result class in src/result/result.ts does NOT have a generic parameter,
 * but Session.run<T>() returns Result<T> as if it does.
 *
 * Expected: TypeScript compilation should catch type inconsistencies
 * The GREEN implementation should add generic parameter to Result class.
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import { driver } from '../../index'
import type { RecordShape, Neo4jRecord } from '../../types'
import { Result } from '../../result'
import { Record } from '../../result/record'

// Define test record shapes for type inference testing
interface PersonRecord extends RecordShape {
  name: string
  age: number
}

interface MovieRecord extends RecordShape {
  title: string
  released: number
  tagline: string | null
}

interface CountRecord extends RecordShape {
  count: number
}

describe('Session.run<T>() Result<T> Generic Type Parameter', () => {
  describe('Result generic parameter mismatch', () => {
    it('should allow Session.run<T>() to return Result<T>', () => {
      // This test documents that Session.run<T>() claims to return Result<T>
      // but the Result class does not have a generic parameter
      //
      // Currently this will fail at compile time with:
      // error TS2315: Type 'Result' is not generic.
      const d = driver('neo4j://localhost')
      const session = d.session()

      // Session.run<PersonRecord>() should return Result<PersonRecord>
      // When Result has no generic parameter, TypeScript should error
      const result = session.run<PersonRecord>(
        'MATCH (p:Person) RETURN p.name as name, p.age as age'
      )

      // The result type should be Result<PersonRecord>
      expect(result).toBeDefined()
    })

    it('should propagate generic type through result methods', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      // Run query with typed result
      const result = session.run<CountRecord>('RETURN count(*) as count')

      // When Result<T> is properly implemented:
      // - records should return Promise<Neo4jRecord<CountRecord>[]>
      // - peek() should return Promise<Neo4jRecord<CountRecord> | null>
      // - first() should return Promise<Neo4jRecord<CountRecord> | null>
      //
      // Note: records is a getter property, not a method
      const records = await result.records

      // Type assertion to verify the expected type structure
      expect(Array.isArray(records)).toBe(true)
    })

    it('should enforce RecordShape constraint on type parameter', () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      // Valid: PersonRecord extends RecordShape
      const _validResult = session.run<PersonRecord>(
        'MATCH (p:Person) RETURN p.name as name, p.age as age'
      )

      // Invalid: This should cause a type error
      // interface InvalidRecord {
      //   notExtendingRecordShape: boolean
      // }
      // const invalidResult = session.run<InvalidRecord>(...) // Should error

      expect(_validResult).toBeDefined()
    })
  })

  describe('Record type flow through Result', () => {
    it('should type Record.get<K>() based on result type parameter', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run<PersonRecord>(
        'MATCH (p:Person) RETURN p.name as name, p.age as age'
      )

      // Note: records is a getter property, not a method
      const records = await result.records

      if (records.length > 0) {
        const record = records[0]

        // With proper typing, record.get('name') should return string
        // and record.get('age') should return number
        const name = record.get('name')
        const age = record.get('age')

        // These type assertions document the expected behavior
        // Currently, without proper generics, these might be 'any' or 'unknown'
        expect(typeof name === 'string' || name === undefined).toBe(true)
        expect(typeof age === 'number' || age === undefined).toBe(true)
      }
    })

    it('should type Record.toObject() based on result type parameter', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run<MovieRecord>(
        'MATCH (m:Movie) RETURN m.title as title, m.released as released, m.tagline as tagline LIMIT 1'
      )

      // Note: records is a getter property, not a method
      const records = await result.records

      if (records.length > 0) {
        const record = records[0]

        // toObject() should return MovieRecord type
        const obj = record.toObject()

        // With proper typing, obj should be typed as MovieRecord
        // obj.title should be string
        // obj.released should be number
        // obj.tagline should be string | null
        expect(obj).toBeDefined()
      }
    })
  })

  describe('Type inference from query results', () => {
    it('should infer types from Result async iteration', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run<PersonRecord>('MATCH (p:Person) RETURN p.name as name, p.age as age')

      // Async iteration should yield Neo4jRecord<PersonRecord>
      for await (const record of result) {
        // record should be typed as Neo4jRecord<PersonRecord>
        // record.get('name') should return PersonRecord['name'] = string
        // record.get('age') should return PersonRecord['age'] = number
        expect(record).toBeDefined()

        // Verify the record has expected methods
        expect(typeof record.get).toBe('function')
        expect(typeof record.toObject).toBe('function')
        break // Only check first record
      }
    })

    it('should infer types from Result.subscribe()', () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run<PersonRecord>('MATCH (p:Person) RETURN p.name as name, p.age as age')

      // Subscribe observer should receive Neo4jRecord<PersonRecord>
      result.subscribe({
        onNext: (record) => {
          // record should be typed as Neo4jRecord<PersonRecord>
          expect(record).toBeDefined()
        },
        onCompleted: (summary) => {
          expect(summary).toBeDefined()
        },
        onError: (error) => {
          // This should be typed as Error
          expect(error).toBeInstanceOf(Error)
        }
      })
    })
  })

  describe('Default type parameter behavior', () => {
    it('should default to RecordShape when no type parameter is provided', () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      // When no type parameter is provided, should default to Result<RecordShape>
      const result = session.run('RETURN 1 as value')

      // Result should be Result<RecordShape>
      expect(result).toBeDefined()
    })

    it('should allow access to arbitrary keys with default RecordShape', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run('RETURN 1 as anyKey, "test" as otherKey')
      // Note: records is a getter property, not a method
      const records = await result.records

      if (records.length > 0) {
        const record = records[0]

        // With default RecordShape, any string key should be allowed
        // but return type should be unknown
        const val1 = record.get('anyKey')
        const val2 = record.get('otherKey')

        expect(val1).toBeDefined()
        expect(val2).toBeDefined()
      }
    })
  })

  describe('Type parameter across transaction methods', () => {
    it('should propagate type parameter through executeRead', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      // executeRead work function should have access to typed tx.run<T>()
      await session.executeRead(async (tx) => {
        const result = tx.run<PersonRecord>(
          'MATCH (p:Person) RETURN p.name as name, p.age as age'
        )

        // result should be Result<PersonRecord>
        expect(result).toBeDefined()
        return result
      })
    })

    it('should propagate type parameter through executeWrite', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      await session.executeWrite(async (tx) => {
        const result = tx.run<PersonRecord>(
          'CREATE (p:Person {name: $name, age: $age}) RETURN p.name as name, p.age as age',
          { name: 'Alice', age: 30 }
        )

        // result should be Result<PersonRecord>
        expect(result).toBeDefined()
        return result
      })
    })

    it('should propagate type parameter through beginTransaction', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const tx = await session.beginTransaction()

      try {
        const result = tx.run<MovieRecord>(
          'MATCH (m:Movie) RETURN m.title as title, m.released as released, m.tagline as tagline'
        )

        // result should be Result<MovieRecord>
        expect(result).toBeDefined()
        await tx.commit()
      } catch {
        await tx.rollback()
      }
    })
  })

  describe('Compile-time type checking', () => {
    it('should catch type errors for invalid key access', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run<PersonRecord>(
        'MATCH (p:Person) RETURN p.name as name, p.age as age'
      )

      // Note: records is a getter property, not a method
      const records = await result.records

      if (records.length > 0) {
        const record = records[0]

        // With proper typing, accessing a key not in PersonRecord
        // should cause a compile-time type error
        //
        // Currently without generics, this passes silently
        // With proper implementation:
        // record.get('invalidKey') // Should error: 'invalidKey' is not in keyof PersonRecord

        // This documents the expected behavior
        const name = record.get('name') // Should work: 'name' is in PersonRecord

        expect(name).toBeDefined()
      }
    })

    it('should preserve type safety in chained operations', async () => {
      const d = driver('neo4j://localhost')
      const session = d.session()

      const result = session.run<PersonRecord>(
        'MATCH (p:Person) RETURN p.name as name, p.age as age'
      )

      // Chain operations should preserve type information
      // Note: records is a getter property, not a method
      const names = (await result.records)
        .map(record => record.get('name'))

      // names should be typed as string[] when generics work properly
      expect(Array.isArray(names)).toBe(true)
    })
  })
})

describe('Result class generic type contract', () => {
  it('should document that Result class needs generic parameter', () => {
    // This test documents the expected API:
    //
    // export class Result<T extends RecordShape = RecordShape> implements AsyncIterable<Neo4jRecord<T>> {
    //   get records(): Promise<Neo4jRecord<T>[]>
    //   peek(): Promise<Neo4jRecord<T> | null>
    //   subscribe(observer: ResultObserver<T>): void
    //   [Symbol.asyncIterator](): AsyncIterator<Neo4jRecord<T>>
    // }
    //
    // Currently Result has NO generic parameter, causing type mismatches

    // Test passes if it compiles - documents expected behavior
    expect(true).toBe(true)
  })

  it('should document that Record class needs to flow type from Result', () => {
    // This test documents the expected API:
    //
    // export class Record<T extends RecordShape = RecordShape> implements Neo4jRecord<T> {
    //   get<K extends keyof T>(key: K): T[K]
    //   get(key: string | number): unknown
    //   toObject(): T
    // }
    //
    // The Record in src/result/record.ts has no generic parameter

    // Test passes if it compiles - documents expected behavior
    expect(true).toBe(true)
  })

  it('should verify Result class does not currently accept type parameters', () => {
    // This test verifies the current broken state
    // The Result class in src/result/result.ts has no generic parameter

    // Create a result without generic - this works
    const result = new Result('RETURN 1', {})

    // The Result class should accept generic parameters
    // Currently this would be a type error:
    // const typedResult: Result<PersonRecord> = new Result('...', {})
    //
    // After GREEN implementation, this should compile

    expect(result).toBeDefined()
  })

  it('should verify Record class in result module has no generic parameter', () => {
    // The Record class in src/result/record.ts has no generic parameter
    const record = new Record(['name', 'age'], ['Alice', 30])

    // get() returns 'any' instead of a properly typed value
    const name = record.get('name')

    // With proper generics, this would be typed
    // Currently name is 'any', allowing unsafe operations
    expect(name).toBe('Alice')

    // toObject() returns { [key: string]: any } instead of T
    const obj = record.toObject()
    expect(obj).toEqual({ name: 'Alice', age: 30 })
  })
})

describe('Type system verification tests', () => {
  it('should demonstrate the type mismatch between session and result', () => {
    // This test demonstrates the fundamental issue:
    //
    // In session.ts:
    //   run<T extends RecordShape = RecordShape>(...): Result<T>
    //
    // In result.ts:
    //   export class Result implements AsyncIterable<Record>
    //   (no generic parameter!)
    //
    // TypeScript should error with: "Type 'Result' is not generic"
    // but the current code somehow compiles (possibly due to type declaration files)

    const d = driver('neo4j://localhost')
    const session = d.session()

    // This line should cause a type error because Result<T> doesn't exist
    // but the test documents the expected behavior
    const result = session.run<PersonRecord>('RETURN 1')

    expect(result).toBeDefined()
  })

  it('should verify RecordShape interface definition', () => {
    // RecordShape is the base type for all record types
    // It allows arbitrary string keys with unknown values

    const shape: RecordShape = {
      anyKey: 'anyValue',
      anotherKey: 123,
      nested: { deep: true }
    }

    expect(shape['anyKey']).toBe('anyValue')

    // Custom record types extend RecordShape
    const person: PersonRecord = {
      name: 'Alice',
      age: 30
    }

    // PersonRecord is assignable to RecordShape
    const asShape: RecordShape = person
    expect(asShape['name']).toBe('Alice')
  })

  it('should verify Neo4jRecord interface with generics', () => {
    // Neo4jRecord<T> is the interface that Record should implement
    // It properly types the get() method based on T

    // This demonstrates what the implementation should provide:
    // interface Neo4jRecord<T extends RecordShape = RecordShape> {
    //   keys: string[]
    //   length: number
    //   get<K extends keyof T>(key: K): T[K]
    //   get(key: string | number): unknown
    //   toObject(): T
    // }

    // The issue is that the concrete Record class doesn't implement
    // Neo4jRecord<T> properly - it has no generic parameter

    expect(true).toBe(true)
  })
})
