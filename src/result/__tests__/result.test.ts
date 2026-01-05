import { describe, it, expect, vi } from 'vitest'
import { Result, ResultObserver } from '../result'
import { Record } from '../record'
import { ResultSummary } from '../result-summary'

describe('Result', () => {
  describe('constructor', () => {
    it('should create a Result instance', () => {
      const result = new Result('MATCH (n) RETURN n', {})
      expect(result).toBeInstanceOf(Result)
    })

    it('should accept query text and parameters', () => {
      const result = new Result('MATCH (n) WHERE n.name = $name RETURN n', { name: 'Alice' })
      expect(result).toBeInstanceOf(Result)
    })

    it('should accept lazy option', () => {
      const result = new Result('MATCH (n) RETURN n', {}, { lazy: true })
      expect(result).toBeInstanceOf(Result)
    })
  })

  describe('keys()', () => {
    it('should return a promise that resolves to keys', async () => {
      const result = new Result('MATCH (n) RETURN n.name, n.age', {})

      result._setKeys(['name', 'age'])
      result._complete()

      const keys = await result.keys()
      expect(keys).toEqual(['name', 'age'])
    })

    it('should wait for keys to be available', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      // Set keys after a delay
      setTimeout(() => {
        result._setKeys(['n'])
        result._complete()
      }, 10)

      const keys = await result.keys()
      expect(keys).toEqual(['n'])
    })

    it('should reject if error is set before keys', async () => {
      const result = new Result('INVALID QUERY', {})

      result._setError(new Error('Syntax error'))

      await expect(result.keys()).rejects.toThrow('Syntax error')
    })
  })

  describe('records property', () => {
    it('should return a promise that resolves to all records', async () => {
      const result = new Result('MATCH (n) RETURN n.name', {})

      result._setKeys(['name'])
      result._pushRecord(new Record(['name'], ['Alice']))
      result._pushRecord(new Record(['name'], ['Bob']))
      result._complete()

      const records = await result.records
      expect(records).toHaveLength(2)
      expect(records[0].get('name')).toBe('Alice')
      expect(records[1].get('name')).toBe('Bob')
    })

    it('should return empty array for empty result', async () => {
      const result = new Result('MATCH (n) RETURN n LIMIT 0', {})

      result._setKeys(['n'])
      result._complete()

      const records = await result.records
      expect(records).toEqual([])
    })

    it('should wait for all records to be available', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      setTimeout(() => {
        result._setKeys(['n'])
        result._pushRecord(new Record(['n'], [{ id: 1 }]))
        result._pushRecord(new Record(['n'], [{ id: 2 }]))
        result._complete()
      }, 10)

      const records = await result.records
      expect(records).toHaveLength(2)
    })

    it('should throw error if result has error', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setError(new Error('Query failed'))

      await expect(result.records).rejects.toThrow('Query failed')
    })
  })

  describe('single()', () => {
    it('should return the single record', async () => {
      const result = new Result('MATCH (n) RETURN n LIMIT 1', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ name: 'Alice' }]))
      result._complete()

      const record = await result.single()
      expect(record.get('n')).toEqual({ name: 'Alice' })
    })

    it('should throw if no records', async () => {
      const result = new Result('MATCH (n) RETURN n LIMIT 0', {})

      result._setKeys(['n'])
      result._complete()

      await expect(result.single()).rejects.toThrow('Expected exactly one record, but got none')
    })

    it('should throw if more than one record', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))
      result._complete()

      await expect(result.single()).rejects.toThrow('Expected exactly one record, but got 2')
    })
  })

  describe('peek()', () => {
    it('should return the first record without consuming', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))
      result._complete()

      const peeked = await result.peek()
      expect(peeked).not.toBeNull()
      expect(peeked!.get('n')).toEqual({ id: 1 })

      // Records should still be available
      const records = await result.records
      expect(records).toHaveLength(2)
    })

    it('should return null for empty result', async () => {
      const result = new Result('MATCH (n) RETURN n LIMIT 0', {})

      result._setKeys(['n'])
      result._complete()

      const peeked = await result.peek()
      expect(peeked).toBeNull()
    })

    it('should throw error if result has error', async () => {
      const result = new Result('INVALID', {})

      result._setError(new Error('Query failed'))

      await expect(result.peek()).rejects.toThrow('Query failed')
    })
  })

  describe('summary()', () => {
    it('should return the result summary', async () => {
      const result = new Result('CREATE (n) RETURN n', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))

      const summary = new ResultSummary('CREATE (n) RETURN n', {}, {
        type: 'rw',
        stats: { nodesCreated: 1 }
      })
      result._setSummary(summary)

      const returnedSummary = await result.summary()
      expect(returnedSummary).toBe(summary)
      expect(returnedSummary.queryType).toBe('rw')
      expect(returnedSummary.counters.updates().nodesCreated).toBe(1)
    })

    it('should create default summary if none provided', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setKeys(['n'])
      result._complete()

      const summary = await result.summary()
      expect(summary).toBeInstanceOf(ResultSummary)
      expect(summary.query.text).toBe('MATCH (n) RETURN n')
    })

    it('should throw error if result has error', async () => {
      const result = new Result('INVALID', {})

      result._setError(new Error('Query failed'))

      await expect(result.summary()).rejects.toThrow('Query failed')
    })
  })

  describe('consume()', () => {
    it('should return summary after consuming all records', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._complete()

      const summary = await result.consume()
      expect(summary).toBeInstanceOf(ResultSummary)
    })
  })

  describe('first()', () => {
    it('should return the first record', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))
      result._complete()

      const first = await result.first()
      expect(first).not.toBeNull()
      expect(first!.get('n')).toEqual({ id: 1 })
    })

    it('should return null for empty result', async () => {
      const result = new Result('MATCH (n) RETURN n LIMIT 0', {})

      result._setKeys(['n'])
      result._complete()

      const first = await result.first()
      expect(first).toBeNull()
    })
  })

  describe('subscribe()', () => {
    it('should call onKeys when keys are available', async () => {
      const result = new Result('MATCH (n) RETURN n.name, n.age', {})

      const observer: ResultObserver = {
        onKeys: vi.fn(),
        onNext: vi.fn(),
        onCompleted: vi.fn(),
        onError: vi.fn()
      }

      result.subscribe(observer)

      result._setKeys(['name', 'age'])
      result._complete()

      // Wait for async callbacks
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(observer.onKeys).toHaveBeenCalledWith(['name', 'age'])
    })

    it('should call onNext for each record', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      const observer: ResultObserver = {
        onKeys: vi.fn(),
        onNext: vi.fn(),
        onCompleted: vi.fn(),
        onError: vi.fn()
      }

      result.subscribe(observer)

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))
      result._complete()

      // Wait for async callbacks
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(observer.onNext).toHaveBeenCalledTimes(2)
    })

    it('should call onCompleted with summary', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      const observer: ResultObserver = {
        onCompleted: vi.fn()
      }

      result.subscribe(observer)

      result._setKeys(['n'])
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      result._setSummary(summary)

      // Wait for async callbacks
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(observer.onCompleted).toHaveBeenCalledWith(summary)
    })

    it('should call onError when error occurs', async () => {
      const result = new Result('INVALID', {})

      const observer: ResultObserver = {
        onError: vi.fn()
      }

      result.subscribe(observer)

      const error = new Error('Query failed')
      result._setError(error)

      // Wait for async callbacks
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(observer.onError).toHaveBeenCalledWith(error)
    })
  })

  describe('Symbol.asyncIterator (eager mode)', () => {
    it('should iterate over all records', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))
      result._pushRecord(new Record(['n'], [{ id: 3 }]))
      result._complete()

      const collected: Record[] = []
      for await (const record of result) {
        collected.push(record)
      }

      expect(collected).toHaveLength(3)
      expect(collected[0].get('n')).toEqual({ id: 1 })
      expect(collected[1].get('n')).toEqual({ id: 2 })
      expect(collected[2].get('n')).toEqual({ id: 3 })
    })

    it('should work with empty result', async () => {
      const result = new Result('MATCH (n) RETURN n LIMIT 0', {})

      result._setKeys(['n'])
      result._complete()

      const collected: Record[] = []
      for await (const record of result) {
        collected.push(record)
      }

      expect(collected).toHaveLength(0)
    })

    it('should throw if result has error', async () => {
      const result = new Result('INVALID', {})

      result._setError(new Error('Query failed'))

      const collected: Record[] = []

      await expect(async () => {
        for await (const record of result) {
          collected.push(record)
        }
      }).rejects.toThrow('Query failed')
    })
  })

  describe('Symbol.asyncIterator (lazy mode)', () => {
    it('should stream records as they arrive', async () => {
      const result = new Result('MATCH (n) RETURN n', {}, { lazy: true })

      result._setKeys(['n'])

      const collectedPromise = (async () => {
        const collected: Record[] = []
        for await (const record of result) {
          collected.push(record)
        }
        return collected
      })()

      // Push records asynchronously
      await new Promise(resolve => setTimeout(resolve, 5))
      result._pushRecord(new Record(['n'], [{ id: 1 }]))

      await new Promise(resolve => setTimeout(resolve, 5))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))

      await new Promise(resolve => setTimeout(resolve, 5))
      result._complete()

      const collected = await collectedPromise
      expect(collected).toHaveLength(2)
      expect(collected[0].get('n')).toEqual({ id: 1 })
      expect(collected[1].get('n')).toEqual({ id: 2 })
    })

    it('should handle records already queued', async () => {
      const result = new Result('MATCH (n) RETURN n', {}, { lazy: true })

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ id: 1 }]))
      result._pushRecord(new Record(['n'], [{ id: 2 }]))
      result._complete()

      const collected: Record[] = []
      for await (const record of result) {
        collected.push(record)
      }

      expect(collected).toHaveLength(2)
    })
  })

  describe('static fromRecords()', () => {
    it('should create a Result from raw data', async () => {
      const result = Result.fromRecords(
        ['name', 'age'],
        [
          ['Alice', 30],
          ['Bob', 25]
        ],
        'MATCH (n) RETURN n.name, n.age',
        {}
      )

      const keys = await result.keys()
      expect(keys).toEqual(['name', 'age'])

      const records = await result.records
      expect(records).toHaveLength(2)
      expect(records[0].get('name')).toBe('Alice')
      expect(records[0].get('age')).toBe(30)
      expect(records[1].get('name')).toBe('Bob')
      expect(records[1].get('age')).toBe(25)
    })

    it('should accept summary metadata', async () => {
      const result = Result.fromRecords(
        ['n'],
        [[{ id: 1 }]],
        'CREATE (n) RETURN n',
        {},
        { type: 'w', stats: { nodesCreated: 1 } }
      )

      const summary = await result.summary()
      expect(summary.queryType).toBe('w')
      expect(summary.counters.updates().nodesCreated).toBe(1)
    })
  })

  describe('static empty()', () => {
    it('should create an empty Result', async () => {
      const result = Result.empty('MATCH (n) RETURN n')

      const keys = await result.keys()
      expect(keys).toEqual([])

      const records = await result.records
      expect(records).toEqual([])
    })
  })

  describe('error handling', () => {
    it('should propagate error to all awaiting methods', async () => {
      const result = new Result('MATCH (n) RETURN n', {})

      const keysPromise = result.keys()
      const recordsPromise = result.records
      const summaryPromise = result.summary()

      result._setError(new Error('Database connection failed'))

      await expect(keysPromise).rejects.toThrow('Database connection failed')
      await expect(recordsPromise).rejects.toThrow('Database connection failed')
      await expect(summaryPromise).rejects.toThrow('Database connection failed')
    })
  })

  describe('integration tests', () => {
    it('should work with typical query workflow', async () => {
      const result = new Result('MATCH (p:Person) RETURN p.name, p.age', { limit: 10 })

      // Simulate driver populating result
      result._setKeys(['name', 'age'])
      result._pushRecord(new Record(['name', 'age'], ['Alice', 30]))
      result._pushRecord(new Record(['name', 'age'], ['Bob', 25]))
      result._pushRecord(new Record(['name', 'age'], ['Charlie', 35]))

      const summary = new ResultSummary(
        'MATCH (p:Person) RETURN p.name, p.age',
        { limit: 10 },
        { type: 'r', stats: {} }
      )
      result._setSummary(summary)

      // Consume result using various methods
      const keys = await result.keys()
      expect(keys).toEqual(['name', 'age'])

      const peeked = await result.peek()
      expect(peeked!.get('name')).toBe('Alice')

      const all: Array<{ name: string; age: number }> = []
      for await (const record of result) {
        all.push({
          name: record.get('name'),
          age: record.get('age')
        })
      }

      expect(all).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
      ])

      const returnedSummary = await result.summary()
      expect(returnedSummary.queryType).toBe('r')
    })

    it('should work with write query', async () => {
      const result = new Result(
        'CREATE (n:Person {name: $name}) RETURN n',
        { name: 'David' }
      )

      result._setKeys(['n'])
      result._pushRecord(new Record(['n'], [{ name: 'David' }]))

      const summary = new ResultSummary(
        'CREATE (n:Person {name: $name}) RETURN n',
        { name: 'David' },
        {
          type: 'w',
          stats: {
            nodesCreated: 1,
            propertiesSet: 1,
            labelsAdded: 1
          }
        }
      )
      result._setSummary(summary)

      const single = await result.single()
      expect(single.get('n')).toEqual({ name: 'David' })

      const returnedSummary = await result.summary()
      expect(returnedSummary.counters.containsUpdates()).toBe(true)
      expect(returnedSummary.counters.updates().nodesCreated).toBe(1)
    })
  })
})
