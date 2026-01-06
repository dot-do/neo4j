import { describe, it, expect } from 'vitest'
import {
  isExpressionVariable,
  isPropertyAccess,
  isNodeRecord,
} from '../ast/type-guards'
import type {
  Expression,
  Variable,
  PropertyAccess,
  IntegerLiteral,
  StringLiteral,
  FunctionCall,
  BinaryExpression,
} from '../ast/types'

/**
 * RED TDD tests for type guard helper functions.
 *
 * These type guards will enable better type narrowing in switch statements
 * without needing manual casts like `expr as Variable`.
 *
 * Current pattern in graph-do.ts (lines 1072-1099):
 * ```typescript
 * switch (expr.type) {
 *   case 'Variable': {
 *     const varExpr = expr as Variable  // Cast instead of guard
 *     // ...
 *   }
 * }
 * ```
 *
 * Expected pattern with type guards:
 * ```typescript
 * if (isExpressionVariable(expr)) {
 *   // expr is now narrowed to Variable type
 *   console.log(expr.name)  // No cast needed
 * }
 * ```
 */

describe('Type Guards', () => {
  describe('isExpressionVariable', () => {
    it('should return true for Variable expressions', () => {
      const variable: Variable = {
        type: 'Variable',
        name: 'n',
      }

      expect(isExpressionVariable(variable)).toBe(true)
    })

    it('should return false for non-Variable expressions', () => {
      const literal: IntegerLiteral = {
        type: 'IntegerLiteral',
        value: 42,
      }

      expect(isExpressionVariable(literal)).toBe(false)
    })

    it('should return false for PropertyAccess expressions', () => {
      const variable: Variable = {
        type: 'Variable',
        name: 'n',
      }
      const propertyAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: variable,
        property: 'name',
      }

      expect(isExpressionVariable(propertyAccess)).toBe(false)
    })

    it('should narrow type correctly in conditional', () => {
      const expr: Expression = {
        type: 'Variable',
        name: 'testVar',
      } as Variable

      if (isExpressionVariable(expr)) {
        // TypeScript should narrow expr to Variable type here
        // This test verifies the type guard signature is correct
        expect(expr.name).toBe('testVar')
      } else {
        // This should not execute
        expect(true).toBe(false)
      }
    })
  })

  describe('isPropertyAccess', () => {
    it('should return true for PropertyAccess expressions', () => {
      const variable: Variable = {
        type: 'Variable',
        name: 'n',
      }
      const propertyAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: variable,
        property: 'name',
      }

      expect(isPropertyAccess(propertyAccess)).toBe(true)
    })

    it('should return false for Variable expressions', () => {
      const variable: Variable = {
        type: 'Variable',
        name: 'n',
      }

      expect(isPropertyAccess(variable)).toBe(false)
    })

    it('should return false for literal expressions', () => {
      const literal: StringLiteral = {
        type: 'StringLiteral',
        value: 'test',
      }

      expect(isPropertyAccess(literal)).toBe(false)
    })

    it('should narrow type correctly in conditional', () => {
      const variable: Variable = {
        type: 'Variable',
        name: 'person',
      }
      const expr: Expression = {
        type: 'PropertyAccess',
        object: variable,
        property: 'age',
      } as PropertyAccess

      if (isPropertyAccess(expr)) {
        // TypeScript should narrow expr to PropertyAccess type here
        expect(expr.property).toBe('age')
        expect(expr.object).toBeDefined()
      } else {
        // This should not execute
        expect(true).toBe(false)
      }
    })

    it('should work with nested property access', () => {
      const variable: Variable = {
        type: 'Variable',
        name: 'user',
      }
      const innerAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: variable,
        property: 'address',
      }
      const outerAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: innerAccess,
        property: 'city',
      }

      expect(isPropertyAccess(outerAccess)).toBe(true)
      if (isPropertyAccess(outerAccess)) {
        expect(outerAccess.property).toBe('city')
        // The object is also a PropertyAccess
        expect(isPropertyAccess(outerAccess.object)).toBe(true)
      }
    })
  })

  describe('isNodeRecord', () => {
    it('should return true for valid node records', () => {
      const nodeRecord = {
        id: 1,
        labels: ['Person'],
        properties: { name: 'Alice' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      expect(isNodeRecord(nodeRecord)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isNodeRecord(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isNodeRecord(undefined)).toBe(false)
    })

    it('should return false for primitives', () => {
      expect(isNodeRecord(42)).toBe(false)
      expect(isNodeRecord('string')).toBe(false)
      expect(isNodeRecord(true)).toBe(false)
    })

    it('should return false for objects missing required fields', () => {
      // Missing labels
      expect(
        isNodeRecord({
          id: 1,
          properties: {},
        })
      ).toBe(false)

      // Missing id
      expect(
        isNodeRecord({
          labels: ['Person'],
          properties: {},
        })
      ).toBe(false)

      // Missing properties
      expect(
        isNodeRecord({
          id: 1,
          labels: ['Person'],
        })
      ).toBe(false)
    })

    it('should return false for objects with wrong field types', () => {
      // id is string instead of number
      expect(
        isNodeRecord({
          id: '1',
          labels: ['Person'],
          properties: {},
        })
      ).toBe(false)

      // labels is string instead of array
      expect(
        isNodeRecord({
          id: 1,
          labels: 'Person',
          properties: {},
        })
      ).toBe(false)

      // properties is not an object
      expect(
        isNodeRecord({
          id: 1,
          labels: ['Person'],
          properties: 'invalid',
        })
      ).toBe(false)
    })

    it('should narrow type correctly in conditional', () => {
      const data: unknown = {
        id: 42,
        labels: ['User', 'Admin'],
        properties: { email: 'admin@example.com' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      if (isNodeRecord(data)) {
        // TypeScript should narrow data to Node type here
        expect(data.id).toBe(42)
        expect(data.labels).toContain('User')
        expect(data.properties.email).toBe('admin@example.com')
      } else {
        // This should not execute
        expect(true).toBe(false)
      }
    })
  })

  describe('type narrowing in switch statements', () => {
    it('should work with isExpressionVariable in switch alternative', () => {
      const expressions: Expression[] = [
        { type: 'Variable', name: 'x' } as Variable,
        { type: 'IntegerLiteral', value: 10 } as IntegerLiteral,
        {
          type: 'PropertyAccess',
          object: { type: 'Variable', name: 'n' } as Variable,
          property: 'name',
        } as PropertyAccess,
      ]

      const variableNames: string[] = []

      for (const expr of expressions) {
        if (isExpressionVariable(expr)) {
          variableNames.push(expr.name)
        }
      }

      expect(variableNames).toEqual(['x'])
    })

    it('should work with isPropertyAccess in switch alternative', () => {
      const expressions: Expression[] = [
        { type: 'Variable', name: 'x' } as Variable,
        {
          type: 'PropertyAccess',
          object: { type: 'Variable', name: 'n' } as Variable,
          property: 'name',
        } as PropertyAccess,
        {
          type: 'PropertyAccess',
          object: { type: 'Variable', name: 'm' } as Variable,
          property: 'age',
        } as PropertyAccess,
      ]

      const propertyNames: string[] = []

      for (const expr of expressions) {
        if (isPropertyAccess(expr)) {
          propertyNames.push(expr.property)
        }
      }

      expect(propertyNames).toEqual(['name', 'age'])
    })

    it('should enable exhaustive type checking pattern', () => {
      // This test demonstrates how type guards can be used for
      // exhaustive checking in a functional style
      const getExpressionDescription = (expr: Expression): string => {
        if (isExpressionVariable(expr)) {
          return `Variable: ${expr.name}`
        }
        if (isPropertyAccess(expr)) {
          return `Property: ${expr.property}`
        }
        // For other expression types
        return `Other: ${expr.type}`
      }

      const variable: Variable = { type: 'Variable', name: 'person' }
      const propAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: variable,
        property: 'name',
      }
      const literal: IntegerLiteral = { type: 'IntegerLiteral', value: 42 }

      expect(getExpressionDescription(variable)).toBe('Variable: person')
      expect(getExpressionDescription(propAccess)).toBe('Property: name')
      expect(getExpressionDescription(literal)).toBe('Other: IntegerLiteral')
    })

    it('should work with combined guards for complex validation', () => {
      // Test that guards can be combined for complex conditions
      const isSimplePropertyAccess = (expr: Expression): boolean => {
        return isPropertyAccess(expr) && isExpressionVariable(expr.object)
      }

      const variable: Variable = { type: 'Variable', name: 'n' }
      const simpleAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: variable,
        property: 'name',
      }
      const nestedAccess: PropertyAccess = {
        type: 'PropertyAccess',
        object: simpleAccess,
        property: 'length',
      }

      expect(isSimplePropertyAccess(simpleAccess)).toBe(true)
      expect(isSimplePropertyAccess(nestedAccess)).toBe(false)
      expect(isSimplePropertyAccess(variable)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle FunctionCall expressions correctly', () => {
      const funcCall: FunctionCall = {
        type: 'FunctionCall',
        name: 'count',
        arguments: [{ type: 'Variable', name: 'n' } as Variable],
      }

      expect(isExpressionVariable(funcCall)).toBe(false)
      expect(isPropertyAccess(funcCall)).toBe(false)
    })

    it('should handle BinaryExpression correctly', () => {
      const binaryExpr: BinaryExpression = {
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'IntegerLiteral', value: 1 } as IntegerLiteral,
        right: { type: 'IntegerLiteral', value: 2 } as IntegerLiteral,
      }

      expect(isExpressionVariable(binaryExpr)).toBe(false)
      expect(isPropertyAccess(binaryExpr)).toBe(false)
    })

    it('should handle empty node record-like objects', () => {
      // Object has correct structure but empty arrays/objects
      const emptyNode = {
        id: 0,
        labels: [],
        properties: {},
        createdAt: '',
        updatedAt: '',
      }

      // Should still be valid - empty arrays and objects are valid
      expect(isNodeRecord(emptyNode)).toBe(true)
    })
  })
})
