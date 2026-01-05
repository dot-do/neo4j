import { describe, it, expect } from 'vitest'
import { tokenize, TokenType, LexerError } from '../index'

describe('Lexer - String Literal Tokenization', () => {
  /**
   * Helper to get only significant tokens (no whitespace)
   */
  const getSignificantTokens = (input: string) => {
    return tokenize(input).filter(t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.EOF)
  }

  describe('Single-quoted strings', () => {
    it('should tokenize a simple single-quoted string', () => {
      const tokens = getSignificantTokens("'hello'")

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello')
    })

    it('should tokenize single-quoted string with spaces', () => {
      const tokens = getSignificantTokens("'hello world'")

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello world')
    })

    it('should tokenize single-quoted string with numbers', () => {
      const tokens = getSignificantTokens("'test123'")

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('test123')
    })

    it('should tokenize single-quoted string with special characters', () => {
      const tokens = getSignificantTokens("'hello!@#$%^&*()'")

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello!@#$%^&*()')
    })

    it('should tokenize multiple single-quoted strings', () => {
      const tokens = getSignificantTokens("'first' 'second'")

      expect(tokens).toHaveLength(2)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('first')
      expect(tokens[1].type).toBe(TokenType.STRING)
      expect(tokens[1].value).toBe('second')
    })
  })

  describe('Double-quoted strings', () => {
    it('should tokenize a simple double-quoted string', () => {
      const tokens = getSignificantTokens('"hello"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello')
    })

    it('should tokenize double-quoted string with spaces', () => {
      const tokens = getSignificantTokens('"hello world"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello world')
    })

    it('should tokenize double-quoted string with numbers', () => {
      const tokens = getSignificantTokens('"test123"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('test123')
    })

    it('should tokenize double-quoted string with special characters', () => {
      const tokens = getSignificantTokens('"hello!@#$%^&*()"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello!@#$%^&*()')
    })

    it('should tokenize multiple double-quoted strings', () => {
      const tokens = getSignificantTokens('"first" "second"')

      expect(tokens).toHaveLength(2)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('first')
      expect(tokens[1].type).toBe(TokenType.STRING)
      expect(tokens[1].value).toBe('second')
    })

    it('should tokenize mixed single and double-quoted strings', () => {
      const tokens = getSignificantTokens("'single' \"double\"")

      expect(tokens).toHaveLength(2)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('single')
      expect(tokens[1].type).toBe(TokenType.STRING)
      expect(tokens[1].value).toBe('double')
    })
  })

  describe('Escaped characters within strings', () => {
    describe('Basic escape sequences', () => {
      it('should handle escaped newline (\\n)', () => {
        const tokens = getSignificantTokens('"hello\\nworld"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello\nworld')
      })

      it('should handle escaped tab (\\t)', () => {
        const tokens = getSignificantTokens('"hello\\tworld"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello\tworld')
      })

      it('should handle escaped carriage return (\\r)', () => {
        const tokens = getSignificantTokens('"hello\\rworld"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello\rworld')
      })

      it('should handle escaped backslash (\\\\)', () => {
        const tokens = getSignificantTokens('"hello\\\\world"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello\\world')
      })
    })

    describe('Escaped quotes', () => {
      it('should handle escaped single quote in single-quoted string', () => {
        const tokens = getSignificantTokens("'it\\'s working'")

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe("it's working")
      })

      it('should handle escaped double quote in double-quoted string', () => {
        const tokens = getSignificantTokens('"say \\"hello\\""')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('say "hello"')
      })

      it('should handle double quote inside single-quoted string (no escape needed)', () => {
        const tokens = getSignificantTokens("'say \"hello\"'")

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('say "hello"')
      })

      it('should handle single quote inside double-quoted string (no escape needed)', () => {
        const tokens = getSignificantTokens("\"it's working\"")

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe("it's working")
      })
    })

    describe('Multiple escape sequences', () => {
      it('should handle multiple escape sequences in one string', () => {
        const tokens = getSignificantTokens('"line1\\nline2\\tindented"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('line1\nline2\tindented')
      })

      it('should handle consecutive escape sequences', () => {
        const tokens = getSignificantTokens('"\\n\\t\\r"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\n\t\r')
      })

      it('should handle escape at beginning of string', () => {
        const tokens = getSignificantTokens('"\\nhello"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\nhello')
      })

      it('should handle escape at end of string', () => {
        const tokens = getSignificantTokens('"hello\\n"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello\n')
      })
    })

    describe('Unknown escape sequences', () => {
      it('should keep unknown escaped characters as-is', () => {
        const tokens = getSignificantTokens('"hello\\xworld"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        // Unknown escape sequences are kept as the escaped character
        expect(tokens[0].value).toBe('helloxworld')
      })
    })
  })

  describe('Unicode in strings', () => {
    describe('Unicode escape sequences (\\uXXXX)', () => {
      it('should handle unicode escape for simple character', () => {
        const tokens = getSignificantTokens('"\\u0041"') // 'A'

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('A')
      })

      it('should handle unicode escape for emoji-like characters', () => {
        const tokens = getSignificantTokens('"\\u2764"') // heart symbol

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\u2764')
      })

      it('should handle unicode escape mixed with regular text', () => {
        const tokens = getSignificantTokens('"hello\\u0020world"') // space

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello world')
      })

      it('should handle multiple unicode escapes', () => {
        const tokens = getSignificantTokens('"\\u0041\\u0042\\u0043"') // ABC

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('ABC')
      })

      it('should handle lowercase hex digits in unicode escape', () => {
        const tokens = getSignificantTokens('"\\u00e9"') // e with acute accent

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\u00e9')
      })

      it('should handle uppercase hex digits in unicode escape', () => {
        const tokens = getSignificantTokens('"\\u00E9"') // e with acute accent

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\u00E9')
      })

      it('should handle mixed case hex digits in unicode escape', () => {
        const tokens = getSignificantTokens('"\\u00eF"')

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\u00ef')
      })
    })

    describe('Direct unicode characters (UTF-8)', () => {
      it('should handle direct unicode characters in strings', () => {
        const tokens = getSignificantTokens('"cafe\u0301"') // cafe with combining acute accent

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('cafe\u0301')
      })

      it('should handle emojis in strings', () => {
        const tokens = getSignificantTokens('"hello \uD83D\uDE00"') // grinning face emoji

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello \uD83D\uDE00')
      })

      it('should handle CJK characters in strings', () => {
        const tokens = getSignificantTokens('"hello \u4e16\u754c"') // "hello world" in Chinese

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('hello \u4e16\u754c')
      })

      it('should handle Cyrillic characters in strings', () => {
        const tokens = getSignificantTokens('"\u041f\u0440\u0438\u0432\u0435\u0442"') // "Privet" in Russian

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\u041f\u0440\u0438\u0432\u0435\u0442')
      })

      it('should handle Arabic characters in strings', () => {
        const tokens = getSignificantTokens('"\u0645\u0631\u062d\u0628\u0627"') // "Marhaba" in Arabic

        expect(tokens).toHaveLength(1)
        expect(tokens[0].type).toBe(TokenType.STRING)
        expect(tokens[0].value).toBe('\u0645\u0631\u062d\u0628\u0627')
      })
    })

    describe('Unicode error handling', () => {
      it('should throw error for incomplete unicode escape (too short)', () => {
        expect(() => tokenize('"\\u00"')).toThrow(LexerError)
      })

      it('should throw error for invalid unicode escape (non-hex)', () => {
        expect(() => tokenize('"\\u00GH"')).toThrow(LexerError)
      })

      it('should throw error for unicode escape at end of string', () => {
        expect(() => tokenize('"\\u"')).toThrow(LexerError)
      })

      it('should throw error for unicode escape with only 2 digits', () => {
        expect(() => tokenize('"\\u00"')).toThrow(LexerError)
      })

      it('should throw error for unicode escape with only 3 digits', () => {
        expect(() => tokenize('"\\u000"')).toThrow(LexerError)
      })
    })
  })

  describe('Empty strings', () => {
    it('should tokenize empty single-quoted string', () => {
      const tokens = getSignificantTokens("''")

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('')
    })

    it('should tokenize empty double-quoted string', () => {
      const tokens = getSignificantTokens('""')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('')
    })

    it('should handle empty string followed by non-empty string', () => {
      const tokens = getSignificantTokens("'' 'hello'")

      expect(tokens).toHaveLength(2)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('')
      expect(tokens[1].type).toBe(TokenType.STRING)
      expect(tokens[1].value).toBe('hello')
    })

    it('should handle non-empty string followed by empty string', () => {
      const tokens = getSignificantTokens('"hello" ""')

      expect(tokens).toHaveLength(2)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('hello')
      expect(tokens[1].type).toBe(TokenType.STRING)
      expect(tokens[1].value).toBe('')
    })
  })

  describe('String error handling', () => {
    it('should throw error for unterminated single-quoted string', () => {
      expect(() => tokenize("'hello")).toThrow(LexerError)
    })

    it('should throw error for unterminated double-quoted string', () => {
      expect(() => tokenize('"hello')).toThrow(LexerError)
    })

    it('should throw error for string with unescaped newline', () => {
      expect(() => tokenize('"hello\nworld"')).toThrow(LexerError)
    })

    it('should throw error for string ending with backslash', () => {
      expect(() => tokenize('"hello\\')).toThrow(LexerError)
    })

    it('should throw error for unterminated string at end of input', () => {
      expect(() => tokenize('"')).toThrow(LexerError)
    })

    it('should throw error for single-quoted string with newline', () => {
      expect(() => tokenize("'hello\nworld'")).toThrow(LexerError)
    })
  })

  describe('String position tracking', () => {
    it('should track position of single string', () => {
      const tokens = tokenize('"hello"')
      const stringToken = tokens.find(t => t.type === TokenType.STRING)!

      expect(stringToken.line).toBe(1)
      expect(stringToken.column).toBe(1)
      expect(stringToken.start).toBe(0)
      // Note: end is calculated as start + value.length, where value is content (no quotes)
      expect(stringToken.end).toBe(5)
    })

    it('should track position of string after whitespace', () => {
      const tokens = tokenize('   "hello"')
      const stringToken = tokens.find(t => t.type === TokenType.STRING)!

      expect(stringToken.line).toBe(1)
      expect(stringToken.column).toBe(4)
      expect(stringToken.start).toBe(3)
    })

    it('should track position of string on second line', () => {
      const tokens = tokenize('MATCH\n"hello"')
      const stringToken = tokens.find(t => t.type === TokenType.STRING)!

      expect(stringToken.line).toBe(2)
      expect(stringToken.column).toBe(1)
    })

    it('should track position of multiple strings', () => {
      const tokens = getSignificantTokens('"first" "second"')

      expect(tokens[0].column).toBe(1)
      expect(tokens[1].column).toBe(9)
    })
  })

  describe('Strings in Cypher context', () => {
    it('should tokenize string as property value', () => {
      const tokens = getSignificantTokens("CREATE (n {name: 'Alice'})")

      const stringToken = tokens.find(t => t.type === TokenType.STRING)!
      expect(stringToken.value).toBe('Alice')
    })

    it('should tokenize string in WHERE clause', () => {
      const tokens = getSignificantTokens("MATCH (n) WHERE n.name = 'Bob' RETURN n")

      const stringToken = tokens.find(t => t.type === TokenType.STRING)!
      expect(stringToken.value).toBe('Bob')
    })

    it('should tokenize string in RETURN clause', () => {
      const tokens = getSignificantTokens("RETURN 'hello world'")

      const stringToken = tokens.find(t => t.type === TokenType.STRING)!
      expect(stringToken.value).toBe('hello world')
    })

    it('should tokenize multiple strings in property map', () => {
      const tokens = getSignificantTokens("CREATE (n {first: 'Alice', last: 'Smith'})")

      const stringTokens = tokens.filter(t => t.type === TokenType.STRING)
      expect(stringTokens).toHaveLength(2)
      expect(stringTokens[0].value).toBe('Alice')
      expect(stringTokens[1].value).toBe('Smith')
    })
  })

  describe('Edge cases', () => {
    it('should handle string with only whitespace', () => {
      const tokens = getSignificantTokens('"   "')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('   ')
    })

    it('should handle string with only escape sequences', () => {
      const tokens = getSignificantTokens('"\\n\\t\\r"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\n\t\r')
    })

    it('should handle string with consecutive quotes of different types', () => {
      const tokens = getSignificantTokens("\"\"''\"hello\"")

      expect(tokens).toHaveLength(3)
      expect(tokens[0].value).toBe('')
      expect(tokens[1].value).toBe('')
      expect(tokens[2].value).toBe('hello')
    })

    it('should handle string containing Cypher keywords', () => {
      const tokens = getSignificantTokens('"MATCH (n) RETURN n"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('MATCH (n) RETURN n')
    })

    it('should handle string containing numbers that look like literals', () => {
      const tokens = getSignificantTokens('"123.456"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('123.456')
    })

    it('should handle very long string', () => {
      const longContent = 'a'.repeat(10000)
      const tokens = getSignificantTokens(`"${longContent}"`)

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe(longContent)
    })
  })
})
