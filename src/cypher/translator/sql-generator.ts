/**
 * SQL Generator for Cypher to SQLite translation
 *
 * Converts Cypher AST to SQLite queries compatible with the graph schema.
 */

import type {
  Query,
  MatchClause,
  ReturnClause,
  CreateClause,
  MergeClause,
  DeleteClause,
  SetClause,
  NodePattern,
  RelationshipPattern,
  Expression,
  Variable,
  PropertyAccess,
  FunctionCall,
  BinaryExpression,
  UnaryExpression,
  IntegerLiteral,
  FloatLiteral,
  StringLiteral,
  BooleanLiteral,
  Parameter,
  ReturnItem,
  OrderByItem,
  PropertySetItem,
  LabelSetItem,
} from '../ast'

export interface SQLResult {
  sql: string
  params: any[]
}

interface VariableBinding {
  type: 'node' | 'relationship'
  tableAlias: string
  nodeIndex?: number
}

export class SQLGenerator {
  private params: any[] = []
  private variableBindings: Map<string, VariableBinding> = new Map()
  private tableAliasCounter = 0
  private hasAggregation = false
  private nonAggregatedExpressions: string[] = []

  generate(ast: Query): SQLResult {
    this.reset()

    // Analyze the query structure
    const clauses = ast.clauses
    const matchClauses = clauses.filter((c): c is MatchClause => c.type === 'MatchClause')
    const returnClause = clauses.find((c): c is ReturnClause => c.type === 'ReturnClause')
    const createClause = clauses.find((c): c is CreateClause => c.type === 'CreateClause')
    const mergeClause = clauses.find((c): c is MergeClause => c.type === 'MergeClause')
    const deleteClause = clauses.find((c): c is DeleteClause => c.type === 'DeleteClause')
    const setClause = clauses.find((c): c is SetClause => c.type === 'SetClause')

    let sql = ''

    // Handle different clause combinations
    if (createClause && !matchClauses.length) {
      sql = this.generateCreate(createClause)
    } else if (mergeClause) {
      sql = this.generateMerge(mergeClause)
    } else if (deleteClause && matchClauses.length) {
      sql = this.generateDelete(matchClauses, deleteClause)
    } else if (setClause && matchClauses.length) {
      sql = this.generateUpdate(matchClauses, setClause)
    } else if (matchClauses.length && returnClause) {
      sql = this.generateSelect(matchClauses, returnClause)
    } else if (matchClauses.length) {
      // MATCH without RETURN - select all matched nodes
      sql = this.generateSelect(matchClauses, undefined)
    }

    return { sql, params: this.params }
  }

  private reset(): void {
    this.params = []
    this.variableBindings = new Map()
    this.tableAliasCounter = 0
    this.hasAggregation = false
    this.nonAggregatedExpressions = []
  }

  private nextAlias(): string {
    return `t${this.tableAliasCounter++}`
  }

  private generateSelect(matchClauses: MatchClause[], returnClause?: ReturnClause): string {
    // Check for variable-length paths
    const hasVariableLengthPath = matchClauses.some((m) =>
      m.pattern.elements.some(
        (e) => e.type === 'RelationshipPattern' && (e.minHops !== undefined || e.maxHops !== undefined)
      )
    )

    if (hasVariableLengthPath) {
      return this.generateVariableLengthPathQuery(matchClauses, returnClause)
    }

    const parts: string[] = []

    // Build FROM and JOIN clauses
    const { fromClause, joinClauses, whereConditions } = this.buildFromAndJoins(matchClauses)

    // Build SELECT clause
    const selectClause = this.buildSelectClause(returnClause)

    // Build WHERE clause
    const additionalWhereConditions = matchClauses.filter((m) => m.where).map((m) => this.translateExpression(m.where!))

    const allWhereConditions = [...whereConditions, ...additionalWhereConditions]

    // Assemble query
    parts.push(`SELECT ${selectClause}`)
    parts.push(`FROM ${fromClause}`)

    if (joinClauses.length > 0) {
      parts.push(joinClauses.join('\n'))
    }

    if (allWhereConditions.length > 0) {
      parts.push(`WHERE ${allWhereConditions.join(' AND ')}`)
    }

    // Add GROUP BY if there are aggregations
    if (this.hasAggregation && this.nonAggregatedExpressions.length > 0) {
      parts.push(`GROUP BY ${this.nonAggregatedExpressions.join(', ')}`)
    }

    // Add ORDER BY, SKIP, LIMIT
    if (returnClause?.orderBy) {
      const orderByItems = returnClause.orderBy.map(
        (item: OrderByItem) => `${this.translateExpression(item.expression)} ${item.direction}`
      )
      parts.push(`ORDER BY ${orderByItems.join(', ')}`)
    }

    if (returnClause?.limit) {
      parts.push(`LIMIT ?`)
      this.params.push(this.getLiteralValue(returnClause.limit))
    }

    if (returnClause?.skip) {
      parts.push(`OFFSET ?`)
      this.params.push(this.getLiteralValue(returnClause.skip))
    }

    return parts.join('\n')
  }

  private buildFromAndJoins(matchClauses: MatchClause[]): {
    fromClause: string
    joinClauses: string[]
    whereConditions: string[]
  } {
    const joinClauses: string[] = []
    const whereConditions: string[] = []
    let fromClause = ''
    let nodeIndex = 0

    for (const matchClause of matchClauses) {
      const isOptional = matchClause.optional
      const joinType = isOptional ? 'LEFT JOIN' : 'JOIN'
      const elements = matchClause.pattern.elements

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]

        if (element.type === 'NodePattern') {
          const node = element as NodePattern
          const alias = node.variable || this.nextAlias()

          if (!fromClause) {
            // First node is the FROM clause
            fromClause = `nodes AS ${alias}`
            if (node.variable) {
              this.variableBindings.set(node.variable, { type: 'node', tableAlias: alias, nodeIndex })
            }
          } else if (!this.variableBindings.has(node.variable || '')) {
            // Subsequent nodes that aren't already bound
            // Check if this is a standalone node in a new MATCH clause (not following a relationship)
            const isStandaloneNode = i === 0 // First element in the pattern

            if (isStandaloneNode) {
              // Add CROSS JOIN for unconnected node patterns
              joinClauses.push(`${joinType} nodes AS ${alias} ON 1=1`)
            }

            if (node.variable) {
              this.variableBindings.set(node.variable, { type: 'node', tableAlias: alias, nodeIndex })
            }
          }

          // Add label conditions
          if (node.labels.length > 0) {
            for (const label of node.labels) {
              whereConditions.push(`json_extract(${alias}.labels, '$') LIKE '%"${label}"%'`)
            }
          }

          // Add property conditions
          if (node.properties) {
            for (const entry of node.properties.entries) {
              whereConditions.push(
                `json_extract(${alias}.properties, '$.${entry.key}') = ?`
              )
              this.params.push(this.getLiteralValue(entry.value))
            }
          }

          nodeIndex++
        } else if (element.type === 'RelationshipPattern') {
          const rel = element as RelationshipPattern
          const relAlias = rel.variable || this.nextAlias()
          const prevNode = elements[i - 1] as NodePattern
          const nextNode = elements[i + 1] as NodePattern

          const prevAlias = prevNode.variable || this.variableBindings.get(prevNode.variable || '')?.tableAlias
          const nextAlias = nextNode.variable || this.nextAlias()

          // Bind relationship variable
          if (rel.variable) {
            this.variableBindings.set(rel.variable, { type: 'relationship', tableAlias: relAlias })
          }

          // Check if next node is already bound BEFORE we potentially bind it
          const existingNextBinding = nextNode.variable ? this.variableBindings.get(nextNode.variable) : null

          // Bind next node if not already bound
          if (nextNode.variable && !existingNextBinding) {
            this.variableBindings.set(nextNode.variable, { type: 'node', tableAlias: nextAlias, nodeIndex })
            nodeIndex++
          }

          const actualNextAlias = existingNextBinding?.tableAlias || nextAlias

          // Handle bidirectional (BOTH) and NONE relationships
          if (rel.direction === 'BOTH' || rel.direction === 'NONE') {
            // For bidirectional relationships, we need to match either direction
            // Use OR condition: (prev->next) OR (next->prev)
            joinClauses.push(`${joinType} relationships AS ${relAlias} ON (${relAlias}.start_node_id = ${prevAlias}.id OR ${relAlias}.end_node_id = ${prevAlias}.id)`)

            // Add type condition (parameterized to prevent SQL injection)
            if (rel.types.length === 1) {
              whereConditions.push(`${relAlias}.type = ?`)
              this.params.push(rel.types[0])
            } else if (rel.types.length > 1) {
              whereConditions.push(`${relAlias}.type IN (${rel.types.map(() => '?').join(', ')})`)
              rel.types.forEach(t => this.params.push(t))
            }

            // Add next node join with bidirectional condition
            if (!existingNextBinding) {
              joinClauses.push(`${joinType} nodes AS ${actualNextAlias} ON (${actualNextAlias}.id = ${relAlias}.end_node_id OR ${actualNextAlias}.id = ${relAlias}.start_node_id) AND ${actualNextAlias}.id != ${prevAlias}.id`)
            } else {
              whereConditions.push(`(${relAlias}.start_node_id = ${actualNextAlias}.id OR ${relAlias}.end_node_id = ${actualNextAlias}.id)`)
            }
          } else {
            // Determine join direction for LEFT and RIGHT
            let startJoinCol: string
            let endJoinCol: string

            if (rel.direction === 'LEFT') {
              // <-[:REL]-  means prev is end_node, next is start_node
              startJoinCol = 'end_node_id'
              endJoinCol = 'start_node_id'
            } else {
              // -[:REL]-> means prev is start_node, next is end_node
              startJoinCol = 'start_node_id'
              endJoinCol = 'end_node_id'
            }

            // Add relationship join
            joinClauses.push(`${joinType} relationships AS ${relAlias} ON ${relAlias}.${startJoinCol} = ${prevAlias}.id`)

            // Add type condition (parameterized to prevent SQL injection)
            if (rel.types.length === 1) {
              whereConditions.push(`${relAlias}.type = ?`)
              this.params.push(rel.types[0])
            } else if (rel.types.length > 1) {
              whereConditions.push(`${relAlias}.type IN (${rel.types.map(() => '?').join(', ')})`)
              rel.types.forEach(t => this.params.push(t))
            }

            // Add next node join
            if (!existingNextBinding) {
              joinClauses.push(`${joinType} nodes AS ${actualNextAlias} ON ${actualNextAlias}.id = ${relAlias}.${endJoinCol}`)
            } else {
              whereConditions.push(`${relAlias}.${endJoinCol} = ${actualNextAlias}.id`)
            }
          }

          // Add relationship property conditions
          if (rel.properties) {
            for (const entry of rel.properties.entries) {
              whereConditions.push(
                `json_extract(${relAlias}.properties, '$.${entry.key}') = ?`
              )
              this.params.push(this.getLiteralValue(entry.value))
            }
          }

          // Add label conditions for next node
          if (nextNode.labels.length > 0) {
            for (const label of nextNode.labels) {
              whereConditions.push(`json_extract(${actualNextAlias}.labels, '$') LIKE '%"${label}"%'`)
            }
          }

          // Add property conditions for next node
          if (nextNode.properties) {
            for (const entry of nextNode.properties.entries) {
              whereConditions.push(
                `json_extract(${actualNextAlias}.properties, '$.${entry.key}') = ?`
              )
              this.params.push(this.getLiteralValue(entry.value))
            }
          }
        }
      }
    }

    return { fromClause, joinClauses, whereConditions }
  }

  private buildSelectClause(returnClause?: ReturnClause): string {
    if (!returnClause) {
      return '*'
    }

    const distinct = returnClause.distinct ? 'DISTINCT ' : ''
    this.hasAggregation = false
    this.nonAggregatedExpressions = []

    const items = returnClause.items.map((item: ReturnItem) => {
      const expr = this.translateExpression(item.expression)
      const isAgg = this.isAggregateExpression(item.expression)

      if (!isAgg) {
        this.nonAggregatedExpressions.push(expr)
      }

      if (item.alias) {
        return `${expr} AS ${item.alias}`
      }
      return expr
    })

    return distinct + items.join(', ')
  }

  private isAggregateExpression(expr: Expression): boolean {
    if (expr.type === 'FunctionCall') {
      const func = expr as FunctionCall
      const name = func.name.toLowerCase()
      if (['count', 'sum', 'avg', 'min', 'max', 'collect'].includes(name)) {
        this.hasAggregation = true
        return true
      }
    }
    return false
  }

  private translateExpression(expr: Expression): string {
    switch (expr.type) {
      case 'Variable': {
        const v = expr as Variable
        if (v.name === '*') {
          return '*'
        }
        const binding = this.variableBindings.get(v.name)
        if (binding) {
          return `${binding.tableAlias}.*`
        }
        return v.name
      }

      case 'PropertyAccess': {
        const pa = expr as PropertyAccess
        const obj = pa.object as Variable
        const binding = this.variableBindings.get(obj.name)
        if (binding) {
          return `json_extract(${binding.tableAlias}.properties, '$.${pa.property}')`
        }
        return `json_extract(${obj.name}.properties, '$.${pa.property}')`
      }

      case 'FunctionCall': {
        const fc = expr as FunctionCall
        const name = fc.name.toLowerCase()
        const distinctStr = fc.distinct ? 'DISTINCT ' : ''

        // Handle special argument case for count(*)
        if (name === 'count' && fc.arguments.length === 1) {
          const arg = fc.arguments[0]
          if (arg.type === 'Variable' && (arg as Variable).name === '*') {
            return 'COUNT(*)'
          }
        }

        const args = fc.arguments.map((a) => this.translateExpression(a)).join(', ')

        switch (name) {
          case 'count':
            return `COUNT(${distinctStr}${args})`
          case 'sum':
            return `SUM(${args})`
          case 'avg':
            return `AVG(${args})`
          case 'min':
            return `MIN(${args})`
          case 'max':
            return `MAX(${args})`
          case 'collect':
            return `json_group_array(${args})`
          default:
            return `${fc.name.toUpperCase()}(${args})`
        }
      }

      case 'BinaryExpression': {
        const be = expr as BinaryExpression
        const left = this.translateExpression(be.left)
        const right = this.translateExpression(be.right)
        return `(${left} ${be.operator} ${right})`
      }

      case 'UnaryExpression': {
        const ue = expr as UnaryExpression
        const operand = this.translateExpression(ue.operand)
        if (ue.operator === 'NOT') {
          return `NOT (${operand})`
        }
        return `${ue.operator} ${operand}`
      }

      case 'IntegerLiteral':
        return String((expr as IntegerLiteral).value)

      case 'FloatLiteral':
        return String((expr as FloatLiteral).value)

      case 'StringLiteral':
        this.params.push((expr as StringLiteral).value)
        return '?'

      case 'BooleanLiteral':
        return (expr as BooleanLiteral).value ? '1' : '0'

      case 'NullLiteral':
        return 'NULL'

      case 'Parameter': {
        const param = expr as Parameter
        this.params.push(`$${param.name}`)
        return '?'
      }

      default:
        return ''
    }
  }

  private getLiteralValue(expr: Expression): any {
    switch (expr.type) {
      case 'IntegerLiteral':
        return (expr as IntegerLiteral).value
      case 'FloatLiteral':
        return (expr as FloatLiteral).value
      case 'StringLiteral':
        return (expr as StringLiteral).value
      case 'BooleanLiteral':
        return (expr as BooleanLiteral).value
      default:
        return null
    }
  }

  private generateVariableLengthPathQuery(matchClauses: MatchClause[], returnClause?: ReturnClause): string {
    const matchClause = matchClauses[0]
    const elements = matchClause.pattern.elements

    // Find the relationship pattern with variable length
    const relIndex = elements.findIndex(
      (e) => e.type === 'RelationshipPattern' && ((e as RelationshipPattern).minHops !== undefined || (e as RelationshipPattern).maxHops !== undefined)
    )

    if (relIndex === -1) {
      return this.generateSelect(matchClauses, returnClause)
    }

    const rel = elements[relIndex] as RelationshipPattern
    const startNode = elements[relIndex - 1] as NodePattern
    const endNode = elements[relIndex + 1] as NodePattern

    const startAlias = startNode.variable || 'start_node'
    const endAlias = endNode.variable || 'end_node'

    // Bind variables
    this.variableBindings.set(startAlias, { type: 'node', tableAlias: startAlias })
    this.variableBindings.set(endAlias, { type: 'node', tableAlias: endAlias })

    const minHops = rel.minHops ?? 1
    const maxHops = rel.maxHops ?? 10 // Default max depth for safety

    const typeCondition = rel.types.length > 0 ? `AND r.type = '${rel.types[0]}'` : ''

    const startJoinCol = rel.direction === 'LEFT' ? 'end_node_id' : 'start_node_id'
    const endJoinCol = rel.direction === 'LEFT' ? 'start_node_id' : 'end_node_id'

    // Build label conditions
    let startLabelCondition = ''
    let endLabelCondition = ''

    if (startNode.labels.length > 0) {
      startLabelCondition = startNode.labels.map((l) => `json_extract(${startAlias}.labels, '$') LIKE '%"${l}"%'`).join(' AND ')
    }
    if (endNode.labels.length > 0) {
      endLabelCondition = endNode.labels.map((l) => `json_extract(${endAlias}.labels, '$') LIKE '%"${l}"%'`).join(' AND ')
    }

    // Build recursive CTE
    const sql = `WITH RECURSIVE path_cte AS (
  -- Base case: direct connections
  SELECT
    n1.id AS start_id,
    n2.id AS end_id,
    1 AS depth
  FROM nodes n1
  JOIN relationships r ON r.${startJoinCol} = n1.id ${typeCondition}
  JOIN nodes n2 ON n2.id = r.${endJoinCol}
  ${startLabelCondition ? `WHERE ${startLabelCondition.replace(new RegExp(startAlias, 'g'), 'n1')}` : ''}

  UNION ALL

  -- Recursive case: extend paths
  SELECT
    p.start_id,
    n2.id AS end_id,
    p.depth + 1 AS depth
  FROM path_cte p
  JOIN relationships r ON r.${startJoinCol} = p.end_id ${typeCondition}
  JOIN nodes n2 ON n2.id = r.${endJoinCol}
  WHERE p.depth < ${maxHops}
)
SELECT ${startAlias}.*, ${endAlias}.*
FROM path_cte
JOIN nodes AS ${startAlias} ON ${startAlias}.id = path_cte.start_id
JOIN nodes AS ${endAlias} ON ${endAlias}.id = path_cte.end_id
WHERE path_cte.depth >= ${minHops}${endLabelCondition ? ` AND ${endLabelCondition}` : ''}`

    return sql
  }

  private generateCreate(createClause: CreateClause): string {
    const elements = createClause.pattern.elements
    const statements: string[] = []

    let prevNodeVar: string | undefined

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]

      if (element.type === 'NodePattern') {
        const node = element as NodePattern

        // Check if this is a new node or reference to existing
        if (node.labels.length > 0 || node.properties) {
          const labels = JSON.stringify(node.labels)
          const properties = node.properties
            ? JSON.stringify(
                Object.fromEntries(node.properties.entries.map((e) => [e.key, this.getLiteralValue(e.value)]))
              )
            : '{}'

          statements.push(`INSERT INTO nodes (labels, properties) VALUES (?, ?)`)
          this.params.push(labels)
          this.params.push(properties)
        }

        prevNodeVar = node.variable
      } else if (element.type === 'RelationshipPattern') {
        const rel = element as RelationshipPattern
        const nextNode = elements[i + 1] as NodePattern

        const relType = rel.types[0] || 'RELATED_TO'
        const properties = rel.properties
          ? JSON.stringify(
              Object.fromEntries(rel.properties.entries.map((e) => [e.key, this.getLiteralValue(e.value)]))
            )
          : '{}'

        // For relationship creation, we need node references
        // In a real implementation, we'd track node IDs from previous inserts
        statements.push(`INSERT INTO relationships (type, start_node_id, end_node_id, properties) VALUES (?, ?, ?, ?)`)
        this.params.push(relType)
        // Placeholder for node IDs - in real impl these would be resolved
        this.params.push(`$${prevNodeVar || 'a'}`)
        this.params.push(`$${nextNode.variable || 'b'}`)
        this.params.push(properties)

        prevNodeVar = nextNode.variable
      }
    }

    return statements.join(';\n')
  }

  private generateMerge(mergeClause: MergeClause): string {
    const elements = mergeClause.pattern.elements
    const node = elements[0] as NodePattern

    if (node) {
      const labelsJson = JSON.stringify(node.labels)
      const propertiesJson = node.properties
        ? JSON.stringify(
            Object.fromEntries(node.properties.entries.map((e) => [e.key, this.getLiteralValue(e.value)]))
          )
        : '{}'

      // Build WHERE conditions for the match check
      const conditions: string[] = []

      if (node.labels.length > 0) {
        for (const label of node.labels) {
          conditions.push(`json_extract(labels, '$') LIKE '%"${label}"%'`)
        }
      }

      if (node.properties) {
        for (const entry of node.properties.entries) {
          conditions.push(`json_extract(properties, '$.${entry.key}') = ?`)
          this.params.push(this.getLiteralValue(entry.value))
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Push labels and properties for the INSERT
      this.params.push(labelsJson)
      this.params.push(propertiesJson)

      // Use INSERT with ON CONFLICT or INSERT WHERE NOT EXISTS
      return `INSERT INTO nodes (labels, properties)
SELECT ?, ?
WHERE NOT EXISTS (
  SELECT 1 FROM nodes ${whereClause}
)`
    }

    return ''
  }

  private generateDelete(matchClauses: MatchClause[], deleteClause: DeleteClause): string {
    const statements: string[] = []

    // Build the match conditions
    const { fromClause, whereConditions } = this.buildFromAndJoins(matchClauses)
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    for (const expr of deleteClause.expressions) {
      if (expr.type === 'Variable') {
        const v = expr as Variable
        const binding = this.variableBindings.get(v.name)

        if (binding?.type === 'node') {
          if (deleteClause.detach) {
            // DETACH DELETE - also delete relationships
            statements.push(
              `DELETE FROM relationships WHERE start_node_id IN (SELECT id FROM nodes ${whereClause}) OR end_node_id IN (SELECT id FROM nodes ${whereClause})`
            )
          }
          statements.push(`DELETE FROM nodes WHERE id IN (SELECT ${binding.tableAlias}.id FROM ${fromClause} ${whereClause})`)
        } else if (binding?.type === 'relationship') {
          statements.push(
            `DELETE FROM relationships WHERE id IN (SELECT ${binding.tableAlias}.id FROM ${fromClause} ${whereClause})`
          )
        }
      }
    }

    return statements.join(';\n')
  }

  private generateUpdate(matchClauses: MatchClause[], setClause: SetClause): string {
    const statements: string[] = []

    // Build the match conditions
    const { fromClause, whereConditions } = this.buildFromAndJoins(matchClauses)
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    for (const item of setClause.items) {
      if (item.type === 'PropertySetItem') {
        const propItem = item as PropertySetItem
        const obj = propItem.property.object as Variable
        const binding = this.variableBindings.get(obj.name)

        if (binding?.type === 'node') {
          const value = this.getLiteralValue(propItem.expression)
          statements.push(
            `UPDATE nodes SET properties = json_set(properties, '$.${propItem.property.property}', ?) WHERE id IN (SELECT ${binding.tableAlias}.id FROM ${fromClause} ${whereClause})`
          )
          this.params.push(value)
        }
      } else if (item.type === 'LabelSetItem') {
        const labelItem = item as LabelSetItem
        const binding = this.variableBindings.get(labelItem.variable)

        if (binding?.type === 'node') {
          // Add labels to existing labels array
          for (const label of labelItem.labels) {
            statements.push(
              `UPDATE nodes SET labels = json_insert(labels, '$[#]', ?) WHERE id IN (SELECT ${binding.tableAlias}.id FROM ${fromClause} ${whereClause}) AND NOT json_extract(labels, '$') LIKE ?`
            )
            this.params.push(label)
            this.params.push(`%"${label}"%`)
          }
        }
      }
    }

    return statements.join(';\n')
  }
}
