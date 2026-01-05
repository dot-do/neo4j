import { describe, it, expect } from 'vitest'
import {
  ResultSummary,
  QueryStatistics,
  Plan,
  ProfiledPlan,
  Notification,
  ServerInfo
} from '../result-summary'

describe('QueryStatistics', () => {
  describe('constructor', () => {
    it('should create QueryStatistics with default values', () => {
      const stats = new QueryStatistics({})
      expect(stats).toBeInstanceOf(QueryStatistics)
    })

    it('should create QueryStatistics from metadata object', () => {
      const stats = new QueryStatistics({
        nodesCreated: 5,
        nodesDeleted: 2,
        relationshipsCreated: 3
      })
      expect(stats.updates().nodesCreated).toBe(5)
      expect(stats.updates().nodesDeleted).toBe(2)
      expect(stats.updates().relationshipsCreated).toBe(3)
    })
  })

  describe('updates()', () => {
    it('should return all statistics as a Stats object', () => {
      const stats = new QueryStatistics({
        nodesCreated: 1,
        nodesDeleted: 2,
        relationshipsCreated: 3,
        relationshipsDeleted: 4,
        propertiesSet: 5,
        labelsAdded: 6,
        labelsRemoved: 7,
        indexesAdded: 8,
        indexesRemoved: 9,
        constraintsAdded: 10,
        constraintsRemoved: 11
      })

      const updates = stats.updates()
      expect(updates.nodesCreated).toBe(1)
      expect(updates.nodesDeleted).toBe(2)
      expect(updates.relationshipsCreated).toBe(3)
      expect(updates.relationshipsDeleted).toBe(4)
      expect(updates.propertiesSet).toBe(5)
      expect(updates.labelsAdded).toBe(6)
      expect(updates.labelsRemoved).toBe(7)
      expect(updates.indexesAdded).toBe(8)
      expect(updates.indexesRemoved).toBe(9)
      expect(updates.constraintsAdded).toBe(10)
      expect(updates.constraintsRemoved).toBe(11)
    })

    it('should default all values to 0', () => {
      const stats = new QueryStatistics({})
      const updates = stats.updates()

      expect(updates.nodesCreated).toBe(0)
      expect(updates.nodesDeleted).toBe(0)
      expect(updates.relationshipsCreated).toBe(0)
      expect(updates.relationshipsDeleted).toBe(0)
      expect(updates.propertiesSet).toBe(0)
      expect(updates.labelsAdded).toBe(0)
      expect(updates.labelsRemoved).toBe(0)
      expect(updates.indexesAdded).toBe(0)
      expect(updates.indexesRemoved).toBe(0)
      expect(updates.constraintsAdded).toBe(0)
      expect(updates.constraintsRemoved).toBe(0)
    })
  })

  describe('containsUpdates()', () => {
    it('should return true when nodes were created', () => {
      const stats = new QueryStatistics({ nodesCreated: 1 })
      expect(stats.containsUpdates()).toBe(true)
    })

    it('should return true when properties were set', () => {
      const stats = new QueryStatistics({ propertiesSet: 1 })
      expect(stats.containsUpdates()).toBe(true)
    })

    it('should return true when relationships were created', () => {
      const stats = new QueryStatistics({ relationshipsCreated: 1 })
      expect(stats.containsUpdates()).toBe(true)
    })

    it('should return false when no updates', () => {
      const stats = new QueryStatistics({})
      expect(stats.containsUpdates()).toBe(false)
    })

    it('should return true for any non-zero counter', () => {
      const stats = new QueryStatistics({ constraintsRemoved: 1 })
      expect(stats.containsUpdates()).toBe(true)
    })
  })

  describe('containsSystemUpdates()', () => {
    it('should return true when system updates exist', () => {
      const stats = new QueryStatistics({ systemUpdates: 1 })
      expect(stats.containsSystemUpdates()).toBe(true)
    })

    it('should return false when no system updates', () => {
      const stats = new QueryStatistics({})
      expect(stats.containsSystemUpdates()).toBe(false)
    })
  })

  describe('systemUpdates()', () => {
    it('should return the number of system updates', () => {
      const stats = new QueryStatistics({ systemUpdates: 5 })
      expect(stats.systemUpdates()).toBe(5)
    })

    it('should default to 0', () => {
      const stats = new QueryStatistics({})
      expect(stats.systemUpdates()).toBe(0)
    })
  })
})

describe('ServerInfo', () => {
  it('should store server address', () => {
    const info = new ServerInfo('localhost:7687', '5.0.0')
    expect(info.address).toBe('localhost:7687')
  })

  it('should store server version', () => {
    const info = new ServerInfo('localhost:7687', 'Neo4j/5.0.0')
    expect(info.version).toBe('Neo4j/5.0.0')
  })

  it('should have protocolVersion property', () => {
    const info = new ServerInfo('localhost:7687', '5.0.0', 5.0)
    expect(info.protocolVersion).toBe(5.0)
  })
})

describe('Plan', () => {
  it('should store plan properties', () => {
    const plan: Plan = {
      operatorType: 'AllNodesScan',
      identifiers: ['n'],
      arguments: { version: 'CYPHER 5' },
      children: []
    }
    expect(plan.operatorType).toBe('AllNodesScan')
    expect(plan.identifiers).toEqual(['n'])
    expect(plan.arguments).toEqual({ version: 'CYPHER 5' })
    expect(plan.children).toEqual([])
  })

  it('should support nested children plans', () => {
    const childPlan: Plan = {
      operatorType: 'Filter',
      identifiers: ['n'],
      arguments: {},
      children: []
    }
    const plan: Plan = {
      operatorType: 'ProduceResults',
      identifiers: ['n'],
      arguments: {},
      children: [childPlan]
    }
    expect(plan.children).toHaveLength(1)
    expect(plan.children[0].operatorType).toBe('Filter')
  })
})

describe('ProfiledPlan', () => {
  it('should extend Plan with profiling info', () => {
    const profile: ProfiledPlan = {
      operatorType: 'AllNodesScan',
      identifiers: ['n'],
      arguments: {},
      children: [],
      dbHits: 100,
      rows: 50,
      pageCacheHits: 10,
      pageCacheMisses: 2,
      pageCacheHitRatio: 0.83,
      time: 5
    }
    expect(profile.dbHits).toBe(100)
    expect(profile.rows).toBe(50)
    expect(profile.pageCacheHits).toBe(10)
    expect(profile.pageCacheMisses).toBe(2)
    expect(profile.pageCacheHitRatio).toBe(0.83)
    expect(profile.time).toBe(5)
  })
})

describe('Notification', () => {
  it('should store notification properties', () => {
    const notification: Notification = {
      code: 'Neo.ClientNotification.Statement.CartesianProduct',
      title: 'Cartesian product warning',
      description: 'A cartesian product was generated',
      severity: 'WARNING',
      position: { offset: 0, line: 1, column: 1 }
    }
    expect(notification.code).toBe('Neo.ClientNotification.Statement.CartesianProduct')
    expect(notification.title).toBe('Cartesian product warning')
    expect(notification.severity).toBe('WARNING')
    expect(notification.position?.line).toBe(1)
  })

  it('should handle notification without position', () => {
    const notification: Notification = {
      code: 'Neo.ClientNotification.Statement.UnknownFunction',
      title: 'Unknown function',
      description: 'The function is not known',
      severity: 'WARNING'
    }
    expect(notification.position).toBeUndefined()
  })
})

describe('ResultSummary', () => {
  describe('constructor', () => {
    it('should create ResultSummary with query info', () => {
      const summary = new ResultSummary(
        'MATCH (n) RETURN n',
        { param: 'value' },
        {}
      )
      expect(summary.query.text).toBe('MATCH (n) RETURN n')
      expect(summary.query.parameters).toEqual({ param: 'value' })
    })

    it('should create ResultSummary from metadata', () => {
      const summary = new ResultSummary(
        'CREATE (n)',
        {},
        {
          type: 'w',
          stats: { nodesCreated: 1 }
        }
      )
      expect(summary).toBeInstanceOf(ResultSummary)
    })
  })

  describe('queryType', () => {
    it('should be "r" for read-only queries', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, { type: 'r' })
      expect(summary.queryType).toBe('r')
    })

    it('should be "w" for write-only queries', () => {
      const summary = new ResultSummary('CREATE (n)', {}, { type: 'w' })
      expect(summary.queryType).toBe('w')
    })

    it('should be "rw" for read-write queries', () => {
      const summary = new ResultSummary('MATCH (n) SET n.x = 1', {}, { type: 'rw' })
      expect(summary.queryType).toBe('rw')
    })

    it('should be "s" for schema queries', () => {
      const summary = new ResultSummary('CREATE INDEX ON :Label(prop)', {}, { type: 's' })
      expect(summary.queryType).toBe('s')
    })
  })

  describe('counters', () => {
    it('should return QueryStatistics object', () => {
      const summary = new ResultSummary(
        'CREATE (n)',
        {},
        { stats: { nodesCreated: 1 } }
      )
      expect(summary.counters).toBeInstanceOf(QueryStatistics)
      expect(summary.counters.updates().nodesCreated).toBe(1)
    })
  })

  describe('updateStatistics()', () => {
    it('should be an alias for counters', () => {
      const summary = new ResultSummary(
        'CREATE (n)',
        {},
        { stats: { nodesCreated: 2 } }
      )
      expect(summary.updateStatistics()).toBe(summary.counters)
    })
  })

  describe('plan', () => {
    it('should be null when no plan available', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.plan).toBeNull()
    })

    it('should return Plan when available', () => {
      const planData = {
        operatorType: 'AllNodesScan',
        identifiers: ['n'],
        arguments: {},
        children: []
      }
      const summary = new ResultSummary('EXPLAIN MATCH (n) RETURN n', {}, { plan: planData })
      expect(summary.plan).toEqual(planData)
    })
  })

  describe('profile', () => {
    it('should be null when no profile available', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.profile).toBeNull()
    })

    it('should return ProfiledPlan when available', () => {
      const profileData = {
        operatorType: 'AllNodesScan',
        identifiers: ['n'],
        arguments: {},
        children: [],
        dbHits: 50,
        rows: 25
      }
      const summary = new ResultSummary('PROFILE MATCH (n) RETURN n', {}, { profile: profileData })
      expect(summary.profile).toEqual(profileData)
    })
  })

  describe('hasPlan()', () => {
    it('should return true when plan is available', () => {
      const summary = new ResultSummary('EXPLAIN MATCH (n) RETURN n', {}, {
        plan: { operatorType: 'X', identifiers: [], arguments: {}, children: [] }
      })
      expect(summary.hasPlan()).toBe(true)
    })

    it('should return false when no plan', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.hasPlan()).toBe(false)
    })
  })

  describe('hasProfile()', () => {
    it('should return true when profile is available', () => {
      const summary = new ResultSummary('PROFILE MATCH (n) RETURN n', {}, {
        profile: { operatorType: 'X', identifiers: [], arguments: {}, children: [], dbHits: 0, rows: 0 }
      })
      expect(summary.hasProfile()).toBe(true)
    })

    it('should return false when no profile', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.hasProfile()).toBe(false)
    })
  })

  describe('notifications', () => {
    it('should return empty array when no notifications', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.notifications).toEqual([])
    })

    it('should return notifications array', () => {
      const notifications = [
        { code: 'Neo.Warning.1', title: 'Warning', description: 'Desc', severity: 'WARNING' }
      ]
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, { notifications })
      expect(summary.notifications).toHaveLength(1)
      expect(summary.notifications[0].code).toBe('Neo.Warning.1')
    })
  })

  describe('server', () => {
    it('should return ServerInfo', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {
        server: { address: 'localhost:7687', version: 'Neo4j/5.0.0' }
      })
      expect(summary.server.address).toBe('localhost:7687')
      expect(summary.server.version).toBe('Neo4j/5.0.0')
    })

    it('should have default server info when not provided', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.server).toBeInstanceOf(ServerInfo)
    })
  })

  describe('timing properties', () => {
    it('should have resultConsumedAfter', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {
        resultConsumedAfter: 100
      })
      expect(summary.resultConsumedAfter).toBe(100)
    })

    it('should have resultAvailableAfter', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {
        resultAvailableAfter: 50
      })
      expect(summary.resultAvailableAfter).toBe(50)
    })

    it('should default timing to 0', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.resultConsumedAfter).toBe(0)
      expect(summary.resultAvailableAfter).toBe(0)
    })
  })

  describe('database', () => {
    it('should return database info', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {
        db: { name: 'neo4j' }
      })
      expect(summary.database.name).toBe('neo4j')
    })

    it('should handle undefined database name', () => {
      const summary = new ResultSummary('MATCH (n) RETURN n', {}, {})
      expect(summary.database.name).toBeUndefined()
    })
  })
})
