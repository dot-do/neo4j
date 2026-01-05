/**
 * Tests for Neo4jHttpClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  Neo4jHttpClient,
  HttpSession,
  HttpTransaction,
  createHttpClient,
  basicAuth,
  bearerAuth,
  DriverClosedError,
  SessionClosedError,
  NetworkError,
  ServerError,
  AuthenticationError,
} from '../index'

// Mock fetch for testing
const createMockFetch = () => {
  return vi.fn()
}

describe('Neo4jHttpClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = createMockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create a client with base URL', () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      expect(client.baseUrl).toBe('https://test.neo4j.do')
      expect(client.closed).toBe(false)
    })

    it('should remove trailing slash from base URL', () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do/', undefined, {
        fetch: mockFetch,
      })

      expect(client.baseUrl).toBe('https://test.neo4j.do')
    })

    it('should accept authentication token', () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const auth = basicAuth('neo4j', 'password')
      const client = new Neo4jHttpClient('https://test.neo4j.do', auth, {
        fetch: mockFetch,
      })

      expect(client.baseUrl).toBe('https://test.neo4j.do')
    })
  })

  describe('run()', () => {
    it('should execute a simple query', async () => {
      const responseData = {
        keys: ['name'],
        records: [{ name: 'Alice' }, { name: 'Bob' }],
        summary: {
          queryType: 'r',
          counters: {},
        },
      }

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      const result = await client.run('MATCH (n:Person) RETURN n.name as name')

      expect(result.keys).toEqual(['name'])
      expect(result.records).toHaveLength(2)
      expect(result.records[0].get('name')).toBe('Alice')
      expect(result.records[1].get('name')).toBe('Bob')
    })

    it('should send query with parameters', async () => {
      const responseData = {
        keys: ['name'],
        records: [{ name: 'Alice' }],
        summary: { queryType: 'r' },
      }

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await client.run('MATCH (n:Person {name: $name}) RETURN n.name as name', {
        name: 'Alice',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('https://test.neo4j.do/cypher')

      const body = JSON.parse(options.body)
      expect(body.query).toBe('MATCH (n:Person {name: $name}) RETURN n.name as name')
      expect(body.parameters).toEqual({ name: 'Alice' })
    })

    it('should throw DriverClosedError when client is closed', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await client.close()

      await expect(client.run('MATCH (n) RETURN n')).rejects.toThrow(DriverClosedError)
    })

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'Neo.ClientError.Statement.SyntaxError',
              message: 'Invalid Cypher syntax',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await expect(client.run('INVALID CYPHER')).rejects.toThrow(ServerError)
    })

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'Neo.ClientError.Security.Unauthorized',
              message: 'Invalid credentials',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await expect(client.run('MATCH (n) RETURN n')).rejects.toThrow(AuthenticationError)
    })

    it('should include query summary in result', async () => {
      const responseData = {
        keys: ['count'],
        records: [{ count: 5 }],
        summary: {
          queryType: 'w',
          counters: {
            nodesCreated: 5,
            propertiesSet: 10,
          },
          resultAvailableAfter: 15,
          resultConsumedAfter: 20,
        },
      }

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      const result = await client.run('CREATE (n:Person) RETURN count(*) as count')

      expect(result.summary.queryType).toBe('w')
      expect(result.summary.counters.nodesCreated()).toBe(5)
      expect(result.summary.counters.propertiesSet()).toBe(10)
      expect(result.summary.counters.containsUpdates()).toBe(true)
      expect(result.summary.resultAvailableAfter).toBe(15)
    })
  })

  describe('session()', () => {
    it('should create a session', () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      const session = client.session()

      expect(session).toBeInstanceOf(HttpSession)
      expect(session.closed).toBe(false)
    })

    it('should create session with custom database', () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      const session = client.session({ database: 'mydb' })

      expect(session).toBeInstanceOf(HttpSession)
    })

    it('should throw when creating session on closed client', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await client.close()

      expect(() => client.session()).toThrow(DriverClosedError)
    })
  })

  describe('close()', () => {
    it('should close the client', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      expect(client.closed).toBe(false)

      await client.close()

      expect(client.closed).toBe(true)
    })

    it('should be idempotent', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await client.close()
      await client.close() // Should not throw

      expect(client.closed).toBe(true)
    })
  })

  describe('verifyConnectivity()', () => {
    it('should verify connectivity', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await expect(client.verifyConnectivity()).resolves.toBeUndefined()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.neo4j.do/health',
        expect.any(Object)
      )
    })

    it('should throw NetworkError on connection failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await expect(client.verifyConnectivity()).rejects.toThrow(NetworkError)
    })

    it('should throw DriverClosedError when closed', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

      const client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
        fetch: mockFetch,
      })

      await client.close()

      await expect(client.verifyConnectivity()).rejects.toThrow(DriverClosedError)
    })
  })
})

describe('HttpSession', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let client: Neo4jHttpClient

  beforeEach(() => {
    mockFetch = createMockFetch()
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ keys: [], records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
      fetch: mockFetch,
    })
  })

  afterEach(async () => {
    await client.close()
    vi.restoreAllMocks()
  })

  describe('run()', () => {
    it('should execute a query', async () => {
      const responseData = {
        keys: ['name'],
        records: [{ name: 'Alice' }],
        summary: { queryType: 'r' },
      }

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const session = client.session()
      const result = await session.run('MATCH (n) RETURN n.name as name')

      expect(result.records).toHaveLength(1)
      await session.close()
    })

    it('should update bookmarks from response', async () => {
      const responseData = {
        keys: [],
        records: [],
        bookmarks: ['bookmark:1'],
      }

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const session = client.session()
      await session.run('CREATE (n:Node)')

      expect(session.lastBookmarks()).toEqual(['bookmark:1'])
      await session.close()
    })

    it('should throw SessionClosedError when closed', async () => {
      const session = client.session()
      await session.close()

      await expect(session.run('MATCH (n) RETURN n')).rejects.toThrow(
        SessionClosedError
      )
    })
  })

  describe('beginTransaction()', () => {
    it('should begin a transaction', async () => {
      // Begin transaction
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'tx-123',
            accessMode: 'WRITE',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Rollback
      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const session = client.session()
      const tx = await session.beginTransaction()

      expect(tx).toBeInstanceOf(HttpTransaction)
      expect(tx.isOpen()).toBe(true)

      await tx.rollback()
      await session.close()
    })

    it('should throw when transaction already open', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'tx-123',
            accessMode: 'WRITE',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      const session = client.session()
      await session.beginTransaction()

      await expect(session.beginTransaction()).rejects.toThrow(
        /already open/i
      )

      await session.close()
    })

    it('should throw SessionClosedError when session closed', async () => {
      const session = client.session()
      await session.close()

      await expect(session.beginTransaction()).rejects.toThrow(
        SessionClosedError
      )
    })
  })

  describe('executeWrite()', () => {
    it('should execute work in a write transaction', async () => {
      // First call: begin transaction
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'tx-123',
            accessMode: 'WRITE',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Second call: run query
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            keys: ['created'],
            records: [{ created: true }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Third call: commit
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bookmarks: ['bookmark:tx-123'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      const session = client.session()
      const result = await session.executeWrite(async (tx) => {
        const res = await tx.run('CREATE (n:Node) RETURN true as created')
        return res.records[0].get('created')
      })

      expect(result).toBe(true)
      expect(session.lastBookmarks()).toEqual(['bookmark:tx-123'])

      await session.close()
    })

    it('should rollback on error', async () => {
      // First call: begin transaction
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'tx-123',
            accessMode: 'WRITE',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Second call: run query fails
      mockFetch.mockRejectedValueOnce(new Error('Query failed'))

      // Third call: rollback
      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const session = client.session()

      await expect(
        session.executeWrite(async (tx) => {
          await tx.run('INVALID')
        })
      ).rejects.toThrow()

      await session.close()
    })
  })

  describe('executeRead()', () => {
    it('should execute work in a read transaction', async () => {
      // First call: begin transaction
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'tx-123',
            accessMode: 'READ',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Second call: run query
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            keys: ['count'],
            records: [{ count: 42 }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Third call: commit
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bookmarks: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      const session = client.session()
      const result = await session.executeRead(async (tx) => {
        const res = await tx.run('MATCH (n) RETURN count(n) as count')
        return res.records[0].get('count')
      })

      expect(result).toBe(42)

      await session.close()
    })
  })

  describe('close()', () => {
    it('should close the session', async () => {
      const session = client.session()

      expect(session.closed).toBe(false)
      await session.close()
      expect(session.closed).toBe(true)
    })

    it('should rollback open transaction on close', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'tx-123',
            accessMode: 'WRITE',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Rollback call
      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const session = client.session()
      await session.beginTransaction()
      await session.close()

      // Verify rollback was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.neo4j.do/tx/tx-123/rollback',
        expect.any(Object)
      )
    })

    it('should be idempotent', async () => {
      const session = client.session()

      await session.close()
      await session.close() // Should not throw

      expect(session.closed).toBe(true)
    })
  })

  describe('lastBookmarks()', () => {
    it('should return empty array initially', () => {
      const session = client.session()
      expect(session.lastBookmarks()).toEqual([])
    })

    it('should return bookmarks passed in config', () => {
      const session = client.session({ bookmarks: ['bookmark:1', 'bookmark:2'] })
      expect(session.lastBookmarks()).toEqual(['bookmark:1', 'bookmark:2'])
    })

    it('should normalize string bookmark to array', () => {
      const session = client.session({ bookmarks: 'bookmark:1' })
      expect(session.lastBookmarks()).toEqual(['bookmark:1'])
    })
  })
})

describe('HttpTransaction', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let client: Neo4jHttpClient
  let session: HttpSession

  beforeEach(async () => {
    mockFetch = createMockFetch()
    // Use mockImplementation to create fresh Response objects for each call
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(
        JSON.stringify({
          id: 'tx-123',
          accessMode: 'WRITE',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ))
    )

    client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
      fetch: mockFetch,
    })
    session = client.session()
  })

  afterEach(async () => {
    try {
      await session.close()
    } catch {
      // Ignore
    }
    await client.close()
    vi.restoreAllMocks()
  })

  describe('run()', () => {
    it('should execute query in transaction', async () => {
      const tx = await session.beginTransaction()

      // Query response
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            keys: ['name'],
            records: [{ name: 'Alice' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      // Rollback response
      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await tx.run('MATCH (n:Person) RETURN n.name as name')

      expect(result.keys).toEqual(['name'])
      expect(result.records).toHaveLength(1)
      expect(result.records[0].get('name')).toBe('Alice')

      // Verify the request was made to the transaction endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.neo4j.do/tx/tx-123',
        expect.any(Object)
      )

      await tx.rollback()
    })

    it('should throw error when transaction is closed', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.rollback()

      await expect(tx.run('MATCH (n) RETURN n')).rejects.toThrow(
        /closed transaction/i
      )
    })
  })

  describe('commit()', () => {
    it('should commit the transaction', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bookmarks: ['bookmark:tx-123'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      await tx.commit()

      expect(tx.closed).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.neo4j.do/tx/tx-123/commit',
        expect.any(Object)
      )
    })

    it('should throw error when already closed', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.rollback()

      await expect(tx.commit()).rejects.toThrow(/closed/i)
    })
  })

  describe('rollback()', () => {
    it('should rollback the transaction', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.rollback()

      expect(tx.closed).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.neo4j.do/tx/tx-123/rollback',
        expect.any(Object)
      )
    })

    it('should be idempotent', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.rollback()
      await tx.rollback() // Should not throw

      expect(tx.closed).toBe(true)
    })
  })

  describe('isOpen()', () => {
    it('should return true for new transaction', async () => {
      const tx = await session.beginTransaction()

      expect(tx.isOpen()).toBe(true)

      // Rollback response
      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.rollback()
    })

    it('should return false after commit', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ bookmarks: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.commit()

      expect(tx.isOpen()).toBe(false)
    })

    it('should return false after rollback', async () => {
      const tx = await session.beginTransaction()

      mockFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await tx.rollback()

      expect(tx.isOpen()).toBe(false)
    })
  })
})

describe('Authentication helpers', () => {
  describe('basicAuth()', () => {
    it('should create basic auth token', () => {
      const auth = basicAuth('neo4j', 'password')

      expect(auth).toEqual({
        scheme: 'basic',
        principal: 'neo4j',
        credentials: 'password',
      })
    })
  })

  describe('bearerAuth()', () => {
    it('should create bearer auth token', () => {
      const auth = bearerAuth('my-jwt-token')

      expect(auth).toEqual({
        scheme: 'bearer',
        credentials: 'my-jwt-token',
      })
    })
  })
})

describe('createHttpClient()', () => {
  it('should create a Neo4jHttpClient instance', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    const client = createHttpClient(
      'https://test.neo4j.do',
      basicAuth('neo4j', 'password'),
      { fetch: mockFetch }
    )

    expect(client).toBeInstanceOf(Neo4jHttpClient)
    expect(client.baseUrl).toBe('https://test.neo4j.do')
  })
})

describe('Query construction', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let client: Neo4jHttpClient

  beforeEach(() => {
    mockFetch = createMockFetch()
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ keys: [], records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
      fetch: mockFetch,
    })
  })

  afterEach(async () => {
    await client.close()
    vi.restoreAllMocks()
  })

  it('should send correct request body for query with parameters', async () => {
    await client.run(
      'CREATE (n:Person {name: $name, age: $age}) RETURN n',
      { name: 'Alice', age: 30 },
      { database: 'mydb', routing: 'WRITE' }
    )

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(body).toEqual({
      query: 'CREATE (n:Person {name: $name, age: $age}) RETURN n',
      parameters: { name: 'Alice', age: 30 },
      database: 'mydb',
      bookmarks: undefined,
      routing: 'WRITE',
    })
  })

  it('should use default database when not specified', async () => {
    await client.run('MATCH (n) RETURN n')

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(body.database).toBe('neo4j')
  })

  it('should include bookmarks when provided', async () => {
    await client.run('MATCH (n) RETURN n', undefined, {
      bookmarks: ['bookmark:1', 'bookmark:2'],
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(body.bookmarks).toEqual(['bookmark:1', 'bookmark:2'])
  })

  it('should send authentication headers', async () => {
    await client.close()

    client = new Neo4jHttpClient(
      'https://test.neo4j.do',
      basicAuth('neo4j', 'secret'),
      { fetch: mockFetch }
    )

    await client.run('MATCH (n) RETURN n')

    const [, options] = mockFetch.mock.calls[0]
    const authHeader = options.headers['Authorization']

    expect(authHeader).toBe(`Basic ${btoa('neo4j:secret')}`)
  })
})

describe('Error handling', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let client: Neo4jHttpClient

  beforeEach(() => {
    mockFetch = createMockFetch()
    client = new Neo4jHttpClient('https://test.neo4j.do', undefined, {
      fetch: mockFetch,
    })
  })

  afterEach(async () => {
    await client.close()
    vi.restoreAllMocks()
  })

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(client.run('MATCH (n) RETURN n')).rejects.toThrow(NetworkError)
  })

  it('should handle 500 server errors', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'Neo.DatabaseError.General.UnknownError',
            message: 'Internal server error',
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(client.run('MATCH (n) RETURN n')).rejects.toThrow(ServerError)
  })

  it('should handle 404 not found errors', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'Neo.ClientError.Database.DatabaseNotFound',
            message: 'Database not found',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(client.run('MATCH (n) RETURN n')).rejects.toThrow(ServerError)
  })

  it('should preserve error code from server', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'Neo.ClientError.Statement.SyntaxError',
            message: 'Invalid input',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    )

    try {
      await client.run('INVALID SYNTAX')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ServerError)
      expect((error as ServerError).code).toBe('Neo.ClientError.Statement.SyntaxError')
    }
  })
})
