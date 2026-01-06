import { describe, it, expect } from 'vitest'
import { tokenize, TokenType, LexerError } from '../index'

describe('Lexer - Unicode Escape Edge Cases', () => {
  /**
   * Helper to get only significant tokens (no whitespace)
   */
  const getSignificantTokens = (input: string) => {
    return tokenize(input).filter(t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.EOF)
  }

  describe('Invalid hex values in unicode escapes', () => {
    it('should throw error for non-hex character G in unicode escape', () => {
      expect(() => tokenize('"\\uGGGG"')).toThrow(LexerError)
    })

    it('should throw error for non-hex character at position 1', () => {
      expect(() => tokenize('"\\u0G00"')).toThrow(LexerError)
    })

    it('should throw error for non-hex character at position 2', () => {
      expect(() => tokenize('"\\u00G0"')).toThrow(LexerError)
    })

    it('should throw error for non-hex character at position 3', () => {
      expect(() => tokenize('"\\u000G"')).toThrow(LexerError)
    })

    it('should throw error for lowercase non-hex character', () => {
      expect(() => tokenize('"\\u00zz"')).toThrow(LexerError)
    })

    it('should throw error for special characters in unicode escape', () => {
      expect(() => tokenize('"\\u00!!"')).toThrow(LexerError)
    })

    it('should throw error for space in unicode escape', () => {
      expect(() => tokenize('"\\u00 0"')).toThrow(LexerError)
    })
  })

  describe('Code points above 0x10FFFF (Unicode maximum)', () => {
    /**
     * The maximum valid Unicode code point is 0x10FFFF.
     * The current implementation uses String.fromCharCode which only handles
     * values up to 0xFFFF correctly. For values above 0xFFFF, it should use
     * String.fromCodePoint or surrogate pairs.
     *
     * These tests document the current (potentially incorrect) behavior.
     */

    it('should handle maximum BMP code point (0xFFFF)', () => {
      const tokens = getSignificantTokens('"\\uFFFF"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // 0xFFFF is the max for a single \uXXXX escape
      expect(tokens[0].value).toBe('\uFFFF')
    })

    it('should handle code point 0xD800 (start of surrogate range)', () => {
      // 0xD800-0xDFFF are surrogate code points and should not appear alone
      // String.fromCharCode(0xD800) produces an unpaired high surrogate
      const tokens = getSignificantTokens('"\\uD800"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // This creates an invalid lone surrogate - tests current behavior
      expect(tokens[0].value).toBe('\uD800')
    })

    it('should handle code point 0xDFFF (end of surrogate range)', () => {
      // 0xDFFF is a low surrogate and should not appear alone
      const tokens = getSignificantTokens('"\\uDFFF"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // This creates an invalid lone surrogate - tests current behavior
      expect(tokens[0].value).toBe('\uDFFF')
    })
  })

  describe('Incomplete unicode sequences', () => {
    it('should throw error for \\u with no digits', () => {
      expect(() => tokenize('"\\u"')).toThrow(LexerError)
    })

    it('should throw error for \\u with only 1 digit', () => {
      expect(() => tokenize('"\\u0"')).toThrow(LexerError)
    })

    it('should throw error for \\u with only 2 digits', () => {
      expect(() => tokenize('"\\u00"')).toThrow(LexerError)
    })

    it('should throw error for \\u with only 3 digits', () => {
      expect(() => tokenize('"\\u000"')).toThrow(LexerError)
    })

    it('should throw error for \\u at end of unterminated string', () => {
      expect(() => tokenize('"\\u')).toThrow(LexerError)
    })

    it('should throw error for \\u followed by end of string', () => {
      expect(() => tokenize('"test\\u"')).toThrow(LexerError)
    })

    it('should throw error for incomplete unicode followed by closing quote', () => {
      // The closing quote should not count as a hex digit
      expect(() => tokenize('"\\u00"')).toThrow(LexerError)
    })

    it('should throw error for \\u followed by newline', () => {
      expect(() => tokenize('"\\u\n"')).toThrow(LexerError)
    })
  })

  describe('Surrogate pairs handling', () => {
    /**
     * Characters outside the BMP (U+10000 to U+10FFFF) require surrogate pairs
     * in UTF-16. A proper implementation should either:
     * 1. Support \U00XXXXXX for code points above 0xFFFF
     * 2. Allow two \uXXXX escapes to form a surrogate pair
     * 3. Use String.fromCodePoint for proper handling
     *
     * These tests document the current behavior.
     */

    it('should handle high surrogate followed by low surrogate for emoji', () => {
      // U+1F600 (grinning face) = D83D DE00 in surrogate pairs
      const tokens = getSignificantTokens('"\\uD83D\\uDE00"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // This should produce the grinning face emoji
      expect(tokens[0].value).toBe('\uD83D\uDE00')
      // Verify it's a valid surrogate pair
      expect(tokens[0].value.codePointAt(0)).toBe(0x1F600)
    })

    it('should handle high surrogate followed by low surrogate for math symbol', () => {
      // U+1D49C (mathematical script capital A) = D835 DC9C
      const tokens = getSignificantTokens('"\\uD835\\uDC9C"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\uD835\uDC9C')
    })

    it('should handle isolated high surrogate', () => {
      // An isolated high surrogate is technically invalid but may be allowed
      const tokens = getSignificantTokens('"\\uD83D"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // Creates lone surrogate - documents current behavior
      expect(tokens[0].value).toBe('\uD83D')
    })

    it('should handle isolated low surrogate', () => {
      // An isolated low surrogate is technically invalid but may be allowed
      const tokens = getSignificantTokens('"\\uDE00"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // Creates lone surrogate - documents current behavior
      expect(tokens[0].value).toBe('\uDE00')
    })

    it('should handle reversed surrogate pair (low before high)', () => {
      // This is invalid - low surrogate should follow high surrogate
      const tokens = getSignificantTokens('"\\uDE00\\uD83D"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      // Documents current behavior - both are kept as-is
      expect(tokens[0].value).toBe('\uDE00\uD83D')
    })

    it('should handle high surrogate not followed by low surrogate', () => {
      // High surrogate followed by regular character
      const tokens = getSignificantTokens('"\\uD83Dx"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\uD83Dx')
    })

    it('should handle multiple surrogate pairs', () => {
      // Two emojis in sequence
      const tokens = getSignificantTokens('"\\uD83D\\uDE00\\uD83D\\uDE01"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\uD83D\uDE00\uD83D\uDE01')
    })
  })

  describe('String.fromCharCode behavior with large values', () => {
    /**
     * String.fromCharCode uses modulo 0x10000 for values > 0xFFFF.
     * For example, String.fromCharCode(0x10041) returns 'A' (0x0041).
     *
     * The current unicodeEscape implementation at line 310 uses:
     *   return String.fromCharCode(parseInt(hex, 16))
     *
     * Since \uXXXX only accepts 4 hex digits, the max value is 0xFFFF,
     * so this isn't directly exploitable. However, these tests document
     * the behavior and edge cases.
     */

    it('should correctly parse maximum 4-digit hex value FFFF', () => {
      const tokens = getSignificantTokens('"\\uFFFF"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value.charCodeAt(0)).toBe(0xFFFF)
    })

    it('should correctly parse null character (0000)', () => {
      const tokens = getSignificantTokens('"\\u0000"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value.charCodeAt(0)).toBe(0)
    })

    it('should handle BOM character (FEFF)', () => {
      const tokens = getSignificantTokens('"\\uFEFF"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\uFEFF')
    })

    it('should handle replacement character (FFFD)', () => {
      const tokens = getSignificantTokens('"\\uFFFD"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\uFFFD')
    })

    it('should handle non-character FFFE', () => {
      // U+FFFE is a non-character but still valid for String.fromCharCode
      const tokens = getSignificantTokens('"\\uFFFE"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value.charCodeAt(0)).toBe(0xFFFE)
    })

    it('should handle boundary value 0x0001', () => {
      const tokens = getSignificantTokens('"\\u0001"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value.charCodeAt(0)).toBe(1)
    })
  })

  describe('Edge cases with unicode escapes in context', () => {
    it('should handle unicode escape followed by regular text', () => {
      const tokens = getSignificantTokens('"\\u0041BC"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('ABC')
    })

    it('should handle text followed by unicode escape', () => {
      const tokens = getSignificantTokens('"AB\\u0043"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('ABC')
    })

    it('should handle unicode escape between text', () => {
      const tokens = getSignificantTokens('"A\\u0042C"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('ABC')
    })

    it('should handle multiple consecutive unicode escapes', () => {
      const tokens = getSignificantTokens('"\\u0041\\u0042\\u0043\\u0044"')

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('ABCD')
    })

    it('should handle unicode escape for control characters', () => {
      const tokens = getSignificantTokens('"\\u0007"') // bell character

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('\u0007')
    })

    it('should handle unicode escape in single-quoted string', () => {
      const tokens = getSignificantTokens("'\\u0041'")

      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('A')
    })

    it('should throw for incomplete unicode at string boundary', () => {
      expect(() => tokenize('"test\\u00')).toThrow(LexerError)
    })
  })

  describe('Unicode escape validation boundary conditions', () => {
    it('should validate all 4 hex positions with valid hex digits 0-9', () => {
      const tokens = getSignificantTokens('"\\u0123"')
      expect(tokens[0].value.charCodeAt(0)).toBe(0x0123)
    })

    it('should validate lowercase a-f in unicode escape', () => {
      const tokens = getSignificantTokens('"\\uabcd"')
      expect(tokens[0].value.charCodeAt(0)).toBe(0xABCD)
    })

    it('should validate uppercase A-F in unicode escape', () => {
      const tokens = getSignificantTokens('"\\uABCD"')
      expect(tokens[0].value.charCodeAt(0)).toBe(0xABCD)
    })

    it('should validate mixed case in unicode escape', () => {
      const tokens = getSignificantTokens('"\\uAbCd"')
      expect(tokens[0].value.charCodeAt(0)).toBe(0xABCD)
    })

    it('should reject letter g (first invalid after f)', () => {
      expect(() => tokenize('"\\u000g"')).toThrow(LexerError)
    })

    it('should reject at-sign in unicode escape', () => {
      expect(() => tokenize('"\\u00@0"')).toThrow(LexerError)
    })

    it('should reject backtick in unicode escape', () => {
      expect(() => tokenize('"\\u00`0"')).toThrow(LexerError)
    })
  })
})
