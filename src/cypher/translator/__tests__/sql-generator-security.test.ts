/**
 * Security Tests for SQL Generator - SQL Injection in LIKE Clauses
 *
 * These tests demonstrate security vulnerabilities where label names are
 * directly interpolated into LIKE clauses without proper escaping.
 *
 * Target locations in sql-generator.ts:
 * - Line 206: `json_extract(${alias}.labels, '$') LIKE '%"${label}"%'`
 * - Line 315: `json_extract(${actualNextAlias}.labels, '$') LIKE '%"${label}"%'`
 * - Line 525: Variable-length path start label condition
 * - Line 528: Variable-length path end label condition
 * - Line 635: MERGE clause label condition
 *
 * Expected: Tests should FAIL, proving labels are not properly escaped.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SQLGenerator } from '../sql-generator'
import type {
  Query,
  MatchClause,
  ReturnClause,
  MergeClause,
  Pattern,
  NodePattern,
  RelationshipPattern,
  Variable,
  MapLiteral,
  StringLiteral,
  IntegerLiteral,
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

function createStringLiteral(value: string): StringLiteral {
  return { type: 'StringLiteral', value }
}

function createIntegerLiteral(value: number): IntegerLiteral {
  return { type: 'IntegerLiteral', value }
}

function createMapLiteral(entries: { key: string; value: any }[]): MapLiteral {
  return { type: 'MapLiteral', entries }
}

describe('SQLGenerator Security - LIKE Clause Injection', () => {
  let generator: SQLGenerator

  beforeEach(() => {
    generator = new SQLGenerator()
  })

  describe('Labels with double quotes break LIKE clauses', () => {
    it('should parameterize labels containing double quotes in single node pattern', () => {
      // Label with embedded double quote that could break the LIKE pattern
      // Current code produces: LIKE '%"Person"with"quote"%'
      // which is malformed SQL
      const maliciousLabel = 'Person"with"quote'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [maliciousLabel]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Labels should be parameterized, NOT directly in SQL string
      expect(result.sql).not.toContain(maliciousLabel)
      expect(result.params).toContain(maliciousLabel)
      // Should use parameterized LIKE or json_each for exact matching (more secure)
      const usesParameterizedLike = /LIKE\s+\?/i.test(result.sql)
      const usesJsonEach = /json_each\([^)]+\).*=\s*\?/i.test(result.sql)
      expect(usesParameterizedLike || usesJsonEach).toBe(true)
    })

    it('should parameterize labels with double quotes in relationship target node', () => {
      // Label on target node of relationship pattern (line 315)
      const maliciousLabel = 'Company"DROP TABLE nodes--'
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['WORKS_AT'], 'RIGHT'),
            createNodePattern('b', [maliciousLabel])
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Malicious label should NOT be in SQL string
      expect(result.sql).not.toContain(maliciousLabel)
      expect(result.sql).not.toContain('DROP TABLE')
      // Should be parameterized
      expect(result.params).toContain(maliciousLabel)
    })

    it('should parameterize labels with double quotes in variable-length path start node', () => {
      // Line 525: startNode.labels in variable-length path
      const maliciousLabel = 'Start"Node'
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a', [maliciousLabel]),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT', { minHops: 1, maxHops: 3 }),
            createNodePattern('b')
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Should not have raw malicious label in SQL
      expect(result.sql).not.toContain(maliciousLabel)
      expect(result.params).toContain(maliciousLabel)
    })

    it('should parameterize labels with double quotes in variable-length path end node', () => {
      // Line 528: endNode.labels in variable-length path
      const maliciousLabel = 'End"Node'
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT', { minHops: 1, maxHops: 3 }),
            createNodePattern('b', [maliciousLabel])
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Should not have raw malicious label in SQL
      expect(result.sql).not.toContain(maliciousLabel)
      expect(result.params).toContain(maliciousLabel)
    })

    it('should parameterize labels with double quotes in MERGE clause', () => {
      // Line 635: MERGE clause label condition
      const maliciousLabel = 'Person"MERGE'
      const ast = createQuery({
        type: 'MergeClause',
        pattern: createPattern(
          createNodePattern('n', [maliciousLabel], createMapLiteral([{ key: 'name', value: createStringLiteral('Alice') }]))
        ),
      } as MergeClause)

      const result = generator.generate(ast)

      // Label should not be directly in SQL
      expect(result.sql).not.toContain(maliciousLabel)
      expect(result.params).toContain(maliciousLabel)
    })
  })

  describe('Labels with SQL wildcards cause unintended matches', () => {
    it('should escape percent sign in label for single node pattern', () => {
      // % is a SQL wildcard that matches any sequence
      // Label "100%" should match exactly, not any label starting with "100"
      const labelWithWildcard = '100%'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithWildcard]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // The % should be escaped or the value should be parameterized
      // Either: LIKE '%"100\%"%' ESCAPE '\' or parameterized
      const hasEscapedPercent = result.sql.includes('100\\%') || result.sql.includes("ESCAPE")
      const isParameterized = !result.sql.includes(labelWithWildcard) && result.params.includes(labelWithWildcard)

      expect(hasEscapedPercent || isParameterized).toBe(true)
    })

    it('should escape underscore in label for single node pattern', () => {
      // _ is a SQL wildcard that matches any single character
      // Label "user_admin" should match exactly, not "userXadmin"
      const labelWithUnderscore = 'user_admin'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithUnderscore]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // The _ should be escaped or parameterized
      const hasEscapedUnderscore = result.sql.includes('user\\_admin') || result.sql.includes("ESCAPE")
      const isParameterized = !result.sql.includes(`"${labelWithUnderscore}"`) && result.params.includes(labelWithUnderscore)

      expect(hasEscapedUnderscore || isParameterized).toBe(true)
    })

    it('should escape wildcards in relationship target node labels', () => {
      // Test line 315: labels on target node of relationship
      const labelWithWildcards = 'Admin%_Role'
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['HAS_ROLE'], 'RIGHT'),
            createNodePattern('b', [labelWithWildcards])
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Wildcards should be escaped or parameterized
      const isProperlyHandled =
        result.sql.includes('\\%') ||
        result.sql.includes('\\_') ||
        result.sql.includes("ESCAPE") ||
        (!result.sql.includes(labelWithWildcards) && result.params.includes(labelWithWildcards))

      expect(isProperlyHandled).toBe(true)
    })

    it('should escape wildcards in variable-length path labels', () => {
      // Test lines 525, 528
      const startLabel = 'Start%'
      const endLabel = 'End_'
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a', [startLabel]),
            createRelPattern(undefined, ['KNOWS'], 'RIGHT', { minHops: 1, maxHops: 2 }),
            createNodePattern('b', [endLabel])
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Both wildcards should be handled
      const startHandled =
        result.sql.includes('Start\\%') ||
        (!result.sql.includes(startLabel) && result.params.includes(startLabel))
      const endHandled =
        result.sql.includes('End\\_') ||
        (!result.sql.includes(endLabel) && result.params.includes(endLabel))

      expect(startHandled).toBe(true)
      expect(endHandled).toBe(true)
    })

    it('should escape wildcards in MERGE clause labels', () => {
      // Test line 635
      const labelWithWildcard = 'User%Type'
      const ast = createQuery({
        type: 'MergeClause',
        pattern: createPattern(
          createNodePattern('n', [labelWithWildcard], createMapLiteral([{ key: 'id', value: createIntegerLiteral(1) }]))
        ),
      } as MergeClause)

      const result = generator.generate(ast)

      // Wildcard should be escaped or parameterized
      const isHandled =
        result.sql.includes('\\%') ||
        result.sql.includes("ESCAPE") ||
        (!result.sql.includes(labelWithWildcard) && result.params.includes(labelWithWildcard))

      expect(isHandled).toBe(true)
    })
  })

  describe('Labels with escape sequences', () => {
    it('should handle backslash in labels without breaking LIKE pattern', () => {
      // Backslash is the escape character in LIKE - needs proper handling
      const labelWithBackslash = 'Path\\To\\Node'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithBackslash]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Backslashes should be escaped or value should be parameterized
      const isProperlyHandled =
        result.sql.includes('Path\\\\To\\\\Node') ||
        result.sql.includes("ESCAPE") ||
        (!result.sql.includes(labelWithBackslash) && result.params.includes(labelWithBackslash))

      expect(isProperlyHandled).toBe(true)
    })

    it('should handle single quotes in labels', () => {
      // Single quote could break SQL string literals
      const labelWithQuote = "Person's"
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithQuote]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should be escaped (doubled) or parameterized
      const isProperlyHandled =
        result.sql.includes("Person''s") ||
        (!result.sql.includes(labelWithQuote) && result.params.includes(labelWithQuote))

      expect(isProperlyHandled).toBe(true)
    })

    it('should handle newline characters in labels', () => {
      // Newline could break SQL structure
      const labelWithNewline = 'Label\nWith\nNewlines'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithNewline]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Newlines should not appear raw in the SQL (should be escaped or parameterized)
      const hasRawNewline = result.sql.includes('\n') && result.sql.includes('Label')
      const isParameterized = result.params.includes(labelWithNewline)

      // Either no raw newline in SQL, or it's properly parameterized
      expect(!hasRawNewline || isParameterized).toBe(true)
      expect(result.params).toContain(labelWithNewline)
    })

    it('should handle tab characters in labels', () => {
      const labelWithTab = 'Label\tWith\tTabs'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithTab]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should be parameterized
      expect(result.params).toContain(labelWithTab)
      expect(result.sql).not.toContain(labelWithTab)
    })

    it('should handle null byte in labels', () => {
      // Null bytes could cause truncation or other issues
      const labelWithNull = 'Label\0Null'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [labelWithNull]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should be parameterized, null byte should not be in SQL
      expect(result.params).toContain(labelWithNull)
      expect(result.sql).not.toContain('\0')
    })
  })

  describe('Labels with JSON injection patterns', () => {
    it('should handle label that tries to break out of JSON array check', () => {
      // Trying to break the '%"label"%' pattern
      const jsonBreakLabel = '"]}'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [jsonBreakLabel]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should be parameterized, not in raw SQL
      expect(result.params).toContain(jsonBreakLabel)
      expect(result.sql).not.toContain('"]}')
    })

    it('should handle label with JSON-like content', () => {
      // Label that looks like JSON structure
      const jsonLabel = '{"type":"malicious"}'
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [jsonLabel]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should be parameterized
      expect(result.params).toContain(jsonLabel)
      // Raw JSON should not be in SQL string (or should be escaped)
      expect(result.sql).not.toContain(jsonLabel)
    })

    it('should handle label attempting to close LIKE and start new condition', () => {
      // Attempting: LIKE '%"X"% OR 1=1 --"%'
      const injectionLabel = "X\"% OR 1=1 --"
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [injectionLabel]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should not allow SQL injection
      expect(result.sql).not.toContain('OR 1=1')
      expect(result.sql).not.toContain('--')
      expect(result.params).toContain(injectionLabel)
    })

    it('should handle label with Unicode escape sequences', () => {
      // Unicode that might be interpreted differently
      const unicodeLabel = 'Label\u0022Injection'  // \u0022 is a double quote
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', [unicodeLabel]))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // Should be parameterized
      expect(result.params).toContain(unicodeLabel)
      expect(result.sql).not.toContain(unicodeLabel)
    })

    it('should handle complex injection attempt in relationship target label', () => {
      // Complex injection targeting line 315
      const complexInjection = '"],"malicious":true}%'
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a'),
            createRelPattern(undefined, ['REL'], 'RIGHT'),
            createNodePattern('b', [complexInjection])
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Should be parameterized, no raw injection in SQL
      expect(result.sql).not.toContain('malicious')
      expect(result.params).toContain(complexInjection)
    })

    it('should handle injection attempt in MERGE labels', () => {
      // Testing line 635
      const mergeInjection = 'Node"%, 1=1) OR ("'
      const ast = createQuery({
        type: 'MergeClause',
        pattern: createPattern(
          createNodePattern('n', [mergeInjection], createMapLiteral([{ key: 'id', value: createIntegerLiteral(1) }]))
        ),
      } as MergeClause)

      const result = generator.generate(ast)

      // Should not allow the injection
      expect(result.sql).not.toContain('1=1')
      expect(result.sql).not.toContain(mergeInjection)
      expect(result.params).toContain(mergeInjection)
    })
  })

  describe('Combined vulnerability scenarios', () => {
    it('should handle multiple malicious labels on same node', () => {
      const labels = ['Normal', 'Bad"Quote', 'Wild%Card', 'Escape\\Char']
      const ast = createQuery(
        createMatchClause(createPattern(createNodePattern('n', labels))),
        createReturnClause([createReturnItem(createVariable('n'))])
      )

      const result = generator.generate(ast)

      // All malicious labels should be parameterized
      expect(result.params).toContain('Bad"Quote')
      expect(result.params).toContain('Wild%Card')
      expect(result.params).toContain('Escape\\Char')
      // Raw values should not be in SQL
      expect(result.sql).not.toContain('Bad"Quote')
      expect(result.sql).not.toContain('Wild%Card')
    })

    it('should handle malicious labels across entire pattern', () => {
      // Malicious labels on start node, end node
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a', ['Start"Inject']),
            createRelPattern(undefined, ['REL'], 'RIGHT'),
            createNodePattern('b', ['End%Inject'])
          )
        ),
        createReturnClause([createReturnItem(createVariable('a')), createReturnItem(createVariable('b'))])
      )

      const result = generator.generate(ast)

      // Neither malicious label should be in raw SQL
      expect(result.sql).not.toContain('Start"Inject')
      expect(result.sql).not.toContain('End%Inject')
      // Both should be in params
      expect(result.params).toContain('Start"Inject')
      expect(result.params).toContain('End%Inject')
    })

    it('should handle malicious labels in chained relationships', () => {
      // Testing multiple nodes with relationships
      const ast = createQuery(
        createMatchClause(
          createPattern(
            createNodePattern('a', ['First"Label']),
            createRelPattern(undefined, ['REL1'], 'RIGHT'),
            createNodePattern('b', ['Second%Label']),
            createRelPattern(undefined, ['REL2'], 'RIGHT'),
            createNodePattern('c', ['Third_Label'])
          )
        ),
        createReturnClause([
          createReturnItem(createVariable('a')),
          createReturnItem(createVariable('b')),
          createReturnItem(createVariable('c'))
        ])
      )

      const result = generator.generate(ast)

      // All labels should be parameterized
      expect(result.params).toContain('First"Label')
      expect(result.params).toContain('Second%Label')
      expect(result.params).toContain('Third_Label')
    })
  })
})
