import { Token } from '../lexer/token'
import { TokenType } from '../lexer/tokens'
import { Lexer } from '../lexer/lexer'
import {
  Query,
  Clause,
  MatchClause,
  ReturnClause,
  ReturnItem,
  WhereClause,
  CreateClause,
  MergeClause,
  DeleteClause,
  UnwindClause,
  CallClause,
  UnionClause,
  YieldItem,
  Pattern,
  PatternElement,
  NodePattern,
  RelationshipPattern,
  Expression,
  Variable,
  PropertyAccess,
  IntegerLiteral,
  FloatLiteral,
  StringLiteral,
  BooleanLiteral,
  NullLiteral,
  BinaryExpression,
  BinaryOperator,
  UnaryExpression,
  MapLiteral,
  MapEntry,
  ListExpression,
  FunctionCall,
  Parameter,
  SetClause,
  SetItem,
  PropertySetItem,
  LabelSetItem,
  ReplacePropertiesItem,
  MergePropertiesItem,
  RemoveClause,
  RemoveItem,
  PropertyRemoveItem,
  LabelRemoveItem,
} from '../ast/types'

/**
 * Parser error thrown when invalid syntax is encountered
 */
export class ParserError extends Error {
  readonly line: number
  readonly column: number

  constructor(message: string, line: number, column: number) {
    super(`${message} at line ${line}, column ${column}`)
    this.name = 'ParserError'
    this.line = line
    this.column = column
  }
}

/**
 * Cypher query parser
 * Converts a stream of tokens into an AST
 */
export class Parser {
  private readonly tokens: Token[]
  private pos: number = 0

  /**
   * Create a parser from a Cypher query string
   */
  static fromString(input: string): Parser {
    const lexer = new Lexer(input)
    const tokens = lexer.tokenize()
    return new Parser(tokens)
  }

  constructor(tokens: Token[]) {
    // Filter out whitespace and newline tokens for easier parsing
    this.tokens = tokens.filter(
      t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.NEWLINE
    )
  }

  /**
   * Parse the tokens into a Query AST
   */
  parse(): Query {
    const clauses: Clause[] = []

    while (!this.isAtEnd()) {
      const clause = this.parseClause()
      if (clause) {
        clauses.push(clause)
      }
    }

    return {
      type: 'Query',
      clauses,
    }
  }

  /**
   * Check if we've reached the end of tokens
   */
  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF
  }

  /**
   * Get the current token without advancing
   */
  private peek(): Token {
    return this.tokens[this.pos] || new Token(TokenType.EOF, '', 0, 0)
  }

  /**
   * Get the next token without advancing
   */
  private peekNext(): Token {
    return this.tokens[this.pos + 1] || new Token(TokenType.EOF, '', 0, 0)
  }

  /**
   * Advance to the next token and return the current one
   */
  private advance(): Token {
    if (!this.isAtEnd()) {
      return this.tokens[this.pos++]
    }
    return this.peek()
  }

  /**
   * Check if current token matches the expected type
   */
  private check(type: TokenType): boolean {
    return this.peek().type === type
  }

  /**
   * Consume current token if it matches, otherwise throw error
   */
  private expect(type: TokenType, message?: string): Token {
    if (this.check(type)) {
      return this.advance()
    }
    const token = this.peek()
    throw new ParserError(
      message || `Expected ${type}, got ${token.type}`,
      token.line,
      token.column
    )
  }

  /**
   * Match and consume if current token is of expected type
   */
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance()
        return true
      }
    }
    return false
  }

  /**
   * Parse a single clause
   */
  private parseClause(): Clause | null {
    if (this.check(TokenType.MATCH)) {
      return this.parseMatchClause()
    }
    if (this.check(TokenType.OPTIONAL)) {
      return this.parseOptionalMatchClause()
    }
    if (this.check(TokenType.WHERE)) {
      return this.parseWhereClause()
    }
    if (this.check(TokenType.RETURN)) {
      return this.parseReturnClause()
    }
    if (this.check(TokenType.CREATE)) {
      return this.parseCreateClause()
    }
    if (this.check(TokenType.MERGE)) {
      return this.parseMergeClause()
    }
    if (this.check(TokenType.SET)) {
      return this.parseSetClause()
    }
    if (this.check(TokenType.REMOVE)) {
      return this.parseRemoveClause()
    }
    if (this.check(TokenType.DELETE)) {
      return this.parseDeleteClause()
    }
    if (this.check(TokenType.DETACH)) {
      return this.parseDetachDeleteClause()
    }
    if (this.check(TokenType.UNWIND)) {
      return this.parseUnwindClause()
    }
    if (this.check(TokenType.CALL)) {
      return this.parseCallClause()
    }
    if (this.check(TokenType.UNION)) {
      return this.parseUnionClause()
    }

    // Skip unknown tokens (shouldn't happen with valid Cypher)
    if (!this.isAtEnd()) {
      const token = this.peek()
      throw new ParserError(
        `Unexpected token ${token.type}: ${token.value}`,
        token.line,
        token.column
      )
    }

    return null
  }

  /**
   * Parse MATCH clause
   */
  private parseMatchClause(): MatchClause {
    this.expect(TokenType.MATCH)
    const pattern = this.parsePattern()

    let where: Expression | undefined
    if (this.check(TokenType.WHERE)) {
      this.advance()
      where = this.parseExpression()
    }

    return {
      type: 'MatchClause',
      optional: false,
      pattern,
      where,
    }
  }

  /**
   * Parse OPTIONAL MATCH clause
   */
  private parseOptionalMatchClause(): MatchClause {
    this.expect(TokenType.OPTIONAL)
    this.expect(TokenType.MATCH)
    const pattern = this.parsePattern()

    let where: Expression | undefined
    if (this.check(TokenType.WHERE)) {
      this.advance()
      where = this.parseExpression()
    }

    return {
      type: 'MatchClause',
      optional: true,
      pattern,
      where,
    }
  }

  /**
   * Parse standalone WHERE clause
   */
  private parseWhereClause(): WhereClause {
    this.expect(TokenType.WHERE)
    const expression = this.parseExpression()

    return {
      type: 'WhereClause',
      expression,
    }
  }

  /**
   * Parse RETURN clause
   */
  private parseReturnClause(): ReturnClause {
    this.expect(TokenType.RETURN)
    const items: ReturnItem[] = []

    // Parse first return item
    items.push(this.parseReturnItem())

    // Parse remaining return items
    while (this.match(TokenType.COMMA)) {
      items.push(this.parseReturnItem())
    }

    return {
      type: 'ReturnClause',
      distinct: false,
      items,
    }
  }

  /**
   * Parse a single return item
   */
  private parseReturnItem(): ReturnItem {
    const expression = this.parseExpression()

    // Check for AS alias
    let alias: string | undefined
    if (this.peek().type === TokenType.IDENTIFIER &&
        this.peek().value.toUpperCase() === 'AS') {
      this.advance() // consume AS
      const aliasToken = this.expect(TokenType.IDENTIFIER, 'Expected alias after AS')
      alias = aliasToken.value
    }

    return {
      type: 'ReturnItem',
      expression,
      alias,
    }
  }

  /**
   * Parse a pattern (sequence of nodes and relationships)
   */
  private parsePattern(): Pattern {
    const elements: PatternElement[] = []

    // Parse the first node
    elements.push(this.parseNodePattern())

    // Parse relationship-node pairs
    while (this.isRelationshipStart()) {
      elements.push(this.parseRelationshipPattern())
      elements.push(this.parseNodePattern())
    }

    return {
      type: 'Pattern',
      elements,
    }
  }

  /**
   * Check if current position starts a relationship pattern
   */
  private isRelationshipStart(): boolean {
    return this.check(TokenType.DASH) || this.check(TokenType.ARROW_LEFT)
  }

  /**
   * Parse a node pattern like (n), (n:Label), (n {prop: value})
   */
  private parseNodePattern(): NodePattern {
    this.expect(TokenType.LPAREN)

    let variable: string | undefined
    const labels: string[] = []
    let properties: MapLiteral | undefined

    // Parse optional variable
    if (this.check(TokenType.IDENTIFIER)) {
      variable = this.advance().value
    }

    // Parse optional labels
    while (this.check(TokenType.COLON)) {
      this.advance()
      const labelToken = this.expect(TokenType.IDENTIFIER, 'Expected label name after :')
      labels.push(labelToken.value)
    }

    // Parse optional properties
    if (this.check(TokenType.LBRACE)) {
      properties = this.parseMapLiteral()
    }

    this.expect(TokenType.RPAREN)

    return {
      type: 'NodePattern',
      variable,
      labels,
      properties,
    }
  }

  /**
   * Parse a relationship pattern like -[:TYPE]->, <-[:TYPE]-
   */
  private parseRelationshipPattern(): RelationshipPattern {
    let direction: 'LEFT' | 'RIGHT' | 'BOTH' | 'NONE' = 'NONE'
    let variable: string | undefined
    const types: string[] = []
    let properties: MapLiteral | undefined

    // Parse left arrow
    if (this.match(TokenType.ARROW_LEFT)) {
      direction = 'LEFT'
    } else {
      this.expect(TokenType.DASH)
    }

    // Parse relationship details if present
    if (this.check(TokenType.LBRACKET)) {
      this.advance()

      // Parse optional variable
      if (this.check(TokenType.IDENTIFIER)) {
        variable = this.advance().value
      }

      // Parse optional type(s)
      while (this.check(TokenType.COLON)) {
        this.advance()
        const typeToken = this.expect(TokenType.IDENTIFIER, 'Expected relationship type after :')
        types.push(typeToken.value)

        // Handle OR types (|)
        while (this.match(TokenType.PIPE)) {
          if (this.check(TokenType.COLON)) {
            this.advance()
          }
          const nextType = this.expect(TokenType.IDENTIFIER, 'Expected relationship type after |')
          types.push(nextType.value)
        }
      }

      // Parse optional properties
      if (this.check(TokenType.LBRACE)) {
        properties = this.parseMapLiteral()
      }

      this.expect(TokenType.RBRACKET)
    }

    // Parse right side
    if (this.match(TokenType.ARROW_RIGHT)) {
      if (direction === 'LEFT') {
        direction = 'BOTH'
      } else {
        direction = 'RIGHT'
      }
    } else {
      this.expect(TokenType.DASH)
      if (direction === 'LEFT') {
        // <-- (already set to LEFT)
      }
    }

    return {
      type: 'RelationshipPattern',
      variable,
      types,
      properties,
      direction,
    }
  }

  /**
   * Parse a map literal like {name: 'Alice', age: 30}
   */
  private parseMapLiteral(): MapLiteral {
    this.expect(TokenType.LBRACE)
    const entries: MapEntry[] = []

    if (!this.check(TokenType.RBRACE)) {
      // Parse first entry
      entries.push(this.parseMapEntry())

      // Parse remaining entries
      while (this.match(TokenType.COMMA)) {
        entries.push(this.parseMapEntry())
      }
    }

    this.expect(TokenType.RBRACE)

    return {
      type: 'MapLiteral',
      entries,
    }
  }

  /**
   * Parse a single map entry like name: 'Alice'
   */
  private parseMapEntry(): MapEntry {
    const keyToken = this.expect(TokenType.IDENTIFIER, 'Expected property key')
    this.expect(TokenType.COLON, 'Expected : after property key')
    const value = this.parseExpression()

    return {
      key: keyToken.value,
      value,
    }
  }

  /**
   * Parse an expression (with operator precedence)
   */
  private parseExpression(): Expression {
    return this.parseOrExpression()
  }

  /**
   * Parse OR expression
   */
  private parseOrExpression(): Expression {
    let left = this.parseXorExpression()

    while (this.match(TokenType.OR)) {
      const right = this.parseXorExpression()
      left = {
        type: 'BinaryExpression',
        operator: 'OR' as BinaryOperator,
        left,
        right,
      }
    }

    return left
  }

  /**
   * Parse XOR expression
   */
  private parseXorExpression(): Expression {
    let left = this.parseAndExpression()

    while (this.match(TokenType.XOR)) {
      const right = this.parseAndExpression()
      left = {
        type: 'BinaryExpression',
        operator: 'XOR' as BinaryOperator,
        left,
        right,
      }
    }

    return left
  }

  /**
   * Parse AND expression
   */
  private parseAndExpression(): Expression {
    let left = this.parseNotExpression()

    while (this.match(TokenType.AND)) {
      const right = this.parseNotExpression()
      left = {
        type: 'BinaryExpression',
        operator: 'AND' as BinaryOperator,
        left,
        right,
      }
    }

    return left
  }

  /**
   * Parse NOT expression
   */
  private parseNotExpression(): Expression {
    if (this.match(TokenType.NOT)) {
      const operand = this.parseNotExpression()
      return {
        type: 'UnaryExpression',
        operator: 'NOT',
        operand,
      }
    }

    return this.parseComparisonExpression()
  }

  /**
   * Parse comparison expression
   */
  private parseComparisonExpression(): Expression {
    let left = this.parseAddExpression()

    while (true) {
      let operator: BinaryOperator | null = null

      if (this.match(TokenType.EQUALS)) {
        operator = '='
      } else if (this.match(TokenType.NOT_EQUALS)) {
        operator = '<>'
      } else if (this.match(TokenType.LT)) {
        operator = '<'
      } else if (this.match(TokenType.GT)) {
        operator = '>'
      } else if (this.match(TokenType.LTE)) {
        operator = '<='
      } else if (this.match(TokenType.GTE)) {
        operator = '>='
      } else if (this.match(TokenType.IN)) {
        operator = 'IN'
      } else {
        break
      }

      const right = this.parseAddExpression()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
      }
    }

    // Handle IS NULL / IS NOT NULL
    if (this.match(TokenType.IS)) {
      if (this.match(TokenType.NOT)) {
        this.expect(TokenType.NULL, 'Expected NULL after IS NOT')
        return {
          type: 'UnaryExpression',
          operator: 'IS NOT NULL',
          operand: left,
        }
      } else {
        this.expect(TokenType.NULL, 'Expected NULL after IS')
        return {
          type: 'UnaryExpression',
          operator: 'IS NULL',
          operand: left,
        }
      }
    }

    return left
  }

  /**
   * Parse addition/subtraction expression
   */
  private parseAddExpression(): Expression {
    let left = this.parseMultExpression()

    while (true) {
      let operator: BinaryOperator | null = null

      if (this.match(TokenType.PLUS)) {
        operator = '+'
      } else if (this.match(TokenType.DASH)) {
        operator = '-'
      } else {
        break
      }

      const right = this.parseMultExpression()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
      }
    }

    return left
  }

  /**
   * Parse multiplication/division expression
   */
  private parseMultExpression(): Expression {
    let left = this.parseUnaryExpression()

    while (true) {
      let operator: BinaryOperator | null = null

      if (this.match(TokenType.STAR)) {
        operator = '*'
      } else if (this.match(TokenType.SLASH)) {
        operator = '/'
      } else if (this.match(TokenType.PERCENT)) {
        operator = '%'
      } else {
        break
      }

      const right = this.parseUnaryExpression()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
      }
    }

    return left
  }

  /**
   * Parse unary expression (-, +)
   */
  private parseUnaryExpression(): Expression {
    if (this.match(TokenType.DASH)) {
      const operand = this.parseUnaryExpression()
      return {
        type: 'UnaryExpression',
        operator: '-',
        operand,
      }
    }
    if (this.match(TokenType.PLUS)) {
      const operand = this.parseUnaryExpression()
      return {
        type: 'UnaryExpression',
        operator: '+',
        operand,
      }
    }

    return this.parsePowerExpression()
  }

  /**
   * Parse power expression
   */
  private parsePowerExpression(): Expression {
    let left = this.parsePropertyAccess()

    if (this.match(TokenType.CARET)) {
      const right = this.parseUnaryExpression()
      left = {
        type: 'BinaryExpression',
        operator: '^' as BinaryOperator,
        left,
        right,
      }
    }

    return left
  }

  /**
   * Parse property access expression
   */
  private parsePropertyAccess(): Expression {
    let expr = this.parsePrimaryExpression()

    while (this.check(TokenType.DOT)) {
      this.advance()
      const propToken = this.expect(TokenType.IDENTIFIER, 'Expected property name after .')
      expr = {
        type: 'PropertyAccess',
        object: expr,
        property: propToken.value,
      }
    }

    return expr
  }

  /**
   * Parse primary expression (literals, identifiers, function calls, etc.)
   */
  private parsePrimaryExpression(): Expression {
    // Integer literal
    if (this.check(TokenType.INTEGER)) {
      const token = this.advance()
      return {
        type: 'IntegerLiteral',
        value: parseInt(token.value, 10),
      }
    }

    // Float literal
    if (this.check(TokenType.FLOAT)) {
      const token = this.advance()
      return {
        type: 'FloatLiteral',
        value: parseFloat(token.value),
      }
    }

    // String literal
    if (this.check(TokenType.STRING)) {
      const token = this.advance()
      return {
        type: 'StringLiteral',
        value: token.value,
      }
    }

    // Boolean literals
    if (this.match(TokenType.TRUE)) {
      return {
        type: 'BooleanLiteral',
        value: true,
      }
    }
    if (this.match(TokenType.FALSE)) {
      return {
        type: 'BooleanLiteral',
        value: false,
      }
    }

    // NULL literal
    if (this.match(TokenType.NULL)) {
      return {
        type: 'NullLiteral',
      }
    }

    // Parameter
    if (this.check(TokenType.PARAMETER)) {
      const token = this.advance()
      return {
        type: 'Parameter',
        name: token.value,
      }
    }

    // List literal
    if (this.check(TokenType.LBRACKET)) {
      return this.parseListLiteral()
    }

    // Map literal
    if (this.check(TokenType.LBRACE)) {
      return this.parseMapLiteral()
    }

    // Parenthesized expression
    if (this.check(TokenType.LPAREN)) {
      this.advance()
      const expr = this.parseExpression()
      this.expect(TokenType.RPAREN, 'Expected ) after expression')
      return expr
    }

    // Star (*) as wildcard - used in count(*)
    if (this.check(TokenType.STAR)) {
      this.advance()
      return {
        type: 'Variable',
        name: '*',
      }
    }

    // Identifier or function call
    if (this.check(TokenType.IDENTIFIER)) {
      const token = this.advance()

      // Check if it's a function call
      if (this.check(TokenType.LPAREN)) {
        return this.parseFunctionCall(token.value)
      }

      // Otherwise it's a variable reference
      return {
        type: 'Variable',
        name: token.value,
      }
    }

    // Unexpected token
    const token = this.peek()
    throw new ParserError(
      `Unexpected token in expression: ${token.type} (${token.value})`,
      token.line,
      token.column
    )
  }

  /**
   * Parse a list literal like [1, 2, 3]
   */
  private parseListLiteral(): ListExpression {
    this.expect(TokenType.LBRACKET)
    const elements: Expression[] = []

    if (!this.check(TokenType.RBRACKET)) {
      // Parse first element
      elements.push(this.parseExpression())

      // Parse remaining elements
      while (this.match(TokenType.COMMA)) {
        elements.push(this.parseExpression())
      }
    }

    this.expect(TokenType.RBRACKET)

    return {
      type: 'ListExpression',
      elements,
    }
  }

  /**
   * Parse a function call like count(n), collect(n.name)
   */
  private parseFunctionCall(name: string): FunctionCall {
    this.expect(TokenType.LPAREN)
    const args: Expression[] = []

    if (!this.check(TokenType.RPAREN)) {
      // Handle DISTINCT in aggregate functions
      let distinct = false
      if (this.peek().type === TokenType.IDENTIFIER &&
          this.peek().value.toUpperCase() === 'DISTINCT') {
        this.advance()
        distinct = true
      }

      // Parse first argument
      args.push(this.parseExpression())

      // Parse remaining arguments
      while (this.match(TokenType.COMMA)) {
        args.push(this.parseExpression())
      }

      this.expect(TokenType.RPAREN)

      return {
        type: 'FunctionCall',
        name,
        arguments: args,
        distinct,
      }
    }

    this.expect(TokenType.RPAREN)

    return {
      type: 'FunctionCall',
      name,
      arguments: args,
    }
  }

  /**
   * Parse CREATE clause
   * Syntax: CREATE pattern
   */
  private parseCreateClause(): CreateClause {
    this.expect(TokenType.CREATE)
    const pattern = this.parsePattern()

    return {
      type: 'CreateClause',
      pattern,
    }
  }

  /**
   * Parse MERGE clause
   * Syntax: MERGE pattern [ON CREATE SET ...] [ON MATCH SET ...]
   */
  private parseMergeClause(): MergeClause {
    this.expect(TokenType.MERGE)
    const pattern = this.parsePattern()

    let onCreate: SetClause[] | undefined
    let onMatch: SetClause[] | undefined

    // Parse ON CREATE and ON MATCH clauses
    while (this.check(TokenType.ON)) {
      this.advance() // consume ON

      if (this.check(TokenType.CREATE)) {
        this.advance() // consume CREATE
        if (!onCreate) {
          onCreate = []
        }
        onCreate.push(this.parseSetClause())
      } else if (this.check(TokenType.MATCH)) {
        this.advance() // consume MATCH
        if (!onMatch) {
          onMatch = []
        }
        onMatch.push(this.parseSetClause())
      } else {
        const token = this.peek()
        throw new ParserError(
          `Expected CREATE or MATCH after ON, got ${token.type}`,
          token.line,
          token.column
        )
      }
    }

    return {
      type: 'MergeClause',
      pattern,
      onCreate,
      onMatch,
    }
  }

  /**
   * Parse DELETE clause
   * DELETE n, r, ...
   */
  private parseDeleteClause(): DeleteClause {
    this.expect(TokenType.DELETE)
    const expressions: Expression[] = []

    // Parse first expression to delete
    expressions.push(this.parseExpression())

    // Parse remaining expressions
    while (this.match(TokenType.COMMA)) {
      expressions.push(this.parseExpression())
    }

    return {
      type: 'DeleteClause',
      detach: false,
      expressions,
    }
  }

  /**
   * Parse DETACH DELETE clause
   * DETACH DELETE n, r, ...
   */
  private parseDetachDeleteClause(): DeleteClause {
    this.expect(TokenType.DETACH)
    this.expect(TokenType.DELETE)
    const expressions: Expression[] = []

    // Parse first expression to delete
    expressions.push(this.parseExpression())

    // Parse remaining expressions
    while (this.match(TokenType.COMMA)) {
      expressions.push(this.parseExpression())
    }

    return {
      type: 'DeleteClause',
      detach: true,
      expressions,
    }
  }

  /**
   * Parse UNWIND clause
   * UNWIND expression AS variable
   */
  private parseUnwindClause(): UnwindClause {
    this.expect(TokenType.UNWIND)
    const expression = this.parseExpression()

    // Expect AS keyword
    if (this.peek().type !== TokenType.IDENTIFIER ||
        this.peek().value.toUpperCase() !== 'AS') {
      const token = this.peek()
      throw new ParserError(
        'Expected AS after UNWIND expression',
        token.line,
        token.column
      )
    }
    this.advance() // consume AS

    const aliasToken = this.expect(TokenType.IDENTIFIER, 'Expected variable name after AS')

    return {
      type: 'UnwindClause',
      expression,
      alias: aliasToken.value,
    }
  }

  /**
   * Parse SET clause
   * SET n.prop = value, n:Label, n = {props}, n += {props}
   */
  private parseSetClause(): SetClause {
    this.expect(TokenType.SET)
    const items: SetItem[] = []

    // Parse first set item
    items.push(this.parseSetItem())

    // Parse remaining set items
    while (this.match(TokenType.COMMA)) {
      items.push(this.parseSetItem())
    }

    return {
      type: 'SetClause',
      items,
    }
  }

  /**
   * Parse a single SET item
   * - n.prop = value (property assignment)
   * - n:Label or n:Label1:Label2 (label assignment)
   * - n = {props} (replace all properties)
   * - n += {props} (merge properties)
   */
  private parseSetItem(): SetItem {
    // Must start with an identifier (variable)
    const varToken = this.expect(TokenType.IDENTIFIER, 'Expected variable in SET')
    const variable = varToken.value

    // Check what follows the variable
    if (this.check(TokenType.COLON)) {
      // Label assignment: SET n:Label or SET n:Label1:Label2
      const labels: string[] = []
      while (this.match(TokenType.COLON)) {
        const labelToken = this.expect(TokenType.IDENTIFIER, 'Expected label name after :')
        labels.push(labelToken.value)
      }

      return {
        type: 'LabelSetItem',
        variable,
        labels,
      } as LabelSetItem
    }

    if (this.check(TokenType.DOT)) {
      // Property assignment: SET n.prop = value
      this.advance() // consume .
      const propToken = this.expect(TokenType.IDENTIFIER, 'Expected property name after .')

      // Build the PropertyAccess
      let propertyAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: { type: 'Variable', name: variable } as Variable,
        property: propToken.value,
      }

      // Handle nested property access like n.address.city
      while (this.check(TokenType.DOT)) {
        this.advance()
        const nextProp = this.expect(TokenType.IDENTIFIER, 'Expected property name after .')
        propertyAccess = {
          type: 'PropertyAccess',
          object: propertyAccess,
          property: nextProp.value,
        }
      }

      this.expect(TokenType.EQUALS, 'Expected = after property in SET')
      const expression = this.parseExpression()

      return {
        type: 'PropertySetItem',
        property: propertyAccess,
        expression,
      } as PropertySetItem
    }

    if (this.check(TokenType.EQUALS)) {
      // Replace properties: SET n = {props}
      this.advance() // consume =
      const expression = this.parseExpression()

      return {
        type: 'ReplacePropertiesItem',
        variable,
        expression,
      } as ReplacePropertiesItem
    }

    if (this.check(TokenType.PLUS)) {
      // Merge properties: SET n += {props}
      this.advance() // consume +
      this.expect(TokenType.EQUALS, 'Expected = after + in SET')
      const expression = this.parseExpression()

      return {
        type: 'MergePropertiesItem',
        variable,
        expression,
      } as MergePropertiesItem
    }

    const token = this.peek()
    throw new ParserError(
      `Expected :, ., =, or += after variable in SET, got ${token.type}`,
      token.line,
      token.column
    )
  }

  /**
   * Parse REMOVE clause
   * REMOVE n.prop, n:Label
   */
  private parseRemoveClause(): RemoveClause {
    this.expect(TokenType.REMOVE)
    const items: RemoveItem[] = []

    // Parse first remove item
    items.push(this.parseRemoveItem())

    // Parse remaining remove items
    while (this.match(TokenType.COMMA)) {
      items.push(this.parseRemoveItem())
    }

    return {
      type: 'RemoveClause',
      items,
    }
  }

  /**
   * Parse a single REMOVE item
   * - n.prop (property removal)
   * - n:Label or n:Label1:Label2 (label removal)
   */
  private parseRemoveItem(): RemoveItem {
    // Must start with an identifier (variable)
    const varToken = this.expect(TokenType.IDENTIFIER, 'Expected variable in REMOVE')
    const variable = varToken.value

    // Check what follows the variable
    if (this.check(TokenType.COLON)) {
      // Label removal: REMOVE n:Label or REMOVE n:Label1:Label2
      const labels: string[] = []
      while (this.match(TokenType.COLON)) {
        const labelToken = this.expect(TokenType.IDENTIFIER, 'Expected label name after :')
        labels.push(labelToken.value)
      }

      return {
        type: 'LabelRemoveItem',
        variable,
        labels,
      } as LabelRemoveItem
    }

    if (this.check(TokenType.DOT)) {
      // Property removal: REMOVE n.prop
      this.advance() // consume .
      const propToken = this.expect(TokenType.IDENTIFIER, 'Expected property name after .')

      // Build the PropertyAccess
      let propertyAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: { type: 'Variable', name: variable } as Variable,
        property: propToken.value,
      }

      // Handle nested property access like n.address.city
      while (this.check(TokenType.DOT)) {
        this.advance()
        const nextProp = this.expect(TokenType.IDENTIFIER, 'Expected property name after .')
        propertyAccess = {
          type: 'PropertyAccess',
          object: propertyAccess,
          property: nextProp.value,
        }
      }

      return {
        type: 'PropertyRemoveItem',
        property: propertyAccess,
      } as PropertyRemoveItem
    }

    const token = this.peek()
    throw new ParserError(
      `Expected : or . after variable in REMOVE, got ${token.type}`,
      token.line,
      token.column
    )
  }

  /**
   * Parse CALL clause
   * CALL db.labels() YIELD label WHERE label STARTS WITH 'A'
   * CALL { MATCH (n) RETURN n }
   */
  private parseCallClause(): CallClause {
    this.expect(TokenType.CALL)

    // Check for subquery: CALL { ... }
    if (this.check(TokenType.LBRACE)) {
      // Subquery - for now throw an error, can be implemented later
      const token = this.peek()
      throw new ParserError(
        'CALL subqueries are not yet supported',
        token.line,
        token.column
      )
    }

    // Parse procedure name (namespace.name format)
    const procedure: string[] = []
    const firstPart = this.expect(TokenType.IDENTIFIER, 'Expected procedure name')
    procedure.push(firstPart.value)

    // Parse additional namespace parts
    while (this.check(TokenType.DOT)) {
      this.advance()
      const part = this.expect(TokenType.IDENTIFIER, 'Expected procedure name part')
      procedure.push(part.value)
    }

    // Parse arguments: ()
    const args: Expression[] = []
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        args.push(this.parseExpression())
        while (this.match(TokenType.COMMA)) {
          args.push(this.parseExpression())
        }
      }
      this.expect(TokenType.RPAREN)
    }

    // Parse YIELD clause
    let yieldItems: YieldItem[] | undefined
    let where: Expression | undefined

    if (this.check(TokenType.YIELD)) {
      this.advance()
      yieldItems = []

      // Parse first yield item
      yieldItems.push(this.parseYieldItem())

      // Parse remaining yield items
      while (this.match(TokenType.COMMA)) {
        yieldItems.push(this.parseYieldItem())
      }

      // Parse optional WHERE after YIELD
      if (this.check(TokenType.WHERE)) {
        this.advance()
        where = this.parseExpression()
      }
    }

    return {
      type: 'CallClause',
      procedure,
      arguments: args,
      yield: yieldItems,
      where,
    }
  }

  /**
   * Parse a single YIELD item
   * name or name AS alias
   */
  private parseYieldItem(): YieldItem {
    const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected yield variable name')

    let alias: string | undefined
    if (this.check(TokenType.IDENTIFIER) && this.peek().value.toUpperCase() === 'AS') {
      this.advance() // consume AS
      const aliasToken = this.expect(TokenType.IDENTIFIER, 'Expected alias after AS')
      alias = aliasToken.value
    }

    return {
      type: 'YieldItem',
      name: nameToken.value,
      alias,
    }
  }

  /**
   * Parse UNION clause
   * UNION or UNION ALL
   */
  private parseUnionClause(): UnionClause {
    this.expect(TokenType.UNION)

    const all = this.check(TokenType.ALL)
    if (all) {
      this.advance()
    }

    return {
      type: 'UnionClause',
      all,
    }
  }
}
