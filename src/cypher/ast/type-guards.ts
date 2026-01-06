/**
 * Type guard helper functions for AST and storage types.
 *
 * These type guards enable better type narrowing without manual casts.
 *
 * Example usage:
 * ```typescript
 * if (isExpressionVariable(expr)) {
 *   // expr is now narrowed to Variable type
 *   console.log(expr.name)  // No cast needed
 * }
 * ```
 */

import type { Expression, Variable, PropertyAccess } from './types'
import type { Node } from '../../storage/types'

/**
 * Type guard to check if an expression is a Variable.
 *
 * @param expr - The expression to check
 * @returns True if the expression is a Variable, with type narrowing
 */
export function isExpressionVariable(expr: Expression): expr is Variable {
  return expr.type === 'Variable'
}

/**
 * Type guard to check if an expression is a PropertyAccess.
 *
 * @param expr - The expression to check
 * @returns True if the expression is a PropertyAccess, with type narrowing
 */
export function isPropertyAccess(expr: Expression): expr is PropertyAccess {
  return expr.type === 'PropertyAccess'
}

/**
 * Type guard to check if an unknown value is a Node record.
 *
 * Validates that the value has the required structure of a Node:
 * - id: number
 * - labels: string[]
 * - properties: object
 *
 * @param value - The value to check
 * @returns True if the value is a valid Node record, with type narrowing
 */
export function isNodeRecord(value: unknown): value is Node {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>

  // Check for required 'id' field (must be a number)
  if (typeof obj.id !== 'number') {
    return false
  }

  // Check for required 'labels' field (must be an array)
  if (!Array.isArray(obj.labels)) {
    return false
  }

  // Check for required 'properties' field (must be an object, not null)
  if (typeof obj.properties !== 'object' || obj.properties === null) {
    return false
  }

  return true
}
