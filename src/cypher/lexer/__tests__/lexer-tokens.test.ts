import { describe, it, expect } from 'vitest'
import { tokenize, KEYWORDS } from '../index'

describe('Lexer Token Types', () => {
  describe('Token Type Definitions', () => {
    it('should recognize implemented Cypher keywords', () => {
      // Keywords currently implemented
      const implementedKeywords = [
        'MATCH', 'OPTIONAL', 'CREATE', 'MERGE', 'DELETE', 'DETACH',
        'SET', 'REMOVE', 'RETURN', 'WITH', 'UNWIND', 'WHERE',
        'ORDER', 'BY', 'SKIP', 'LIMIT', 'ASC', 'DESC',
        'AND', 'OR', 'NOT', 'XOR', 'NULL', 'TRUE', 'FALSE', 'IN',
        'IS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
      ]

      // KEYWORDS is a Map, check with .has()
      for (const keyword of implementedKeywords) {
        expect(KEYWORDS.has(keyword)).toBe(true)
      }
    })

    it('should tokenize identifier tokens', () => {
      const tokens = tokenize('myVariable')
      expect(tokens).toHaveLength(2) // identifier + EOF
      expect(tokens[0].type).toBe('IDENTIFIER')
      expect(tokens[0].value).toBe('myVariable')
    })

    it.todo('should tokenize backtick-quoted identifiers')

    it('should tokenize operator tokens', () => {
      // Map operators to their expected token types
      const operatorMap: Record<string, string> = {
        '+': 'PLUS',
        '-': 'DASH', // Lexer uses DASH for all '-'
        '*': 'STAR',
        '/': 'SLASH',
        '%': 'PERCENT',
        '^': 'CARET',
        '=': 'EQUALS',
        '<>': 'NOT_EQUALS',
        '<': 'LT',
        '>': 'GT',
        '<=': 'LTE',
        '>=': 'GTE',
      }
      for (const [op, expectedType] of Object.entries(operatorMap)) {
        const tokens = tokenize(op)
        expect(tokens[0].type).toBe(expectedType)
        expect(tokens[0].value).toBe(op)
      }
    })

    it('should tokenize punctuation tokens', () => {
      // Map punctuation to their expected token types
      const punctuationMap: Record<string, string> = {
        '(': 'LPAREN',
        ')': 'RPAREN',
        '[': 'LBRACKET',
        ']': 'RBRACKET',
        '{': 'LBRACE',
        '}': 'RBRACE',
        ':': 'COLON',
        '.': 'DOT',
        ',': 'COMMA',
        '|': 'PIPE',
      }
      for (const [punc, expectedType] of Object.entries(punctuationMap)) {
        const tokens = tokenize(punc)
        expect(tokens[0].type).toBe(expectedType)
        expect(tokens[0].value).toBe(punc)
      }
    })

    it('should tokenize parameter tokens', () => {
      const tokens = tokenize('$param')
      expect(tokens[0].type).toBe('PARAMETER')
      expect(tokens[0].value).toBe('param')
    })

    it('should tokenize parameter with curly braces', () => {
      const tokens = tokenize('${myParam}')
      expect(tokens[0].type).toBe('PARAMETER')
      expect(tokens[0].value).toBe('myParam')
    })
  })

  describe('Basic Tokenization', () => {
    it('should tokenize simple query: MATCH (n) RETURN n', () => {
      const tokens = tokenize('MATCH (n) RETURN n')

      // Filter out whitespace tokens
      const significant = tokens.filter(t => t.type !== 'WHITESPACE')

      expect(significant).toHaveLength(7) // MATCH, (, n, ), RETURN, n, EOF
      expect(significant[0]).toMatchObject({ type: 'MATCH', value: 'MATCH' })
      expect(significant[1]).toMatchObject({ type: 'LPAREN', value: '(' })
      expect(significant[2]).toMatchObject({ type: 'IDENTIFIER', value: 'n' })
      expect(significant[3]).toMatchObject({ type: 'RPAREN', value: ')' })
      expect(significant[4]).toMatchObject({ type: 'RETURN', value: 'RETURN' })
      expect(significant[5]).toMatchObject({ type: 'IDENTIFIER', value: 'n' })
      expect(significant[6]).toMatchObject({ type: 'EOF' })
    })

    it('should handle whitespace correctly', () => {
      const tokens = tokenize('MATCH   (n)')
      const whitespaceTokens = tokens.filter(t => t.type === 'WHITESPACE')
      expect(whitespaceTokens.length).toBeGreaterThan(0)
    })

    it('should track token position (line, column)', () => {
      const tokens = tokenize('MATCH\n(n)')

      const match = tokens.find(t => t.value === 'MATCH')!
      expect(match.line).toBe(1)
      expect(match.column).toBe(1)

      const paren = tokens.find(t => t.value === '(')!
      expect(paren.line).toBe(2)
      expect(paren.column).toBe(1)
    })

    it('should track token span (start, end offsets)', () => {
      const tokens = tokenize('MATCH (n)')

      const match = tokens.find(t => t.value === 'MATCH')!
      expect(match.start).toBe(0)
      expect(match.end).toBe(5)

      const n = tokens.find(t => t.value === 'n')!
      expect(n.start).toBe(7)
      expect(n.end).toBe(8)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const tokens = tokenize('')
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe('EOF')
    })

    it('should handle single token', () => {
      const tokens = tokenize('MATCH')
      expect(tokens).toHaveLength(2) // MATCH + EOF
      expect(tokens[0]).toMatchObject({ type: 'MATCH', value: 'MATCH' })
    })

    it('should handle whitespace-only input', () => {
      const tokens = tokenize('   \n\t  ')
      const significant = tokens.filter(t => t.type !== 'WHITESPACE' && t.type !== 'NEWLINE')
      expect(significant).toHaveLength(1) // Just EOF
      expect(significant[0].type).toBe('EOF')
    })
  })
})

describe('Token Interface', () => {
  it('should have correct token structure', () => {
    const tokens = tokenize('MATCH')
    const token = tokens[0]

    // Verify all required properties exist
    expect(token).toHaveProperty('type')
    expect(token).toHaveProperty('value')
    expect(token).toHaveProperty('line')
    expect(token).toHaveProperty('column')
    expect(token).toHaveProperty('start')
    expect(token).toHaveProperty('end')

    // Verify types
    expect(typeof token.type).toBe('string')
    expect(typeof token.value).toBe('string')
    expect(typeof token.line).toBe('number')
    expect(typeof token.column).toBe('number')
    expect(typeof token.start).toBe('number')
    expect(typeof token.end).toBe('number')
  })
})
