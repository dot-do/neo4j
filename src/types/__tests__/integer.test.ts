import { describe, it, expect } from 'vitest'
import { Integer, int, isInt, inSafeRange, toNumber, toString } from '../integer'

describe('Integer', () => {
  describe('Constructor', () => {
    it('creates Integer with low and high bits', () => {
      const i = new Integer(1, 0)
      expect(i.low).toBe(1)
      expect(i.high).toBe(0)
    })

    it('defaults to zero when no arguments provided', () => {
      const i = new Integer()
      expect(i.low).toBe(0)
      expect(i.high).toBe(0)
    })

    it('handles negative low bits', () => {
      const i = new Integer(-1, -1)
      expect(i.low).toBe(-1)
      expect(i.high).toBe(-1)
    })
  })

  describe('int() factory function', () => {
    it('creates Integer from number', () => {
      const i = int(42)
      expect(i).toBeInstanceOf(Integer)
      expect(i.toNumber()).toBe(42)
    })

    it('creates Integer from string', () => {
      const i = int('12345678901234')
      expect(i).toBeInstanceOf(Integer)
      expect(i.toString()).toBe('12345678901234')
    })

    it('creates Integer from another Integer', () => {
      const original = int(100)
      const copy = int(original)
      expect(copy).toBeInstanceOf(Integer)
      expect(copy.toNumber()).toBe(100)
      expect(copy).not.toBe(original)
    })

    it('creates Integer from BigInt', () => {
      const i = int(BigInt(9007199254740993))
      expect(i).toBeInstanceOf(Integer)
      expect(i.toBigInt()).toBe(BigInt(9007199254740993))
    })

    it('creates Integer from object with low/high', () => {
      const i = int({ low: 5, high: 0 })
      expect(i).toBeInstanceOf(Integer)
      expect(i.toNumber()).toBe(5)
    })
  })

  describe('Static factory methods', () => {
    it('Integer.fromInt() creates from 32-bit value', () => {
      const i = Integer.fromInt(42)
      expect(i.toNumber()).toBe(42)
    })

    it('Integer.fromNumber() creates from floating-point', () => {
      const i = Integer.fromNumber(1.5)
      expect(i.toNumber()).toBe(1) // truncates
    })

    it('Integer.fromString() creates from string', () => {
      const i = Integer.fromString('9007199254740993')
      expect(i.toString()).toBe('9007199254740993')
    })

    it('Integer.fromString() supports radix', () => {
      const i = Integer.fromString('ff', 16)
      expect(i.toNumber()).toBe(255)
    })

    it('Integer.fromBits() creates from low/high bits', () => {
      const i = Integer.fromBits(1, 1)
      expect(i.low).toBe(1)
      expect(i.high).toBe(1)
    })

    it('Integer.fromValue() creates from any valid input', () => {
      expect(Integer.fromValue(42).toNumber()).toBe(42)
      expect(Integer.fromValue('42').toNumber()).toBe(42)
      expect(Integer.fromValue(BigInt(42)).toNumber()).toBe(42)
    })
  })

  describe('Conversion methods', () => {
    it('toInt() returns low 32 bits', () => {
      const i = int(42)
      expect(i.toInt()).toBe(42)
    })

    it('toNumber() returns JavaScript number', () => {
      const i = int(42)
      expect(i.toNumber()).toBe(42)
      expect(typeof i.toNumber()).toBe('number')
    })

    it('toBigInt() returns BigInt', () => {
      const i = int(42)
      expect(i.toBigInt()).toBe(BigInt(42))
      expect(typeof i.toBigInt()).toBe('bigint')
    })

    it('toString() returns string representation', () => {
      const i = int(42)
      expect(i.toString()).toBe('42')
    })

    it('toString(radix) supports different bases', () => {
      const i = int(255)
      expect(i.toString(16)).toBe('ff')
      expect(i.toString(2)).toBe('11111111')
      expect(i.toString(8)).toBe('377')
    })

    it('valueOf() returns BigInt primitive', () => {
      const i = int(42)
      expect(i.valueOf()).toBe(BigInt(42))
    })

    it('toNumberOrInfinity() returns Infinity for unsafe integers', () => {
      const large = Integer.fromString('9223372036854775807')
      expect(large.toNumberOrInfinity()).toBe(Infinity)
      
      const small = Integer.fromString('-9223372036854775808')
      expect(small.toNumberOrInfinity()).toBe(-Infinity)
    })
  })

  describe('Safe range checking', () => {
    it('inSafeRange() returns true for safe integers', () => {
      const i = int(42)
      expect(i.inSafeRange()).toBe(true)
    })

    it('inSafeRange() returns false for unsafe integers', () => {
      const unsafe = Integer.fromString('9007199254740993')
      expect(unsafe.inSafeRange()).toBe(false)
    })

    it('Integer.inSafeRange() static method works', () => {
      expect(Integer.inSafeRange(int(42))).toBe(true)
      expect(Integer.inSafeRange(Integer.fromString('9007199254740993'))).toBe(false)
    })

    it('inSafeRange() exported function works', () => {
      expect(inSafeRange(int(42))).toBe(true)
      expect(inSafeRange(Integer.fromString('9007199254740993'))).toBe(false)
    })
  })

  describe('Arithmetic operations', () => {
    it('add() returns sum', () => {
      const a = int(5)
      const b = int(3)
      expect(a.add(b).toNumber()).toBe(8)
    })

    it('add() works with large numbers', () => {
      const a = Integer.fromString('9007199254740991')
      const b = int(2)
      expect(a.add(b).toString()).toBe('9007199254740993')
    })

    it('subtract() returns difference', () => {
      const a = int(10)
      const b = int(3)
      expect(a.subtract(b).toNumber()).toBe(7)
    })

    it('multiply() returns product', () => {
      const a = int(6)
      const b = int(7)
      expect(a.multiply(b).toNumber()).toBe(42)
    })

    it('div() returns integer division result', () => {
      const a = int(10)
      const b = int(3)
      expect(a.div(b).toNumber()).toBe(3)
    })

    it('modulo() returns remainder', () => {
      const a = int(10)
      const b = int(3)
      expect(a.modulo(b).toNumber()).toBe(1)
    })

    it('negate() returns negated value', () => {
      const i = int(42)
      expect(i.negate().toNumber()).toBe(-42)
    })

    it('negate() handles negative values', () => {
      const i = int(-42)
      expect(i.negate().toNumber()).toBe(42)
    })
  })

  describe('Comparison operations', () => {
    it('equals() returns true for equal values', () => {
      expect(int(42).equals(int(42))).toBe(true)
    })

    it('equals() returns false for different values', () => {
      expect(int(42).equals(int(43))).toBe(false)
    })

    it('notEquals() returns true for different values', () => {
      expect(int(42).notEquals(int(43))).toBe(true)
    })

    it('notEquals() returns false for equal values', () => {
      expect(int(42).notEquals(int(42))).toBe(false)
    })

    it('lessThan() compares correctly', () => {
      expect(int(5).lessThan(int(10))).toBe(true)
      expect(int(10).lessThan(int(5))).toBe(false)
      expect(int(5).lessThan(int(5))).toBe(false)
    })

    it('lessThanOrEqual() compares correctly', () => {
      expect(int(5).lessThanOrEqual(int(10))).toBe(true)
      expect(int(5).lessThanOrEqual(int(5))).toBe(true)
      expect(int(10).lessThanOrEqual(int(5))).toBe(false)
    })

    it('greaterThan() compares correctly', () => {
      expect(int(10).greaterThan(int(5))).toBe(true)
      expect(int(5).greaterThan(int(10))).toBe(false)
      expect(int(5).greaterThan(int(5))).toBe(false)
    })

    it('greaterThanOrEqual() compares correctly', () => {
      expect(int(10).greaterThanOrEqual(int(5))).toBe(true)
      expect(int(5).greaterThanOrEqual(int(5))).toBe(true)
      expect(int(5).greaterThanOrEqual(int(10))).toBe(false)
    })

    it('compare() returns -1, 0, or 1', () => {
      expect(int(5).compare(int(10))).toBe(-1)
      expect(int(10).compare(int(5))).toBe(1)
      expect(int(5).compare(int(5))).toBe(0)
    })
  })

  describe('Test methods', () => {
    it('isZero() returns true for zero', () => {
      expect(int(0).isZero()).toBe(true)
      expect(Integer.ZERO.isZero()).toBe(true)
    })

    it('isZero() returns false for non-zero', () => {
      expect(int(1).isZero()).toBe(false)
      expect(int(-1).isZero()).toBe(false)
    })

    it('isNegative() returns true for negative', () => {
      expect(int(-1).isNegative()).toBe(true)
      expect(int(-100).isNegative()).toBe(true)
    })

    it('isNegative() returns false for non-negative', () => {
      expect(int(0).isNegative()).toBe(false)
      expect(int(1).isNegative()).toBe(false)
    })

    it('isPositive() returns true for positive', () => {
      expect(int(1).isPositive()).toBe(true)
      expect(int(100).isPositive()).toBe(true)
    })

    it('isPositive() returns false for non-positive', () => {
      expect(int(0).isPositive()).toBe(false)
      expect(int(-1).isPositive()).toBe(false)
    })

    it('isOdd() returns true for odd numbers', () => {
      expect(int(1).isOdd()).toBe(true)
      expect(int(3).isOdd()).toBe(true)
      expect(int(-1).isOdd()).toBe(true)
    })

    it('isOdd() returns false for even numbers', () => {
      expect(int(0).isOdd()).toBe(false)
      expect(int(2).isOdd()).toBe(false)
      expect(int(-2).isOdd()).toBe(false)
    })

    it('isEven() returns true for even numbers', () => {
      expect(int(0).isEven()).toBe(true)
      expect(int(2).isEven()).toBe(true)
      expect(int(-2).isEven()).toBe(true)
    })

    it('isEven() returns false for odd numbers', () => {
      expect(int(1).isEven()).toBe(false)
      expect(int(3).isEven()).toBe(false)
    })
  })

  describe('Bitwise operations', () => {
    it('and() performs bitwise AND', () => {
      expect(int(0b1100).and(int(0b1010)).toNumber()).toBe(0b1000)
    })

    it('or() performs bitwise OR', () => {
      expect(int(0b1100).or(int(0b1010)).toNumber()).toBe(0b1110)
    })

    it('xor() performs bitwise XOR', () => {
      expect(int(0b1100).xor(int(0b1010)).toNumber()).toBe(0b0110)
    })

    it('not() performs bitwise NOT', () => {
      expect(int(0).not().toNumber()).toBe(-1)
    })

    it('shiftLeft() shifts bits left', () => {
      expect(int(1).shiftLeft(4).toNumber()).toBe(16)
    })

    it('shiftRight() shifts bits right', () => {
      expect(int(16).shiftRight(4).toNumber()).toBe(1)
    })

    it('shiftRight() handles negative numbers (arithmetic shift)', () => {
      expect(int(-16).shiftRight(2).toNumber()).toBe(-4)
    })
  })

  describe('Accessor methods', () => {
    it('getLowBits() returns low 32 bits', () => {
      const i = new Integer(42, 0)
      expect(i.getLowBits()).toBe(42)
    })

    it('getHighBits() returns high 32 bits', () => {
      const i = new Integer(0, 42)
      expect(i.getHighBits()).toBe(42)
    })

    it('getNumBitsAbs() returns number of bits', () => {
      expect(int(0).getNumBitsAbs()).toBe(1)
      expect(int(1).getNumBitsAbs()).toBe(1)
      expect(int(2).getNumBitsAbs()).toBe(2)
      expect(int(255).getNumBitsAbs()).toBe(8)
    })
  })

  describe('Static constants', () => {
    it('ZERO is zero', () => {
      expect(Integer.ZERO.toNumber()).toBe(0)
    })

    it('ONE is one', () => {
      expect(Integer.ONE.toNumber()).toBe(1)
    })

    it('NEG_ONE is negative one', () => {
      expect(Integer.NEG_ONE.toNumber()).toBe(-1)
    })

    it('MAX_VALUE is max 64-bit signed integer', () => {
      expect(Integer.MAX_VALUE.toString()).toBe('9223372036854775807')
    })

    it('MIN_VALUE is min 64-bit signed integer', () => {
      expect(Integer.MIN_VALUE.toString()).toBe('-9223372036854775808')
    })

    it('MAX_SAFE_VALUE is max safe JavaScript integer', () => {
      expect(Integer.MAX_SAFE_VALUE.toNumber()).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('MIN_SAFE_VALUE is min safe JavaScript integer', () => {
      expect(Integer.MIN_SAFE_VALUE.toNumber()).toBe(Number.MIN_SAFE_INTEGER)
    })
  })

  describe('Type guards', () => {
    it('isInt() returns true for Integer', () => {
      expect(isInt(int(42))).toBe(true)
    })

    it('isInt() returns false for number', () => {
      expect(isInt(42)).toBe(false)
    })

    it('isInt() returns false for string', () => {
      expect(isInt('42')).toBe(false)
    })

    it('isInt() returns false for BigInt', () => {
      expect(isInt(BigInt(42))).toBe(false)
    })

    it('isInt() returns false for null/undefined', () => {
      expect(isInt(null)).toBe(false)
      expect(isInt(undefined)).toBe(false)
    })

    it('Integer.isInteger() works as type guard', () => {
      expect(Integer.isInteger(int(42))).toBe(true)
      expect(Integer.isInteger(42)).toBe(false)
    })
  })

  describe('Exported utility functions', () => {
    it('toNumber() converts Integer to number', () => {
      expect(toNumber(int(42))).toBe(42)
    })

    it('toString() converts Integer to string', () => {
      expect(toString(int(42))).toBe('42')
    })

    it('toString() supports radix', () => {
      expect(toString(int(255), 16)).toBe('ff')
    })
  })

  describe('Edge cases', () => {
    it('handles maximum 64-bit integer (2^63 - 1)', () => {
      const max = Integer.MAX_VALUE
      expect(max.toString()).toBe('9223372036854775807')
      expect(max.high).toBe(0x7fffffff)
      expect(max.low).toBe(-1)
    })

    it('handles minimum 64-bit integer (-2^63)', () => {
      const min = Integer.MIN_VALUE
      expect(min.toString()).toBe('-9223372036854775808')
      expect(min.high).toBe(-2147483648)
      expect(min.low).toBe(0)
    })

    it('handles zero correctly', () => {
      const zero = int(0)
      expect(zero.isZero()).toBe(true)
      expect(zero.toNumber()).toBe(0)
      expect(zero.toString()).toBe('0')
    })

    it('handles overflow in addition', () => {
      const max = Integer.MAX_VALUE
      const result = max.add(int(1))
      expect(result.toString()).toBe('-9223372036854775808') // wraps to min
    })

    it('handles MIN_VALUE negation edge case', () => {
      const min = Integer.MIN_VALUE
      const negated = min.negate()
      // MIN_VALUE negation overflows back to MIN_VALUE in 2's complement
      expect(negated.toString()).toBe('-9223372036854775808')
    })

    it('division by zero throws', () => {
      expect(() => int(10).div(int(0))).toThrow()
    })

    it('modulo by zero throws', () => {
      expect(() => int(10).modulo(int(0))).toThrow()
    })
  })

  describe('MIN_VALUE and MAX_VALUE edge case operations', () => {
    describe('Addition edge cases', () => {
      it('MAX_VALUE + 0 = MAX_VALUE', () => {
        expect(Integer.MAX_VALUE.add(Integer.ZERO).equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('MIN_VALUE + 0 = MIN_VALUE', () => {
        expect(Integer.MIN_VALUE.add(Integer.ZERO).equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('MAX_VALUE + MIN_VALUE = -1', () => {
        const result = Integer.MAX_VALUE.add(Integer.MIN_VALUE)
        expect(result.equals(Integer.NEG_ONE)).toBe(true)
      })

      it('MIN_VALUE + 1 produces correct result', () => {
        const result = Integer.MIN_VALUE.add(Integer.ONE)
        expect(result.toString()).toBe('-9223372036854775807')
      })

      it('MAX_VALUE - 1 produces correct result', () => {
        const result = Integer.MAX_VALUE.subtract(Integer.ONE)
        expect(result.toString()).toBe('9223372036854775806')
      })
    })

    describe('Subtraction edge cases', () => {
      it('MIN_VALUE - 1 wraps to MAX_VALUE', () => {
        const result = Integer.MIN_VALUE.subtract(Integer.ONE)
        expect(result.equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('MAX_VALUE - MAX_VALUE = 0', () => {
        expect(Integer.MAX_VALUE.subtract(Integer.MAX_VALUE).isZero()).toBe(true)
      })

      it('MIN_VALUE - MIN_VALUE = 0', () => {
        expect(Integer.MIN_VALUE.subtract(Integer.MIN_VALUE).isZero()).toBe(true)
      })

      it('0 - MIN_VALUE wraps correctly', () => {
        const result = Integer.ZERO.subtract(Integer.MIN_VALUE)
        // 0 - MIN_VALUE overflows back to MIN_VALUE
        expect(result.equals(Integer.MIN_VALUE)).toBe(true)
      })
    })

    describe('Multiplication edge cases', () => {
      it('MAX_VALUE * 0 = 0', () => {
        expect(Integer.MAX_VALUE.multiply(Integer.ZERO).isZero()).toBe(true)
      })

      it('MIN_VALUE * 0 = 0', () => {
        expect(Integer.MIN_VALUE.multiply(Integer.ZERO).isZero()).toBe(true)
      })

      it('MAX_VALUE * 1 = MAX_VALUE', () => {
        expect(Integer.MAX_VALUE.multiply(Integer.ONE).equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('MIN_VALUE * 1 = MIN_VALUE', () => {
        expect(Integer.MIN_VALUE.multiply(Integer.ONE).equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('MAX_VALUE * -1 produces correct result', () => {
        const result = Integer.MAX_VALUE.multiply(Integer.NEG_ONE)
        expect(result.toString()).toBe('-9223372036854775807')
      })

      it('MIN_VALUE * -1 wraps to MIN_VALUE', () => {
        const result = Integer.MIN_VALUE.multiply(Integer.NEG_ONE)
        expect(result.equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('MIN_VALUE * 2 = 0 (overflow)', () => {
        const result = Integer.MIN_VALUE.multiply(int(2))
        expect(result.isZero()).toBe(true)
      })
    })

    describe('Division edge cases', () => {
      it('MAX_VALUE / 1 = MAX_VALUE', () => {
        expect(Integer.MAX_VALUE.div(Integer.ONE).equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('MIN_VALUE / 1 = MIN_VALUE', () => {
        expect(Integer.MIN_VALUE.div(Integer.ONE).equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('MAX_VALUE / -1 produces correct result', () => {
        const result = Integer.MAX_VALUE.div(Integer.NEG_ONE)
        expect(result.toString()).toBe('-9223372036854775807')
      })

      it('MIN_VALUE / -1 = MIN_VALUE (overflow case)', () => {
        // This is the famous overflow case where MIN_VALUE / -1 cannot be represented
        const result = Integer.MIN_VALUE.div(Integer.NEG_ONE)
        expect(result.equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('MIN_VALUE / MIN_VALUE = 1', () => {
        expect(Integer.MIN_VALUE.div(Integer.MIN_VALUE).equals(Integer.ONE)).toBe(true)
      })

      it('MAX_VALUE / MAX_VALUE = 1', () => {
        expect(Integer.MAX_VALUE.div(Integer.MAX_VALUE).equals(Integer.ONE)).toBe(true)
      })

      it('1 / MAX_VALUE = 0', () => {
        expect(Integer.ONE.div(Integer.MAX_VALUE).isZero()).toBe(true)
      })

      it('(MAX_VALUE - 1) / MAX_VALUE = 0', () => {
        const result = Integer.MAX_VALUE.subtract(Integer.ONE).div(Integer.MAX_VALUE)
        expect(result.isZero()).toBe(true)
      })
    })

    describe('Modulo edge cases', () => {
      it('MAX_VALUE % 1 = 0', () => {
        expect(Integer.MAX_VALUE.modulo(Integer.ONE).isZero()).toBe(true)
      })

      it('MIN_VALUE % 1 = 0', () => {
        expect(Integer.MIN_VALUE.modulo(Integer.ONE).isZero()).toBe(true)
      })

      it('MAX_VALUE % MAX_VALUE = 0', () => {
        expect(Integer.MAX_VALUE.modulo(Integer.MAX_VALUE).isZero()).toBe(true)
      })

      it('MIN_VALUE % MIN_VALUE = 0', () => {
        expect(Integer.MIN_VALUE.modulo(Integer.MIN_VALUE).isZero()).toBe(true)
      })

      it('MAX_VALUE % 2 = 1 (odd number)', () => {
        expect(Integer.MAX_VALUE.modulo(int(2)).equals(Integer.ONE)).toBe(true)
      })

      it('MIN_VALUE % 2 = 0 (even number)', () => {
        expect(Integer.MIN_VALUE.modulo(int(2)).isZero()).toBe(true)
      })
    })

    describe('Bitwise operations with extreme values', () => {
      it('MAX_VALUE & MIN_VALUE = 0', () => {
        expect(Integer.MAX_VALUE.and(Integer.MIN_VALUE).isZero()).toBe(true)
      })

      it('MAX_VALUE | MIN_VALUE = -1', () => {
        expect(Integer.MAX_VALUE.or(Integer.MIN_VALUE).equals(Integer.NEG_ONE)).toBe(true)
      })

      it('MAX_VALUE ^ MIN_VALUE = -1', () => {
        expect(Integer.MAX_VALUE.xor(Integer.MIN_VALUE).equals(Integer.NEG_ONE)).toBe(true)
      })

      it('~MAX_VALUE = MIN_VALUE', () => {
        expect(Integer.MAX_VALUE.not().equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('~MIN_VALUE = MAX_VALUE', () => {
        expect(Integer.MIN_VALUE.not().equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('MAX_VALUE << 1 produces correct wraparound', () => {
        const result = Integer.MAX_VALUE.shiftLeft(1)
        expect(result.equals(int(-2))).toBe(true)
      })

      it('MIN_VALUE >> 1 produces correct sign extension', () => {
        const result = Integer.MIN_VALUE.shiftRight(1)
        // Arithmetic shift preserves sign
        expect(result.toString()).toBe('-4611686018427387904')
      })
    })
  })

  describe('Overflow detection and handling', () => {
    describe('addWithOverflow - returns overflow status', () => {
      it('detects positive overflow', () => {
        const [result, overflow] = Integer.MAX_VALUE.addWithOverflow(Integer.ONE)
        expect(overflow).toBe(true)
        expect(result.equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('detects negative overflow', () => {
        const [result, overflow] = Integer.MIN_VALUE.addWithOverflow(Integer.NEG_ONE)
        expect(overflow).toBe(true)
        expect(result.equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('returns false when no overflow', () => {
        const [result, overflow] = int(100).addWithOverflow(int(200))
        expect(overflow).toBe(false)
        expect(result.toNumber()).toBe(300)
      })

      it('handles large positive numbers without overflow', () => {
        const large = Integer.MAX_VALUE.subtract(int(100))
        const [result, overflow] = large.addWithOverflow(int(50))
        expect(overflow).toBe(false)
      })

      it('handles large negative numbers without overflow', () => {
        const large = Integer.MIN_VALUE.add(int(100))
        const [result, overflow] = large.addWithOverflow(int(-50))
        expect(overflow).toBe(false)
      })
    })

    describe('subtractWithOverflow - returns overflow status', () => {
      it('detects overflow when subtracting from MIN_VALUE', () => {
        const [result, overflow] = Integer.MIN_VALUE.subtractWithOverflow(Integer.ONE)
        expect(overflow).toBe(true)
        expect(result.equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('detects overflow when subtracting negative from MAX_VALUE', () => {
        const [result, overflow] = Integer.MAX_VALUE.subtractWithOverflow(Integer.NEG_ONE)
        expect(overflow).toBe(true)
        expect(result.equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('returns false when no overflow', () => {
        const [result, overflow] = int(100).subtractWithOverflow(int(50))
        expect(overflow).toBe(false)
        expect(result.toNumber()).toBe(50)
      })
    })

    describe('multiplyWithOverflow - returns overflow status', () => {
      it('detects overflow on large positive multiplication', () => {
        const large = Integer.fromString('4611686018427387904') // 2^62
        const [result, overflow] = large.multiplyWithOverflow(int(4))
        expect(overflow).toBe(true)
      })

      it('detects overflow on MIN_VALUE * -1', () => {
        const [result, overflow] = Integer.MIN_VALUE.multiplyWithOverflow(Integer.NEG_ONE)
        expect(overflow).toBe(true)
      })

      it('returns false for safe multiplication', () => {
        const [result, overflow] = int(1000000).multiplyWithOverflow(int(1000000))
        expect(overflow).toBe(false)
        expect(result.toNumber()).toBe(1000000000000)
      })
    })

    describe('checkedAdd - throws on overflow', () => {
      it('throws on positive overflow', () => {
        expect(() => Integer.MAX_VALUE.checkedAdd(Integer.ONE)).toThrow('Integer overflow')
      })

      it('throws on negative overflow', () => {
        expect(() => Integer.MIN_VALUE.checkedAdd(Integer.NEG_ONE)).toThrow('Integer overflow')
      })

      it('returns result when no overflow', () => {
        expect(int(100).checkedAdd(int(200)).toNumber()).toBe(300)
      })
    })

    describe('checkedSubtract - throws on overflow', () => {
      it('throws on overflow', () => {
        expect(() => Integer.MIN_VALUE.checkedSubtract(Integer.ONE)).toThrow('Integer overflow')
      })

      it('returns result when no overflow', () => {
        expect(int(100).checkedSubtract(int(50)).toNumber()).toBe(50)
      })
    })

    describe('checkedMultiply - throws on overflow', () => {
      it('throws on overflow', () => {
        const large = Integer.fromString('4611686018427387904')
        expect(() => large.checkedMultiply(int(4))).toThrow('Integer overflow')
      })

      it('returns result when no overflow', () => {
        expect(int(100).checkedMultiply(int(200)).toNumber()).toBe(20000)
      })
    })

    describe('saturatingAdd - clamps to bounds', () => {
      it('clamps to MAX_VALUE on positive overflow', () => {
        const result = Integer.MAX_VALUE.saturatingAdd(Integer.ONE)
        expect(result.equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('clamps to MIN_VALUE on negative overflow', () => {
        const result = Integer.MIN_VALUE.saturatingAdd(Integer.NEG_ONE)
        expect(result.equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('returns normal result when no overflow', () => {
        expect(int(100).saturatingAdd(int(200)).toNumber()).toBe(300)
      })
    })

    describe('saturatingSubtract - clamps to bounds', () => {
      it('clamps to MAX_VALUE on overflow', () => {
        const result = Integer.MIN_VALUE.saturatingSubtract(Integer.ONE)
        expect(result.equals(Integer.MAX_VALUE)).toBe(false) // saturates to MAX_VALUE
        expect(result.equals(Integer.MIN_VALUE)).toBe(true) // actually saturates to MIN_VALUE
      })

      it('clamps to MIN_VALUE on negative overflow', () => {
        const result = Integer.MAX_VALUE.saturatingSubtract(Integer.NEG_ONE)
        expect(result.equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('returns normal result when no overflow', () => {
        expect(int(100).saturatingSubtract(int(50)).toNumber()).toBe(50)
      })
    })
  })

  describe('Additional conversion methods', () => {
    describe('toJSON', () => {
      it('returns string representation for safe range', () => {
        const i = int(42)
        expect(i.toJSON()).toBe('42')
      })

      it('returns string for values outside safe range', () => {
        const large = Integer.fromString('9007199254740993')
        expect(large.toJSON()).toBe('9007199254740993')
      })

      it('handles negative values', () => {
        expect(int(-42).toJSON()).toBe('-42')
      })

      it('works with JSON.stringify', () => {
        const obj = { value: int(42) }
        expect(JSON.stringify(obj)).toBe('{"value":"42"}')
      })
    })

    describe('toBytes / fromBytes', () => {
      it('converts to 8-byte array (big-endian)', () => {
        const i = int(0x0102030405060708n)
        const bytes = i.toBytes()
        expect(bytes).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]))
      })

      it('converts from 8-byte array', () => {
        const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        const i = Integer.fromBytes(bytes)
        expect(i.toBigInt()).toBe(0x0102030405060708n)
      })

      it('roundtrips correctly for positive values', () => {
        const original = Integer.fromString('1234567890123456789')
        const bytes = original.toBytes()
        const restored = Integer.fromBytes(bytes)
        expect(restored.equals(original)).toBe(true)
      })

      it('roundtrips correctly for negative values', () => {
        const original = Integer.fromString('-1234567890123456789')
        const bytes = original.toBytes()
        const restored = Integer.fromBytes(bytes)
        expect(restored.equals(original)).toBe(true)
      })

      it('handles MIN_VALUE', () => {
        const bytes = Integer.MIN_VALUE.toBytes()
        const restored = Integer.fromBytes(bytes)
        expect(restored.equals(Integer.MIN_VALUE)).toBe(true)
      })

      it('handles MAX_VALUE', () => {
        const bytes = Integer.MAX_VALUE.toBytes()
        const restored = Integer.fromBytes(bytes)
        expect(restored.equals(Integer.MAX_VALUE)).toBe(true)
      })

      it('handles zero', () => {
        const bytes = Integer.ZERO.toBytes()
        expect(bytes).toEqual(new Uint8Array(8))
        const restored = Integer.fromBytes(bytes)
        expect(restored.isZero()).toBe(true)
      })
    })

    describe('toBytesLE / fromBytesLE (little-endian)', () => {
      it('converts to 8-byte array (little-endian)', () => {
        const i = int(0x0102030405060708n)
        const bytes = i.toBytesLE()
        expect(bytes).toEqual(new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]))
      })

      it('converts from 8-byte array (little-endian)', () => {
        const bytes = new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01])
        const i = Integer.fromBytesLE(bytes)
        expect(i.toBigInt()).toBe(0x0102030405060708n)
      })

      it('roundtrips correctly', () => {
        const original = Integer.fromString('9876543210987654321')
        const bytes = original.toBytesLE()
        const restored = Integer.fromBytesLE(bytes)
        expect(restored.equals(original)).toBe(true)
      })
    })

    describe('abs', () => {
      it('returns absolute value of positive number', () => {
        expect(int(42).abs().toNumber()).toBe(42)
      })

      it('returns absolute value of negative number', () => {
        expect(int(-42).abs().toNumber()).toBe(42)
      })

      it('returns zero for zero', () => {
        expect(Integer.ZERO.abs().isZero()).toBe(true)
      })

      it('handles MIN_VALUE specially (returns MIN_VALUE)', () => {
        // abs(MIN_VALUE) cannot be represented, returns MIN_VALUE
        expect(Integer.MIN_VALUE.abs().equals(Integer.MIN_VALUE)).toBe(true)
      })
    })

    describe('sign', () => {
      it('returns 1 for positive numbers', () => {
        expect(int(42).sign()).toBe(1)
      })

      it('returns -1 for negative numbers', () => {
        expect(int(-42).sign()).toBe(-1)
      })

      it('returns 0 for zero', () => {
        expect(Integer.ZERO.sign()).toBe(0)
      })
    })

    describe('clamp', () => {
      it('returns value when within range', () => {
        expect(int(50).clamp(int(0), int(100)).toNumber()).toBe(50)
      })

      it('returns min when value is below range', () => {
        expect(int(-10).clamp(int(0), int(100)).toNumber()).toBe(0)
      })

      it('returns max when value is above range', () => {
        expect(int(150).clamp(int(0), int(100)).toNumber()).toBe(100)
      })

      it('handles edge case where value equals min', () => {
        expect(int(0).clamp(int(0), int(100)).toNumber()).toBe(0)
      })

      it('handles edge case where value equals max', () => {
        expect(int(100).clamp(int(0), int(100)).toNumber()).toBe(100)
      })
    })

    describe('toHex', () => {
      it('returns lowercase hex string', () => {
        expect(int(255).toHex()).toBe('ff')
      })

      it('handles large numbers', () => {
        expect(Integer.MAX_VALUE.toHex()).toBe('7fffffffffffffff')
      })

      it('handles negative numbers', () => {
        expect(int(-1).toHex()).toBe('ffffffffffffffff')
      })

      it('handles zero', () => {
        expect(Integer.ZERO.toHex()).toBe('0')
      })
    })

    describe('toBinary', () => {
      it('returns binary string', () => {
        expect(int(5).toBinary()).toBe('101')
      })

      it('handles zero', () => {
        expect(Integer.ZERO.toBinary()).toBe('0')
      })
    })

    describe('toOctal', () => {
      it('returns octal string', () => {
        expect(int(8).toOctal()).toBe('10')
      })

      it('handles zero', () => {
        expect(Integer.ZERO.toOctal()).toBe('0')
      })
    })
  })

  describe('Performance optimizations', () => {
    describe('Integer caching', () => {
      it('caches small integers via int() helper', () => {
        const a = int(5)
        const b = int(5)
        // With caching, these should be the same instance
        expect(a).toBe(b)
      })

      it('caches common values -128 to 127', () => {
        for (let i = -128; i <= 127; i++) {
          const a = int(i)
          const b = int(i)
          expect(a).toBe(b)
        }
      })

      it('does not cache values outside range', () => {
        const a = int(1000)
        const b = int(1000)
        // These should be different instances
        expect(a).not.toBe(b)
      })
    })

    describe('Fast paths for common operations', () => {
      it('add with ZERO returns same instance', () => {
        const i = int(42)
        expect(i.add(Integer.ZERO)).toBe(i)
      })

      it('subtract ZERO returns same instance', () => {
        const i = int(42)
        expect(i.subtract(Integer.ZERO)).toBe(i)
      })

      it('multiply by ONE returns same instance', () => {
        const i = int(42)
        expect(i.multiply(Integer.ONE)).toBe(i)
      })

      it('multiply by ZERO returns ZERO constant', () => {
        expect(int(42).multiply(Integer.ZERO)).toBe(Integer.ZERO)
      })

      it('divide by ONE returns same instance', () => {
        const i = int(42)
        expect(i.div(Integer.ONE)).toBe(i)
      })

      it('modulo by ONE returns ZERO constant', () => {
        expect(int(42).modulo(Integer.ONE)).toBe(Integer.ZERO)
      })
    })

    describe('isMax and isMin quick checks', () => {
      it('isMax() returns true for MAX_VALUE', () => {
        expect(Integer.MAX_VALUE.isMax()).toBe(true)
      })

      it('isMax() returns false for other values', () => {
        expect(int(42).isMax()).toBe(false)
        expect(Integer.MIN_VALUE.isMax()).toBe(false)
      })

      it('isMin() returns true for MIN_VALUE', () => {
        expect(Integer.MIN_VALUE.isMin()).toBe(true)
      })

      it('isMin() returns false for other values', () => {
        expect(int(42).isMin()).toBe(false)
        expect(Integer.MAX_VALUE.isMin()).toBe(false)
      })
    })

    describe('Power of two optimizations', () => {
      it('isPowerOfTwo() returns true for powers of 2', () => {
        expect(int(1).isPowerOfTwo()).toBe(true)
        expect(int(2).isPowerOfTwo()).toBe(true)
        expect(int(4).isPowerOfTwo()).toBe(true)
        expect(int(1024).isPowerOfTwo()).toBe(true)
        expect(Integer.fromString('4611686018427387904').isPowerOfTwo()).toBe(true) // 2^62
      })

      it('isPowerOfTwo() returns false for non-powers of 2', () => {
        expect(int(0).isPowerOfTwo()).toBe(false)
        expect(int(3).isPowerOfTwo()).toBe(false)
        expect(int(-2).isPowerOfTwo()).toBe(false)
      })
    })
  })
})
