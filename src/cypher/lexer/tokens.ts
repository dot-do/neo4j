/**
 * Token types for the Cypher lexer
 */
export enum TokenType {
  // Keywords - Clauses
  MATCH = 'MATCH',
  OPTIONAL = 'OPTIONAL',
  WHERE = 'WHERE',
  RETURN = 'RETURN',
  WITH = 'WITH',
  UNWIND = 'UNWIND',
  CREATE = 'CREATE',
  MERGE = 'MERGE',
  DELETE = 'DELETE',
  DETACH = 'DETACH',
  SET = 'SET',
  REMOVE = 'REMOVE',
  CALL = 'CALL',
  YIELD = 'YIELD',
  UNION = 'UNION',
  ALL = 'ALL',

  // Keywords - Ordering
  ORDER = 'ORDER',
  BY = 'BY',
  ASC = 'ASC',
  DESC = 'DESC',
  SKIP = 'SKIP',
  LIMIT = 'LIMIT',

  // Keywords - Logical operators
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  XOR = 'XOR',
  IN = 'IN',
  IS = 'IS',
  NULL = 'NULL',

  // Keywords - Boolean literals
  TRUE = 'TRUE',
  FALSE = 'FALSE',

  // Keywords - CASE expression
  CASE = 'CASE',
  WHEN = 'WHEN',
  THEN = 'THEN',
  ELSE = 'ELSE',
  END = 'END',

  // Keywords - MERGE actions
  ON = 'ON',

  // Literals
  INTEGER = 'INTEGER',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  PARAMETER = 'PARAMETER',

  // Identifiers
  IDENTIFIER = 'IDENTIFIER',

  // Symbols - Grouping
  LPAREN = 'LPAREN',     // (
  RPAREN = 'RPAREN',     // )
  LBRACKET = 'LBRACKET', // [
  RBRACKET = 'RBRACKET', // ]
  LBRACE = 'LBRACE',     // {
  RBRACE = 'RBRACE',     // }

  // Symbols - Punctuation
  COLON = 'COLON',       // :
  COMMA = 'COMMA',       // ,
  DOT = 'DOT',           // .
  PIPE = 'PIPE',         // |

  // Symbols - Relationship arrows
  ARROW_LEFT = 'ARROW_LEFT',   // <-
  ARROW_RIGHT = 'ARROW_RIGHT', // ->
  DASH = 'DASH',               // -

  // Symbols - Comparison operators
  EQUALS = 'EQUALS',           // =
  NOT_EQUALS = 'NOT_EQUALS',   // <>
  LT = 'LT',                   // <
  GT = 'GT',                   // >
  LTE = 'LTE',                 // <=
  GTE = 'GTE',                 // >=

  // Symbols - Arithmetic operators
  PLUS = 'PLUS',       // +
  MINUS = 'MINUS',     // -
  STAR = 'STAR',       // *
  SLASH = 'SLASH',     // /
  PERCENT = 'PERCENT', // %
  CARET = 'CARET',     // ^

  // Special tokens
  EOF = 'EOF',
  NEWLINE = 'NEWLINE',
  WHITESPACE = 'WHITESPACE',
}

/**
 * Map of Cypher keywords to their token types
 * Keywords are case-insensitive in Cypher
 */
export const KEYWORDS: Map<string, TokenType> = new Map([
  // Clauses
  ['MATCH', TokenType.MATCH],
  ['OPTIONAL', TokenType.OPTIONAL],
  ['WHERE', TokenType.WHERE],
  ['RETURN', TokenType.RETURN],
  ['WITH', TokenType.WITH],
  ['UNWIND', TokenType.UNWIND],
  ['CREATE', TokenType.CREATE],
  ['MERGE', TokenType.MERGE],
  ['DELETE', TokenType.DELETE],
  ['DETACH', TokenType.DETACH],
  ['SET', TokenType.SET],
  ['REMOVE', TokenType.REMOVE],
  ['CALL', TokenType.CALL],
  ['YIELD', TokenType.YIELD],
  ['UNION', TokenType.UNION],
  ['ALL', TokenType.ALL],

  // Ordering
  ['ORDER', TokenType.ORDER],
  ['BY', TokenType.BY],
  ['ASC', TokenType.ASC],
  ['DESC', TokenType.DESC],
  ['SKIP', TokenType.SKIP],
  ['LIMIT', TokenType.LIMIT],

  // Logical operators
  ['AND', TokenType.AND],
  ['OR', TokenType.OR],
  ['NOT', TokenType.NOT],
  ['XOR', TokenType.XOR],
  ['IN', TokenType.IN],
  ['IS', TokenType.IS],
  ['NULL', TokenType.NULL],

  // Boolean literals
  ['TRUE', TokenType.TRUE],
  ['FALSE', TokenType.FALSE],

  // CASE expression
  ['CASE', TokenType.CASE],
  ['WHEN', TokenType.WHEN],
  ['THEN', TokenType.THEN],
  ['ELSE', TokenType.ELSE],
  ['END', TokenType.END],

  // MERGE actions
  ['ON', TokenType.ON],
])
