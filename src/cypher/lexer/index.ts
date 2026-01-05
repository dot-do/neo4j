export { TokenType, KEYWORDS } from './tokens'
export { Token } from './token'
export { Lexer, LexerError } from './lexer'

import { Lexer } from './lexer'
import { Token } from './token'

/**
 * Convenience function to tokenize a Cypher query string
 * @param input The Cypher query string to tokenize
 * @returns Array of tokens
 */
export function tokenize(input: string): Token[] {
  return new Lexer(input).tokenize()
}
