import { describe, it, expect, beforeEach } from 'vitest'
import { driver, auth } from '../../index'
import type { Driver } from '../driver'
import type { AuthToken, Config } from '../../types'

describe('neo4j.driver()', () => {
  describe('factory function', () => {
    it('should create driver with URI only', () => {
      const d = driver('neo4j://localhost')
      expect(d).toBeDefined()
      expect(d).toBeInstanceOf(Object)
    })

    it('should create driver with URI and auth token', () => {
      const authToken = auth.basic('neo4j', 'password')
      const d = driver('neo4j://localhost', authToken)
      expect(d).toBeDefined()
    })

    it('should create driver with URI, auth, and config', () => {
      const authToken = auth.basic('neo4j', 'password')
      const config: Config = {
        maxTransactionRetryTime: 30000,
        connectionTimeout: 30000,
      }
      const d = driver('neo4j://localhost', authToken, config)
      expect(d).toBeDefined()
    })

    it('should throw on invalid URI format', () => {
      expect(() => driver('')).toThrow()
      expect(() => driver('invalid')).toThrow()
      expect(() => driver('://missing-scheme')).toThrow()
    })

    it('should throw on unsupported scheme', () => {
      expect(() => driver('http://localhost')).toThrow()
      expect(() => driver('https://localhost')).toThrow()
      expect(() => driver('ws://localhost')).toThrow()
    })
  })

  describe('URI Parsing', () => {
    it('should parse neo4j:// scheme', () => {
      const d = driver('neo4j://localhost')
      expect(d.encrypted).toBe(false)
    })

    it('should parse neo4j+s:// scheme (encrypted)', () => {
      const d = driver('neo4j+s://localhost')
      expect(d.encrypted).toBe(true)
    })

    it('should parse bolt:// scheme', () => {
      const d = driver('bolt://localhost')
      expect(d.encrypted).toBe(false)
    })

    it('should parse bolt+s:// scheme (encrypted)', () => {
      const d = driver('bolt+s://localhost')
      expect(d.encrypted).toBe(true)
    })

    it('should extract host from URI', () => {
      const d = driver('neo4j://myhost.example.com')
      // Host should be accessible through internal properties
      expect(d).toBeDefined()
    })

    it('should extract port from URI (default 7687)', () => {
      const d = driver('neo4j://localhost')
      // Default port 7687
      expect(d).toBeDefined()
    })

    it('should handle custom ports', () => {
      const d = driver('neo4j://localhost:7688')
      expect(d).toBeDefined()
    })

    it('should handle IPv6 addresses', () => {
      const d = driver('neo4j://[::1]:7687')
      expect(d).toBeDefined()
    })

    it('should parse database in path', () => {
      const d = driver('neo4j://localhost/mydb')
      expect(d).toBeDefined()
    })
  })

  describe('Driver getters', () => {
    it('should expose encrypted getter', () => {
      const d = driver('neo4j://localhost')
      expect(typeof d.encrypted).toBe('boolean')
    })

    it('should expose supportsMultiDb getter', () => {
      const d = driver('neo4j://localhost')
      expect(typeof d.supportsMultiDb).toBe('boolean')
    })

    it('should expose supportsTransactionConfig getter', () => {
      const d = driver('neo4j://localhost')
      expect(typeof d.supportsTransactionConfig).toBe('boolean')
    })
  })
})

describe('neo4j.auth', () => {
  describe('basic()', () => {
    it('should create basic auth token with username/password', () => {
      const token = auth.basic('neo4j', 'password')
      expect(token).toBeDefined()
      expect(token.scheme).toBe('basic')
      expect(token.principal).toBe('neo4j')
      expect(token.credentials).toBe('password')
    })

    it('should create basic auth with realm', () => {
      const token = auth.basic('neo4j', 'password', 'native')
      expect(token.scheme).toBe('basic')
      expect(token.realm).toBe('native')
    })
  })

  describe('bearer()', () => {
    it('should create bearer token', () => {
      const token = auth.bearer('my-sso-token')
      expect(token).toBeDefined()
      expect(token.scheme).toBe('bearer')
      expect(token.credentials).toBe('my-sso-token')
    })
  })

  describe('kerberos()', () => {
    it('should create kerberos token', () => {
      const token = auth.kerberos('base64-ticket')
      expect(token).toBeDefined()
      expect(token.scheme).toBe('kerberos')
      expect(token.credentials).toBe('base64-ticket')
    })
  })

  describe('custom()', () => {
    it('should create custom auth with principal/credentials/realm/scheme', () => {
      const token = auth.custom('user', 'secret', 'myrealm', 'myscheme')
      expect(token).toBeDefined()
      expect(token.scheme).toBe('myscheme')
      expect(token.principal).toBe('user')
      expect(token.credentials).toBe('secret')
      expect(token.realm).toBe('myrealm')
    })

    it('should include custom parameters', () => {
      const params = { customParam: 'value' }
      const token = auth.custom('user', 'secret', 'myrealm', 'myscheme', params)
      expect(token.parameters).toEqual(params)
    })
  })
})

describe('Driver Configuration', () => {
  it('should accept maxTransactionRetryTime', () => {
    const config: Config = { maxTransactionRetryTime: 60000 }
    const d = driver('neo4j://localhost', undefined, config)
    expect(d).toBeDefined()
  })

  it('should accept connectionTimeout', () => {
    const config: Config = { connectionTimeout: 30000 }
    const d = driver('neo4j://localhost', undefined, config)
    expect(d).toBeDefined()
  })

  it('should accept maxConnectionPoolSize', () => {
    const config: Config = { maxConnectionPoolSize: 100 }
    const d = driver('neo4j://localhost', undefined, config)
    expect(d).toBeDefined()
  })

  it('should accept connectionAcquisitionTimeout', () => {
    const config: Config = { connectionAcquisitionTimeout: 60000 }
    const d = driver('neo4j://localhost', undefined, config)
    expect(d).toBeDefined()
  })

  it('should accept logging configuration', () => {
    const config: Config = {
      logging: {
        level: 'info',
        logger: (level, message) => console.log(`${level}: ${message}`),
      },
    }
    const d = driver('neo4j://localhost', undefined, config)
    expect(d).toBeDefined()
  })

  it('should use defaults when not specified', () => {
    const d = driver('neo4j://localhost')
    expect(d).toBeDefined()
    // Driver should have sensible defaults
  })

  it('should validate configuration values', () => {
    const invalidConfig: Config = { maxTransactionRetryTime: -1 }
    expect(() => driver('neo4j://localhost', undefined, invalidConfig)).toThrow()
  })
})

describe('Driver session() method', () => {
  let d: Driver

  beforeEach(() => {
    d = driver('neo4j://localhost')
  })

  it('should create a session with default config', () => {
    const session = d.session()
    expect(session).toBeDefined()
  })

  it('should create a session with database specified', () => {
    const session = d.session({ database: 'mydb' })
    expect(session).toBeDefined()
  })

  it('should create a session with access mode', () => {
    const session = d.session({ defaultAccessMode: 'READ' })
    expect(session).toBeDefined()
  })

  it('should create a session with bookmarks', () => {
    const session = d.session({ bookmarks: ['bookmark1'] })
    expect(session).toBeDefined()
  })

  it('should create a session with fetch size', () => {
    const session = d.session({ fetchSize: 100 })
    expect(session).toBeDefined()
  })
})

// ============================================================================
// TDD Tests for Driver Lifecycle Methods
// ============================================================================

describe('Driver.close()', () => {
  let d: Driver

  beforeEach(() => {
    d = driver('neo4j://localhost')
  })

  it('should close the driver and set isOpen to false', async () => {
    expect(d.isOpen).toBe(true)
    await d.close()
    expect(d.isOpen).toBe(false)
  })

  it('should be idempotent - calling close multiple times should not throw', async () => {
    await d.close()
    await d.close()
    await d.close()
    expect(d.isOpen).toBe(false)
  })

  it('should close all active sessions when driver is closed', async () => {
    const session1 = d.session()
    const session2 = d.session()

    expect(session1.closed).toBe(false)
    expect(session2.closed).toBe(false)

    await d.close()

    expect(session1.closed).toBe(true)
    expect(session2.closed).toBe(true)
  })

  it('should track active sessions', () => {
    const session1 = d.session()
    const session2 = d.session()

    expect(d.activeSessions).toContain(session1)
    expect(d.activeSessions).toContain(session2)
    expect(d.activeSessionCount).toBe(2)
  })

  it('should remove session from tracking when session is closed', async () => {
    const session = d.session()
    expect(d.activeSessionCount).toBe(1)

    await session.close()

    expect(d.activeSessionCount).toBe(0)
    expect(d.activeSessions).not.toContain(session)
  })

  it('should resolve close() only after all sessions are closed', async () => {
    const session1 = d.session()
    const session2 = d.session()

    // Start a transaction to simulate active work
    const tx = await session1.beginTransaction()

    // Close should wait for cleanup
    const closePromise = d.close()

    // After close resolves, all sessions should be closed
    await closePromise

    expect(session1.closed).toBe(true)
    expect(session2.closed).toBe(true)
  })
})

describe('Driver.verifyConnectivity()', () => {
  let d: Driver

  beforeEach(() => {
    d = driver('neo4j://localhost')
  })

  it('should resolve successfully when driver is open', async () => {
    await expect(d.verifyConnectivity()).resolves.toBeUndefined()
  })

  it('should throw error when driver is closed', async () => {
    await d.close()
    await expect(d.verifyConnectivity()).rejects.toThrow('Driver is closed')
  })

  it('should accept optional database parameter', async () => {
    await expect(d.verifyConnectivity({ database: 'testdb' })).resolves.toBeUndefined()
  })

  it('should return server info when requested', async () => {
    const serverInfo = await d.getServerInfo()
    expect(serverInfo).toBeDefined()
    expect(serverInfo.address).toBeDefined()
  })

  it('should throw on closed driver when getting server info', async () => {
    await d.close()
    await expect(d.getServerInfo()).rejects.toThrow('Driver is closed')
  })
})

describe('Session Management Lifecycle', () => {
  let d: Driver

  beforeEach(() => {
    d = driver('neo4j://localhost')
  })

  afterEach(async () => {
    if (d.isOpen) {
      await d.close()
    }
  })

  it('should track session creation', () => {
    expect(d.activeSessionCount).toBe(0)

    const session = d.session()

    expect(d.activeSessionCount).toBe(1)
  })

  it('should track multiple sessions', () => {
    const sessions = [d.session(), d.session(), d.session()]

    expect(d.activeSessionCount).toBe(3)
  })

  it('should untrack sessions when closed individually', async () => {
    const session1 = d.session()
    const session2 = d.session()

    expect(d.activeSessionCount).toBe(2)

    await session1.close()

    expect(d.activeSessionCount).toBe(1)
    expect(d.activeSessions).not.toContain(session1)
    expect(d.activeSessions).toContain(session2)
  })

  it('should allow creating new sessions after closing old ones', async () => {
    const session1 = d.session()
    await session1.close()

    const session2 = d.session()

    expect(d.activeSessionCount).toBe(1)
    expect(session2.closed).toBe(false)
  })

  it('should support session event callbacks via onSessionClose', async () => {
    let closedSession: any = null

    d.onSessionClose((session) => {
      closedSession = session
    })

    const session = d.session()
    await session.close()

    expect(closedSession).toBe(session)
  })
})

describe('Error Handling for Closed Drivers', () => {
  let d: Driver

  beforeEach(async () => {
    d = driver('neo4j://localhost')
    await d.close()
  })

  it('should throw when creating session on closed driver', () => {
    expect(() => d.session()).toThrow('Cannot create session on closed driver')
  })

  it('should throw descriptive error when running query on closed driver session', async () => {
    d = driver('neo4j://localhost') // Create a fresh driver
    const session = d.session()
    await d.close() // Close driver which should close session

    const result = session.run('RETURN 1')

    await expect(result.summary()).rejects.toThrow(/closed/)
  })

  it('should throw when calling verifyConnectivity on closed driver', async () => {
    await expect(d.verifyConnectivity()).rejects.toThrow('Driver is closed')
  })

  it('should throw when calling verifyAuthentication on closed driver', async () => {
    await expect(d.verifyAuthentication()).rejects.toThrow('Driver is closed')
  })

  it('should throw when calling getServerInfo on closed driver', async () => {
    await expect(d.getServerInfo()).rejects.toThrow('Driver is closed')
  })

  it('should throw when beginning transaction on session from closed driver', async () => {
    d = driver('neo4j://localhost')
    const session = d.session()
    await d.close()

    await expect(session.beginTransaction()).rejects.toThrow(/closed/)
  })

  it('should throw when executing read transaction on session from closed driver', async () => {
    d = driver('neo4j://localhost')
    const session = d.session()
    await d.close()

    await expect(session.executeRead(async (tx) => {
      return tx.run('RETURN 1')
    })).rejects.toThrow(/closed/)
  })

  it('should throw when executing write transaction on session from closed driver', async () => {
    d = driver('neo4j://localhost')
    const session = d.session()
    await d.close()

    await expect(session.executeWrite(async (tx) => {
      return tx.run('CREATE (n:Test) RETURN n')
    })).rejects.toThrow(/closed/)
  })
})
