import { describe, it, expect } from 'vitest'
import { TokenType } from '../tokens'
import { Token } from '../token'
import { Lexer } from '../lexer'

describe('TokenType enum', () => {
  describe('Keywords', () => {
    it('should have all Cypher clause keywords', () => {
      expect(TokenType.MATCH).toBeDefined()
      expect(TokenType.OPTIONAL).toBeDefined()
      expect(TokenType.WHERE).toBeDefined()
      expect(TokenType.RETURN).toBeDefined()
      expect(TokenType.WITH).toBeDefined()
      expect(TokenType.UNWIND).toBeDefined()
      expect(TokenType.CREATE).toBeDefined()
      expect(TokenType.MERGE).toBeDefined()
      expect(TokenType.DELETE).toBeDefined()
      expect(TokenType.DETACH).toBeDefined()
      expect(TokenType.SET).toBeDefined()
      expect(TokenType.REMOVE).toBeDefined()
    })

    it('should have ordering keywords', () => {
      expect(TokenType.ORDER).toBeDefined()
      expect(TokenType.BY).toBeDefined()
      expect(TokenType.ASC).toBeDefined()
      expect(TokenType.DESC).toBeDefined()
      expect(TokenType.SKIP).toBeDefined()
      expect(TokenType.LIMIT).toBeDefined()
    })

    it('should have logical operator keywords', () => {
      expect(TokenType.AND).toBeDefined()
      expect(TokenType.OR).toBeDefined()
      expect(TokenType.NOT).toBeDefined()
      expect(TokenType.XOR).toBeDefined()
      expect(TokenType.IN).toBeDefined()
      expect(TokenType.IS).toBeDefined()
      expect(TokenType.NULL).toBeDefined()
    })

    it('should have literal keywords', () => {
      expect(TokenType.TRUE).toBeDefined()
      expect(TokenType.FALSE).toBeDefined()
    })

    it('should have CASE expression keywords', () => {
      expect(TokenType.CASE).toBeDefined()
      expect(TokenType.WHEN).toBeDefined()
      expect(TokenType.THEN).toBeDefined()
      expect(TokenType.ELSE).toBeDefined()
      expect(TokenType.END).toBeDefined()
    })
  })

  describe('Literal types', () => {
    it('should have numeric literal types', () => {
      expect(TokenType.INTEGER).toBeDefined()
      expect(TokenType.FLOAT).toBeDefined()
    })

    it('should have string and parameter types', () => {
      expect(TokenType.STRING).toBeDefined()
      expect(TokenType.PARAMETER).toBeDefined()
    })
  })

  describe('Identifiers', () => {
    it('should have IDENTIFIER type', () => {
      expect(TokenType.IDENTIFIER).toBeDefined()
    })
  })

  describe('Symbols and operators', () => {
    it('should have grouping symbols', () => {
      expect(TokenType.LPAREN).toBeDefined()
      expect(TokenType.RPAREN).toBeDefined()
      expect(TokenType.LBRACKET).toBeDefined()
      expect(TokenType.RBRACKET).toBeDefined()
      expect(TokenType.LBRACE).toBeDefined()
      expect(TokenType.RBRACE).toBeDefined()
    })

    it('should have punctuation symbols', () => {
      expect(TokenType.COLON).toBeDefined()
      expect(TokenType.COMMA).toBeDefined()
      expect(TokenType.DOT).toBeDefined()
      expect(TokenType.PIPE).toBeDefined()
    })

    it('should have relationship arrow symbols', () => {
      expect(TokenType.ARROW_LEFT).toBeDefined()
      expect(TokenType.ARROW_RIGHT).toBeDefined()
      expect(TokenType.DASH).toBeDefined()
    })

    it('should have comparison operators', () => {
      expect(TokenType.EQUALS).toBeDefined()
      expect(TokenType.NOT_EQUALS).toBeDefined()
      expect(TokenType.LT).toBeDefined()
      expect(TokenType.GT).toBeDefined()
      expect(TokenType.LTE).toBeDefined()
      expect(TokenType.GTE).toBeDefined()
    })

    it('should have arithmetic operators', () => {
      expect(TokenType.PLUS).toBeDefined()
      expect(TokenType.MINUS).toBeDefined()
      expect(TokenType.STAR).toBeDefined()
      expect(TokenType.SLASH).toBeDefined()
      expect(TokenType.PERCENT).toBeDefined()
      expect(TokenType.CARET).toBeDefined()
    })
  })

  describe('Special tokens', () => {
    it('should have EOF token', () => {
      expect(TokenType.EOF).toBeDefined()
    })

    it('should have whitespace tokens', () => {
      expect(TokenType.NEWLINE).toBeDefined()
      expect(TokenType.WHITESPACE).toBeDefined()
    })
  })
})

describe('Token class', () => {
  it('should store type, value, line, and column', () => {
    const token = new Token(TokenType.IDENTIFIER, 'myVar', 1, 5)
    
    expect(token.type).toBe(TokenType.IDENTIFIER)
    expect(token.value).toBe('myVar')
    expect(token.line).toBe(1)
    expect(token.column).toBe(5)
  })

  it('should handle keyword tokens', () => {
    const token = new Token(TokenType.MATCH, 'MATCH', 1, 1)
    
    expect(token.type).toBe(TokenType.MATCH)
    expect(token.value).toBe('MATCH')
  })

  it('should handle empty value', () => {
    const token = new Token(TokenType.EOF, '', 10, 1)
    
    expect(token.type).toBe(TokenType.EOF)
    expect(token.value).toBe('')
  })
})

describe('Lexer - Basic Tokenization', () => {
  describe('Empty and whitespace input', () => {
    it('should return only EOF for empty input', () => {
      const lexer = new Lexer('')
      const tokens = lexer.tokenize()
      
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.EOF)
    })

    it('should handle whitespace-only input', () => {
      const lexer = new Lexer('   \t\t   ')
      const tokens = lexer.tokenize()
      
      // Should return whitespace and EOF
      const nonWhitespace = tokens.filter(t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.EOF)
      expect(nonWhitespace).toHaveLength(0)
    })
  })

  describe('Simple query tokenization', () => {
    it('should tokenize MATCH (n) RETURN n', () => {
      const lexer = new Lexer('MATCH (n) RETURN n')
      const tokens = lexer.tokenize()
      
      // Filter out whitespace for easier testing
      const significant = tokens.filter(t => t.type !== TokenType.WHITESPACE)
      
      expect(significant[0].type).toBe(TokenType.MATCH)
      expect(significant[1].type).toBe(TokenType.LPAREN)
      expect(significant[2].type).toBe(TokenType.IDENTIFIER)
      expect(significant[2].value).toBe('n')
      expect(significant[3].type).toBe(TokenType.RPAREN)
      expect(significant[4].type).toBe(TokenType.RETURN)
      expect(significant[5].type).toBe(TokenType.IDENTIFIER)
      expect(significant[5].value).toBe('n')
      expect(significant[6].type).toBe(TokenType.EOF)
    })

    it('should handle case-insensitive keywords', () => {
      const lexer1 = new Lexer('match')
      const lexer2 = new Lexer('MATCH')
      const lexer3 = new Lexer('Match')
      
      const tokens1 = lexer1.tokenize().filter(t => t.type !== TokenType.WHITESPACE)
      const tokens2 = lexer2.tokenize().filter(t => t.type !== TokenType.WHITESPACE)
      const tokens3 = lexer3.tokenize().filter(t => t.type !== TokenType.WHITESPACE)
      
      expect(tokens1[0].type).toBe(TokenType.MATCH)
      expect(tokens2[0].type).toBe(TokenType.MATCH)
      expect(tokens3[0].type).toBe(TokenType.MATCH)
    })
  })

  describe('Position tracking', () => {
    it('should track line numbers correctly', () => {
      const lexer = new Lexer('MATCH\nRETURN')
      const tokens = lexer.tokenize()
      
      const matchToken = tokens.find(t => t.type === TokenType.MATCH)
      const returnToken = tokens.find(t => t.type === TokenType.RETURN)
      
      expect(matchToken?.line).toBe(1)
      expect(returnToken?.line).toBe(2)
    })

    it('should track column numbers correctly', () => {
      const lexer = new Lexer('MATCH (n)')
      const tokens = lexer.tokenize()
      
      const matchToken = tokens.find(t => t.type === TokenType.MATCH)
      const lparenToken = tokens.find(t => t.type === TokenType.LPAREN)
      
      expect(matchToken?.column).toBe(1)
      expect(lparenToken?.column).toBe(7)
    })
  })

  describe('Symbol tokenization', () => {
    it('should tokenize all grouping symbols', () => {
      const lexer = new Lexer('()[]{}')
      const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF)
      
      expect(tokens[0].type).toBe(TokenType.LPAREN)
      expect(tokens[1].type).toBe(TokenType.RPAREN)
      expect(tokens[2].type).toBe(TokenType.LBRACKET)
      expect(tokens[3].type).toBe(TokenType.RBRACKET)
      expect(tokens[4].type).toBe(TokenType.LBRACE)
      expect(tokens[5].type).toBe(TokenType.RBRACE)
    })

    it('should tokenize punctuation symbols', () => {
      const lexer = new Lexer(':,.|')
      const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF)
      
      expect(tokens[0].type).toBe(TokenType.COLON)
      expect(tokens[1].type).toBe(TokenType.COMMA)
      expect(tokens[2].type).toBe(TokenType.DOT)
      expect(tokens[3].type).toBe(TokenType.PIPE)
    })

    it('should tokenize comparison operators', () => {
      const lexer = new Lexer('= <> < > <= >=')
      const tokens = lexer.tokenize().filter(t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.EOF)
      
      expect(tokens[0].type).toBe(TokenType.EQUALS)
      expect(tokens[1].type).toBe(TokenType.NOT_EQUALS)
      expect(tokens[2].type).toBe(TokenType.LT)
      expect(tokens[3].type).toBe(TokenType.GT)
      expect(tokens[4].type).toBe(TokenType.LTE)
      expect(tokens[5].type).toBe(TokenType.GTE)
    })

    it('should tokenize arithmetic operators', () => {
      const lexer = new Lexer('+ - * / % ^')
      const tokens = lexer.tokenize().filter(t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.EOF)

      expect(tokens[0].type).toBe(TokenType.PLUS)
      // Lexer uses DASH for all '-' characters, parser determines arithmetic context
      expect(tokens[1].type).toBe(TokenType.DASH)
      expect(tokens[2].type).toBe(TokenType.STAR)
      expect(tokens[3].type).toBe(TokenType.SLASH)
      expect(tokens[4].type).toBe(TokenType.PERCENT)
      expect(tokens[5].type).toBe(TokenType.CARET)
    })

    it('should tokenize relationship arrows', () => {
      const lexer = new Lexer('--><--')
      const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF)
      
      expect(tokens[0].type).toBe(TokenType.DASH)
      expect(tokens[1].type).toBe(TokenType.ARROW_RIGHT)
      expect(tokens[2].type).toBe(TokenType.ARROW_LEFT)
      expect(tokens[3].type).toBe(TokenType.DASH)
    })
  })
})
