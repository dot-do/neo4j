/**
 * Parser module exports
 */

export { Parser, ParserError } from './parser'

import { Parser } from './parser'
import { Query } from '../ast/types'

/**
 * Convenience function to parse a Cypher query string into an AST
 * @param input The Cypher query string to parse
 * @returns The parsed Query AST
 */
export function parse(input: string): Query {
  return Parser.fromString(input).parse()
}
