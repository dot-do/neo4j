import { describe, it, expect } from 'vitest'
import { ParserError, parse } from '../index'
import {
  MatchClause,
  ReturnClause,
  DeleteClause,
  UnwindClause,
  CallClause,
  UnionClause,
  SetClause,
  RemoveClause,
  PropertySetItem,
  LabelSetItem,
  ReplacePropertiesItem,
  MergePropertiesItem,
  PropertyRemoveItem,
  LabelRemoveItem,
  NodePattern,
  RelationshipPattern,
  Variable,
  PropertyAccess,
  StringLiteral,
  IntegerLiteral,
  BinaryExpression,
  ListExpression,
  MapLiteral,
} from '../../ast/types'

describe('Parser', () => {
  describe('basic MATCH queries', () => {
    it('should parse MATCH (n) RETURN n', () => {
      const query = parse('MATCH (n) RETURN n')

      expect(query.type).toBe('Query')
      expect(query.clauses).toHaveLength(2)

      // Check MATCH clause
      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.type).toBe('MatchClause')
      expect(matchClause.optional).toBe(false)
      expect(matchClause.pattern.elements).toHaveLength(1)

      const nodePattern = matchClause.pattern.elements[0] as NodePattern
      expect(nodePattern.type).toBe('NodePattern')
      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toHaveLength(0)

      // Check RETURN clause
      const returnClause = query.clauses[1] as ReturnClause
      expect(returnClause.type).toBe('ReturnClause')
      expect(returnClause.items).toHaveLength(1)

      const returnItem = returnClause.items[0]
      expect(returnItem.expression.type).toBe('Variable')
      expect((returnItem.expression as Variable).name).toBe('n')
    })

    it('should parse MATCH (n:Person) RETURN n', () => {
      const query = parse('MATCH (n:Person) RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      const nodePattern = matchClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person'])
    })

    it('should parse MATCH (n:Person:Employee) RETURN n (multiple labels)', () => {
      const query = parse('MATCH (n:Person:Employee) RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      const nodePattern = matchClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person', 'Employee'])
    })

    it('should parse MATCH (:Person) RETURN * (anonymous node)', () => {
      const query = parse('MATCH (:Person) RETURN count(*)')

      const matchClause = query.clauses[0] as MatchClause
      const nodePattern = matchClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBeUndefined()
      expect(nodePattern.labels).toEqual(['Person'])
    })

    it('should parse node pattern with properties', () => {
      const query = parse("MATCH (n:Person {name: 'Alice'}) RETURN n")

      const matchClause = query.clauses[0] as MatchClause
      const nodePattern = matchClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person'])
      expect(nodePattern.properties).toBeDefined()
      expect(nodePattern.properties!.entries).toHaveLength(1)
      expect(nodePattern.properties!.entries[0].key).toBe('name')
      expect((nodePattern.properties!.entries[0].value as StringLiteral).value).toBe('Alice')
    })

    it('should parse node pattern with multiple properties', () => {
      const query = parse("MATCH (n {name: 'Alice', age: 30}) RETURN n")

      const matchClause = query.clauses[0] as MatchClause
      const nodePattern = matchClause.pattern.elements[0] as NodePattern

      expect(nodePattern.properties!.entries).toHaveLength(2)
      expect(nodePattern.properties!.entries[0].key).toBe('name')
      expect(nodePattern.properties!.entries[1].key).toBe('age')
      expect((nodePattern.properties!.entries[1].value as IntegerLiteral).value).toBe(30)
    })
  })

  describe('relationship patterns', () => {
    it('should parse MATCH (a)-[:KNOWS]->(b) RETURN a, b', () => {
      const query = parse('MATCH (a)-[:KNOWS]->(b) RETURN a, b')

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.pattern.elements).toHaveLength(3)

      // First node
      const nodeA = matchClause.pattern.elements[0] as NodePattern
      expect(nodeA.variable).toBe('a')

      // Relationship
      const rel = matchClause.pattern.elements[1] as RelationshipPattern
      expect(rel.type).toBe('RelationshipPattern')
      expect(rel.types).toEqual(['KNOWS'])
      expect(rel.direction).toBe('RIGHT')

      // Second node
      const nodeB = matchClause.pattern.elements[2] as NodePattern
      expect(nodeB.variable).toBe('b')

      // Return clause should have 2 items
      const returnClause = query.clauses[1] as ReturnClause
      expect(returnClause.items).toHaveLength(2)
    })

    it('should parse left-directed relationship <-[:TYPE]-', () => {
      const query = parse('MATCH (a)<-[:KNOWS]-(b) RETURN a')

      const matchClause = query.clauses[0] as MatchClause
      const rel = matchClause.pattern.elements[1] as RelationshipPattern

      expect(rel.direction).toBe('LEFT')
      expect(rel.types).toEqual(['KNOWS'])
    })

    it('should parse undirected relationship -[:TYPE]-', () => {
      const query = parse('MATCH (a)-[:KNOWS]-(b) RETURN a')

      const matchClause = query.clauses[0] as MatchClause
      const rel = matchClause.pattern.elements[1] as RelationshipPattern

      expect(rel.direction).toBe('NONE')
      expect(rel.types).toEqual(['KNOWS'])
    })

    it('should parse relationship without type', () => {
      const query = parse('MATCH (a)-->(b) RETURN a')

      const matchClause = query.clauses[0] as MatchClause
      const rel = matchClause.pattern.elements[1] as RelationshipPattern

      expect(rel.direction).toBe('RIGHT')
      expect(rel.types).toHaveLength(0)
    })

    it('should parse relationship with variable', () => {
      const query = parse('MATCH (a)-[r:KNOWS]->(b) RETURN r')

      const matchClause = query.clauses[0] as MatchClause
      const rel = matchClause.pattern.elements[1] as RelationshipPattern

      expect(rel.variable).toBe('r')
      expect(rel.types).toEqual(['KNOWS'])
    })

    it('should parse relationship with properties', () => {
      const query = parse("MATCH (a)-[:KNOWS {since: 2020}]->(b) RETURN a")

      const matchClause = query.clauses[0] as MatchClause
      const rel = matchClause.pattern.elements[1] as RelationshipPattern

      expect(rel.properties).toBeDefined()
      expect(rel.properties!.entries).toHaveLength(1)
      expect(rel.properties!.entries[0].key).toBe('since')
    })

    it('should parse longer path patterns', () => {
      const query = parse('MATCH (a)-[:KNOWS]->(b)-[:LIVES_IN]->(c) RETURN a, c')

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.pattern.elements).toHaveLength(5)

      // a, rel1, b, rel2, c
      expect((matchClause.pattern.elements[0] as NodePattern).variable).toBe('a')
      expect((matchClause.pattern.elements[1] as RelationshipPattern).types).toEqual(['KNOWS'])
      expect((matchClause.pattern.elements[2] as NodePattern).variable).toBe('b')
      expect((matchClause.pattern.elements[3] as RelationshipPattern).types).toEqual(['LIVES_IN'])
      expect((matchClause.pattern.elements[4] as NodePattern).variable).toBe('c')
    })
  })

  describe('WHERE clause', () => {
    it("should parse MATCH (n) WHERE n.name = 'Alice' RETURN n", () => {
      const query = parse("MATCH (n) WHERE n.name = 'Alice' RETURN n")

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.where).toBeDefined()

      const whereExpr = matchClause.where as BinaryExpression
      expect(whereExpr.type).toBe('BinaryExpression')
      expect(whereExpr.operator).toBe('=')

      const left = whereExpr.left as PropertyAccess
      expect(left.type).toBe('PropertyAccess')
      expect((left.object as Variable).name).toBe('n')
      expect(left.property).toBe('name')

      const right = whereExpr.right as StringLiteral
      expect(right.type).toBe('StringLiteral')
      expect(right.value).toBe('Alice')
    })

    it('should parse WHERE with AND', () => {
      const query = parse("MATCH (n) WHERE n.name = 'Alice' AND n.age > 25 RETURN n")

      const matchClause = query.clauses[0] as MatchClause
      const whereExpr = matchClause.where as BinaryExpression

      expect(whereExpr.operator).toBe('AND')
      expect((whereExpr.left as BinaryExpression).operator).toBe('=')
      expect((whereExpr.right as BinaryExpression).operator).toBe('>')
    })

    it('should parse WHERE with OR', () => {
      const query = parse("MATCH (n) WHERE n.name = 'Alice' OR n.name = 'Bob' RETURN n")

      const matchClause = query.clauses[0] as MatchClause
      const whereExpr = matchClause.where as BinaryExpression

      expect(whereExpr.operator).toBe('OR')
    })

    it('should parse WHERE with NOT', () => {
      const query = parse("MATCH (n) WHERE NOT n.active RETURN n")

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.where!.type).toBe('UnaryExpression')
    })

    it('should parse WHERE with comparison operators', () => {
      const operators = [
        ['<', '<'],
        ['>', '>'],
        ['<=', '<='],
        ['>=', '>='],
        ['<>', '<>'],
      ]

      for (const [op, expectedOp] of operators) {
        const query = parse(`MATCH (n) WHERE n.age ${op} 30 RETURN n`)
        const matchClause = query.clauses[0] as MatchClause
        const whereExpr = matchClause.where as BinaryExpression
        expect(whereExpr.operator).toBe(expectedOp)
      }
    })

    it('should parse WHERE with IS NULL', () => {
      const query = parse('MATCH (n) WHERE n.email IS NULL RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.where!.type).toBe('UnaryExpression')
    })

    it('should parse WHERE with IS NOT NULL', () => {
      const query = parse('MATCH (n) WHERE n.email IS NOT NULL RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.where!.type).toBe('UnaryExpression')
    })
  })

  describe('RETURN clause', () => {
    it('should parse RETURN with multiple items', () => {
      const query = parse('MATCH (n) RETURN n.name, n.age')

      const returnClause = query.clauses[1] as ReturnClause
      expect(returnClause.items).toHaveLength(2)

      expect((returnClause.items[0].expression as PropertyAccess).property).toBe('name')
      expect((returnClause.items[1].expression as PropertyAccess).property).toBe('age')
    })

    it('should parse RETURN with alias', () => {
      const query = parse('MATCH (n) RETURN n.name AS personName')

      const returnClause = query.clauses[1] as ReturnClause
      expect(returnClause.items[0].alias).toBe('personName')
    })

    it('should parse RETURN with function call', () => {
      const query = parse('MATCH (n) RETURN count(n)')

      const returnClause = query.clauses[1] as ReturnClause
      const funcCall = returnClause.items[0].expression
      expect(funcCall.type).toBe('FunctionCall')
    })
  })

  describe('expressions', () => {
    it('should parse arithmetic expressions', () => {
      const query = parse('MATCH (n) RETURN n.a + n.b * 2')

      const returnClause = query.clauses[1] as ReturnClause
      const expr = returnClause.items[0].expression as BinaryExpression

      // Should be n.a + (n.b * 2) due to precedence
      expect(expr.operator).toBe('+')
      expect((expr.right as BinaryExpression).operator).toBe('*')
    })

    it('should parse list literals', () => {
      const query = parse('MATCH (n) WHERE n.id IN [1, 2, 3] RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      const whereExpr = matchClause.where as BinaryExpression

      expect(whereExpr.operator).toBe('IN')
      expect(whereExpr.right.type).toBe('ListExpression')
    })

    it('should parse boolean literals', () => {
      const query = parse('MATCH (n) WHERE n.active = true RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      const whereExpr = matchClause.where as BinaryExpression

      expect(whereExpr.right.type).toBe('BooleanLiteral')
    })

    it('should parse parameters', () => {
      const query = parse('MATCH (n) WHERE n.id = $id RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      const whereExpr = matchClause.where as BinaryExpression

      expect(whereExpr.right.type).toBe('Parameter')
    })

    it('should parse parenthesized expressions', () => {
      const query = parse('MATCH (n) WHERE (n.a + n.b) * 2 > 10 RETURN n')

      const matchClause = query.clauses[0] as MatchClause
      const whereExpr = matchClause.where as BinaryExpression

      expect(whereExpr.operator).toBe('>')
    })

    it('should parse nested property access', () => {
      const query = parse('MATCH (n) RETURN n.address.city')

      const returnClause = query.clauses[1] as ReturnClause
      const expr = returnClause.items[0].expression as PropertyAccess

      expect(expr.property).toBe('city')
      expect((expr.object as PropertyAccess).property).toBe('address')
    })
  })

  describe('OPTIONAL MATCH', () => {
    it('should parse OPTIONAL MATCH', () => {
      const query = parse('MATCH (n) OPTIONAL MATCH (n)-[:KNOWS]->(m) RETURN n, m')

      expect(query.clauses).toHaveLength(3)

      const match1 = query.clauses[0] as MatchClause
      expect(match1.optional).toBe(false)

      const match2 = query.clauses[1] as MatchClause
      expect(match2.optional).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should throw ParserError for invalid syntax', () => {
      expect(() => parse('MATCH')).toThrow(ParserError)
    })

    it('should throw ParserError for unclosed parenthesis', () => {
      expect(() => parse('MATCH (n RETURN n')).toThrow(ParserError)
    })

    it('should throw ParserError for missing RETURN item', () => {
      expect(() => parse('MATCH (n) RETURN')).toThrow(ParserError)
    })
  })

  describe('complex queries', () => {
    it('should parse a complex query', () => {
      const query = parse(`
        MATCH (p:Person {name: 'Alice'})-[:KNOWS]->(friend:Person)
        WHERE friend.age > 25 AND friend.city = 'NYC'
        RETURN friend.name, friend.age
      `)

      expect(query.clauses).toHaveLength(2)

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.pattern.elements).toHaveLength(3)
      expect(matchClause.where).toBeDefined()

      const returnClause = query.clauses[1] as ReturnClause
      expect(returnClause.items).toHaveLength(2)
    })
  })

  describe('SET clause', () => {
    describe('property assignment', () => {
      it('should parse SET n.name = value', () => {
        const query = parse("MATCH (n) SET n.name = 'Alice' RETURN n")

        expect(query.clauses).toHaveLength(3)
        const setClause = query.clauses[1] as SetClause
        expect(setClause.type).toBe('SetClause')
        expect(setClause.items).toHaveLength(1)

        const item = setClause.items[0] as PropertySetItem
        expect(item.type).toBe('PropertySetItem')
        expect(item.property.type).toBe('PropertyAccess')
        expect((item.property.object as Variable).name).toBe('n')
        expect(item.property.property).toBe('name')
        expect((item.expression as StringLiteral).value).toBe('Alice')
      })

      it('should parse SET with integer value', () => {
        const query = parse('MATCH (n) SET n.age = 30 RETURN n')

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as PropertySetItem
        expect((item.expression as IntegerLiteral).value).toBe(30)
      })

      it('should parse SET with parameter value', () => {
        const query = parse('MATCH (n) SET n.name = $name RETURN n')

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as PropertySetItem
        expect(item.expression.type).toBe('Parameter')
      })

      it('should parse SET with nested property access', () => {
        const query = parse("MATCH (n) SET n.address.city = 'NYC' RETURN n")

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as PropertySetItem
        expect(item.property.property).toBe('city')
        expect((item.property.object as PropertyAccess).property).toBe('address')
      })

      it('should parse SET with expression value', () => {
        const query = parse('MATCH (n) SET n.total = n.price * n.quantity RETURN n')

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as PropertySetItem
        expect(item.expression.type).toBe('BinaryExpression')
      })
    })

    describe('label assignment', () => {
      it('should parse SET n:Label', () => {
        const query = parse('MATCH (n) SET n:Admin RETURN n')

        expect(query.clauses).toHaveLength(3)
        const setClause = query.clauses[1] as SetClause
        expect(setClause.items).toHaveLength(1)

        const item = setClause.items[0] as LabelSetItem
        expect(item.type).toBe('LabelSetItem')
        expect(item.variable).toBe('n')
        expect(item.labels).toEqual(['Admin'])
      })

      it('should parse SET n:Label1:Label2 (multiple labels)', () => {
        const query = parse('MATCH (n) SET n:Admin:Superuser RETURN n')

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as LabelSetItem
        expect(item.labels).toEqual(['Admin', 'Superuser'])
      })
    })

    describe('replace properties', () => {
      it('should parse SET n = {props}', () => {
        const query = parse("MATCH (n) SET n = {name: 'Alice', age: 30} RETURN n")

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as ReplacePropertiesItem
        expect(item.type).toBe('ReplacePropertiesItem')
        expect(item.variable).toBe('n')
        expect(item.expression.type).toBe('MapLiteral')

        const mapLiteral = item.expression as MapLiteral
        expect(mapLiteral.entries).toHaveLength(2)
      })

      it('should parse SET n = $props (parameter)', () => {
        const query = parse('MATCH (n) SET n = $props RETURN n')

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as ReplacePropertiesItem
        expect(item.expression.type).toBe('Parameter')
      })
    })

    describe('merge properties', () => {
      it('should parse SET n += {props}', () => {
        const query = parse("MATCH (n) SET n += {age: 31} RETURN n")

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as MergePropertiesItem
        expect(item.type).toBe('MergePropertiesItem')
        expect(item.variable).toBe('n')
        expect(item.expression.type).toBe('MapLiteral')
      })

      it('should parse SET n += $props (parameter)', () => {
        const query = parse('MATCH (n) SET n += $updates RETURN n')

        const setClause = query.clauses[1] as SetClause
        const item = setClause.items[0] as MergePropertiesItem
        expect(item.expression.type).toBe('Parameter')
      })
    })

    describe('multiple SET items', () => {
      it('should parse SET with multiple property assignments', () => {
        const query = parse("MATCH (n) SET n.name = 'Alice', n.age = 30 RETURN n")

        const setClause = query.clauses[1] as SetClause
        expect(setClause.items).toHaveLength(2)

        expect(setClause.items[0].type).toBe('PropertySetItem')
        expect(setClause.items[1].type).toBe('PropertySetItem')
      })

      it('should parse SET with mixed item types', () => {
        const query = parse("MATCH (n) SET n.name = 'Alice', n:Admin, n += {active: true} RETURN n")

        const setClause = query.clauses[1] as SetClause
        expect(setClause.items).toHaveLength(3)

        expect(setClause.items[0].type).toBe('PropertySetItem')
        expect(setClause.items[1].type).toBe('LabelSetItem')
        expect(setClause.items[2].type).toBe('MergePropertiesItem')
      })
    })

    describe('error handling', () => {
      it('should throw error for SET without variable', () => {
        expect(() => parse('MATCH (n) SET RETURN n')).toThrow(ParserError)
      })

      it('should throw error for SET property without =', () => {
        expect(() => parse('MATCH (n) SET n.name RETURN n')).toThrow(ParserError)
      })
    })
  })

  describe('REMOVE clause', () => {
    describe('property removal', () => {
      it('should parse REMOVE n.property', () => {
        const query = parse('MATCH (n) REMOVE n.temp RETURN n')

        expect(query.clauses).toHaveLength(3)
        const removeClause = query.clauses[1] as RemoveClause
        expect(removeClause.type).toBe('RemoveClause')
        expect(removeClause.items).toHaveLength(1)

        const item = removeClause.items[0] as PropertyRemoveItem
        expect(item.type).toBe('PropertyRemoveItem')
        expect(item.property.type).toBe('PropertyAccess')
        expect((item.property.object as Variable).name).toBe('n')
        expect(item.property.property).toBe('temp')
      })

      it('should parse REMOVE with nested property', () => {
        const query = parse('MATCH (n) REMOVE n.address.temp RETURN n')

        const removeClause = query.clauses[1] as RemoveClause
        const item = removeClause.items[0] as PropertyRemoveItem
        expect(item.property.property).toBe('temp')
        expect((item.property.object as PropertyAccess).property).toBe('address')
      })
    })

    describe('label removal', () => {
      it('should parse REMOVE n:Label', () => {
        const query = parse('MATCH (n) REMOVE n:Admin RETURN n')

        expect(query.clauses).toHaveLength(3)
        const removeClause = query.clauses[1] as RemoveClause
        expect(removeClause.items).toHaveLength(1)

        const item = removeClause.items[0] as LabelRemoveItem
        expect(item.type).toBe('LabelRemoveItem')
        expect(item.variable).toBe('n')
        expect(item.labels).toEqual(['Admin'])
      })

      it('should parse REMOVE n:Label1:Label2 (multiple labels)', () => {
        const query = parse('MATCH (n) REMOVE n:Admin:Superuser RETURN n')

        const removeClause = query.clauses[1] as RemoveClause
        const item = removeClause.items[0] as LabelRemoveItem
        expect(item.labels).toEqual(['Admin', 'Superuser'])
      })
    })

    describe('multiple REMOVE items', () => {
      it('should parse REMOVE with multiple properties', () => {
        const query = parse('MATCH (n) REMOVE n.temp1, n.temp2 RETURN n')

        const removeClause = query.clauses[1] as RemoveClause
        expect(removeClause.items).toHaveLength(2)

        expect(removeClause.items[0].type).toBe('PropertyRemoveItem')
        expect(removeClause.items[1].type).toBe('PropertyRemoveItem')
      })

      it('should parse REMOVE with mixed item types', () => {
        const query = parse('MATCH (n) REMOVE n.temp, n:Admin RETURN n')

        const removeClause = query.clauses[1] as RemoveClause
        expect(removeClause.items).toHaveLength(2)

        expect(removeClause.items[0].type).toBe('PropertyRemoveItem')
        expect(removeClause.items[1].type).toBe('LabelRemoveItem')
      })
    })

    describe('error handling', () => {
      it('should throw error for REMOVE without variable', () => {
        expect(() => parse('MATCH (n) REMOVE RETURN n')).toThrow(ParserError)
      })

      it('should throw error for REMOVE variable without property or label', () => {
        expect(() => parse('MATCH (n) REMOVE n RETURN n')).toThrow(ParserError)
      })
    })
  })

  describe('SET and REMOVE in complex queries', () => {
    it('should parse MATCH with SET and RETURN', () => {
      const query = parse(`
        MATCH (p:Person {name: 'Alice'})
        SET p.visited = true, p:Active
        RETURN p
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('SetClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse MATCH with REMOVE and RETURN', () => {
      const query = parse(`
        MATCH (p:Person)
        REMOVE p.temp, p:Inactive
        RETURN p
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('RemoveClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse MATCH with both SET and REMOVE', () => {
      const query = parse(`
        MATCH (p:Person)
        SET p.active = true
        REMOVE p:Pending
        RETURN p
      `)

      expect(query.clauses).toHaveLength(4)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('SetClause')
      expect(query.clauses[2].type).toBe('RemoveClause')
      expect(query.clauses[3].type).toBe('ReturnClause')
    })
  })

  describe('CREATE clause', () => {
    it('should parse CREATE (n)', () => {
      const query = parse('CREATE (n)')

      expect(query.type).toBe('Query')
      expect(query.clauses).toHaveLength(1)

      const createClause = query.clauses[0]
      expect(createClause.type).toBe('CreateClause')
      expect((createClause as any).pattern.elements).toHaveLength(1)

      const nodePattern = (createClause as any).pattern.elements[0] as NodePattern
      expect(nodePattern.type).toBe('NodePattern')
      expect(nodePattern.variable).toBe('n')
    })

    it('should parse CREATE (n:Person)', () => {
      const query = parse('CREATE (n:Person)')

      const createClause = query.clauses[0] as any
      const nodePattern = createClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person'])
    })

    it('should parse CREATE (n:Person:Employee)', () => {
      const query = parse('CREATE (n:Person:Employee)')

      const createClause = query.clauses[0] as any
      const nodePattern = createClause.pattern.elements[0] as NodePattern

      expect(nodePattern.labels).toEqual(['Person', 'Employee'])
    })

    it('should parse CREATE (n {name: "Alice", age: 30})', () => {
      const query = parse("CREATE (n {name: 'Alice', age: 30})")

      const createClause = query.clauses[0] as any
      const nodePattern = createClause.pattern.elements[0] as NodePattern

      expect(nodePattern.properties).toBeDefined()
      expect(nodePattern.properties!.entries).toHaveLength(2)
      expect(nodePattern.properties!.entries[0].key).toBe('name')
      expect(nodePattern.properties!.entries[1].key).toBe('age')
    })

    it('should parse CREATE (n:Person {name: "Alice"})', () => {
      const query = parse("CREATE (n:Person {name: 'Alice'})")

      const createClause = query.clauses[0] as any
      const nodePattern = createClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person'])
      expect(nodePattern.properties!.entries).toHaveLength(1)
    })

    it('should parse CREATE (a)-[:KNOWS]->(b)', () => {
      const query = parse('CREATE (a)-[:KNOWS]->(b)')

      const createClause = query.clauses[0] as any
      expect(createClause.pattern.elements).toHaveLength(3)

      const nodeA = createClause.pattern.elements[0] as NodePattern
      expect(nodeA.variable).toBe('a')

      const rel = createClause.pattern.elements[1] as RelationshipPattern
      expect(rel.types).toEqual(['KNOWS'])
      expect(rel.direction).toBe('RIGHT')

      const nodeB = createClause.pattern.elements[2] as NodePattern
      expect(nodeB.variable).toBe('b')
    })

    it('should parse CREATE (a:Person)-[r:KNOWS {since: 2020}]->(b:Person)', () => {
      const query = parse('CREATE (a:Person)-[r:KNOWS {since: 2020}]->(b:Person)')

      const createClause = query.clauses[0] as any
      expect(createClause.pattern.elements).toHaveLength(3)

      const nodeA = createClause.pattern.elements[0] as NodePattern
      expect(nodeA.labels).toEqual(['Person'])

      const rel = createClause.pattern.elements[1] as RelationshipPattern
      expect(rel.variable).toBe('r')
      expect(rel.types).toEqual(['KNOWS'])
      expect(rel.properties!.entries).toHaveLength(1)
      expect(rel.properties!.entries[0].key).toBe('since')

      const nodeB = createClause.pattern.elements[2] as NodePattern
      expect(nodeB.labels).toEqual(['Person'])
    })

    it('should parse CREATE with RETURN', () => {
      const query = parse("CREATE (n:Person {name: 'Alice'}) RETURN n")

      expect(query.clauses).toHaveLength(2)
      expect(query.clauses[0].type).toBe('CreateClause')
      expect(query.clauses[1].type).toBe('ReturnClause')
    })

    it('should parse MATCH followed by CREATE', () => {
      const query = parse('MATCH (a:Person) CREATE (a)-[:KNOWS]->(b:Person) RETURN b')

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('CreateClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse CREATE with anonymous node', () => {
      const query = parse('CREATE (:Person {name: "Alice"})')

      const createClause = query.clauses[0] as any
      const nodePattern = createClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBeUndefined()
      expect(nodePattern.labels).toEqual(['Person'])
    })

    it('should parse CREATE with left-directed relationship', () => {
      const query = parse('CREATE (a)<-[:KNOWS]-(b)')

      const createClause = query.clauses[0] as any
      const rel = createClause.pattern.elements[1] as RelationshipPattern

      expect(rel.direction).toBe('LEFT')
    })

    it('should parse CREATE with undirected relationship', () => {
      const query = parse('CREATE (a)-[:KNOWS]-(b)')

      const createClause = query.clauses[0] as any
      const rel = createClause.pattern.elements[1] as RelationshipPattern

      expect(rel.direction).toBe('NONE')
    })
  })

  describe('MERGE clause', () => {
    it('should parse MERGE (n)', () => {
      const query = parse('MERGE (n)')

      expect(query.type).toBe('Query')
      expect(query.clauses).toHaveLength(1)

      const mergeClause = query.clauses[0]
      expect(mergeClause.type).toBe('MergeClause')
      expect((mergeClause as any).pattern.elements).toHaveLength(1)

      const nodePattern = (mergeClause as any).pattern.elements[0] as NodePattern
      expect(nodePattern.variable).toBe('n')
    })

    it('should parse MERGE (n:Person)', () => {
      const query = parse('MERGE (n:Person)')

      const mergeClause = query.clauses[0] as any
      const nodePattern = mergeClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person'])
    })

    it('should parse MERGE (n:Person {name: "Alice"})', () => {
      const query = parse("MERGE (n:Person {name: 'Alice'})")

      const mergeClause = query.clauses[0] as any
      const nodePattern = mergeClause.pattern.elements[0] as NodePattern

      expect(nodePattern.variable).toBe('n')
      expect(nodePattern.labels).toEqual(['Person'])
      expect(nodePattern.properties!.entries).toHaveLength(1)
      expect(nodePattern.properties!.entries[0].key).toBe('name')
    })

    it('should parse MERGE (a)-[:KNOWS]->(b)', () => {
      const query = parse('MERGE (a)-[:KNOWS]->(b)')

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.pattern.elements).toHaveLength(3)

      const rel = mergeClause.pattern.elements[1] as RelationshipPattern
      expect(rel.types).toEqual(['KNOWS'])
      expect(rel.direction).toBe('RIGHT')
    })

    it('should parse MERGE with ON CREATE SET', () => {
      const query = parse("MERGE (n:Person {name: 'Alice'}) ON CREATE SET n.created = true")

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.type).toBe('MergeClause')
      expect(mergeClause.onCreate).toBeDefined()
      expect(mergeClause.onCreate).toHaveLength(1)
      expect(mergeClause.onCreate[0].type).toBe('SetClause')
      expect(mergeClause.onCreate[0].items).toHaveLength(1)
      expect(mergeClause.onCreate[0].items[0].type).toBe('PropertySetItem')
    })

    it('should parse MERGE with ON MATCH SET', () => {
      const query = parse("MERGE (n:Person {name: 'Alice'}) ON MATCH SET n.accessed = true")

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.type).toBe('MergeClause')
      expect(mergeClause.onMatch).toBeDefined()
      expect(mergeClause.onMatch).toHaveLength(1)
      expect(mergeClause.onMatch[0].type).toBe('SetClause')
      expect(mergeClause.onMatch[0].items).toHaveLength(1)
      expect(mergeClause.onMatch[0].items[0].type).toBe('PropertySetItem')
    })

    it('should parse MERGE with both ON CREATE and ON MATCH', () => {
      const query = parse(`
        MERGE (n:Person {name: 'Alice'})
        ON CREATE SET n.created = timestamp()
        ON MATCH SET n.accessed = timestamp()
      `)

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.type).toBe('MergeClause')
      expect(mergeClause.onCreate).toBeDefined()
      expect(mergeClause.onCreate).toHaveLength(1)
      expect(mergeClause.onMatch).toBeDefined()
      expect(mergeClause.onMatch).toHaveLength(1)
    })

    it('should parse MERGE with multiple properties in ON CREATE SET', () => {
      const query = parse(`
        MERGE (n:Person {name: 'Alice'})
        ON CREATE SET n.created = true, n.counter = 1
      `)

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.onCreate).toBeDefined()
      expect(mergeClause.onCreate[0].items).toHaveLength(2)
    })

    it('should parse MERGE with RETURN', () => {
      const query = parse("MERGE (n:Person {name: 'Alice'}) RETURN n")

      expect(query.clauses).toHaveLength(2)
      expect(query.clauses[0].type).toBe('MergeClause')
      expect(query.clauses[1].type).toBe('ReturnClause')
    })

    it('should parse MATCH followed by MERGE', () => {
      const query = parse(`
        MATCH (a:Person {name: 'Alice'})
        MERGE (a)-[:KNOWS]->(b:Person {name: 'Bob'})
        RETURN a, b
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('MergeClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse MERGE relationship with ON CREATE SET', () => {
      const query = parse(`
        MERGE (a)-[r:KNOWS]->(b)
        ON CREATE SET r.since = 2020
      `)

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.pattern.elements).toHaveLength(3)
      expect(mergeClause.onCreate).toBeDefined()
      expect(mergeClause.onCreate[0].items[0].type).toBe('PropertySetItem')
    })

    it('should parse MERGE with ON MATCH SET before ON CREATE SET', () => {
      const query = parse(`
        MERGE (n:Person {name: 'Alice'})
        ON MATCH SET n.count = n.count + 1
        ON CREATE SET n.count = 1
      `)

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.onMatch).toBeDefined()
      expect(mergeClause.onMatch).toHaveLength(1)
      expect(mergeClause.onCreate).toBeDefined()
      expect(mergeClause.onCreate).toHaveLength(1)
    })

    it('should parse MERGE with label set in ON CREATE', () => {
      const query = parse(`
        MERGE (n:Person {name: 'Alice'})
        ON CREATE SET n:NewUser
      `)

      const mergeClause = query.clauses[0] as any
      expect(mergeClause.onCreate).toBeDefined()
      expect(mergeClause.onCreate[0].items[0].type).toBe('LabelSetItem')
    })
  })

  describe('CREATE and MERGE combined', () => {
    it('should parse CREATE followed by MERGE', () => {
      const query = parse(`
        CREATE (a:Person {name: 'Alice'})
        MERGE (b:Person {name: 'Bob'})
        RETURN a, b
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('CreateClause')
      expect(query.clauses[1].type).toBe('MergeClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse complex CREATE with relationships', () => {
      const query = parse(`
        CREATE (a:Person {name: 'Alice'})-[:KNOWS {since: 2020}]->(b:Person {name: 'Bob'})-[:WORKS_AT]->(c:Company {name: 'ACME'})
      `)

      const createClause = query.clauses[0] as any
      expect(createClause.pattern.elements).toHaveLength(5)

      // a -> KNOWS -> b -> WORKS_AT -> c
      expect((createClause.pattern.elements[0] as NodePattern).variable).toBe('a')
      expect((createClause.pattern.elements[1] as RelationshipPattern).types).toEqual(['KNOWS'])
      expect((createClause.pattern.elements[2] as NodePattern).variable).toBe('b')
      expect((createClause.pattern.elements[3] as RelationshipPattern).types).toEqual(['WORKS_AT'])
      expect((createClause.pattern.elements[4] as NodePattern).variable).toBe('c')
    })

    it('should parse CREATE with SET', () => {
      const query = parse(`
        CREATE (n:Person {name: 'Alice'})
        SET n.created = timestamp()
        RETURN n
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('CreateClause')
      expect(query.clauses[1].type).toBe('SetClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse MERGE with SET (outside ON CREATE/ON MATCH)', () => {
      const query = parse(`
        MERGE (n:Person {name: 'Alice'})
        SET n.updated = timestamp()
        RETURN n
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MergeClause')
      expect(query.clauses[1].type).toBe('SetClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse multiple MERGE clauses', () => {
      const query = parse(`
        MERGE (a:Person {name: 'Alice'})
        MERGE (b:Person {name: 'Bob'})
        MERGE (a)-[:KNOWS]->(b)
        RETURN a, b
      `)

      expect(query.clauses).toHaveLength(4)
      expect(query.clauses[0].type).toBe('MergeClause')
      expect(query.clauses[1].type).toBe('MergeClause')
      expect(query.clauses[2].type).toBe('MergeClause')
      expect(query.clauses[3].type).toBe('ReturnClause')
    })
  })

  describe('DELETE clause', () => {
    it('should parse DELETE with single variable', () => {
      const query = parse('MATCH (n) DELETE n')

      expect(query.clauses).toHaveLength(2)

      const deleteClause = query.clauses[1] as DeleteClause
      expect(deleteClause.type).toBe('DeleteClause')
      expect(deleteClause.detach).toBe(false)
      expect(deleteClause.expressions).toHaveLength(1)

      const expr = deleteClause.expressions[0] as Variable
      expect(expr.type).toBe('Variable')
      expect(expr.name).toBe('n')
    })

    it('should parse DELETE with multiple variables', () => {
      const query = parse('MATCH (n)-[r]->(m) DELETE n, r, m')

      expect(query.clauses).toHaveLength(2)

      const deleteClause = query.clauses[1] as DeleteClause
      expect(deleteClause.type).toBe('DeleteClause')
      expect(deleteClause.detach).toBe(false)
      expect(deleteClause.expressions).toHaveLength(3)

      expect((deleteClause.expressions[0] as Variable).name).toBe('n')
      expect((deleteClause.expressions[1] as Variable).name).toBe('r')
      expect((deleteClause.expressions[2] as Variable).name).toBe('m')
    })

    it('should parse DETACH DELETE with single variable', () => {
      const query = parse('MATCH (n) DETACH DELETE n')

      expect(query.clauses).toHaveLength(2)

      const deleteClause = query.clauses[1] as DeleteClause
      expect(deleteClause.type).toBe('DeleteClause')
      expect(deleteClause.detach).toBe(true)
      expect(deleteClause.expressions).toHaveLength(1)

      const expr = deleteClause.expressions[0] as Variable
      expect(expr.name).toBe('n')
    })

    it('should parse DETACH DELETE with multiple variables', () => {
      const query = parse('MATCH (a)-[r]->(b) DETACH DELETE a, b')

      expect(query.clauses).toHaveLength(2)

      const deleteClause = query.clauses[1] as DeleteClause
      expect(deleteClause.detach).toBe(true)
      expect(deleteClause.expressions).toHaveLength(2)

      expect((deleteClause.expressions[0] as Variable).name).toBe('a')
      expect((deleteClause.expressions[1] as Variable).name).toBe('b')
    })

    it('should parse query with DELETE followed by RETURN', () => {
      const query = parse('MATCH (n) DELETE n RETURN count(*)')

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('DeleteClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should parse complex query with DETACH DELETE', () => {
      const query = parse(`
        MATCH (n:Person {name: 'Alice'})
        DETACH DELETE n
      `)

      expect(query.clauses).toHaveLength(2)

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.pattern.elements).toHaveLength(1)

      const deleteClause = query.clauses[1] as DeleteClause
      expect(deleteClause.detach).toBe(true)
    })
  })

  describe('UNWIND clause', () => {
    it('should parse UNWIND with list literal', () => {
      const query = parse('UNWIND [1, 2, 3] AS x RETURN x')

      expect(query.clauses).toHaveLength(2)

      const unwindClause = query.clauses[0] as UnwindClause
      expect(unwindClause.type).toBe('UnwindClause')
      expect(unwindClause.alias).toBe('x')

      const listExpr = unwindClause.expression as ListExpression
      expect(listExpr.type).toBe('ListExpression')
      expect(listExpr.elements).toHaveLength(3)
    })

    it('should parse UNWIND with variable', () => {
      const query = parse('MATCH (n) UNWIND n.items AS item RETURN item')

      expect(query.clauses).toHaveLength(3)

      const unwindClause = query.clauses[1] as UnwindClause
      expect(unwindClause.type).toBe('UnwindClause')
      expect(unwindClause.alias).toBe('item')

      const propAccess = unwindClause.expression as PropertyAccess
      expect(propAccess.type).toBe('PropertyAccess')
      expect(propAccess.property).toBe('items')
    })

    it('should parse UNWIND with parameter', () => {
      const query = parse('UNWIND $names AS name RETURN name')

      expect(query.clauses).toHaveLength(2)

      const unwindClause = query.clauses[0] as UnwindClause
      expect(unwindClause.alias).toBe('name')
      expect(unwindClause.expression.type).toBe('Parameter')
    })

    it('should parse UNWIND with function call', () => {
      const query = parse('UNWIND range(1, 10) AS num RETURN num')

      expect(query.clauses).toHaveLength(2)

      const unwindClause = query.clauses[0] as UnwindClause
      expect(unwindClause.alias).toBe('num')
      expect(unwindClause.expression.type).toBe('FunctionCall')
    })

    it('should parse multiple UNWIND clauses', () => {
      const query = parse('UNWIND [1, 2] AS x UNWIND [3, 4] AS y RETURN x, y')

      expect(query.clauses).toHaveLength(3)

      const unwind1 = query.clauses[0] as UnwindClause
      expect(unwind1.alias).toBe('x')

      const unwind2 = query.clauses[1] as UnwindClause
      expect(unwind2.alias).toBe('y')
    })

    it('should parse UNWIND in complex query', () => {
      const query = parse(`
        MATCH (p:Person)
        UNWIND p.hobbies AS hobby
        RETURN p.name, hobby
      `)

      expect(query.clauses).toHaveLength(3)

      const matchClause = query.clauses[0] as MatchClause
      expect(matchClause.type).toBe('MatchClause')

      const unwindClause = query.clauses[1] as UnwindClause
      expect(unwindClause.type).toBe('UnwindClause')
      expect(unwindClause.alias).toBe('hobby')

      const returnClause = query.clauses[2] as ReturnClause
      expect(returnClause.items).toHaveLength(2)
    })

    it('should throw error for UNWIND without AS', () => {
      expect(() => parse('UNWIND [1, 2, 3] x RETURN x')).toThrow(ParserError)
    })

    it('should throw error for UNWIND without alias after AS', () => {
      expect(() => parse('UNWIND [1, 2, 3] AS')).toThrow(ParserError)
    })

    it('should parse UNWIND with nested list', () => {
      const query = parse('UNWIND [[1, 2], [3, 4]] AS pair RETURN pair')

      expect(query.clauses).toHaveLength(2)

      const unwindClause = query.clauses[0] as UnwindClause
      expect(unwindClause.alias).toBe('pair')

      const listExpr = unwindClause.expression as ListExpression
      expect(listExpr.elements).toHaveLength(2)
      expect(listExpr.elements[0].type).toBe('ListExpression')
    })
  })

  describe('DELETE and UNWIND combined', () => {
    it('should parse query with UNWIND and DELETE', () => {
      const query = parse(`
        UNWIND $nodeIds AS nodeId
        MATCH (n) WHERE n.id = nodeId
        DELETE n
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('UnwindClause')
      expect(query.clauses[1].type).toBe('MatchClause')
      expect(query.clauses[2].type).toBe('DeleteClause')
    })

    it('should parse query with UNWIND and DETACH DELETE', () => {
      const query = parse(`
        UNWIND [1, 2, 3] AS id
        MATCH (n) WHERE n.id = id
        DETACH DELETE n
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('UnwindClause')
      expect(query.clauses[1].type).toBe('MatchClause')
      const deleteClause = query.clauses[2] as DeleteClause
      expect(deleteClause.detach).toBe(true)
    })
  })

  describe('CALL clause', () => {
    it('should parse CALL with simple procedure name', () => {
      const query = parse('CALL db.labels()')

      expect(query.clauses).toHaveLength(1)
      const callClause = query.clauses[0] as CallClause
      expect(callClause.type).toBe('CallClause')
      expect(callClause.procedure).toEqual(['db', 'labels'])
      expect(callClause.arguments).toHaveLength(0)
    })

    it('should parse CALL with nested namespace', () => {
      const query = parse('CALL dbms.security.listUsers()')

      expect(query.clauses).toHaveLength(1)
      const callClause = query.clauses[0] as CallClause
      expect(callClause.procedure).toEqual(['dbms', 'security', 'listUsers'])
    })

    it('should parse CALL with arguments', () => {
      const query = parse('CALL db.index.fulltext.queryNodes("myIndex", "search term")')

      expect(query.clauses).toHaveLength(1)
      const callClause = query.clauses[0] as CallClause
      expect(callClause.procedure).toEqual(['db', 'index', 'fulltext', 'queryNodes'])
      expect(callClause.arguments).toHaveLength(2)
      expect((callClause.arguments[0] as StringLiteral).value).toBe('myIndex')
      expect((callClause.arguments[1] as StringLiteral).value).toBe('search term')
    })

    it('should parse CALL with YIELD', () => {
      const query = parse('CALL db.labels() YIELD label')

      expect(query.clauses).toHaveLength(1)
      const callClause = query.clauses[0] as CallClause
      expect(callClause.yield).toBeDefined()
      expect(callClause.yield).toHaveLength(1)
      expect(callClause.yield![0].name).toBe('label')
    })

    it('should parse CALL with multiple YIELD items', () => {
      const query = parse('CALL dbms.listConfig() YIELD name, value, description')

      const callClause = query.clauses[0] as CallClause
      expect(callClause.yield).toHaveLength(3)
      expect(callClause.yield![0].name).toBe('name')
      expect(callClause.yield![1].name).toBe('value')
      expect(callClause.yield![2].name).toBe('description')
    })

    it('should parse CALL with YIELD and alias', () => {
      const query = parse('CALL db.labels() YIELD label AS labelName')

      const callClause = query.clauses[0] as CallClause
      expect(callClause.yield).toHaveLength(1)
      expect(callClause.yield![0].name).toBe('label')
      expect(callClause.yield![0].alias).toBe('labelName')
    })

    it('should parse CALL with YIELD and WHERE', () => {
      const query = parse('CALL db.labels() YIELD label WHERE label = "Person"')

      const callClause = query.clauses[0] as CallClause
      expect(callClause.yield).toHaveLength(1)
      expect(callClause.where).toBeDefined()
      expect(callClause.where!.type).toBe('BinaryExpression')
    })

    it('should parse CALL followed by RETURN', () => {
      const query = parse('CALL db.labels() YIELD label RETURN label')

      expect(query.clauses).toHaveLength(2)
      expect(query.clauses[0].type).toBe('CallClause')
      expect(query.clauses[1].type).toBe('ReturnClause')
    })

    it('should parse CALL in complex query', () => {
      const query = parse(`
        MATCH (n:Person)
        CALL db.labels() YIELD label
        RETURN n.name, label
      `)

      expect(query.clauses).toHaveLength(3)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('CallClause')
      expect(query.clauses[2].type).toBe('ReturnClause')
    })

    it('should throw error for CALL subquery (not yet supported)', () => {
      expect(() => parse('CALL { MATCH (n) RETURN n }')).toThrow(ParserError)
    })
  })

  describe('UNION clause', () => {
    it('should parse UNION', () => {
      const query = parse('MATCH (n:Person) RETURN n.name UNION MATCH (n:Company) RETURN n.name')

      expect(query.clauses).toHaveLength(5)
      expect(query.clauses[0].type).toBe('MatchClause')
      expect(query.clauses[1].type).toBe('ReturnClause')

      const unionClause = query.clauses[2] as UnionClause
      expect(unionClause.type).toBe('UnionClause')
      expect(unionClause.all).toBe(false)

      expect(query.clauses[3].type).toBe('MatchClause')
      expect(query.clauses[4].type).toBe('ReturnClause')
    })

    it('should parse UNION ALL', () => {
      const query = parse('MATCH (n:Person) RETURN n UNION ALL MATCH (n:Company) RETURN n')

      const unionClause = query.clauses[2] as UnionClause
      expect(unionClause.type).toBe('UnionClause')
      expect(unionClause.all).toBe(true)
    })

    it('should parse multiple UNIONs', () => {
      const query = parse(`
        MATCH (a:A) RETURN a
        UNION
        MATCH (b:B) RETURN b
        UNION ALL
        MATCH (c:C) RETURN c
      `)

      expect(query.clauses).toHaveLength(8)

      const union1 = query.clauses[2] as UnionClause
      expect(union1.all).toBe(false)

      const union2 = query.clauses[5] as UnionClause
      expect(union2.all).toBe(true)
    })

    it('should parse UNION with complex queries', () => {
      const query = parse(`
        MATCH (p:Person) WHERE p.age > 30 RETURN p.name
        UNION
        MATCH (p:Person) WHERE p.salary > 100000 RETURN p.name
      `)

      expect(query.clauses).toHaveLength(5)

      const match1 = query.clauses[0] as MatchClause
      expect(match1.where).toBeDefined()

      expect(query.clauses[2].type).toBe('UnionClause')
    })
  })
})
