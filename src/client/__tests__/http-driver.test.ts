/**
 * Tests for Neo4jHttpDriver
 * RED Phase tests for the HTTP Driver class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Neo4jHttpDriver, HttpSession } from '../http-driver'

// Mock fetch for testing
const createMockFetch = () => vi.fn()

describe('Neo4jHttpDriver', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = createMockFetch()
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ keys: [], records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create driver with baseUrl', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    expect(driver).toBeInstanceOf(Neo4jHttpDriver)
    expect(driver.baseUrl).toBe('https://neo4j.do/db/mydb')
  })

  it('should remove trailing slash from baseUrl', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb/', { fetch: mockFetch })
    expect(driver.baseUrl).toBe('https://neo4j.do/db/mydb')
  })

  it('should create driver with auth credentials', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
      auth: { username: 'neo4j', password: 'password' },
      fetch: mockFetch,
    })
    expect(driver.isAuthenticated).toBe(true)
  })

  it('should create driver with token auth', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
      auth: { token: 'my-jwt-token' },
      fetch: mockFetch,
    })
    expect(driver.isAuthenticated).toBe(true)
  })

  it('should report not authenticated when no auth provided', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    expect(driver.isAuthenticated).toBe(false)
  })

  it('should return HttpSession from session()', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    const session = driver.session()
    expect(session).toBeInstanceOf(HttpSession)
  })

  it('should throw when creating session on closed driver', async () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    await driver.close()
    expect(() => driver.session()).toThrow(/closed/i)
  })

  it('should execute query via HTTP', async () => {
    const responseData = {
      keys: ['n'],
      records: [{ n: 1 }],
      summary: { queryType: 'r' },
    }
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    const result = await driver.executeQuery('RETURN 1 as n')

    expect(result.records).toHaveLength(1)
    expect(result.records[0].get('n')).toBe(1)
  })

  it('should execute query with parameters', async () => {
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

    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    const result = await driver.executeQuery('MATCH (n:Person {name: $name}) RETURN n.name as name', {
      name: 'Alice',
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].get('name')).toBe('Alice')
  })

  it('should get server info via HTTP', async () => {
    const serverInfo = {
      address: 'neo4j.do',
      protocolVersion: '1.0',
    }
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(serverInfo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    const info = await driver.getServerInfo()

    expect(info.address).toBeDefined()
    expect(info.protocolVersion).toBeDefined()
  })

  it('should close driver and cleanup resources', async () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
    expect(driver.isClosed).toBe(false)

    await driver.close()

    expect(driver.isClosed).toBe(true)
  })

  it('should support optional connection pooling', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
      maxConnectionPoolSize: 10,
      fetch: mockFetch,
    })
    expect(driver.config.maxConnectionPoolSize).toBe(10)
  })

  it('should support connection timeout config', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
      connectionTimeout: 5000,
      fetch: mockFetch,
    })
    expect(driver.config.connectionTimeout).toBe(5000)
  })

  it('should support custom headers', () => {
    const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
      headers: { 'X-Custom-Header': 'value' },
      fetch: mockFetch,
    })
    expect(driver.config.headers).toEqual({ 'X-Custom-Header': 'value' })
  })

  describe('Authentication headers', () => {
    it('should send Basic auth header for username/password auth', async () => {
      const responseData = { keys: [], records: [] }
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
        auth: { username: 'neo4j', password: 'secret' },
        fetch: mockFetch,
      })

      await driver.executeQuery('RETURN 1')

      expect(mockFetch).toHaveBeenCalled()
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers['Authorization']).toBe(`Basic ${btoa('neo4j:secret')}`)
    })

    it('should send Bearer auth header for token auth', async () => {
      const responseData = { keys: [], records: [] }
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', {
        auth: { token: 'my-jwt-token' },
        fetch: mockFetch,
      })

      await driver.executeQuery('RETURN 1')

      expect(mockFetch).toHaveBeenCalled()
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers['Authorization']).toBe('Bearer my-jwt-token')
    })
  })
})

describe('HttpSession from Neo4jHttpDriver', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let driver: Neo4jHttpDriver

  beforeEach(() => {
    mockFetch = createMockFetch()
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ keys: [], records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    driver = new Neo4jHttpDriver('https://neo4j.do/db/mydb', { fetch: mockFetch })
  })

  afterEach(async () => {
    await driver.close()
    vi.restoreAllMocks()
  })

  it('should run queries through session', async () => {
    const responseData = {
      keys: ['name'],
      records: [{ name: 'Bob' }],
      summary: { queryType: 'r' },
    }
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const session = driver.session()
    const result = await session.run('MATCH (n) RETURN n.name as name')

    expect(result.records).toHaveLength(1)
    expect(result.records[0].get('name')).toBe('Bob')

    await session.close()
  })

  it('should create session with database config', () => {
    const session = driver.session({ database: 'mydb' })
    expect(session).toBeInstanceOf(HttpSession)
  })

  it('should report session as closed after close()', async () => {
    const session = driver.session()
    expect(session.closed).toBe(false)
    await session.close()
    expect(session.closed).toBe(true)
  })
})
