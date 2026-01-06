/**
 * Cypher Query Executor
 *
 * Executes Cypher queries against an InMemoryStorage backend.
 * This module bridges the parser/AST and the storage layer.
 */

import { Parser } from '../parser/parser'
import { InMemoryStorage, MergeResult } from '../../storage/in-memory-storage'
import type { Node, Relationship } from '../../storage/types'
import type {
  Query,
  Clause,
  MatchClause,
  ReturnClause,
  CreateClause,
  MergeClause,
  DeleteClause,
  SetClause,
  WhereClause,
  NodePattern,
  RelationshipPattern,
  Expression,
  Variable,
  PropertyAccess,
  BinaryExpression,
  UnaryExpression,
  IntegerLiteral,
  FloatLiteral,
  StringLiteral,
  BooleanLiteral,
  Parameter,
  MapLiteral,
  ListExpression,
  FunctionCall,
  ReturnItem,
  SetItem,
  PropertySetItem,
  LabelSetItem,
} from '../ast/types'

/**
 * Query execution result
 */
export interface ExecutionResult {
  keys: string[]
  records: unknown[][]
  summary: ExecutionSummary
}

/**
 * Query execution summary with counters
 */
export interface ExecutionSummary {
  nodesCreated: number
  nodesDeleted: number
  relationshipsCreated: number
  relationshipsDeleted: number
  propertiesSet: number
  labelsAdded: number
  labelsRemoved: number
}

/**
 * A row during query execution - maps variable names to values
 */
type ExecutionRow = Map<string, unknown>

/**
 * Node wrapper for Neo4j-compatible output
 */
interface Neo4jNode {
  identity: number
  labels: string[]
  properties: Record<string, unknown>
  elementId: string
}

/**
 * Relationship wrapper for Neo4j-compatible output
 */
interface Neo4jRelationship {
  identity: number
  type: string
  startNodeElementId: string
  endNodeElementId: string
  properties: Record<string, unknown>
  elementId: string
}

/**
 * Convert internal Node to Neo4j-compatible format
 */
function toNeo4jNode(node: Node): Neo4jNode {
  return {
    identity: node.id,
    labels: node.labels,
    properties: node.properties,
    elementId: `node:${node.id}`,
  }
}

/**
 * Convert internal Relationship to Neo4j-compatible format
 */
function toNeo4jRelationship(rel: Relationship): Neo4jRelationship {
  return {
    identity: rel.id,
    type: rel.type,
    startNodeElementId: `node:${rel.startNodeId}`,
    endNodeElementId: `node:${rel.endNodeId}`,
    properties: rel.properties,
    elementId: `rel:${rel.id}`,
  }
}

/**
 * CypherExecutor - executes Cypher queries against InMemoryStorage
 */
export class CypherExecutor {
  private storage: InMemoryStorage

  constructor(storage?: InMemoryStorage) {
    this.storage = storage ?? new InMemoryStorage()
  }

  /**
   * Initialize the executor's storage
   */
  async initialize(): Promise<void> {
    await this.storage.initialize()
  }

  /**
   * Execute a Cypher query string
   */
  async execute(
    query: string,
    parameters: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    const parser = Parser.fromString(query)
    const ast = parser.parse()
    return this.executeAST(ast, parameters)
  }

  /**
   * Execute a parsed AST
   */
  async executeAST(
    ast: Query,
    parameters: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    const summary: ExecutionSummary = {
      nodesCreated: 0,
      nodesDeleted: 0,
      relationshipsCreated: 0,
      relationshipsDeleted: 0,
      propertiesSet: 0,
      labelsAdded: 0,
      labelsRemoved: 0,
    }

    // Start with a single empty row
    let rows: ExecutionRow[] = [new Map()]
    let keys: string[] = []

    for (const clause of ast.clauses) {
      const result = await this.executeClause(clause, rows, parameters, summary)
      rows = result.rows
      if (result.keys) {
        keys = result.keys
      }
    }

    // Convert rows to record arrays
    const records: unknown[][] = rows.map((row) => {
      return keys.map((key) => row.get(key))
    })

    return { keys, records, summary }
  }

  /**
   * Execute a single clause
   */
  private async executeClause(
    clause: Clause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>,
    summary: ExecutionSummary
  ): Promise<{ rows: ExecutionRow[]; keys?: string[] }> {
    switch (clause.type) {
      case 'CreateClause':
        return this.executeCreate(clause as CreateClause, rows, parameters, summary)

      case 'MatchClause':
        return this.executeMatch(clause as MatchClause, rows, parameters)

      case 'MergeClause':
        return this.executeMerge(clause as MergeClause, rows, parameters, summary)

      case 'DeleteClause':
        return this.executeDelete(clause as DeleteClause, rows, summary)

      case 'SetClause':
        return this.executeSet(clause as SetClause, rows, parameters, summary)

      case 'WhereClause':
        return this.executeWhere(clause as WhereClause, rows, parameters)

      case 'ReturnClause':
        return this.executeReturn(clause as ReturnClause, rows, parameters)

      default:
        // For unhandled clauses, pass through
        return { rows }
    }
  }

  /**
   * Execute CREATE clause
   */
  private async executeCreate(
    clause: CreateClause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>,
    summary: ExecutionSummary
  ): Promise<{ rows: ExecutionRow[]; keys?: string[] }> {
    const newRows: ExecutionRow[] = []

    for (const row of rows) {
      const newRow = new Map(row)
      let prevNode: Node | null = null

      for (const element of clause.pattern.elements) {
        if (element.type === 'NodePattern') {
          const nodePattern = element as NodePattern
          const properties = this.extractProperties(nodePattern.properties, parameters, row)

          const nodeId = await this.storage.createNode(nodePattern.labels, properties)
          const node = await this.storage.getNode(nodeId)

          summary.nodesCreated++
          summary.labelsAdded += nodePattern.labels.length
          summary.propertiesSet += Object.keys(properties).length

          if (nodePattern.variable && node) {
            newRow.set(nodePattern.variable, toNeo4jNode(node))
          }

          prevNode = node
        } else if (element.type === 'RelationshipPattern') {
          const relPattern = element as RelationshipPattern
          const properties = this.extractProperties(relPattern.properties, parameters, row)
          const type = relPattern.types[0] || 'RELATED_TO'

          // Store the pattern for later relationship creation
          // We'll create the relationship when we have both nodes
          if (relPattern.variable) {
            // Store relationship info temporarily
            newRow.set(`__rel_${relPattern.variable}`, {
              type,
              properties,
              startNode: prevNode,
              direction: relPattern.direction,
            })
          }
        }
      }

      // Create relationships if pattern has them
      const elements = clause.pattern.elements
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        if (element.type === 'RelationshipPattern') {
          const relPattern = element as RelationshipPattern
          const prevNodePattern = elements[i - 1] as NodePattern
          const nextNodePattern = elements[i + 1] as NodePattern

          const prevNodeValue = newRow.get(prevNodePattern.variable!) as Neo4jNode | undefined
          const nextNodeValue = newRow.get(nextNodePattern.variable!) as Neo4jNode | undefined

          if (prevNodeValue && nextNodeValue) {
            const properties = this.extractProperties(relPattern.properties, parameters, row)
            const type = relPattern.types[0] || 'RELATED_TO'

            let startId: number
            let endId: number

            if (relPattern.direction === 'LEFT') {
              startId = nextNodeValue.identity
              endId = prevNodeValue.identity
            } else {
              startId = prevNodeValue.identity
              endId = nextNodeValue.identity
            }

            const relId = await this.storage.createRelationship(type, startId, endId, properties)
            const rel = await this.storage.getRelationship(relId)

            summary.relationshipsCreated++
            summary.propertiesSet += Object.keys(properties).length

            if (relPattern.variable && rel) {
              newRow.set(relPattern.variable, toNeo4jRelationship(rel))
            }
          }
        }
      }

      newRows.push(newRow)
    }

    return { rows: newRows }
  }

  /**
   * Execute MATCH clause
   */
  private async executeMatch(
    clause: MatchClause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>
  ): Promise<{ rows: ExecutionRow[] }> {
    const newRows: ExecutionRow[] = []
    const isOptional = clause.optional

    for (const row of rows) {
      const matchedRows = await this.matchPattern(clause.pattern.elements, row, parameters)

      // Apply WHERE filter if present
      let filteredRows = matchedRows
      if (clause.where) {
        filteredRows = matchedRows.filter((r) =>
          this.evaluateExpression(clause.where!, r, parameters)
        )
      }

      if (filteredRows.length > 0) {
        newRows.push(...filteredRows)
      } else if (isOptional) {
        // For OPTIONAL MATCH, return row with null values for pattern variables
        const nullRow = new Map(row)
        for (const element of clause.pattern.elements) {
          if (element.type === 'NodePattern' && (element as NodePattern).variable) {
            nullRow.set((element as NodePattern).variable!, null)
          } else if (element.type === 'RelationshipPattern' && (element as RelationshipPattern).variable) {
            nullRow.set((element as RelationshipPattern).variable!, null)
          }
        }
        newRows.push(nullRow)
      }
    }

    return { rows: newRows.length > 0 ? newRows : [] }
  }

  /**
   * Match a pattern against storage
   */
  private async matchPattern(
    elements: (NodePattern | RelationshipPattern)[],
    baseRow: ExecutionRow,
    parameters: Record<string, unknown>
  ): Promise<ExecutionRow[]> {
    // Start with matching the first node
    const firstElement = elements[0]
    if (firstElement.type !== 'NodePattern') {
      return []
    }

    const firstNodePattern = firstElement as NodePattern
    let candidateRows: ExecutionRow[] = []

    // Get all nodes that match the first pattern
    const allNodes = await this.findMatchingNodes(firstNodePattern, parameters, baseRow)

    for (const node of allNodes) {
      const row = new Map(baseRow)
      if (firstNodePattern.variable) {
        row.set(firstNodePattern.variable, toNeo4jNode(node))
      }
      candidateRows.push(row)
    }

    // Process relationship-node pairs
    for (let i = 1; i < elements.length; i += 2) {
      if (i + 1 >= elements.length) break

      const relPattern = elements[i] as RelationshipPattern
      const nextNodePattern = elements[i + 1] as NodePattern
      const newCandidates: ExecutionRow[] = []

      for (const row of candidateRows) {
        // Get the previous node
        const prevNodePattern = elements[i - 1] as NodePattern
        const prevNode = prevNodePattern.variable
          ? (row.get(prevNodePattern.variable) as Neo4jNode | undefined)
          : null

        if (!prevNode) continue

        // Find matching relationships and next nodes
        const matches = await this.findMatchingRelationshipsAndNodes(
          prevNode.identity,
          relPattern,
          nextNodePattern,
          parameters,
          row
        )

        for (const match of matches) {
          const newRow = new Map(row)
          if (relPattern.variable) {
            newRow.set(relPattern.variable, match.relationship)
          }
          if (nextNodePattern.variable) {
            newRow.set(nextNodePattern.variable, match.node)
          }
          newCandidates.push(newRow)
        }
      }

      candidateRows = newCandidates
    }

    return candidateRows
  }

  /**
   * Find nodes matching a pattern
   */
  private async findMatchingNodes(
    pattern: NodePattern,
    parameters: Record<string, unknown>,
    row: ExecutionRow
  ): Promise<Node[]> {
    let nodes: Node[]

    if (pattern.labels.length > 0) {
      // Find by first label, then filter by additional labels
      nodes = await this.storage.findNodesByLabel(pattern.labels[0])
      if (pattern.labels.length > 1) {
        nodes = nodes.filter((n) =>
          pattern.labels.every((label) => n.labels.includes(label))
        )
      }
    } else {
      // Get all nodes
      nodes = await this.storage.getAllNodes()
    }

    // Filter by properties
    if (pattern.properties) {
      const requiredProps = this.extractProperties(pattern.properties, parameters, row)
      nodes = nodes.filter((n) => {
        for (const [key, value] of Object.entries(requiredProps)) {
          if (n.properties[key] !== value) {
            return false
          }
        }
        return true
      })
    }

    return nodes
  }

  /**
   * Find relationships and connected nodes matching patterns
   */
  private async findMatchingRelationshipsAndNodes(
    nodeId: number,
    relPattern: RelationshipPattern,
    nextNodePattern: NodePattern,
    parameters: Record<string, unknown>,
    row: ExecutionRow
  ): Promise<Array<{ relationship: Neo4jRelationship; node: Neo4jNode }>> {
    const results: Array<{ relationship: Neo4jRelationship; node: Neo4jNode }> = []

    // Get relationships based on direction
    let relationships: Relationship[] = []

    if (relPattern.direction === 'RIGHT' || relPattern.direction === 'BOTH' || relPattern.direction === 'NONE') {
      const outgoing = await this.storage.getOutgoingRelationships(nodeId)
      relationships.push(...outgoing)
    }

    if (relPattern.direction === 'LEFT' || relPattern.direction === 'BOTH' || relPattern.direction === 'NONE') {
      const incoming = await this.storage.getIncomingRelationships(nodeId)
      relationships.push(...incoming)
    }

    // Filter by type if specified
    if (relPattern.types.length > 0) {
      relationships = relationships.filter((r) => relPattern.types.includes(r.type))
    }

    // Filter by properties
    if (relPattern.properties) {
      const requiredProps = this.extractProperties(relPattern.properties, parameters, row)
      relationships = relationships.filter((r) => {
        for (const [key, value] of Object.entries(requiredProps)) {
          if (r.properties[key] !== value) {
            return false
          }
        }
        return true
      })
    }

    // For each matching relationship, check if the connected node matches
    for (const rel of relationships) {
      // Determine which end to check based on direction and which end we came from
      let connectedNodeId: number
      if (rel.startNodeId === nodeId) {
        connectedNodeId = rel.endNodeId
      } else {
        connectedNodeId = rel.startNodeId
      }

      const connectedNode = await this.storage.getNode(connectedNodeId)
      if (!connectedNode) continue

      // Check if connected node matches the pattern
      if (!this.nodeMatchesPattern(connectedNode, nextNodePattern, parameters, row)) {
        continue
      }

      results.push({
        relationship: toNeo4jRelationship(rel),
        node: toNeo4jNode(connectedNode),
      })
    }

    return results
  }

  /**
   * Check if a node matches a pattern
   */
  private nodeMatchesPattern(
    node: Node,
    pattern: NodePattern,
    parameters: Record<string, unknown>,
    row: ExecutionRow
  ): boolean {
    // Check labels
    if (pattern.labels.length > 0) {
      if (!pattern.labels.every((label) => node.labels.includes(label))) {
        return false
      }
    }

    // Check properties
    if (pattern.properties) {
      const requiredProps = this.extractProperties(pattern.properties, parameters, row)
      for (const [key, value] of Object.entries(requiredProps)) {
        if (node.properties[key] !== value) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Execute MERGE clause
   */
  private async executeMerge(
    clause: MergeClause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>,
    summary: ExecutionSummary
  ): Promise<{ rows: ExecutionRow[] }> {
    const newRows: ExecutionRow[] = []

    for (const row of rows) {
      // First, try to match the pattern
      const matchedRows = await this.matchPattern(clause.pattern.elements, row, parameters)

      if (matchedRows.length > 0) {
        // Pattern exists - apply ON MATCH clauses
        for (const matchedRow of matchedRows) {
          if (clause.onMatch) {
            for (const setClause of clause.onMatch) {
              await this.executeSetItems(setClause.items, matchedRow, parameters, summary)
            }
          }
          newRows.push(matchedRow)
        }
      } else {
        // Pattern doesn't exist - create it and apply ON CREATE clauses
        const newRow = new Map(row)

        // Create nodes
        for (const element of clause.pattern.elements) {
          if (element.type === 'NodePattern') {
            const nodePattern = element as NodePattern
            const properties = this.extractProperties(nodePattern.properties, parameters, row)

            const nodeId = await this.storage.createNode(nodePattern.labels, properties)
            const node = await this.storage.getNode(nodeId)

            summary.nodesCreated++
            summary.labelsAdded += nodePattern.labels.length
            summary.propertiesSet += Object.keys(properties).length

            if (nodePattern.variable && node) {
              newRow.set(nodePattern.variable, toNeo4jNode(node))
            }
          }
        }

        // Apply ON CREATE clauses
        if (clause.onCreate) {
          for (const setClause of clause.onCreate) {
            await this.executeSetItems(setClause.items, newRow, parameters, summary)
          }
        }

        newRows.push(newRow)
      }
    }

    return { rows: newRows }
  }

  /**
   * Execute DELETE clause
   */
  private async executeDelete(
    clause: DeleteClause,
    rows: ExecutionRow[],
    summary: ExecutionSummary
  ): Promise<{ rows: ExecutionRow[] }> {
    const deletedNodeIds = new Set<number>()
    const deletedRelIds = new Set<number>()

    for (const row of rows) {
      for (const expr of clause.expressions) {
        if (expr.type === 'Variable') {
          const varName = (expr as Variable).name
          const value = row.get(varName)

          if (value && typeof value === 'object') {
            if ('labels' in value) {
              // It's a node
              const node = value as Neo4jNode
              if (!deletedNodeIds.has(node.identity)) {
                if (clause.detach) {
                  // Delete connected relationships first
                  const outgoing = await this.storage.getOutgoingRelationships(node.identity)
                  const incoming = await this.storage.getIncomingRelationships(node.identity)

                  for (const rel of [...outgoing, ...incoming]) {
                    if (!deletedRelIds.has(rel.id)) {
                      await this.storage.deleteRelationship(rel.id)
                      deletedRelIds.add(rel.id)
                      summary.relationshipsDeleted++
                    }
                  }
                }

                await this.storage.deleteNode(node.identity)
                deletedNodeIds.add(node.identity)
                summary.nodesDeleted++
              }
            } else if ('type' in value && 'startNodeElementId' in value) {
              // It's a relationship
              const rel = value as Neo4jRelationship
              if (!deletedRelIds.has(rel.identity)) {
                await this.storage.deleteRelationship(rel.identity)
                deletedRelIds.add(rel.identity)
                summary.relationshipsDeleted++
              }
            }
          }
        }
      }
    }

    return { rows }
  }

  /**
   * Execute SET clause
   */
  private async executeSet(
    clause: SetClause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>,
    summary: ExecutionSummary
  ): Promise<{ rows: ExecutionRow[] }> {
    for (const row of rows) {
      await this.executeSetItems(clause.items, row, parameters, summary)
    }
    return { rows }
  }

  /**
   * Execute SET items
   */
  private async executeSetItems(
    items: SetItem[],
    row: ExecutionRow,
    parameters: Record<string, unknown>,
    summary: ExecutionSummary
  ): Promise<void> {
    for (const item of items) {
      if (item.type === 'PropertySetItem') {
        const propItem = item as PropertySetItem
        const varName = (propItem.property.object as Variable).name
        const propName = propItem.property.property
        const value = this.evaluateExpression(propItem.expression, row, parameters)

        const nodeOrRel = row.get(varName)
        if (nodeOrRel && typeof nodeOrRel === 'object' && 'identity' in nodeOrRel) {
          const entity = nodeOrRel as Neo4jNode | Neo4jRelationship

          if ('labels' in entity) {
            // It's a node
            const node = await this.storage.getNode(entity.identity)
            if (node) {
              const newProps = { ...node.properties, [propName]: value }
              await this.storage.updateNode(entity.identity, newProps)
              entity.properties[propName] = value
              summary.propertiesSet++
            }
          }
        }
      } else if (item.type === 'LabelSetItem') {
        const labelItem = item as LabelSetItem
        const nodeOrRel = row.get(labelItem.variable)

        if (nodeOrRel && typeof nodeOrRel === 'object' && 'labels' in nodeOrRel) {
          const entity = nodeOrRel as Neo4jNode
          for (const label of labelItem.labels) {
            if (!entity.labels.includes(label)) {
              await this.storage.addLabel(entity.identity, label)
              entity.labels.push(label)
              summary.labelsAdded++
            }
          }
        }
      }
    }
  }

  /**
   * Execute WHERE clause (standalone filter)
   */
  private async executeWhere(
    clause: WhereClause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>
  ): Promise<{ rows: ExecutionRow[] }> {
    const filteredRows = rows.filter((row) =>
      this.evaluateExpression(clause.expression, row, parameters)
    )
    return { rows: filteredRows }
  }

  /**
   * Execute RETURN clause
   */
  private async executeReturn(
    clause: ReturnClause,
    rows: ExecutionRow[],
    parameters: Record<string, unknown>
  ): Promise<{ rows: ExecutionRow[]; keys: string[] }> {
    const keys: string[] = []
    const newRows: ExecutionRow[] = []

    // Determine the keys from return items
    for (const item of clause.items) {
      if (item.alias) {
        keys.push(item.alias)
      } else if (item.expression.type === 'Variable') {
        keys.push((item.expression as Variable).name)
      } else if (item.expression.type === 'PropertyAccess') {
        const pa = item.expression as PropertyAccess
        const objName = (pa.object as Variable).name
        keys.push(`${objName}.${pa.property}`)
      } else {
        keys.push(`expr_${keys.length}`)
      }
    }

    // Project rows to return items
    for (const row of rows) {
      const newRow = new Map<string, unknown>()

      for (let i = 0; i < clause.items.length; i++) {
        const item = clause.items[i]
        const key = keys[i]
        const value = this.evaluateExpression(item.expression, row, parameters)
        newRow.set(key, value)
      }

      newRows.push(newRow)
    }

    // Handle DISTINCT
    if (clause.distinct) {
      const uniqueRows: ExecutionRow[] = []
      const seen = new Set<string>()

      for (const row of newRows) {
        const key = JSON.stringify([...row.entries()])
        if (!seen.has(key)) {
          seen.add(key)
          uniqueRows.push(row)
        }
      }

      return { rows: uniqueRows, keys }
    }

    return { rows: newRows, keys }
  }

  /**
   * Extract properties from a MapLiteral
   */
  private extractProperties(
    mapLiteral: MapLiteral | undefined,
    parameters: Record<string, unknown>,
    row: ExecutionRow
  ): Record<string, unknown> {
    if (!mapLiteral) return {}

    const result: Record<string, unknown> = {}
    for (const entry of mapLiteral.entries) {
      result[entry.key] = this.evaluateExpression(entry.value, row, parameters)
    }
    return result
  }

  /**
   * Evaluate an expression
   */
  private evaluateExpression(
    expr: Expression,
    row: ExecutionRow,
    parameters: Record<string, unknown>
  ): unknown {
    switch (expr.type) {
      case 'Variable': {
        const v = expr as Variable
        return row.get(v.name)
      }

      case 'PropertyAccess': {
        const pa = expr as PropertyAccess
        const obj = this.evaluateExpression(pa.object, row, parameters)
        if (obj && typeof obj === 'object' && 'properties' in obj) {
          return (obj as { properties: Record<string, unknown> }).properties[pa.property]
        }
        if (obj && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[pa.property]
        }
        return null
      }

      case 'IntegerLiteral':
        return (expr as IntegerLiteral).value

      case 'FloatLiteral':
        return (expr as FloatLiteral).value

      case 'StringLiteral':
        return (expr as StringLiteral).value

      case 'BooleanLiteral':
        return (expr as BooleanLiteral).value

      case 'NullLiteral':
        return null

      case 'Parameter': {
        const param = expr as Parameter
        return parameters[param.name]
      }

      case 'ListExpression': {
        const list = expr as ListExpression
        return list.elements.map((e) => this.evaluateExpression(e, row, parameters))
      }

      case 'MapLiteral': {
        const map = expr as MapLiteral
        const result: Record<string, unknown> = {}
        for (const entry of map.entries) {
          result[entry.key] = this.evaluateExpression(entry.value, row, parameters)
        }
        return result
      }

      case 'BinaryExpression': {
        const be = expr as BinaryExpression
        const left = this.evaluateExpression(be.left, row, parameters)
        const right = this.evaluateExpression(be.right, row, parameters)
        return this.evaluateBinaryOp(be.operator, left, right)
      }

      case 'UnaryExpression': {
        const ue = expr as UnaryExpression
        const operand = this.evaluateExpression(ue.operand, row, parameters)

        switch (ue.operator) {
          case 'NOT':
            return !operand
          case '-':
            return -(operand as number)
          case '+':
            return +(operand as number)
          case 'IS NULL':
            return operand === null || operand === undefined
          case 'IS NOT NULL':
            return operand !== null && operand !== undefined
          default:
            return null
        }
      }

      case 'FunctionCall': {
        const fc = expr as FunctionCall
        return this.evaluateFunctionCall(fc, row, parameters)
      }

      default:
        return null
    }
  }

  /**
   * Evaluate a binary operator
   */
  private evaluateBinaryOp(op: string, left: unknown, right: unknown): unknown {
    switch (op) {
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
      case 'XOR':
        return Boolean(left) !== Boolean(right)
      case 'IN':
        return Array.isArray(right) && right.includes(left)
      case 'STARTS WITH':
        return typeof left === 'string' && typeof right === 'string' && left.startsWith(right)
      case 'ENDS WITH':
        return typeof left === 'string' && typeof right === 'string' && left.endsWith(right)
      case 'CONTAINS':
        return typeof left === 'string' && typeof right === 'string' && left.includes(right)
      default:
        return null
    }
  }

  /**
   * Evaluate a function call
   */
  private evaluateFunctionCall(
    fc: FunctionCall,
    row: ExecutionRow,
    parameters: Record<string, unknown>
  ): unknown {
    const funcName = fc.name.toLowerCase()
    const args = fc.arguments.map((a) => this.evaluateExpression(a, row, parameters))

    switch (funcName) {
      case 'id':
        if (args[0] && typeof args[0] === 'object' && 'identity' in args[0]) {
          return (args[0] as { identity: number }).identity
        }
        return null

      case 'type':
        if (args[0] && typeof args[0] === 'object' && 'type' in args[0]) {
          return (args[0] as { type: string }).type
        }
        return null

      case 'labels':
        if (args[0] && typeof args[0] === 'object' && 'labels' in args[0]) {
          return (args[0] as { labels: string[] }).labels
        }
        return []

      case 'properties':
        if (args[0] && typeof args[0] === 'object' && 'properties' in args[0]) {
          return (args[0] as { properties: Record<string, unknown> }).properties
        }
        return {}

      case 'keys':
        if (args[0] && typeof args[0] === 'object') {
          return Object.keys(args[0] as Record<string, unknown>)
        }
        return []

      case 'tostring':
        return String(args[0])

      case 'tointeger':
        return parseInt(String(args[0]), 10)

      case 'tofloat':
        return parseFloat(String(args[0]))

      case 'toboolean':
        return Boolean(args[0])

      case 'size':
        if (Array.isArray(args[0])) {
          return args[0].length
        }
        if (typeof args[0] === 'string') {
          return args[0].length
        }
        return 0

      case 'length':
        return this.evaluateFunctionCall({ ...fc, name: 'size' }, row, parameters)

      case 'coalesce':
        for (const arg of args) {
          if (arg !== null && arg !== undefined) {
            return arg
          }
        }
        return null

      case 'head':
        if (Array.isArray(args[0]) && args[0].length > 0) {
          return args[0][0]
        }
        return null

      case 'last':
        if (Array.isArray(args[0]) && args[0].length > 0) {
          return args[0][args[0].length - 1]
        }
        return null

      case 'tail':
        if (Array.isArray(args[0])) {
          return args[0].slice(1)
        }
        return []

      case 'range':
        const start = args[0] as number
        const end = args[1] as number
        const step = (args[2] as number) || 1
        const result: number[] = []
        for (let i = start; i <= end; i += step) {
          result.push(i)
        }
        return result

      case 'abs':
        return Math.abs(args[0] as number)

      case 'ceil':
        return Math.ceil(args[0] as number)

      case 'floor':
        return Math.floor(args[0] as number)

      case 'round':
        return Math.round(args[0] as number)

      case 'rand':
        return Math.random()

      case 'sqrt':
        return Math.sqrt(args[0] as number)

      case 'sign':
        return Math.sign(args[0] as number)

      case 'tolower':
        return typeof args[0] === 'string' ? args[0].toLowerCase() : args[0]

      case 'toupper':
        return typeof args[0] === 'string' ? args[0].toUpperCase() : args[0]

      case 'trim':
        return typeof args[0] === 'string' ? args[0].trim() : args[0]

      case 'ltrim':
        return typeof args[0] === 'string' ? args[0].trimStart() : args[0]

      case 'rtrim':
        return typeof args[0] === 'string' ? args[0].trimEnd() : args[0]

      case 'replace':
        if (typeof args[0] === 'string' && typeof args[1] === 'string' && typeof args[2] === 'string') {
          return args[0].split(args[1]).join(args[2])
        }
        return args[0]

      case 'substring':
        if (typeof args[0] === 'string') {
          const str = args[0]
          const start = args[1] as number
          const len = args[2] as number | undefined
          return len !== undefined ? str.substring(start, start + len) : str.substring(start)
        }
        return args[0]

      case 'left':
        if (typeof args[0] === 'string' && typeof args[1] === 'number') {
          return args[0].substring(0, args[1])
        }
        return args[0]

      case 'right':
        if (typeof args[0] === 'string' && typeof args[1] === 'number') {
          return args[0].substring(args[0].length - args[1])
        }
        return args[0]

      case 'split':
        if (typeof args[0] === 'string' && typeof args[1] === 'string') {
          return args[0].split(args[1])
        }
        return [args[0]]

      case 'reverse':
        if (Array.isArray(args[0])) {
          return [...args[0]].reverse()
        }
        if (typeof args[0] === 'string') {
          return args[0].split('').reverse().join('')
        }
        return args[0]

      case 'timestamp':
        return Date.now()

      case 'date':
        return new Date().toISOString().split('T')[0]

      case 'datetime':
        return new Date().toISOString()

      default:
        return null
    }
  }

  /**
   * Get the underlying storage (for testing)
   */
  getStorage(): InMemoryStorage {
    return this.storage
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.storage.clear()
  }
}

export default CypherExecutor
