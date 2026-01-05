/**
 * AST Types for Cypher Query Language
 *
 * These types represent the parsed structure of a Cypher query
 * before translation to SQL.
 */

// Base AST node type
export interface ASTNode {
  type: string
}

// Query is the root of any Cypher statement
export interface Query extends ASTNode {
  type: 'Query'
  clauses: Clause[]
}

// Union type for all clauses
export type Clause =
  | MatchClause
  | ReturnClause
  | CreateClause
  | MergeClause
  | DeleteClause
  | SetClause
  | RemoveClause
  | WithClause
  | UnwindClause
  | WhereClause
  | OrderByClause
  | SkipClause
  | LimitClause
  | CallClause
  | UnionClause

// MATCH clause
export interface MatchClause extends ASTNode {
  type: 'MatchClause'
  optional: boolean
  pattern: Pattern
  where?: Expression
}

// RETURN clause
export interface ReturnClause extends ASTNode {
  type: 'ReturnClause'
  distinct: boolean
  items: ReturnItem[]
  orderBy?: OrderByItem[]
  skip?: Expression
  limit?: Expression
}

export interface ReturnItem extends ASTNode {
  type: 'ReturnItem'
  expression: Expression
  alias?: string
}

export interface OrderByItem extends ASTNode {
  type: 'OrderByItem'
  expression: Expression
  direction: 'ASC' | 'DESC'
}

// CREATE clause
export interface CreateClause extends ASTNode {
  type: 'CreateClause'
  pattern: Pattern
}

// MERGE clause
export interface MergeClause extends ASTNode {
  type: 'MergeClause'
  pattern: Pattern
  onMatch?: SetClause[]
  onCreate?: SetClause[]
}

// DELETE clause
export interface DeleteClause extends ASTNode {
  type: 'DeleteClause'
  detach: boolean
  expressions: Expression[]
}

// SET clause
export interface SetClause extends ASTNode {
  type: 'SetClause'
  items: SetItem[]
}

export type SetItem =
  | PropertySetItem
  | LabelSetItem
  | ReplacePropertiesItem
  | MergePropertiesItem

export interface PropertySetItem extends ASTNode {
  type: 'PropertySetItem'
  property: PropertyAccess
  expression: Expression
}

export interface LabelSetItem extends ASTNode {
  type: 'LabelSetItem'
  variable: string
  labels: string[]
}

export interface ReplacePropertiesItem extends ASTNode {
  type: 'ReplacePropertiesItem'
  variable: string
  expression: Expression
}

export interface MergePropertiesItem extends ASTNode {
  type: 'MergePropertiesItem'
  variable: string
  expression: Expression
}

// REMOVE clause
export interface RemoveClause extends ASTNode {
  type: 'RemoveClause'
  items: RemoveItem[]
}

export type RemoveItem = PropertyRemoveItem | LabelRemoveItem

export interface PropertyRemoveItem extends ASTNode {
  type: 'PropertyRemoveItem'
  property: PropertyAccess
}

export interface LabelRemoveItem extends ASTNode {
  type: 'LabelRemoveItem'
  variable: string
  labels: string[]
}

// WITH clause
export interface WithClause extends ASTNode {
  type: 'WithClause'
  distinct: boolean
  items: ReturnItem[]
  where?: Expression
  orderBy?: OrderByItem[]
  skip?: Expression
  limit?: Expression
}

// UNWIND clause
export interface UnwindClause extends ASTNode {
  type: 'UnwindClause'
  expression: Expression
  alias: string
}

// WHERE clause (standalone)
export interface WhereClause extends ASTNode {
  type: 'WhereClause'
  expression: Expression
}

// ORDER BY clause (standalone)
export interface OrderByClause extends ASTNode {
  type: 'OrderByClause'
  items: OrderByItem[]
}

// SKIP clause
export interface SkipClause extends ASTNode {
  type: 'SkipClause'
  expression: Expression
}

// LIMIT clause
export interface LimitClause extends ASTNode {
  type: 'LimitClause'
  expression: Expression
}

// CALL clause for procedure calls
export interface CallClause extends ASTNode {
  type: 'CallClause'
  procedure: string[]  // Procedure name as namespace.name
  arguments: Expression[]
  yield?: YieldItem[]
  where?: Expression
}

export interface YieldItem extends ASTNode {
  type: 'YieldItem'
  name: string
  alias?: string
}

// UNION clause
export interface UnionClause extends ASTNode {
  type: 'UnionClause'
  all: boolean  // UNION vs UNION ALL
}

// Pattern represents a graph pattern like (a)-[:REL]->(b)
export interface Pattern extends ASTNode {
  type: 'Pattern'
  elements: PatternElement[]
}

export type PatternElement = NodePattern | RelationshipPattern

// Node pattern like (n:Person {name: 'Alice'})
export interface NodePattern extends ASTNode {
  type: 'NodePattern'
  variable?: string
  labels: string[]
  properties?: MapLiteral
}

// Relationship pattern like -[:KNOWS {since: 2020}]->
export interface RelationshipPattern extends ASTNode {
  type: 'RelationshipPattern'
  variable?: string
  types: string[]
  properties?: MapLiteral
  direction: 'LEFT' | 'RIGHT' | 'BOTH' | 'NONE'
  minHops?: number
  maxHops?: number
}

// Expression types
export type Expression =
  | Literal
  | Variable
  | PropertyAccess
  | FunctionCall
  | BinaryExpression
  | UnaryExpression
  | ListExpression
  | MapLiteral
  | CaseExpression
  | PatternExpression
  | Parameter
  | ExistsExpression
  | AllExpression
  | AnyExpression
  | NoneExpression
  | SingleExpression
  | ListComprehension

// Literals
export type Literal =
  | IntegerLiteral
  | FloatLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral

export interface IntegerLiteral extends ASTNode {
  type: 'IntegerLiteral'
  value: number
}

export interface FloatLiteral extends ASTNode {
  type: 'FloatLiteral'
  value: number
}

export interface StringLiteral extends ASTNode {
  type: 'StringLiteral'
  value: string
}

export interface BooleanLiteral extends ASTNode {
  type: 'BooleanLiteral'
  value: boolean
}

export interface NullLiteral extends ASTNode {
  type: 'NullLiteral'
}

// Variable reference
export interface Variable extends ASTNode {
  type: 'Variable'
  name: string
}

// Property access like n.name
export interface PropertyAccess extends ASTNode {
  type: 'PropertyAccess'
  object: Expression
  property: string
}

// Function call like count(n), collect(n.name)
export interface FunctionCall extends ASTNode {
  type: 'FunctionCall'
  name: string
  arguments: Expression[]
  distinct?: boolean
}

// Binary expression like a + b, a AND b
export interface BinaryExpression extends ASTNode {
  type: 'BinaryExpression'
  operator: BinaryOperator
  left: Expression
  right: Expression
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>='
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'IN'
  | 'STARTS WITH'
  | 'ENDS WITH'
  | 'CONTAINS'
  | '=~'

// Unary expression like NOT a, -5
export interface UnaryExpression extends ASTNode {
  type: 'UnaryExpression'
  operator: UnaryOperator
  operand: Expression
}

export type UnaryOperator = 'NOT' | '-' | '+' | 'IS NULL' | 'IS NOT NULL'

// List expression like [1, 2, 3]
export interface ListExpression extends ASTNode {
  type: 'ListExpression'
  elements: Expression[]
}

// Map literal like {name: 'Alice', age: 30}
export interface MapLiteral extends ASTNode {
  type: 'MapLiteral'
  entries: MapEntry[]
}

export interface MapEntry {
  key: string
  value: Expression
}

// CASE expression
export interface CaseExpression extends ASTNode {
  type: 'CaseExpression'
  expression?: Expression
  alternatives: CaseAlternative[]
  default?: Expression
}

export interface CaseAlternative {
  when: Expression
  then: Expression
}

// Pattern expression (for EXISTS, pattern in WHERE)
export interface PatternExpression extends ASTNode {
  type: 'PatternExpression'
  pattern: Pattern
}

// Parameter like $name
export interface Parameter extends ASTNode {
  type: 'Parameter'
  name: string
}

// EXISTS expression
export interface ExistsExpression extends ASTNode {
  type: 'ExistsExpression'
  pattern: Pattern
}

// ALL, ANY, NONE, SINGLE expressions
export interface AllExpression extends ASTNode {
  type: 'AllExpression'
  variable: string
  listExpression: Expression
  whereExpression: Expression
}

export interface AnyExpression extends ASTNode {
  type: 'AnyExpression'
  variable: string
  listExpression: Expression
  whereExpression: Expression
}

export interface NoneExpression extends ASTNode {
  type: 'NoneExpression'
  variable: string
  listExpression: Expression
  whereExpression: Expression
}

export interface SingleExpression extends ASTNode {
  type: 'SingleExpression'
  variable: string
  listExpression: Expression
  whereExpression: Expression
}

// List comprehension like [x IN list WHERE x > 0 | x * 2]
export interface ListComprehension extends ASTNode {
  type: 'ListComprehension'
  variable: string
  listExpression: Expression
  whereExpression?: Expression
  mapExpression?: Expression
}
