import { TokenType } from './tokens'

/**
 * Represents a single token from the Cypher lexer
 */
export class Token {
  /**
   * The type of this token
   */
  readonly type: TokenType

  /**
   * The raw string value of this token
   */
  readonly value: string

  /**
   * Line number where this token starts (1-indexed)
   */
  readonly line: number

  /**
   * Column number where this token starts (1-indexed)
   */
  readonly column: number

  /**
   * Start position in source string (0-indexed character offset)
   */
  readonly start: number

  /**
   * End position in source string (0-indexed character offset, exclusive)
   */
  readonly end: number

  constructor(type: TokenType, value: string, line: number, column: number, start: number = 0, end: number = 0) {
    this.type = type
    this.value = value
    this.line = line
    this.column = column
    this.start = start
    this.end = end || start + value.length
  }

  /**
   * Returns a string representation of this token for debugging
   */
  toString(): string {
    return `Token(${this.type}, "${this.value}", ${this.line}:${this.column})`
  }
}
