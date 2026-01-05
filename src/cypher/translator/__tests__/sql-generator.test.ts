import { describe, it, expect } from 'vitest'
import { SQLGenerator } from '../sql-generator'
import type {
  Query,
  MatchClause,
  ReturnClause,
  CreateClause,
  MergeClause,
  DeleteClause,
  SetClause,
  Pattern,
  NodePattern,
  RelationshipPattern,
  Variable,
  PropertyAccess,
  FunctionCall,
  BinaryExpression,
  StringLiteral,
  IntegerLiteral,
  MapLiteral,
} from '../../ast'

// Helper to create AST nodes
function createQuery(...clauses: any[]): Query {
  return { type: 'Query', clauses }
}

function createMatchClause(pattern: Pattern, optional = false, where?: any): MatchClause {
  return { type: 'MatchClause', pattern, optional, where }
}

function createReturnClause(items: any[], options?: { distinct?: boolean; orderBy?: any[]; skip?: any; limit?: any }): ReturnClause {
  return {
    type: 'ReturnClause',
    distinct: options?.distinct ?? false,
    items,
    orderBy: options?.orderBy,
    skip: options?.skip,
    limit: options?.limit,
  }
}

function createReturnItem(expression: any, alias?: string) {
  return { type: 'ReturnItem', expression, alias }
}

function createPattern(...elements: any[]): Pattern {
  return { type: 'Pattern', elements }
}

function createNodePattern(variable?: string, labels: string[] = [], properties?: MapLiteral): NodePattern {
  return { type: 'NodePattern', variable, labels, properties }
}

function createRelPattern(
  variable?: string,
  types: string[] = [],
  direction: 'LEFT' | 'RIGHT' | 'BOTH' | 'NONE' = 'RIGHT',
  options?: { properties?: MapLiteral; minHops?: number; maxHops?: number }
): RelationshipPattern {
  return {
    type: 'RelationshipPattern',
    variable,
    types,
    direction,
    properties: options?.properties,
    minHops: options?.minHops,
    maxHops: options?.maxHops,
  }
}

function createVariable(name: string): Variable {
  return { type: 'Variable', name }
}

function createPropertyAccess(object: any, property: string): PropertyAccess {
  return { type: 'PropertyAccess', object, property }
}

function createFunctionCall(name: string, args: any[], distinct = false): FunctionCall {
  return { type: 'FunctionCall', name, arguments: args, distinct }
}

function createBinaryExpr(operator: any, left: any, right: any): BinaryExpression {
  return { type: 'BinaryExpression', operator, left, right }
}

function createStringLiteral(value: string): StringLiteral {
  return { type: 'StringLiteral', value }
}

function createIntegerLiteral(value: number): IntegerLiteral {
  return { type: 'IntegerLiteral', value }
}

function createMapLiteral(entries: { key: string; value: any }[]): MapLiteral {
  return { type: 'MapLiteral', entries }
}

describe('SQLGenerator', () => {
  let generator: SQLGenerator

  beforeEach(() => {
    generator = new SQLGenerator()
  })

  describe('Basic MATCH patterns', () => {
    it('should translate MATCH (n) RETURN n to SELECT * FROM nodes', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n'))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('SELECT')
      expect(result.sql).toContain('FROM nodes')
    })

    it('should translate MATCH (n:Person) to WHERE with label check', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('FROM nodes')
      expect(result.sql).toMatch(/WHERE.*labels.*Person/i)
    })

    it('should translate MATCH (n:Person:Employee) to AND conditions for multiple labels', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person', 'Employee']))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('Person')
      expect(result.sql).toContain('Employee')
    })

    it('should translate MATCH (n {name: "Alice"}) to property WHERE clause', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('n', [], createMapLiteral([{ key: 'name', value: createStringLiteral('Alice') }]))
          )
        ),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('json_extract')
      expect(result.sql).toContain('name')
      expect(result.params).toContain('Alice')
    })

    it('should handle anonymous node pattern ()', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern())),
        createReturnClause([createReturnItem(createFunctionCall('count', [createVariable('*')]))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('COUNT(*)')
      expect(result.sql).toContain('FROM nodes')
    })
  })

  describe('Relationship patterns', () => {
    it('should translate MATCH (a)-[:KNOWS]->(b) to JOIN', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT'),
            createNodePattern('b')
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('JOIN relationships')
      expect(result.sql).toContain('JOIN nodes')
      // Type is parameterized for SQL injection prevention
      expect(result.sql).toMatch(/type\s*=\s*\?/)
      expect(result.params).toContain('KNOWS')
    })

    it('should translate MATCH (a)<-[:KNOWS]-(b) with LEFT direction', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS'], 'LEFT'),
            createNodePattern('b')
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('end_node_id')
      expect(result.sql).toContain('start_node_id')
    })

    it('should translate MATCH (a)-[:KNOWS|LIKES]->(b) with multiple rel types', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS', 'LIKES'], 'RIGHT'),
            createNodePattern('b')
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Types are parameterized for SQL injection prevention
      expect(result.params).toContain('KNOWS')
      expect(result.params).toContain('LIKES')
      expect(result.sql).toMatch(/type\s+IN\s+\(\?,\s*\?\)/i)
    })

    it('should translate MATCH (a)-[r:KNOWS]->(b) with relationship variable', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern('r', ['KNOWS'], 'RIGHT'),
            createNodePattern('b')
          )
        ),
        createReturnClause([
          createReturnItem(createVariable('a')),
          createReturnItem(createVariable('r')),
          createReturnItem(createVariable('b')),
        ])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('relationships')
      // Should alias the relationship table
      expect(result.sql).toMatch(/AS\s+r\b|relationships\s+r\b/i)
    })
  })

  describe('Variable-length paths', () => {
    it('should translate MATCH (a)-[:KNOWS*1..3]->(b) with recursive CTE', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT', { minHops: 1, maxHops: 3 }),
            createNodePattern('b')
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('WITH RECURSIVE')
      expect(result.sql).toContain('UNION ALL')
      expect(result.sql).toMatch(/depth\s*<\s*3/i)
    })

    it('should translate MATCH (a)-[:KNOWS*]->(b) with unbounded path', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT', { minHops: 1, maxHops: undefined }),
            createNodePattern('b')
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('WITH RECURSIVE')
      // Should have a max depth limit for safety
      expect(result.sql).toMatch(/depth\s*<\s*\d+/i)
    })
  })

  describe('OPTIONAL MATCH', () => {
    it('should translate OPTIONAL MATCH to LEFT JOIN', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('a', ['Person']))),
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT'),
            createNodePattern('b')
          ),
          true // optional
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('LEFT JOIN')
    })
  })

  describe('WHERE clause', () => {
    it('should translate WHERE with property comparison', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(createNodePattern('n', ['Person'])),
          false,
          createBinaryExpr('>', createPropertyAccess(createVariable('n'), 'age'), createIntegerLiteral(21))
        ),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('json_extract')
      expect(result.sql).toContain('age')
      expect(result.sql).toContain('>')
    })

    it('should translate WHERE with AND/OR', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(createNodePattern('n', ['Person'])),
          false,
          createBinaryExpr(
            'AND',
            createBinaryExpr('>', createPropertyAccess(createVariable('n'), 'age'), createIntegerLiteral(21)),
            createBinaryExpr('=', createPropertyAccess(createVariable('n'), 'active'), { type: 'BooleanLiteral', value: true })
          )
        ),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('AND')
    })

    it('should translate WHERE with NOT', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(createNodePattern('n', ['Person'])),
          false,
          {
            type: 'UnaryExpression',
            operator: 'NOT',
            operand: createBinaryExpr('=', createPropertyAccess(createVariable('n'), 'active'), { type: 'BooleanLiteral', value: false }),
          }
        ),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('NOT')
    })
  })

  describe('RETURN clause', () => {
    it('should translate RETURN n.name with property access', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createPropertyAccess(createVariable('n'), 'name'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('json_extract')
      expect(result.sql).toContain('name')
    })

    it('should translate RETURN with alias', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createPropertyAccess(createVariable('n'), 'name'), 'personName')])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('AS personName')
    })

    it('should translate RETURN DISTINCT', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createPropertyAccess(createVariable('n'), 'name'))], { distinct: true })
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('SELECT DISTINCT')
    })

    it('should translate RETURN count(*)', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createFunctionCall('count', [createVariable('*')]))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('COUNT(*)')
    })

    it('should translate RETURN count(DISTINCT n.name)', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([
          createReturnItem(createFunctionCall('count', [createPropertyAccess(createVariable('n'), 'name')], true)),
        ])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('COUNT(DISTINCT')
    })
  })

  describe('Aggregations', () => {
    it('should translate GROUP BY for aggregation queries', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([
          createReturnItem(createPropertyAccess(createVariable('n'), 'city')),
          createReturnItem(createFunctionCall('count', [createVariable('n')])),
        ])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('GROUP BY')
    })

    it('should translate collect() to GROUP_CONCAT', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createFunctionCall('collect', [createPropertyAccess(createVariable('n'), 'name')]))])
      )

      const result = generator.generate(ast)

      // SQLite uses json_group_array for collecting values
      expect(result.sql).toMatch(/json_group_array|GROUP_CONCAT/i)
    })

    it('should translate sum(), avg(), min(), max()', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([
          createReturnItem(createFunctionCall('sum', [createPropertyAccess(createVariable('n'), 'age')])),
          createReturnItem(createFunctionCall('avg', [createPropertyAccess(createVariable('n'), 'age')])),
          createReturnItem(createFunctionCall('min', [createPropertyAccess(createVariable('n'), 'age')])),
          createReturnItem(createFunctionCall('max', [createPropertyAccess(createVariable('n'), 'age')])),
        ])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('SUM(')
      expect(result.sql).toContain('AVG(')
      expect(result.sql).toContain('MIN(')
      expect(result.sql).toContain('MAX(')
    })
  })

  describe('ORDER BY, SKIP, LIMIT', () => {
    it('should translate ORDER BY', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createVariable('n'))], {
          orderBy: [{ type: 'OrderByItem', expression: createPropertyAccess(createVariable('n'), 'name'), direction: 'ASC' }],
        })
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('ASC')
    })

    it('should translate ORDER BY DESC', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createVariable('n'))], {
          orderBy: [{ type: 'OrderByItem', expression: createPropertyAccess(createVariable('n'), 'age'), direction: 'DESC' }],
        })
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('DESC')
    })

    it('should translate SKIP', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createVariable('n'))], {
          skip: createIntegerLiteral(10),
        })
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('OFFSET')
      expect(result.params).toContain(10)
    })

    it('should translate LIMIT', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        createReturnClause([createReturnItem(createVariable('n'))], {
          limit: createIntegerLiteral(5),
        })
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('LIMIT')
      expect(result.params).toContain(5)
    })
  })

  describe('CREATE clause', () => {
    it('should translate CREATE (n:Person {name: "Alice"}) to INSERT', () => {
      const ast = createQuery({
        type: 'CreateClause',
        pattern: createPattern(
          createNodePattern('n', ['Person'], createMapLiteral([{ key: 'name', value: createStringLiteral('Alice') }]))
        ),
      } as CreateClause)

      const result = generator.generate(ast)

      expect(result.sql).toContain('INSERT INTO nodes')
      expect(result.sql).toContain('labels')
      expect(result.sql).toContain('properties')
      expect(result.params).toContain('["Person"]')
    })

    it('should translate CREATE with relationship', () => {
      const ast = createQuery({
        type: 'CreateClause',
        pattern: createPattern(
          createNodePattern('a'),
          createRelPattern(undefined, ['KNOWS'], 'RIGHT'),
          createNodePattern('b')
        ),
      } as CreateClause)

      const result = generator.generate(ast)

      expect(result.sql).toContain('INSERT INTO relationships')
      expect(result.sql).toContain('type')
      expect(result.sql).toContain('start_node_id')
      expect(result.sql).toContain('end_node_id')
    })
  })

  describe('MERGE clause', () => {
    it('should translate MERGE (n:Person {name: "Alice"}) with upsert logic', () => {
      const ast = createQuery({
        type: 'MergeClause',
        pattern: createPattern(
          createNodePattern('n', ['Person'], createMapLiteral([{ key: 'name', value: createStringLiteral('Alice') }]))
        ),
      } as MergeClause)

      const result = generator.generate(ast)

      // MERGE should check for existence then INSERT if not found
      expect(result.sql).toContain('INSERT')
      expect(result.sql).toMatch(/ON CONFLICT|WHERE NOT EXISTS|INSERT OR IGNORE/i)
    })
  })

  describe('DELETE clause', () => {
    it('should translate DELETE n', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        {
          type: 'DeleteClause',
          detach: false,
          expressions: [createVariable('n')],
        } as DeleteClause
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('DELETE FROM nodes')
    })

    it('should translate DETACH DELETE n', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        {
          type: 'DeleteClause',
          detach: true,
          expressions: [createVariable('n')],
        } as DeleteClause
      )

      const result = generator.generate(ast)

      // DETACH DELETE should also delete relationships
      expect(result.sql).toContain('DELETE')
      expect(result.sql).toContain('relationships')
    })
  })

  describe('SET clause', () => {
    it('should translate SET n.name = "Bob"', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        {
          type: 'SetClause',
          items: [
            {
              type: 'PropertySetItem',
              property: createPropertyAccess(createVariable('n'), 'name'),
              expression: createStringLiteral('Bob'),
            },
          ],
        } as SetClause
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('UPDATE nodes')
      expect(result.sql).toContain('json_set')
      expect(result.params).toContain('Bob')
    })

    it('should translate SET n:Manager (add label)', () => {
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', ['Person']))),
        {
          type: 'SetClause',
          items: [
            {
              type: 'LabelSetItem',
              variable: 'n',
              labels: ['Manager'],
            },
          ],
        } as SetClause
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('UPDATE nodes')
      expect(result.sql).toContain('labels')
    })
  })

  describe('Parameters', () => {
    it('should handle $param placeholders', () => {
      const ast = createQuery(
        createMatchClause(
          createPattern(createNodePattern('n', ['Person'])),
          false,
          createBinaryExpr('=', createPropertyAccess(createVariable('n'), 'name'), { type: 'Parameter', name: 'name' })
        ),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('?')
      // The parameter should be tracked
      expect(result.params).toBeDefined()
    })
  })

  describe('Complex queries', () => {
    it('should translate multi-hop pattern with labels and properties', () => {
      // MATCH (a:Person)-[:KNOWS]->(b:Person)-[:WORKS_AT]->(c:Company)
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a', ['Person']),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT'),
            createNodePattern('b', ['Person']),
            createRelPattern(undefined, ['WORKS_AT'], 'RIGHT'),
            createNodePattern('c', ['Company'])
          )
        ),
        createReturnClause([
          createReturnItem(createPropertyAccess(createVariable('a'), 'name'), 'person'),
          createReturnItem(createPropertyAccess(createVariable('c'), 'name'), 'company'),
        ])
      )

      const result = generator.generate(ast)

      expect(result.sql).toContain('JOIN')
      expect(result.sql).toContain('Person')
      expect(result.sql).toContain('Company')
      // Relationship types are parameterized for SQL injection prevention
      expect(result.params).toContain('KNOWS')
      expect(result.params).toContain('WORKS_AT')
    })
  })

  /**
   * TDD Tests for Pattern to JOIN Translation
   *
   * These tests focus on the specific mechanics of translating Cypher graph patterns
   * to SQL JOINs, ensuring correct table aliasing, join conditions, and WHERE clauses.
   */
  describe('Pattern to JOIN Translation', () => {
    describe('Single node pattern (n:Label)', () => {
      it('should use node variable as table alias', () => {
        // MATCH (person:Person) RETURN person
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('person', ['Person']))),
          createReturnClause([createReturnItem(createVariable('person'))])
        )

        const result = generator.generate(ast)

        // The SQL should use 'person' as the table alias
        expect(result.sql).toMatch(/FROM nodes AS person/i)
      })

      it('should generate correct label check using json_extract', () => {
        // MATCH (n:Person) RETURN n
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n', ['Person']))),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Should use json_extract to check labels array
        expect(result.sql).toMatch(/json_extract\(n\.labels/i)
        expect(result.sql).toContain('"Person"')
      })

      it('should handle multiple labels with AND conditions', () => {
        // MATCH (n:Person:Employee) RETURN n
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n', ['Person', 'Employee']))),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Both labels should be checked with AND
        expect(result.sql).toMatch(/json_extract\(n\.labels.*Person/i)
        expect(result.sql).toMatch(/json_extract\(n\.labels.*Employee/i)
        // Should have two separate conditions connected with AND
        expect(result.sql).toMatch(/LIKE.*AND.*LIKE/i)
      })

      it('should return all columns for node variable', () => {
        // MATCH (n:Person) RETURN n
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n', ['Person']))),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // RETURN n should translate to n.*
        expect(result.sql).toMatch(/SELECT\s+n\.\*/i)
      })

      it('should generate correct SQL structure for labeled node', () => {
        // MATCH (n:Product) RETURN n
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n', ['Product']))),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Full SQL structure verification
        expect(result.sql).toMatch(/^SELECT.*FROM nodes AS n.*WHERE/is)
      })
    })

    describe('Node pattern with property filters (n:Label {prop: value})', () => {
      it('should translate inline property to WHERE condition with json_extract', () => {
        // MATCH (n:Person {name: "Alice"}) RETURN n
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', ['Person'], createMapLiteral([{ key: 'name', value: createStringLiteral('Alice') }]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Should use json_extract for property access
        expect(result.sql).toMatch(/json_extract\(n\.properties,\s*'\$\.name'\)/i)
        // Value should be parameterized
        expect(result.sql).toContain('= ?')
        expect(result.params).toContain('Alice')
      })

      it('should handle multiple inline properties with AND', () => {
        // MATCH (n:Person {name: "Alice", age: 30}) RETURN n
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', ['Person'], createMapLiteral([
                { key: 'name', value: createStringLiteral('Alice') },
                { key: 'age', value: createIntegerLiteral(30) }
              ]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Both properties should be checked
        expect(result.sql).toMatch(/json_extract\(n\.properties,\s*'\$\.name'\)/i)
        expect(result.sql).toMatch(/json_extract\(n\.properties,\s*'\$\.age'\)/i)
        // Both params should be present
        expect(result.params).toContain('Alice')
        expect(result.params).toContain(30)
      })

      it('should combine label and property filters in WHERE', () => {
        // MATCH (n:Person {city: "NYC"}) RETURN n
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', ['Person'], createMapLiteral([{ key: 'city', value: createStringLiteral('NYC') }]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Should have both label check AND property check
        expect(result.sql).toMatch(/labels.*Person/i)
        expect(result.sql).toMatch(/properties.*city/i)
        // Conditions should be combined with AND
        const whereMatch = result.sql.match(/WHERE\s+(.+)/is)
        expect(whereMatch).not.toBeNull()
        expect(whereMatch![1]).toContain('AND')
      })

      it('should handle integer property values correctly', () => {
        // MATCH (n {count: 42}) RETURN n
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', [], createMapLiteral([{ key: 'count', value: createIntegerLiteral(42) }]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        expect(result.sql).toContain('json_extract')
        expect(result.params).toContain(42)
      })

      it('should handle boolean property values', () => {
        // MATCH (n:User {active: true}) RETURN n
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', ['User'], createMapLiteral([{ key: 'active', value: { type: 'BooleanLiteral', value: true } as any }]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        expect(result.sql).toMatch(/json_extract\(n\.properties,\s*'\$\.active'\)/i)
        expect(result.params).toContain(true)
      })

      it('should properly parameterize all property values to prevent SQL injection', () => {
        // MATCH (n {sql: "'; DROP TABLE nodes; --"}) RETURN n
        const maliciousValue = "'; DROP TABLE nodes; --"
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', [], createMapLiteral([{ key: 'sql', value: createStringLiteral(maliciousValue) }]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Value should be in params, not in SQL string
        expect(result.sql).not.toContain(maliciousValue)
        expect(result.params).toContain(maliciousValue)
        expect(result.sql).toContain('= ?')
      })
    })

    describe('Multiple node patterns', () => {
      it('should handle two separate MATCH clauses', () => {
        // MATCH (a:Person) MATCH (b:Company) RETURN a, b
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(createPattern(createNodePattern('b', ['Company']))),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should have both table aliases
        expect(result.sql).toMatch(/nodes AS a/i)
        expect(result.sql).toMatch(/nodes AS b/i)
        // Should check both labels
        expect(result.sql).toContain('Person')
        expect(result.sql).toContain('Company')
      })

      it('should create proper cross join for unrelated node patterns', () => {
        // MATCH (a:Person), (b:Product) RETURN a, b
        // This represents a Cartesian product
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(createPattern(createNodePattern('b', ['Product']))),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should have FROM for first table and JOIN for second
        expect(result.sql).toMatch(/FROM nodes AS a/i)
        expect(result.sql).toMatch(/JOIN nodes AS b|nodes AS b/i)
      })

      it('should maintain separate variable bindings for each node', () => {
        // MATCH (x:A), (y:B), (z:C) RETURN x.name, y.name, z.name
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('x', ['A']))),
          createMatchClause(createPattern(createNodePattern('y', ['B']))),
          createMatchClause(createPattern(createNodePattern('z', ['C']))),
          createReturnClause([
            createReturnItem(createPropertyAccess(createVariable('x'), 'name')),
            createReturnItem(createPropertyAccess(createVariable('y'), 'name')),
            createReturnItem(createPropertyAccess(createVariable('z'), 'name'))
          ])
        )

        const result = generator.generate(ast)

        // Each variable should have its own json_extract
        expect(result.sql).toMatch(/json_extract\(x\.properties,\s*'\$\.name'\)/i)
        expect(result.sql).toMatch(/json_extract\(y\.properties,\s*'\$\.name'\)/i)
        expect(result.sql).toMatch(/json_extract\(z\.properties,\s*'\$\.name'\)/i)
      })

      it('should handle WHERE clause across multiple node patterns', () => {
        // MATCH (a:Person), (b:Company) WHERE a.name = b.name RETURN a, b
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(
            createPattern(createNodePattern('b', ['Company'])),
            false,
            createBinaryExpr('=',
              createPropertyAccess(createVariable('a'), 'name'),
              createPropertyAccess(createVariable('b'), 'name')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should have comparison between properties from different nodes
        expect(result.sql).toMatch(/json_extract\(a\.properties.*=.*json_extract\(b\.properties/i)
      })

      it('should generate unique aliases when variables are not specified', () => {
        // MATCH (:Person), (:Company) RETURN count(*)
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern(undefined, ['Person']))),
          createMatchClause(createPattern(createNodePattern(undefined, ['Company']))),
          createReturnClause([createReturnItem(createFunctionCall('count', [createVariable('*')]))])
        )

        const result = generator.generate(ast)

        // Should generate unique aliases like t0, t1
        expect(result.sql).toMatch(/nodes AS t\d/i)
        // Should have two different node tables
        expect(result.sql).toContain('Person')
        expect(result.sql).toContain('Company')
      })

      it('should properly count results from multiple patterns', () => {
        // MATCH (p:Person), (c:Company) RETURN count(*) as total
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('p', ['Person']))),
          createMatchClause(createPattern(createNodePattern('c', ['Company']))),
          createReturnClause([
            createReturnItem(createFunctionCall('count', [createVariable('*')]), 'total')
          ])
        )

        const result = generator.generate(ast)

        expect(result.sql).toContain('COUNT(*)')
        expect(result.sql).toContain('AS total')
      })
    })

    describe('Edge cases for Pattern to JOIN', () => {
      it('should handle node without label or properties', () => {
        // MATCH (n) RETURN n
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n'))),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Use 's' flag for dotall mode (. matches newlines)
        expect(result.sql).toMatch(/SELECT.*FROM nodes AS n/is)
        // Should not have WHERE clause for labels
        expect(result.sql).not.toMatch(/WHERE.*labels/i)
      })

      it('should handle returning specific properties from nodes', () => {
        // MATCH (n:Person) RETURN n.name, n.age
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n', ['Person']))),
          createReturnClause([
            createReturnItem(createPropertyAccess(createVariable('n'), 'name')),
            createReturnItem(createPropertyAccess(createVariable('n'), 'age'))
          ])
        )

        const result = generator.generate(ast)

        expect(result.sql).toMatch(/SELECT.*json_extract\(n\.properties,\s*'\$\.name'\).*json_extract\(n\.properties,\s*'\$\.age'\)/i)
      })

      it('should handle labels with special characters escaped', () => {
        // Label names should be properly handled to prevent SQL issues
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('n', ['My Label']))),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        expect(result.sql).toContain('My Label')
      })

      it('should handle empty labels array', () => {
        // MATCH (n {prop: "value"}) RETURN n - node with property but no label
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('n', [], createMapLiteral([{ key: 'prop', value: createStringLiteral('value') }]))
            )
          ),
          createReturnClause([createReturnItem(createVariable('n'))])
        )

        const result = generator.generate(ast)

        // Should have property check but no label check
        expect(result.sql).toMatch(/json_extract\(n\.properties/i)
      })
    })
  })

  /**
   * TDD Tests for Relationship Pattern to JOIN Translation
   *
   * These tests focus on translating Cypher relationship patterns to SQL JOINs.
   * - Directed relationships: (a)-[r:TYPE]->(b), (a)<-[r:TYPE]-(b)
   * - Bidirectional relationships: (a)-[r]-(b)
   * - Optional relationships: OPTIONAL MATCH
   */
  describe('Relationship Pattern to JOIN Translation', () => {
    describe('Directed relationships (a)-[r:TYPE]->(b)', () => {
      it('should generate JOIN on relationships table for right-directed pattern', () => {
        // MATCH (a)-[r:KNOWS]->(b) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should join relationships table with alias 'r'
        expect(result.sql).toMatch(/JOIN\s+relationships\s+AS\s+r\b/i)
        // Relationship should connect a.id to start_node_id
        expect(result.sql).toMatch(/r\.start_node_id\s*=\s*a\.id/i)
        // Node b should connect via end_node_id
        expect(result.sql).toMatch(/b\.id\s*=\s*r\.end_node_id/i)
      })

      it('should generate correct JOIN for left-directed pattern (a)<-[:TYPE]-(b)', () => {
        // MATCH (a)<-[r:KNOWS]-(b) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'LEFT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // For LEFT direction: a is the end_node, b is the start_node
        // JOIN should be: r.end_node_id = a.id and r.start_node_id = b.id
        expect(result.sql).toMatch(/r\.end_node_id\s*=\s*a\.id/i)
        expect(result.sql).toMatch(/b\.id\s*=\s*r\.start_node_id/i)
      })

      it('should filter by relationship type in WHERE clause', () => {
        // MATCH (a)-[:FRIEND_OF]->(b) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern(undefined, ['FRIEND_OF'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should have parameterized type filter in WHERE
        expect(result.sql).toMatch(/\.type\s*=\s*\?/i)
        expect(result.params).toContain('FRIEND_OF')
      })

      it('should handle multiple relationship types with IN clause', () => {
        // MATCH (a)-[:KNOWS|LIKES|FOLLOWS]->(b) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern(undefined, ['KNOWS', 'LIKES', 'FOLLOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should use IN with parameterized values
        expect(result.sql).toMatch(/\.type\s+IN\s*\(\?, \?, \?\)/i)
        // Types should be in params
        expect(result.params).toContain('KNOWS')
        expect(result.params).toContain('LIKES')
        expect(result.params).toContain('FOLLOWS')
      })

      it('should properly alias relationship variable', () => {
        // MATCH (a)-[rel:KNOWS]->(b) RETURN rel
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('rel', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([createReturnItem(createVariable('rel'))])
        )

        const result = generator.generate(ast)

        // Relationship should use 'rel' as alias
        expect(result.sql).toMatch(/relationships\s+AS\s+rel\b/i)
        // RETURN should reference rel.*
        expect(result.sql).toMatch(/SELECT.*rel\.\*/i)
      })

      it('should handle relationship with properties in pattern', () => {
        // MATCH (a)-[r:KNOWS {since: 2020}]->(b) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT', {
                properties: createMapLiteral([{ key: 'since', value: createIntegerLiteral(2020) }])
              }),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should have property filter on relationship
        expect(result.sql).toMatch(/json_extract\(r\.properties,\s*'\$\.since'\)/i)
        expect(result.params).toContain(2020)
      })

      it('should chain multiple relationships correctly', () => {
        // MATCH (a)-[:KNOWS]->(b)-[:WORKS_AT]->(c) RETURN a, b, c
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r1', ['KNOWS'], 'RIGHT'),
              createNodePattern('b'),
              createRelPattern('r2', ['WORKS_AT'], 'RIGHT'),
              createNodePattern('c')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b')),
            createReturnItem(createVariable('c'))
          ])
        )

        const result = generator.generate(ast)

        // Should have two relationship JOINs
        expect(result.sql).toMatch(/JOIN\s+relationships\s+AS\s+r1/i)
        expect(result.sql).toMatch(/JOIN\s+relationships\s+AS\s+r2/i)
        // Should have three node tables
        expect(result.sql).toMatch(/nodes\s+AS\s+a/i)
        expect(result.sql).toMatch(/nodes\s+AS\s+b/i)
        expect(result.sql).toMatch(/nodes\s+AS\s+c/i)
        // First relationship: a -> b
        expect(result.sql).toMatch(/r1\.start_node_id\s*=\s*a\.id/i)
        expect(result.sql).toMatch(/b\.id\s*=\s*r1\.end_node_id/i)
        // Second relationship: b -> c
        expect(result.sql).toMatch(/r2\.start_node_id\s*=\s*b\.id/i)
        expect(result.sql).toMatch(/c\.id\s*=\s*r2\.end_node_id/i)
      })

      it('should handle relationship without type filter', () => {
        // MATCH (a)-[r]->(b) RETURN a, b (any relationship type)
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', [], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should join relationships without type filter
        expect(result.sql).toMatch(/JOIN\s+relationships\s+AS\s+r/i)
        // Should NOT have type filter when no types specified
        expect(result.sql).not.toMatch(/r\.type\s*=/i)
        expect(result.sql).not.toMatch(/r\.type\s+IN/i)
      })

      it('should return relationship properties correctly', () => {
        // MATCH (a)-[r:KNOWS]->(b) RETURN r.since
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createPropertyAccess(createVariable('r'), 'since'))
          ])
        )

        const result = generator.generate(ast)

        // Should extract property from relationship
        expect(result.sql).toMatch(/json_extract\(r\.properties,\s*'\$\.since'\)/i)
      })

      it('should handle node labels with relationship', () => {
        // MATCH (a:Person)-[:KNOWS]->(b:Company) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a', ['Person']),
              createRelPattern(undefined, ['KNOWS'], 'RIGHT'),
              createNodePattern('b', ['Company'])
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should filter both nodes by label
        expect(result.sql).toMatch(/json_extract\(a\.labels.*Person/i)
        expect(result.sql).toMatch(/json_extract\(b\.labels.*Company/i)
      })

      it('should generate auto-alias when relationship variable not specified', () => {
        // MATCH (a)-[:KNOWS]->(b) RETURN a, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern(undefined, ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should auto-generate alias like t0, t1, etc.
        expect(result.sql).toMatch(/relationships\s+AS\s+t\d+/i)
      })
    })

    describe('Bidirectional relationships (a)-[r]-(b)', () => {
      it('should generate UNION or OR for bidirectional pattern', () => {
        // MATCH (a)-[r:KNOWS]-(b) RETURN a, b
        // This matches both (a)->(b) AND (a)<-(b)
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'BOTH'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should handle bidirectional - could be UNION or OR condition
        // Either approach is valid:
        // 1. UNION of left and right
        // 2. OR condition: (r.start_node_id = a.id AND r.end_node_id = b.id) OR (r.end_node_id = a.id AND r.start_node_id = b.id)
        const hasBidirectionalHandling =
          result.sql.includes('UNION') ||
          (result.sql.match(/start_node_id/g)?.length ?? 0) >= 2 ||
          result.sql.includes(' OR ')

        expect(hasBidirectionalHandling).toBe(true)
      })

      it('should match relationships in either direction for BOTH', () => {
        // MATCH (a)-[r]-(b) RETURN a, r, b
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', [], 'BOTH'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('r')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // For bidirectional without type, should still handle both directions
        expect(result.sql).toMatch(/relationships/i)
        // Should reference both start_node_id and end_node_id in conditions
        expect(result.sql).toContain('start_node_id')
        expect(result.sql).toContain('end_node_id')
      })

      it('should handle bidirectional with node labels', () => {
        // MATCH (p:Person)-[:FRIEND]-(other:Person) RETURN p, other
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('p', ['Person']),
              createRelPattern(undefined, ['FRIEND'], 'BOTH'),
              createNodePattern('other', ['Person'])
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('p')),
            createReturnItem(createVariable('other'))
          ])
        )

        const result = generator.generate(ast)

        // Should filter both nodes as Person
        expect(result.sql).toMatch(/json_extract\(p\.labels.*Person/i)
        expect(result.sql).toMatch(/json_extract\(other\.labels.*Person/i)
        // Should handle bidirectional relationship (type is parameterized)
        expect(result.sql).toMatch(/\.type\s*=\s*\?/i)
        expect(result.params).toContain('FRIEND')
      })

      it('should handle NONE direction (undirected edge pattern)', () => {
        // MATCH (a)-->(b) with NONE direction means unspecified
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['LINKS'], 'NONE'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // NONE typically treated like BOTH in Cypher
        expect(result.sql).toMatch(/relationships/i)
      })

      it('should chain bidirectional relationships', () => {
        // MATCH (a)-[:KNOWS]-(b)-[:WORKS_WITH]-(c) RETURN a, c
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r1', ['KNOWS'], 'BOTH'),
              createNodePattern('b'),
              createRelPattern('r2', ['WORKS_WITH'], 'BOTH'),
              createNodePattern('c')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('c'))
          ])
        )

        const result = generator.generate(ast)

        // Should have both relationship types in params (parameterized)
        expect(result.params).toContain('KNOWS')
        expect(result.params).toContain('WORKS_WITH')
        // Should have all three nodes
        expect(result.sql).toMatch(/nodes.*a/i)
        expect(result.sql).toMatch(/nodes.*b/i)
        expect(result.sql).toMatch(/nodes.*c/i)
      })
    })

    describe('OPTIONAL MATCH with relationships', () => {
      it('should generate LEFT JOIN for OPTIONAL MATCH relationship', () => {
        // MATCH (a:Person)
        // OPTIONAL MATCH (a)-[r:KNOWS]->(b)
        // RETURN a, b
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            ),
            true // optional = true
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should use LEFT JOIN for optional relationship
        expect(result.sql).toMatch(/LEFT\s+JOIN\s+relationships/i)
        // Should use LEFT JOIN for the target node too
        expect(result.sql).toMatch(/LEFT\s+JOIN\s+nodes\s+AS\s+b/i)
      })

      it('should handle OPTIONAL MATCH with NULL values', () => {
        // MATCH (a:Person)
        // OPTIONAL MATCH (a)-[:HAS_ADDRESS]->(addr:Address)
        // RETURN a.name, addr.city
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern(undefined, ['HAS_ADDRESS'], 'RIGHT'),
              createNodePattern('addr', ['Address'])
            ),
            true
          ),
          createReturnClause([
            createReturnItem(createPropertyAccess(createVariable('a'), 'name')),
            createReturnItem(createPropertyAccess(createVariable('addr'), 'city'))
          ])
        )

        const result = generator.generate(ast)

        // Should have LEFT JOINs for optional part
        expect(result.sql).toMatch(/LEFT\s+JOIN/i)
        // Should be able to return properties from both
        expect(result.sql).toMatch(/json_extract\(a\.properties,\s*'\$\.name'\)/i)
        expect(result.sql).toMatch(/json_extract\(addr\.properties,\s*'\$\.city'\)/i)
      })

      it('should combine mandatory and optional relationships', () => {
        // MATCH (a:Person)-[:WORKS_AT]->(c:Company)
        // OPTIONAL MATCH (a)-[:MANAGES]->(e:Employee)
        // RETURN a, c, e
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a', ['Person']),
              createRelPattern('r1', ['WORKS_AT'], 'RIGHT'),
              createNodePattern('c', ['Company'])
            )
          ),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r2', ['MANAGES'], 'RIGHT'),
              createNodePattern('e', ['Employee'])
            ),
            true
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('c')),
            createReturnItem(createVariable('e'))
          ])
        )

        const result = generator.generate(ast)

        // First MATCH should be regular JOIN
        expect(result.sql).toMatch(/JOIN\s+relationships\s+AS\s+r1/i)
        expect(result.sql).toMatch(/JOIN\s+nodes\s+AS\s+c/i)
        // Optional MATCH should be LEFT JOIN
        expect(result.sql).toMatch(/LEFT\s+JOIN\s+relationships\s+AS\s+r2/i)
        expect(result.sql).toMatch(/LEFT\s+JOIN\s+nodes\s+AS\s+e/i)
      })

      it('should handle OPTIONAL MATCH with WHERE clause', () => {
        // MATCH (a:Person)
        // OPTIONAL MATCH (a)-[r:KNOWS]->(b) WHERE r.since > 2020
        // RETURN a, b
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            ),
            true,
            createBinaryExpr('>', createPropertyAccess(createVariable('r'), 'since'), createIntegerLiteral(2020))
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should use LEFT JOIN
        expect(result.sql).toMatch(/LEFT\s+JOIN/i)
        // Should include WHERE condition
        expect(result.sql).toMatch(/json_extract\(r\.properties.*since/i)
      })

      it('should handle multiple OPTIONAL MATCH clauses', () => {
        // MATCH (a:Person)
        // OPTIONAL MATCH (a)-[:FRIEND]->(f:Person)
        // OPTIONAL MATCH (a)-[:ENEMY]->(e:Person)
        // RETURN a, f, e
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r1', ['FRIEND'], 'RIGHT'),
              createNodePattern('f', ['Person'])
            ),
            true
          ),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r2', ['ENEMY'], 'RIGHT'),
              createNodePattern('e', ['Person'])
            ),
            true
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('f')),
            createReturnItem(createVariable('e'))
          ])
        )

        const result = generator.generate(ast)

        // Should have two LEFT JOINs for relationships
        const leftJoinMatches = result.sql.match(/LEFT\s+JOIN\s+relationships/gi)
        expect(leftJoinMatches?.length).toBeGreaterThanOrEqual(2)
        // Should reference all relationship types in params (parameterized)
        expect(result.params).toContain('FRIEND')
        expect(result.params).toContain('ENEMY')
      })

      it('should handle OPTIONAL MATCH bidirectional relationship', () => {
        // MATCH (a:Person)
        // OPTIONAL MATCH (a)-[:RELATED]-(b:Person)
        // RETURN a, b
        const ast = createQuery(
          createMatchClause(createPattern(createNodePattern('a', ['Person']))),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['RELATED'], 'BOTH'),
              createNodePattern('b', ['Person'])
            ),
            true
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should use LEFT JOIN
        expect(result.sql).toMatch(/LEFT\s+JOIN/i)
        // Should handle bidirectional (type is parameterized)
        expect(result.params).toContain('RELATED')
      })
    })

    describe('Relationship variable reuse', () => {
      it('should handle same node variable appearing in multiple patterns', () => {
        // MATCH (a)-[:KNOWS]->(b), (a)-[:LIKES]->(c) RETURN a, b, c
        // The 'a' node appears in both patterns
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r1', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r2', ['LIKES'], 'RIGHT'),
              createNodePattern('c')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b')),
            createReturnItem(createVariable('c'))
          ])
        )

        const result = generator.generate(ast)

        // Node 'a' should only have one table reference
        const aMatches = result.sql.match(/nodes\s+AS\s+a\b/gi)
        expect(aMatches?.length).toBe(1)
        // Both relationships should connect to 'a'
        expect(result.sql).toMatch(/r1\.start_node_id\s*=\s*a\.id/i)
        expect(result.sql).toMatch(/r2\.start_node_id\s*=\s*a\.id/i)
      })

      it('should handle cycle pattern (a)-[:REL]->(b)-[:REL]->(a)', () => {
        // MATCH (a)-[:KNOWS]->(b)-[:KNOWS]->(a) RETURN a, b
        // Cycle back to same node
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r1', ['KNOWS'], 'RIGHT'),
              createNodePattern('b'),
              createRelPattern('r2', ['KNOWS'], 'RIGHT'),
              createNodePattern('a')  // Same 'a' node
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should handle the cycle - a should be defined once
        // Second relationship should connect back to a
        expect(result.sql).toContain('r2')
        // Should have condition connecting r2.end_node_id to a
        expect(result.sql).toMatch(/r2\.end_node_id\s*=\s*a\.id/i)
      })
    })

    describe('Edge cases for relationship patterns', () => {
      it('should handle relationship with empty type array as any type', () => {
        // MATCH (a)-[]->(b) - relationship without type
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern(undefined, [], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // Should not filter by type
        expect(result.sql).not.toMatch(/\.type\s*=\s*'/i)
        expect(result.sql).not.toMatch(/\.type\s+IN/i)
      })

      it('should prevent SQL injection in relationship type', () => {
        // Malicious type name should be parameterized, not inline
        const maliciousType = "KNOWS'; DROP TABLE relationships; --"
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern(undefined, [maliciousType], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createVariable('a')),
            createReturnItem(createVariable('b'))
          ])
        )

        const result = generator.generate(ast)

        // The type should NOT be in the SQL directly - it should be parameterized
        expect(result.sql).not.toContain(maliciousType)
        expect(result.sql).not.toMatch(/DROP\s+TABLE/i)
        // Type should be in params instead
        expect(result.params).toContain(maliciousType)
        // SQL should use placeholder
        expect(result.sql).toMatch(/\.type\s*=\s*\?/i)
      })

      it('should count relationships correctly', () => {
        // MATCH (a)-[r:KNOWS]->(b) RETURN count(r)
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createFunctionCall('count', [createVariable('r')]))
          ])
        )

        const result = generator.generate(ast)

        expect(result.sql).toContain('COUNT(')
        expect(result.sql).toMatch(/COUNT\(.*r\./i)
      })

      it('should aggregate by node with relationship', () => {
        // MATCH (a)-[r:KNOWS]->(b) RETURN a.name, count(b) as friends
        const ast = createQuery(
          createMatchClause(
            createPattern(
              createNodePattern('a'),
              createRelPattern('r', ['KNOWS'], 'RIGHT'),
              createNodePattern('b')
            )
          ),
          createReturnClause([
            createReturnItem(createPropertyAccess(createVariable('a'), 'name')),
            createReturnItem(createFunctionCall('count', [createVariable('b')]), 'friends')
          ])
        )

        const result = generator.generate(ast)

        expect(result.sql).toContain('COUNT(')
        expect(result.sql).toContain('GROUP BY')
        expect(result.sql).toContain('AS friends')
      })
    })
  })
})
