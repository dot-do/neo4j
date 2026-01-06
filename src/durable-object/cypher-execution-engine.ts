/**
 * CypherExecutionEngine - Executes Cypher queries against SQLite storage
 *
 * This module extracts the query execution logic from GraphDO to:
 * - Improve separation of concerns
 * - Enable independent testing
 * - Reduce GraphDO to a thin HTTP handler
 */

import { parse } from '../cypher/parser'
import type {
  Clause,
  MatchClause,
  CreateClause,
  ReturnClause,
  Pattern,
  NodePattern,
  RelationshipPattern,
  Expression,
  MapLiteral,
  PropertyAccess,
  Variable,
  FunctionCall,
} from '../cypher/ast/types'

/**
 * Node record stored in the database
 */
export interface NodeRecord {
  id: number
  labels: string
  properties: string
}

/**
 * Relationship record stored in the database
 */
export interface RelationshipRecord {
  id: number
  type: string
  start_node_id: number
  end_node_id: number
  properties: string
}

/**
 * Query counters for tracking changes
 */
export interface QueryCounters {
  nodesCreated: number
  nodesDeleted: number
  relationshipsCreated: number
  relationshipsDeleted: number
  propertiesSet: number
  labelsAdded: number
  labelsRemoved: number
}

/**
 * Query execution result
 */
export interface QueryResult {
  records: Record<string, unknown>[]
  summary: {
    counters: QueryCounters
  }
}

/**
 * Transaction work buffer for staged changes
 */
export interface TransactionWorkBuffer {
  nodes: Map<number, NodeRecord>
  relationships: Map<number, RelationshipRecord>
  createdNodeIds: Set<number>
  createdRelationshipIds: Set<number>
  deletedNodeIds: Set<number>
  deletedRelationshipIds: Set<number>
}

/**
 * SQL cursor result interface
 */
export interface SqlCursor<T = unknown> {
  toArray(): T[]
  one(): T | undefined
  [Symbol.iterator](): Iterator<T>
}

/**
 * SQL interface for storage
 */
export interface SqlStorage {
  exec<T = unknown>(sql: string, ...params: unknown[]): SqlCursor<T>
}

/**
 * Execution context for queries
 */
interface ExecutionContext {
  variables: Map<string, unknown>
  declaredVariables: Set<string>
  parameters: Record<string, unknown>
  counters: QueryCounters
  workBuffer?: TransactionWorkBuffer
  sql: SqlStorage
}

/**
 * ID generator interface
 */
export interface IdGenerator {
  nextNodeId(): number
  nextRelationshipId(): number
}

/**
 * Cypher execution error
 */
export class CypherError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'CypherError'
    this.code = code
  }
}

/**
 * CypherExecutionEngine executes parsed Cypher queries
 */
export class CypherExecutionEngine {
  private sql: SqlStorage
  private idGenerator: IdGenerator

  constructor(sql: SqlStorage, idGenerator: IdGenerator) {
    this.sql = sql
    this.idGenerator = idGenerator
  }

  /**
   * Execute a Cypher query
   */
  execute(
    queryString: string,
    parameters: Record<string, unknown>,
    workBuffer?: TransactionWorkBuffer
  ): QueryResult {
    const ast = parse(queryString)

    const counters: QueryCounters = {
      nodesCreated: 0,
      nodesDeleted: 0,
      relationshipsCreated: 0,
      relationshipsDeleted: 0,
      propertiesSet: 0,
      labelsAdded: 0,
      labelsRemoved: 0,
    }

    const context: ExecutionContext = {
      variables: new Map(),
      declaredVariables: new Set(),
      parameters,
      counters,
      workBuffer,
      sql: this.sql,
    }

    let records: Record<string, unknown>[] = []

    for (const clause of ast.clauses) {
      const result = this.executeClause(clause, context)
      if (result.records) {
        records = result.records
      }
    }

    return {
      records,
      summary: { counters },
    }
  }

  /**
   * Execute a single clause
   */
  private executeClause(
    clause: Clause,
    context: ExecutionContext
  ): { records?: Record<string, unknown>[] } {
    switch (clause.type) {
      case 'CreateClause':
        return this.executeCreate(clause as CreateClause, context)
      case 'MatchClause':
        return this.executeMatch(clause as MatchClause, context)
      case 'ReturnClause':
        return this.executeReturn(clause as ReturnClause, context)
      default:
        throw new CypherError(
          `Unsupported clause type: ${clause.type}`,
          'Neo.ClientError.Statement.NotImplemented'
        )
    }
  }

  /**
   * Execute CREATE clause
   */
  private executeCreate(
    clause: CreateClause,
    context: ExecutionContext
  ): { records?: Record<string, unknown>[] } {
    const pattern = clause.pattern
    const createdNodes: Map<string, NodeRecord> = new Map()

    // Declare all variables from the pattern first
    for (const element of pattern.elements) {
      if (element.type === 'NodePattern') {
        const nodePattern = element as NodePattern
        if (nodePattern.variable) {
          context.declaredVariables.add(nodePattern.variable)
        }
      } else if (element.type === 'RelationshipPattern') {
        const relPattern = element as RelationshipPattern
        if (relPattern.variable) {
          context.declaredVariables.add(relPattern.variable)
        }
      }
    }

    // Process pattern elements
    for (let i = 0; i < pattern.elements.length; i++) {
      const element = pattern.elements[i]

      if (element.type === 'NodePattern') {
        const nodePattern = element as NodePattern
        const node = this.createNode(nodePattern, context)
        createdNodes.set(nodePattern.variable || `_anon_${i}`, node)

        if (nodePattern.variable) {
          context.variables.set(nodePattern.variable, { type: 'node', data: node })
        }
      } else if (element.type === 'RelationshipPattern') {
        const relPattern = element as RelationshipPattern

        const prevElement = pattern.elements[i - 1] as NodePattern
        const nextElement = pattern.elements[i + 1] as NodePattern

        const startVar = prevElement.variable || `_anon_${i - 1}`
        const endVar = nextElement.variable || `_anon_${i + 1}`

        const startNode = createdNodes.get(startVar) || this.getNodeFromVariable(context, startVar)
        const endNode = createdNodes.get(endVar) || this.getNodeFromVariable(context, endVar)

        if (!startNode || !endNode) {
          throw new CypherError(
            'Cannot create relationship without both start and end nodes',
            'Neo.ClientError.Statement.SemanticError'
          )
        }

        const rel = this.createRelationship(relPattern, startNode.id, endNode.id, context)

        if (relPattern.variable) {
          context.variables.set(relPattern.variable, { type: 'relationship', data: rel })
        }
      }
    }

    return {}
  }

  /**
   * Create a node
   */
  private createNode(
    pattern: NodePattern,
    context: ExecutionContext
  ): NodeRecord {
    const labels = pattern.labels
    const properties = this.evaluateProperties(pattern.properties, context)

    const node: NodeRecord = {
      id: this.idGenerator.nextNodeId(),
      labels: JSON.stringify(labels),
      properties: JSON.stringify(properties),
    }

    if (context.workBuffer) {
      context.workBuffer.nodes.set(node.id, node)
      context.workBuffer.createdNodeIds.add(node.id)
    } else {
      context.sql.exec(
        'INSERT INTO nodes (id, labels, properties) VALUES (?, ?, ?)',
        node.id,
        node.labels,
        node.properties
      )
    }

    context.counters.nodesCreated++
    context.counters.labelsAdded += labels.length
    context.counters.propertiesSet += Object.keys(properties).length

    return node
  }

  /**
   * Create a relationship
   */
  private createRelationship(
    pattern: RelationshipPattern,
    startNodeId: number,
    endNodeId: number,
    context: ExecutionContext
  ): RelationshipRecord {
    const type = pattern.types[0] || 'RELATED_TO'
    const properties = this.evaluateProperties(pattern.properties, context)

    let actualStartId = startNodeId
    let actualEndId = endNodeId

    if (pattern.direction === 'LEFT') {
      actualStartId = endNodeId
      actualEndId = startNodeId
    }

    const rel: RelationshipRecord = {
      id: this.idGenerator.nextRelationshipId(),
      type,
      start_node_id: actualStartId,
      end_node_id: actualEndId,
      properties: JSON.stringify(properties),
    }

    if (context.workBuffer) {
      context.workBuffer.relationships.set(rel.id, rel)
      context.workBuffer.createdRelationshipIds.add(rel.id)
    } else {
      context.sql.exec(
        'INSERT INTO relationships (id, type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?, ?)',
        rel.id,
        rel.type,
        rel.start_node_id,
        rel.end_node_id,
        rel.properties
      )
    }

    context.counters.relationshipsCreated++
    context.counters.propertiesSet += Object.keys(properties).length

    return rel
  }

  /**
   * Execute MATCH clause
   */
  private executeMatch(
    clause: MatchClause,
    context: ExecutionContext
  ): { records?: Record<string, unknown>[] } {
    const pattern = clause.pattern
    const matches: Map<string, unknown>[] = []

    // Declare all variables from the pattern
    for (const element of pattern.elements) {
      if (element.type === 'NodePattern') {
        const nodePattern = element as NodePattern
        if (nodePattern.variable) {
          context.declaredVariables.add(nodePattern.variable)
        }
      } else if (element.type === 'RelationshipPattern') {
        const relPattern = element as RelationshipPattern
        if (relPattern.variable) {
          context.declaredVariables.add(relPattern.variable)
        }
      }
    }

    // For simple node patterns
    if (pattern.elements.length === 1 && pattern.elements[0].type === 'NodePattern') {
      const nodePattern = pattern.elements[0] as NodePattern
      const nodes = this.findNodes(nodePattern, context)

      for (const node of nodes) {
        const match = new Map<string, unknown>()
        if (nodePattern.variable) {
          match.set(nodePattern.variable, {
            type: 'node',
            data: node,
          })
        }

        // Apply WHERE filter
        if (clause.where) {
          const matchContext: ExecutionContext = {
            ...context,
            variables: new Map(context.variables),
            declaredVariables: new Set(context.declaredVariables),
          }
          if (nodePattern.variable) {
            matchContext.variables.set(nodePattern.variable, { type: 'node', data: node })
          }

          if (!this.evaluateExpression(clause.where, matchContext)) {
            continue
          }
        }

        matches.push(match)
      }
    } else if (pattern.elements.length >= 3) {
      // Pattern with relationships
      const patternMatches = this.matchPatternWithRelationships(pattern, clause.where, context)
      for (const match of patternMatches) {
        for (const [key, value] of match) {
          context.variables.set(key, value)
        }
      }
      return {}
    }

    // Store matches in context
    for (const match of matches) {
      for (const [key, value] of match) {
        context.variables.set(key, value)
      }
    }

    return {}
  }

  /**
   * Match a pattern with relationships
   */
  private matchPatternWithRelationships(
    pattern: Pattern,
    whereClause: Expression | undefined,
    context: ExecutionContext
  ): Map<string, unknown>[] {
    const results: Map<string, unknown>[] = []

    const startNodePattern = pattern.elements[0] as NodePattern
    const startNodes = this.findNodes(startNodePattern, context)

    for (const startNode of startNodes) {
      const match = new Map<string, unknown>()
      if (startNodePattern.variable) {
        match.set(startNodePattern.variable, { type: 'node', data: startNode })
      }

      let currentNodes = [{ node: startNode, match }]

      for (let i = 1; i < pattern.elements.length; i += 2) {
        const relPattern = pattern.elements[i] as RelationshipPattern
        const targetNodePattern = pattern.elements[i + 1] as NodePattern

        const nextNodes: Array<{ node: NodeRecord; match: Map<string, unknown> }> = []

        for (const { node: currentNode, match: currentMatch } of currentNodes) {
          const relationships = this.findRelationships(relPattern, currentNode.id, context)

          for (const rel of relationships) {
            let targetNodeId: number
            if (relPattern.direction === 'LEFT') {
              targetNodeId = rel.start_node_id
            } else {
              targetNodeId = rel.end_node_id
            }

            const targetNodes = this.findNodesById(targetNodeId, targetNodePattern, context)

            for (const targetNode of targetNodes) {
              const newMatch = new Map(currentMatch)

              if (relPattern.variable) {
                newMatch.set(relPattern.variable, { type: 'relationship', data: rel })
              }
              if (targetNodePattern.variable) {
                newMatch.set(targetNodePattern.variable, { type: 'node', data: targetNode })
              }

              nextNodes.push({ node: targetNode, match: newMatch })
            }
          }
        }

        currentNodes = nextNodes
      }

      // Add all final matches that pass WHERE filter
      for (const { match: finalMatch } of currentNodes) {
        if (whereClause) {
          const matchContext: ExecutionContext = {
            ...context,
            variables: new Map(context.variables),
            declaredVariables: new Set(context.declaredVariables),
          }
          for (const [key, value] of finalMatch) {
            matchContext.variables.set(key, value)
          }

          if (!this.evaluateExpression(whereClause, matchContext)) {
            continue
          }
        }

        results.push(finalMatch)
      }
    }

    return results
  }

  /**
   * Find nodes matching a pattern
   */
  private findNodes(
    pattern: NodePattern,
    context: ExecutionContext
  ): NodeRecord[] {
    let sql = 'SELECT id, labels, properties FROM nodes WHERE 1=1'
    const params: unknown[] = []

    // Filter by labels
    if (pattern.labels.length > 0) {
      for (const label of pattern.labels) {
        sql += ` AND json_each.value = ?`
        params.push(label)
      }
      sql = `SELECT n.id, n.labels, n.properties FROM nodes n, json_each(n.labels) WHERE json_each.value IN (${pattern.labels.map(() => '?').join(', ')})`
      params.length = 0
      params.push(...pattern.labels)
    }

    // Filter by properties
    if (pattern.properties) {
      const props = this.evaluateProperties(pattern.properties, context)
      for (const [key, value] of Object.entries(props)) {
        sql += ` AND json_extract(properties, '$.${key}') = ?`
        params.push(value)
      }
    }

    let result: NodeRecord[]

    if (pattern.labels.length > 0) {
      result = context.sql.exec<NodeRecord>(sql, ...params).toArray()
    } else {
      result = context.sql.exec<NodeRecord>(sql, ...params).toArray()
    }

    // Include transaction nodes
    if (context.workBuffer) {
      const txNodes = Array.from(context.workBuffer.nodes.values()).filter(node => {
        if (context.workBuffer!.deletedNodeIds.has(node.id)) {
          return false
        }

        // Check labels
        if (pattern.labels.length > 0) {
          const nodeLabels = JSON.parse(node.labels) as string[]
          if (!pattern.labels.every(l => nodeLabels.includes(l))) {
            return false
          }
        }

        // Check properties
        if (pattern.properties) {
          const nodeProps = JSON.parse(node.properties) as Record<string, unknown>
          const filterProps = this.evaluateProperties(pattern.properties, context)
          for (const [key, value] of Object.entries(filterProps)) {
            if (nodeProps[key] !== value) {
              return false
            }
          }
        }

        return true
      })

      // Merge results, avoiding duplicates
      const existingIds = new Set(result.map(n => n.id))
      for (const txNode of txNodes) {
        if (!existingIds.has(txNode.id)) {
          result.push(txNode)
        }
      }
    }

    return result
  }

  /**
   * Find nodes by ID with optional pattern matching
   */
  private findNodesById(
    nodeId: number,
    pattern: NodePattern,
    context: ExecutionContext
  ): NodeRecord[] {
    // Check transaction first
    if (context.workBuffer) {
      const txNode = context.workBuffer.nodes.get(nodeId)
      if (txNode && !context.workBuffer.deletedNodeIds.has(nodeId)) {
        // Check if it matches the pattern
        if (pattern.labels.length > 0) {
          const nodeLabels = JSON.parse(txNode.labels) as string[]
          if (!pattern.labels.every(l => nodeLabels.includes(l))) {
            return []
          }
        }
        return [txNode]
      }
    }

    let sql = 'SELECT id, labels, properties FROM nodes WHERE id = ?'
    const params: unknown[] = [nodeId]

    // Filter by labels
    if (pattern.labels.length > 0) {
      for (const label of pattern.labels) {
        sql += ` AND labels LIKE ?`
        params.push(`%"${label}"%`)
      }
    }

    return context.sql.exec<NodeRecord>(sql, ...params).toArray()
  }

  /**
   * Find relationships matching a pattern
   */
  private findRelationships(
    pattern: RelationshipPattern,
    nodeId: number,
    context: ExecutionContext
  ): RelationshipRecord[] {
    let sql: string
    const params: unknown[] = []

    if (pattern.direction === 'LEFT') {
      sql = 'SELECT id, type, start_node_id, end_node_id, properties FROM relationships WHERE end_node_id = ?'
      params.push(nodeId)
    } else if (pattern.direction === 'RIGHT') {
      sql = 'SELECT id, type, start_node_id, end_node_id, properties FROM relationships WHERE start_node_id = ?'
      params.push(nodeId)
    } else {
      sql = 'SELECT id, type, start_node_id, end_node_id, properties FROM relationships WHERE start_node_id = ? OR end_node_id = ?'
      params.push(nodeId, nodeId)
    }

    // Filter by type
    if (pattern.types.length > 0) {
      sql += ` AND type IN (${pattern.types.map(() => '?').join(', ')})`
      params.push(...pattern.types)
    }

    const result = context.sql.exec<RelationshipRecord>(sql, ...params).toArray()

    // Include transaction relationships
    if (context.workBuffer) {
      const txRels = Array.from(context.workBuffer.relationships.values()).filter(rel => {
        if (context.workBuffer!.deletedRelationshipIds.has(rel.id)) {
          return false
        }

        // Check direction
        if (pattern.direction === 'LEFT' && rel.end_node_id !== nodeId) {
          return false
        }
        if (pattern.direction === 'RIGHT' && rel.start_node_id !== nodeId) {
          return false
        }
        if (pattern.direction === 'NONE' && rel.start_node_id !== nodeId && rel.end_node_id !== nodeId) {
          return false
        }

        // Check type
        if (pattern.types.length > 0 && !pattern.types.includes(rel.type)) {
          return false
        }

        return true
      })

      // Merge results
      const existingIds = new Set(result.map(r => r.id))
      for (const txRel of txRels) {
        if (!existingIds.has(txRel.id)) {
          result.push(txRel)
        }
      }
    }

    return result
  }

  /**
   * Execute RETURN clause
   */
  private executeReturn(
    clause: ReturnClause,
    context: ExecutionContext
  ): { records: Record<string, unknown>[] } {
    const records: Record<string, unknown>[] = []

    // Validate all return items reference valid variables
    for (const item of clause.items) {
      this.validateExpression(item.expression, context)
    }

    // If we have variables, create records from them
    if (context.variables.size > 0) {
      const record: Record<string, unknown> = {}

      for (const item of clause.items) {
        const value = this.evaluateExpression(item.expression, context)
        const key = item.alias || this.getExpressionKey(item.expression)
        record[key] = value
      }

      records.push(record)
    }

    return { records }
  }

  /**
   * Validate an expression references valid variables
   */
  private validateExpression(expr: Expression, context: ExecutionContext): void {
    switch (expr.type) {
      case 'Variable': {
        const varExpr = expr as Variable
        if (!context.declaredVariables.has(varExpr.name)) {
          throw new CypherError(
            `Variable \`${varExpr.name}\` not defined`,
            'Neo.ClientError.Statement.SemanticError'
          )
        }
        break
      }
      case 'PropertyAccess': {
        const pa = expr as PropertyAccess
        this.validateExpression(pa.object, context)
        break
      }
      case 'FunctionCall': {
        const fc = expr as FunctionCall
        for (const arg of fc.arguments) {
          this.validateExpression(arg, context)
        }
        break
      }
    }
  }

  /**
   * Get a key for an expression (used for RETURN without alias)
   */
  private getExpressionKey(expr: Expression): string {
    switch (expr.type) {
      case 'Variable':
        return (expr as Variable).name
      case 'PropertyAccess': {
        const pa = expr as PropertyAccess
        return `${this.getExpressionKey(pa.object)}.${pa.property}`
      }
      case 'FunctionCall': {
        const fc = expr as FunctionCall
        return `${fc.name}(${fc.arguments.map(a => this.getExpressionKey(a)).join(', ')})`
      }
      default:
        return 'expr'
    }
  }

  /**
   * Evaluate an expression
   */
  private evaluateExpression(expr: Expression, context: ExecutionContext): unknown {
    switch (expr.type) {
      case 'Variable': {
        const varExpr = expr as Variable
        const value = context.variables.get(varExpr.name)
        if (!value) {
          throw new CypherError(
            `Variable \`${varExpr.name}\` not defined`,
            'Neo.ClientError.Statement.SemanticError'
          )
        }
        if (typeof value === 'object' && value !== null && 'type' in value && 'data' in value) {
          const typedValue = value as { type: string; data: NodeRecord | RelationshipRecord }
          if (typedValue.type === 'node') {
            const node = typedValue.data as NodeRecord
            return {
              id: node.id,
              labels: JSON.parse(node.labels),
              properties: JSON.parse(node.properties),
            }
          }
          if (typedValue.type === 'relationship') {
            const rel = typedValue.data as RelationshipRecord
            return {
              id: rel.id,
              type: rel.type,
              startNodeId: rel.start_node_id,
              endNodeId: rel.end_node_id,
              properties: JSON.parse(rel.properties),
            }
          }
        }
        return value
      }

      case 'PropertyAccess': {
        const pa = expr as PropertyAccess
        const obj = this.evaluateExpression(pa.object, context) as Record<string, unknown>
        if (obj && typeof obj === 'object') {
          if ('properties' in obj && typeof obj.properties === 'object') {
            return (obj.properties as Record<string, unknown>)[pa.property]
          }
          return obj[pa.property]
        }
        return undefined
      }

      case 'FunctionCall': {
        const fc = expr as FunctionCall
        return this.evaluateFunction(fc, context)
      }

      case 'IntegerLiteral':
        return (expr as { value: number }).value

      case 'FloatLiteral':
        return (expr as { value: number }).value

      case 'StringLiteral':
        return (expr as { value: string }).value

      case 'BooleanLiteral':
        return (expr as { value: boolean }).value

      case 'NullLiteral':
        return null

      case 'Parameter': {
        const param = expr as { name: string }
        if (!(param.name in context.parameters)) {
          throw new CypherError(
            `Parameter \`${param.name}\` not provided`,
            'Neo.ClientError.Statement.ParameterMissing'
          )
        }
        return context.parameters[param.name]
      }

      case 'BinaryExpression': {
        const be = expr as { operator: string; left: Expression; right: Expression }
        const left = this.evaluateExpression(be.left, context)
        const right = this.evaluateExpression(be.right, context)
        return this.evaluateBinaryOp(be.operator, left, right)
      }

      case 'MapLiteral': {
        const ml = expr as MapLiteral
        const result: Record<string, unknown> = {}
        for (const entry of ml.entries) {
          result[entry.key] = this.evaluateExpression(entry.value, context)
        }
        return result
      }

      default:
        throw new CypherError(
          `Unsupported expression type: ${expr.type}`,
          'Neo.ClientError.Statement.NotImplemented'
        )
    }
  }

  /**
   * Evaluate a binary operation
   */
  private evaluateBinaryOp(operator: string, left: unknown, right: unknown): unknown {
    switch (operator) {
      case '=':
        return left === right
      case '<>':
        return left !== right
      case '<':
        return (left as number) < (right as number)
      case '>':
        return (left as number) > (right as number)
      case '<=':
        return (left as number) <= (right as number)
      case '>=':
        return (left as number) >= (right as number)
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right)
        }
        return (left as number) + (right as number)
      case '-':
        return (left as number) - (right as number)
      case '*':
        return (left as number) * (right as number)
      case '/':
        return (left as number) / (right as number)
      case '%':
        return (left as number) % (right as number)
      case 'AND':
        return Boolean(left) && Boolean(right)
      case 'OR':
        return Boolean(left) || Boolean(right)
      default:
        throw new CypherError(
          `Unsupported operator: ${operator}`,
          'Neo.ClientError.Statement.NotImplemented'
        )
    }
  }

  /**
   * Evaluate a function call
   */
  private evaluateFunction(fc: FunctionCall, context: ExecutionContext): unknown {
    const name = fc.name.toLowerCase()

    switch (name) {
      case 'id': {
        if (fc.arguments.length !== 1) {
          throw new CypherError(
            'id() requires exactly one argument',
            'Neo.ClientError.Statement.SyntaxError'
          )
        }
        const arg = this.evaluateExpression(fc.arguments[0], context) as { id: number }
        return arg?.id
      }

      case 'count': {
        return 1 // Simplified
      }

      case 'labels': {
        if (fc.arguments.length !== 1) {
          throw new CypherError(
            'labels() requires exactly one argument',
            'Neo.ClientError.Statement.SyntaxError'
          )
        }
        const node = this.evaluateExpression(fc.arguments[0], context) as { labels: string[] }
        return node?.labels || []
      }

      case 'type': {
        if (fc.arguments.length !== 1) {
          throw new CypherError(
            'type() requires exactly one argument',
            'Neo.ClientError.Statement.SyntaxError'
          )
        }
        const rel = this.evaluateExpression(fc.arguments[0], context) as { type: string }
        return rel?.type
      }

      case 'properties': {
        if (fc.arguments.length !== 1) {
          throw new CypherError(
            'properties() requires exactly one argument',
            'Neo.ClientError.Statement.SyntaxError'
          )
        }
        const obj = this.evaluateExpression(fc.arguments[0], context) as { properties: Record<string, unknown> }
        return obj?.properties || {}
      }

      default:
        throw new CypherError(
          `Unknown function: ${fc.name}`,
          'Neo.ClientError.Statement.SyntaxError'
        )
    }
  }

  /**
   * Evaluate properties from a MapLiteral
   */
  private evaluateProperties(
    mapLiteral: MapLiteral | undefined,
    context: ExecutionContext
  ): Record<string, unknown> {
    if (!mapLiteral) {
      return {}
    }

    const result: Record<string, unknown> = {}
    for (const entry of mapLiteral.entries) {
      result[entry.key] = this.evaluateExpression(entry.value, context)
    }
    return result
  }

  /**
   * Get node from a variable in context
   */
  private getNodeFromVariable(context: ExecutionContext, varName: string): NodeRecord | undefined {
    const value = context.variables.get(varName)
    if (value && typeof value === 'object' && 'type' in value && (value as { type: string }).type === 'node') {
      return (value as { data: NodeRecord }).data
    }
    return undefined
  }
}
