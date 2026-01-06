/**
 * Result Summary types for neo4j.do
 * 100% API compatible with neo4j-driver ResultSummary
 */

/**
 * Statistics about query execution
 */
export interface Stats {
  nodesCreated: number
  nodesDeleted: number
  relationshipsCreated: number
  relationshipsDeleted: number
  propertiesSet: number
  labelsAdded: number
  labelsRemoved: number
  indexesAdded: number
  indexesRemoved: number
  constraintsAdded: number
  constraintsRemoved: number
}

/**
 * Input for QueryStatistics constructor
 */
export interface QueryStatisticsInput {
  nodesCreated?: number
  nodesDeleted?: number
  relationshipsCreated?: number
  relationshipsDeleted?: number
  propertiesSet?: number
  labelsAdded?: number
  labelsRemoved?: number
  indexesAdded?: number
  indexesRemoved?: number
  constraintsAdded?: number
  constraintsRemoved?: number
  systemUpdates?: number
}

/**
 * QueryStatistics represents the statistics of query execution.
 * API compatible with neo4j-driver QueryStatistics.
 */
export class QueryStatistics {
  private readonly _stats: Stats
  private readonly _systemUpdates: number

  constructor(input: QueryStatisticsInput) {
    this._stats = {
      nodesCreated: input.nodesCreated ?? 0,
      nodesDeleted: input.nodesDeleted ?? 0,
      relationshipsCreated: input.relationshipsCreated ?? 0,
      relationshipsDeleted: input.relationshipsDeleted ?? 0,
      propertiesSet: input.propertiesSet ?? 0,
      labelsAdded: input.labelsAdded ?? 0,
      labelsRemoved: input.labelsRemoved ?? 0,
      indexesAdded: input.indexesAdded ?? 0,
      indexesRemoved: input.indexesRemoved ?? 0,
      constraintsAdded: input.constraintsAdded ?? 0,
      constraintsRemoved: input.constraintsRemoved ?? 0
    }
    this._systemUpdates = input.systemUpdates ?? 0
  }

  /**
   * Returns all statistics as a Stats object.
   */
  updates(): Stats {
    return { ...this._stats }
  }

  /**
   * Returns true if any update counters are non-zero.
   */
  containsUpdates(): boolean {
    return Object.values(this._stats).some(value => value > 0)
  }

  /**
   * Returns true if system updates were made.
   */
  containsSystemUpdates(): boolean {
    return this._systemUpdates > 0
  }

  /**
   * Returns the number of system updates.
   */
  systemUpdates(): number {
    return this._systemUpdates
  }

  /**
   * Returns the number of nodes created.
   */
  nodesCreated(): number {
    return this._stats.nodesCreated
  }

  /**
   * Returns the number of nodes deleted.
   */
  nodesDeleted(): number {
    return this._stats.nodesDeleted
  }

  /**
   * Returns the number of relationships created.
   */
  relationshipsCreated(): number {
    return this._stats.relationshipsCreated
  }

  /**
   * Returns the number of relationships deleted.
   */
  relationshipsDeleted(): number {
    return this._stats.relationshipsDeleted
  }

  /**
   * Returns the number of properties set.
   */
  propertiesSet(): number {
    return this._stats.propertiesSet
  }

  /**
   * Returns the number of labels added.
   */
  labelsAdded(): number {
    return this._stats.labelsAdded
  }

  /**
   * Returns the number of labels removed.
   */
  labelsRemoved(): number {
    return this._stats.labelsRemoved
  }

  /**
   * Returns the number of indexes added.
   */
  indexesAdded(): number {
    return this._stats.indexesAdded
  }

  /**
   * Returns the number of indexes removed.
   */
  indexesRemoved(): number {
    return this._stats.indexesRemoved
  }

  /**
   * Returns the number of constraints added.
   */
  constraintsAdded(): number {
    return this._stats.constraintsAdded
  }

  /**
   * Returns the number of constraints removed.
   */
  constraintsRemoved(): number {
    return this._stats.constraintsRemoved
  }
}

/**
 * Plan represents a query execution plan (from EXPLAIN).
 */
export interface Plan {
  operatorType: string
  identifiers: string[]
  arguments: Record<string, unknown>
  children: Plan[]
}

/**
 * ProfiledPlan extends Plan with profiling information (from PROFILE).
 */
export interface ProfiledPlan extends Plan {
  dbHits: number
  rows: number
  pageCacheHits?: number
  pageCacheMisses?: number
  pageCacheHitRatio?: number
  time?: number
  children: ProfiledPlan[]
}

/**
 * Notification position in the query.
 */
export interface NotificationPosition {
  offset: number
  line: number
  column: number
}

/**
 * Notification represents a warning or information message from the database.
 */
export interface Notification {
  code: string
  title: string
  description: string
  severity: string
  position?: NotificationPosition
}

/**
 * ServerInfo contains information about the Neo4j server.
 */
export class ServerInfo {
  readonly address: string
  readonly version: string
  readonly protocolVersion?: number

  constructor(address: string, version: string, protocolVersion?: number) {
    this.address = address
    this.version = version
    this.protocolVersion = protocolVersion
  }
}

/**
 * Database information.
 */
export interface DatabaseInfo {
  name?: string
}

/**
 * Query type: read, write, read-write, or schema.
 */
export type QueryType = 'r' | 'w' | 'rw' | 's'

/**
 * Metadata passed to ResultSummary constructor.
 */
export interface ResultSummaryMetadata {
  type?: QueryType
  stats?: QueryStatisticsInput
  plan?: Plan
  profile?: ProfiledPlan
  notifications?: Notification[]
  server?: {
    address: string
    version: string
    protocolVersion?: number
  }
  resultConsumedAfter?: number
  resultAvailableAfter?: number
  db?: {
    name?: string
  }
}

/**
 * ResultSummary contains information about the result of a query execution.
 */
export class ResultSummary {
  readonly query: { text: string; parameters: Record<string, unknown> }
  readonly queryType: QueryType
  readonly counters: QueryStatistics
  readonly plan: Plan | null
  readonly profile: ProfiledPlan | null
  readonly notifications: Notification[]
  readonly server: ServerInfo
  readonly resultConsumedAfter: number
  readonly resultAvailableAfter: number
  readonly database: DatabaseInfo

  constructor(
    queryText: string,
    parameters: Record<string, unknown>,
    metadata: ResultSummaryMetadata
  ) {
    this.query = {
      text: queryText,
      parameters: parameters ?? {}
    }
    this.queryType = metadata.type ?? 'r'
    this.counters = new QueryStatistics(metadata.stats ?? {})
    this.plan = metadata.plan ?? null
    this.profile = metadata.profile ?? null
    this.notifications = metadata.notifications ?? []

    if (metadata.server) {
      this.server = new ServerInfo(
        metadata.server.address,
        metadata.server.version,
        metadata.server.protocolVersion
      )
    } else {
      this.server = new ServerInfo('', '')
    }

    this.resultConsumedAfter = metadata.resultConsumedAfter ?? 0
    this.resultAvailableAfter = metadata.resultAvailableAfter ?? 0
    this.database = metadata.db ?? {}
  }

  /**
   * Returns the query statistics (alias for counters).
   */
  updateStatistics(): QueryStatistics {
    return this.counters
  }

  /**
   * Returns true if a plan is available.
   */
  hasPlan(): boolean {
    return this.plan !== null
  }

  /**
   * Returns true if a profile is available.
   */
  hasProfile(): boolean {
    return this.profile !== null
  }
}
