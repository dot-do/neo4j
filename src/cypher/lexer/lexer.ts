import { Token } from './token'
import { TokenType, KEYWORDS } from './tokens'

/**
 * Lexer error thrown when invalid input is encountered
 */
export class LexerError extends Error {
  readonly line: number
  readonly column: number

  constructor(message: string, line: number, column: number) {
    super(`${message} at line ${line}, column ${column}`)
    this.name = 'LexerError'
    this.line = line
    this.column = column
  }
}

/**
 * Cypher query lexer (tokenizer)
 * Converts a Cypher query string into a stream of tokens
 */
export class Lexer {
  private readonly input: string
  private pos: number = 0
  private line: number = 1
  private column: number = 1

  constructor(input: string) {
    this.input = input
  }

  /**
   * Tokenize the entire input string
   * @returns Array of tokens
   */
  tokenize(): Token[] {
    const tokens: Token[] = []

    while (!this.isAtEnd()) {
      const token = this.nextToken()
      if (token) {
        tokens.push(token)
      }
    }

    tokens.push(new Token(TokenType.EOF, '', this.line, this.column, this.pos, this.pos))
    return tokens
  }

  /**
   * Check if we've reached the end of input
   */
  private isAtEnd(): boolean {
    return this.pos >= this.input.length
  }

  /**
   * Get the current character without advancing
   */
  private peek(): string {
    if (this.isAtEnd()) return '\0'
    return this.input[this.pos]
  }

  /**
   * Get the next character without advancing
   */
  private peekNext(): string {
    if (this.pos + 1 >= this.input.length) return '\0'
    return this.input[this.pos + 1]
  }

  /**
   * Advance to the next character and return the current one
   */
  private advance(): string {
    const char = this.input[this.pos++]
    if (char === '\n') {
      this.line++
      this.column = 1
    } else {
      this.column++
    }
    return char
  }

  /**
   * Match and consume expected character
   */
  private match(expected: string): boolean {
    if (this.isAtEnd() || this.peek() !== expected) {
      return false
    }
    this.advance()
    return true
  }

  /**
   * Create a token at the current position
   */
  private makeToken(type: TokenType, value: string, startLine: number, startColumn: number, startPos: number): Token {
    return new Token(type, value, startLine, startColumn, startPos, startPos + value.length)
  }

  /**
   * Get the next token from the input
   */
  private nextToken(): Token | null {
    const startPos = this.pos  // Capture before advance
    const startLine = this.line
    const startColumn = this.column

    const char = this.advance()

    // Whitespace
    if (char === ' ' || char === '\t' || char === '\r') {
      return this.whitespace(startLine, startColumn, startPos)
    }

    // Newlines
    if (char === '\n') {
      return this.makeToken(TokenType.NEWLINE, '\n', startLine, startColumn, startPos)
    }

    // Single-character tokens
    switch (char) {
      case '(':
        return this.makeToken(TokenType.LPAREN, '(', startLine, startColumn, startPos)
      case ')':
        return this.makeToken(TokenType.RPAREN, ')', startLine, startColumn, startPos)
      case '[':
        return this.makeToken(TokenType.LBRACKET, '[', startLine, startColumn, startPos)
      case ']':
        return this.makeToken(TokenType.RBRACKET, ']', startLine, startColumn, startPos)
      case '{':
        return this.makeToken(TokenType.LBRACE, '{', startLine, startColumn, startPos)
      case '}':
        return this.makeToken(TokenType.RBRACE, '}', startLine, startColumn, startPos)
      case ':':
        return this.makeToken(TokenType.COLON, ':', startLine, startColumn, startPos)
      case ',':
        return this.makeToken(TokenType.COMMA, ',', startLine, startColumn, startPos)
      case '.':
        // Could be float starting with dot
        if (this.isDigit(this.peek())) {
          return this.number('.', startLine, startColumn, startPos)
        }
        return this.makeToken(TokenType.DOT, '.', startLine, startColumn, startPos)
      case '|':
        return this.makeToken(TokenType.PIPE, '|', startLine, startColumn, startPos)
      case '+':
        return this.makeToken(TokenType.PLUS, '+', startLine, startColumn, startPos)
      case '*':
        return this.makeToken(TokenType.STAR, '*', startLine, startColumn, startPos)
      case '%':
        return this.makeToken(TokenType.PERCENT, '%', startLine, startColumn, startPos)
      case '^':
        return this.makeToken(TokenType.CARET, '^', startLine, startColumn, startPos)
      case '=':
        return this.makeToken(TokenType.EQUALS, '=', startLine, startColumn, startPos)
    }

    // Two-character tokens
    if (char === '<') {
      if (this.match('>')) {
        return this.makeToken(TokenType.NOT_EQUALS, '<>', startLine, startColumn, startPos)
      }
      if (this.match('=')) {
        return this.makeToken(TokenType.LTE, '<=', startLine, startColumn, startPos)
      }
      if (this.match('-')) {
        return this.makeToken(TokenType.ARROW_LEFT, '<-', startLine, startColumn, startPos)
      }
      return this.makeToken(TokenType.LT, '<', startLine, startColumn, startPos)
    }

    if (char === '>') {
      if (this.match('=')) {
        return this.makeToken(TokenType.GTE, '>=', startLine, startColumn, startPos)
      }
      return this.makeToken(TokenType.GT, '>', startLine, startColumn, startPos)
    }

    if (char === '-') {
      if (this.match('>')) {
        return this.makeToken(TokenType.ARROW_RIGHT, '->', startLine, startColumn, startPos)
      }
      // Could be negative number
      if (this.isDigit(this.peek())) {
        return this.number('-', startLine, startColumn, startPos)
      }
      // Use DASH for all standalone '-' (for relationship patterns)
      // Parser will determine if it's arithmetic MINUS based on context
      return this.makeToken(TokenType.DASH, '-', startLine, startColumn, startPos)
    }

    if (char === '/') {
      // Single-line comment
      if (this.match('/')) {
        return this.singleLineComment(startLine, startColumn)
      }
      // Multi-line comment
      if (this.match('*')) {
        return this.multiLineComment(startLine, startColumn)
      }
      return this.makeToken(TokenType.SLASH, '/', startLine, startColumn, startPos)
    }

    // String literals
    if (char === '"' || char === "'") {
      return this.string(char, startLine, startColumn, startPos)
    }

    // Parameters
    if (char === '$') {
      return this.parameter(startLine, startColumn, startPos)
    }

    // Numbers
    if (this.isDigit(char)) {
      return this.number(char, startLine, startColumn, startPos)
    }

    // Identifiers and keywords
    if (this.isIdentifierStart(char)) {
      return this.identifierOrKeyword(char, startLine, startColumn, startPos)
    }

    throw new LexerError(`Unexpected character '${char}'`, startLine, startColumn)
  }

  /**
   * Consume whitespace and return a whitespace token
   */
  private whitespace(startLine: number, startColumn: number, startPos: number): Token {
    let value = this.input[this.pos - 1]
    while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r')) {
      value += this.advance()
    }
    return this.makeToken(TokenType.WHITESPACE, value, startLine, startColumn, startPos)
  }

  /**
   * Parse a string literal
   */
  private string(quote: string, startLine: number, startColumn: number, startPos: number): Token {
    let value = ''

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance() // consume backslash
        if (this.isAtEnd()) {
          throw new LexerError('Unterminated string literal', startLine, startColumn)
        }
        const escaped = this.advance()
        switch (escaped) {
          case 'n':
            value += '\n'
            break
          case 't':
            value += '\t'
            break
          case 'r':
            value += '\r'
            break
          case '\\':
            value += '\\'
            break
          case "'":
            value += "'"
            break
          case '"':
            value += '"'
            break
          case 'u':
            // Unicode escape sequence \uXXXX
            value += this.unicodeEscape(startLine, startColumn)
            break
          default:
            // Keep the escaped character as-is
            value += escaped
        }
      } else if (this.peek() === '\n') {
        throw new LexerError('Unterminated string literal', startLine, startColumn)
      } else {
        value += this.advance()
      }
    }

    if (this.isAtEnd()) {
      throw new LexerError('Unterminated string literal', startLine, startColumn)
    }

    this.advance() // consume closing quote
    return this.makeToken(TokenType.STRING, value, startLine, startColumn, startPos)
  }

  /**
   * Parse unicode escape sequence \uXXXX
   */
  private unicodeEscape(startLine: number, startColumn: number): string {
    let hex = ''
    for (let i = 0; i < 4; i++) {
      if (this.isAtEnd() || !this.isHexDigit(this.peek())) {
        throw new LexerError('Invalid unicode escape sequence', startLine, startColumn)
      }
      hex += this.advance()
    }
    return String.fromCharCode(parseInt(hex, 16))
  }

  /**
   * Parse a number (integer or float)
   */
  private number(first: string, startLine: number, startColumn: number, startPos: number): Token {
    let value = first
    let isFloat = first === '.'

    // Consume integer part
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance()
    }

    // Check for decimal point
    if (!isFloat && this.peek() === '.' && this.isDigit(this.peekNext())) {
      isFloat = true
      value += this.advance() // consume '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance()
      }
    }

    // Check for exponent
    if (this.peek() === 'e' || this.peek() === 'E') {
      isFloat = true
      value += this.advance() // consume 'e' or 'E'
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance()
      }
      if (!this.isDigit(this.peek())) {
        throw new LexerError('Invalid number format', startLine, startColumn)
      }
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance()
      }
    }

    return this.makeToken(
      isFloat ? TokenType.FLOAT : TokenType.INTEGER,
      value,
      startLine,
      startColumn,
      startPos
    )
  }

  /**
   * Parse a parameter ($name or {name})
   */
  private parameter(startLine: number, startColumn: number, startPos: number): Token {
    let name = ''

    if (this.peek() === '{') {
      // {name} style parameter
      this.advance() // consume '{'
      while (!this.isAtEnd() && this.peek() !== '}') {
        name += this.advance()
      }
      if (this.isAtEnd()) {
        throw new LexerError('Unterminated parameter', startLine, startColumn)
      }
      this.advance() // consume '}'
    } else {
      // $name style parameter
      while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
        name += this.advance()
      }
    }

    if (name.length === 0) {
      throw new LexerError('Empty parameter name', startLine, startColumn)
    }

    return this.makeToken(TokenType.PARAMETER, name, startLine, startColumn, startPos)
  }

  /**
   * Parse an identifier or keyword
   */
  private identifierOrKeyword(first: string, startLine: number, startColumn: number, startPos: number): Token {
    let value = first

    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      value += this.advance()
    }

    // Check if it's a keyword (case-insensitive)
    const upperValue = value.toUpperCase()
    const keywordType = KEYWORDS.get(upperValue)

    if (keywordType !== undefined) {
      return this.makeToken(keywordType, value, startLine, startColumn, startPos)
    }

    return this.makeToken(TokenType.IDENTIFIER, value, startLine, startColumn, startPos)
  }

  /**
   * Parse a single-line comment (// ...)
   */
  private singleLineComment(_startLine: number, _startColumn: number): Token | null {
    // Consume until end of line
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance()
    }
    // Skip comment tokens - return null to not include in token stream
    return null
  }

  /**
   * Parse a multi-line comment
   */
  private multiLineComment(startLine: number, startColumn: number): Token | null {
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance() // consume '*'
        this.advance() // consume '/'
        return null
      }
      this.advance()
    }
    throw new LexerError('Unterminated multi-line comment', startLine, startColumn)
  }

  /**
   * Check if character is a digit
   */
  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9'
  }

  /**
   * Check if character is a hex digit
   */
  private isHexDigit(char: string): boolean {
    return (
      (char >= '0' && char <= '9') ||
      (char >= 'a' && char <= 'f') ||
      (char >= 'A' && char <= 'F')
    )
  }

  /**
   * Check if character can start an identifier
   */
  private isIdentifierStart(char: string): boolean {
    return (
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_'
    )
  }

  /**
   * Check if character can be part of an identifier
   */
  private isIdentifierChar(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char)
  }
}
