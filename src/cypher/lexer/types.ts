/**
 * Token types for the Cypher lexer
 */
export type TokenType =
  | 'KEYWORD'      // MATCH, CREATE, RETURN, etc.
  | 'IDENTIFIER'   // variable names, unquoted or backtick-quoted
  | 'STRING'       // 'string' or "string"
  | 'INTEGER'      // 123
  | 'FLOAT'        // 1.23, 1e10, 1.5e-3
  | 'BOOLEAN'      // true, false (subset of KEYWORD for parsing)
  | 'NULL'         // null (subset of KEYWORD for parsing)
  | 'OPERATOR'     // +, -, *, /, =, <>, etc.
  | 'PUNCTUATION'  // (, ), [, ], {, }, :, etc.
  | 'PARAMETER'    // $param
  | 'COMMENT'      // // or /* */
  | 'WHITESPACE'   // spaces, tabs, newlines
  | 'EOF'          // end of input

/**
 * Represents a single token in the lexer output
 */
export interface Token {
  /** The type of the token */
  type: TokenType
  /** The actual string value of the token */
  value: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
  /** 0-based start offset in the input */
  start: number
  /** 0-based end offset in the input (exclusive) */
  end: number
}

/**
 * Cypher keywords (case-insensitive)
 */
export const KEYWORDS = [
  // Query structure
  'MATCH', 'OPTIONAL', 'CREATE', 'MERGE', 'DELETE', 'DETACH',
  'SET', 'REMOVE', 'RETURN', 'WITH', 'UNWIND', 'WHERE',

  // Ordering and pagination
  'ORDER', 'BY', 'SKIP', 'LIMIT', 'ASCENDING', 'ASC',
  'DESCENDING', 'DESC', 'DISTINCT',

  // Aliases
  'AS',

  // Boolean operators
  'AND', 'OR', 'NOT', 'XOR',

  // Null and boolean values
  'NULL', 'TRUE', 'FALSE',

  // String predicates
  'IN', 'STARTS', 'ENDS', 'CONTAINS', 'IS',

  // Case expression
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',

  // Merge actions
  'ON',

  // Procedure calls
  'CALL', 'YIELD',

  // Union
  'UNION', 'ALL',

  // Hints
  'USING', 'INDEX', 'SCAN', 'JOIN',

  // Schema
  'CONSTRAINT', 'ASSERT', 'EXISTS', 'UNIQUE', 'DROP',

  // Subqueries
  'FOREACH',

  // CSV
  'LOAD', 'CSV', 'FROM', 'HEADERS'
] as const

export type Keyword = typeof KEYWORDS[number]

/**
 * Operators in Cypher
 */
export const OPERATORS = [
  // Arithmetic
  '+', '-', '*', '/', '%', '^',

  // Comparison
  '=', '<>', '<', '>', '<=', '>=',

  // String pattern matching
  '=~'
] as const

/**
 * Punctuation characters in Cypher
 */
export const PUNCTUATION = [
  '(', ')', '[', ']', '{', '}',
  ':', '.', ',', '|',
  '..'  // Range
] as const
