/**
 * Integer type for 64-bit signed integers.
 *
 * This implementation is API-compatible with the neo4j-driver Integer class.
 * It represents 64-bit two's-complement integers using two 32-bit signed values.
 *
 * Based on Long.js concepts but implemented fresh for neo4j.do
 */

// Type for values that can be converted to Integer
export type Integerable = number | string | Integer | { low: number; high: number } | bigint

// Constants
const TWO_PWR_16 = 1 << 16
const TWO_PWR_32 = TWO_PWR_16 * TWO_PWR_16
const TWO_PWR_64 = TWO_PWR_32 * TWO_PWR_32
const TWO_PWR_63 = TWO_PWR_64 / 2

/**
 * Represents a 64-bit two's-complement integer, given its low and high 32-bit values as signed integers.
 */
export class Integer {
  /** The low 32 bits as a signed value */
  readonly low: number
  /** The high 32 bits as a signed value */
  readonly high: number

  // Static constants
  static readonly ZERO: Integer = new Integer(0, 0)
  static readonly ONE: Integer = new Integer(1, 0)
  static readonly NEG_ONE: Integer = new Integer(-1, -1)
  static readonly MAX_VALUE: Integer = new Integer(-1, 0x7fffffff)
  static readonly MIN_VALUE: Integer = new Integer(0, -2147483648)
  static readonly MAX_SAFE_VALUE: Integer = Integer.fromNumber(Number.MAX_SAFE_INTEGER)
  static readonly MIN_SAFE_VALUE: Integer = Integer.fromNumber(Number.MIN_SAFE_INTEGER)

  /**
   * Creates an Integer from low and high 32-bit components
   * @param low - The low 32 bits
   * @param high - The high 32 bits
   */
  constructor(low: number = 0, high: number = 0) {
    this.low = low | 0 // force to 32-bit signed
    this.high = high | 0 // force to 32-bit signed
  }

  // ==================== Static Factory Methods ====================

  /**
   * Creates Integer from a 32-bit integer value
   */
  static fromInt(value: number): Integer {
    const intValue = value | 0
    return new Integer(intValue, intValue < 0 ? -1 : 0)
  }

  /**
   * Creates Integer from a floating-point number (truncates decimal)
   */
  static fromNumber(value: number): Integer {
    if (Number.isNaN(value)) {
      return Integer.ZERO
    }
    if (value <= -TWO_PWR_63) {
      return Integer.MIN_VALUE
    }
    if (value + 1 >= TWO_PWR_63) {
      return Integer.MAX_VALUE
    }
    if (value < 0) {
      return Integer.fromNumber(-value).negate()
    }
    return new Integer(
      value % TWO_PWR_32 | 0,
      (value / TWO_PWR_32) | 0
    )
  }

  /**
   * Creates Integer from a string representation
   * @param str - String representation
   * @param radix - Radix (2-36), defaults to 10
   */
  static fromString(str: string, radix: number = 10): Integer {
    if (str.length === 0) {
      throw new Error('Empty string')
    }

    if (str === 'NaN' || str === 'Infinity' || str === '+Infinity' || str === '-Infinity') {
      return Integer.ZERO
    }

    radix = radix || 10
    if (radix < 2 || radix > 36) {
      throw new RangeError('radix out of range')
    }

    let p = 0
    if (str.charAt(0) === '-') {
      p++
      if (str.length === 1) {
        throw new Error('Invalid string')
      }
    }

    // Parse in chunks to avoid overflow
    const radixToPower = Integer.fromNumber(Math.pow(radix, 8))
    let result = Integer.ZERO
    for (let i = p; i < str.length; i += 8) {
      const size = Math.min(8, str.length - i)
      const value = parseInt(str.substring(i, i + size), radix)
      if (size < 8) {
        const power = Integer.fromNumber(Math.pow(radix, size))
        result = result.multiply(power).add(Integer.fromNumber(value))
      } else {
        result = result.multiply(radixToPower)
        result = result.add(Integer.fromNumber(value))
      }
    }

    if (str.charAt(0) === '-') {
      return result.negate()
    }
    return result
  }

  /**
   * Creates Integer from low and high bits directly
   */
  static fromBits(lowBits: number, highBits: number): Integer {
    return new Integer(lowBits, highBits)
  }

  /**
   * Creates Integer from any valid input value
   */
  static fromValue(val: Integerable): Integer {
    if (val instanceof Integer) {
      return new Integer(val.low, val.high)
    }
    if (typeof val === 'number') {
      return Integer.fromNumber(val)
    }
    if (typeof val === 'string') {
      return Integer.fromString(val)
    }
    if (typeof val === 'bigint') {
      return Integer.fromBigInt(val)
    }
    if (typeof val === 'object' && val !== null && 'low' in val && 'high' in val) {
      return new Integer(val.low, val.high)
    }
    throw new Error('Invalid value for Integer')
  }

  /**
   * Creates Integer from BigInt
   */
  static fromBigInt(value: bigint): Integer {
    const TWO_PWR_32_BIGINT = BigInt(0x100000000)
    const TWO_PWR_64_BIGINT = TWO_PWR_32_BIGINT * TWO_PWR_32_BIGINT

    // Handle negative numbers
    if (value < 0) {
      // Convert to two's complement representation
      value = TWO_PWR_64_BIGINT + value
    }

    const low = Number(value & BigInt(0xffffffff))
    const high = Number((value >> BigInt(32)) & BigInt(0xffffffff))

    // Convert to signed 32-bit integers
    return new Integer(
      low > 0x7fffffff ? low - 0x100000000 : low,
      high > 0x7fffffff ? high - 0x100000000 : high
    )
  }

  /**
   * Creates Integer from an 8-byte Uint8Array (big-endian)
   */
  static fromBytes(bytes: Uint8Array): Integer {
    if (bytes.length !== 8) {
      throw new Error('fromBytes requires exactly 8 bytes')
    }

    const high = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]
    const low = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]

    return new Integer(low, high)
  }

  /**
   * Creates Integer from an 8-byte Uint8Array (little-endian)
   */
  static fromBytesLE(bytes: Uint8Array): Integer {
    if (bytes.length !== 8) {
      throw new Error('fromBytesLE requires exactly 8 bytes')
    }

    const low = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)
    const high = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)

    return new Integer(low, high)
  }

  /**
   * Type guard to check if value is an Integer
   */
  static isInteger(obj: unknown): obj is Integer {
    return obj instanceof Integer
  }

  /**
   * Static method to check if Integer is in safe JavaScript range
   */
  static inSafeRange(val: Integer): boolean {
    return val.inSafeRange()
  }

  /**
   * Static method to convert Integer to number
   */
  static toNumber(val: Integer): number {
    return val.toNumber()
  }

  /**
   * Static method to convert Integer to string
   */
  static toString(val: Integer, radix?: number): string {
    return val.toString(radix)
  }

  // ==================== Conversion Methods ====================

  /**
   * Returns the low 32 bits as a 32-bit integer
   */
  toInt(): number {
    return this.low
  }

  /**
   * Converts to a JavaScript number (may lose precision for large values)
   */
  toNumber(): number {
    return this.high * TWO_PWR_32 + (this.low >>> 0)
  }

  /**
   * Converts to BigInt
   */
  toBigInt(): bigint {
    if (this.high >= 0) {
      return (BigInt(this.high) << BigInt(32)) + BigInt(this.low >>> 0)
    }
    // Negative number - convert from two's complement
    const TWO_PWR_64_BIGINT = BigInt(0x10000000000000000)
    const unsignedValue = (BigInt(this.high >>> 0) << BigInt(32)) + BigInt(this.low >>> 0)
    return unsignedValue - TWO_PWR_64_BIGINT
  }

  /**
   * Converts to string with optional radix
   */
  toString(radix: number = 10): string {
    radix = radix || 10
    if (radix < 2 || radix > 36) {
      throw new RangeError('radix out of range')
    }

    if (this.isZero()) {
      return '0'
    }

    if (this.isNegative()) {
      if (this.equals(Integer.MIN_VALUE)) {
        // Handle MIN_VALUE specially
        const radixInteger = Integer.fromNumber(radix)
        const div = this.div(radixInteger)
        const rem = div.multiply(radixInteger).subtract(this)
        return div.toString(radix) + rem.toInt().toString(radix)
      }
      return '-' + this.negate().toString(radix)
    }

    // Use BigInt for conversion if available
    return this.toBigInt().toString(radix)
  }

  /**
   * Returns the BigInt value (for valueOf)
   */
  valueOf(): bigint {
    return this.toBigInt()
  }

  /**
   * Returns number, or Infinity/-Infinity if out of safe range
   */
  toNumberOrInfinity(): number {
    if (this.lessThan(Integer.MIN_SAFE_VALUE)) {
      return -Infinity
    }
    if (this.greaterThan(Integer.MAX_SAFE_VALUE)) {
      return Infinity
    }
    return this.toNumber()
  }

  /**
   * Returns a JSON-compatible string representation
   */
  toJSON(): string {
    return this.toString()
  }

  /**
   * Returns a hexadecimal string representation (lowercase)
   */
  toHex(): string {
    if (this.isZero()) {
      return '0'
    }
    if (this.isNegative()) {
      // For negative numbers, show full 64-bit two's complement
      const high = (this.high >>> 0).toString(16).padStart(8, '0')
      const low = (this.low >>> 0).toString(16).padStart(8, '0')
      return high + low
    }
    return this.toBigInt().toString(16)
  }

  /**
   * Returns a binary string representation
   */
  toBinary(): string {
    return this.toString(2)
  }

  /**
   * Returns an octal string representation
   */
  toOctal(): string {
    return this.toString(8)
  }

  /**
   * Returns the absolute value
   */
  abs(): Integer {
    if (this.isNegative()) {
      return this.negate()
    }
    return this
  }

  /**
   * Returns the sign of this integer: -1, 0, or 1
   */
  sign(): number {
    if (this.isZero()) {
      return 0
    }
    return this.isNegative() ? -1 : 1
  }

  /**
   * Clamps this value between min and max (inclusive)
   */
  clamp(min: Integer | Integerable, max: Integer | Integerable): Integer {
    const minInt = min instanceof Integer ? min : Integer.fromValue(min)
    const maxInt = max instanceof Integer ? max : Integer.fromValue(max)

    if (this.lessThan(minInt)) {
      return minInt
    }
    if (this.greaterThan(maxInt)) {
      return maxInt
    }
    return this
  }

  /**
   * Converts to an 8-byte Uint8Array (big-endian)
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(8)
    const high = this.high >>> 0
    const low = this.low >>> 0

    bytes[0] = (high >>> 24) & 0xff
    bytes[1] = (high >>> 16) & 0xff
    bytes[2] = (high >>> 8) & 0xff
    bytes[3] = high & 0xff
    bytes[4] = (low >>> 24) & 0xff
    bytes[5] = (low >>> 16) & 0xff
    bytes[6] = (low >>> 8) & 0xff
    bytes[7] = low & 0xff

    return bytes
  }

  /**
   * Converts to an 8-byte Uint8Array (little-endian)
   */
  toBytesLE(): Uint8Array {
    const bytes = new Uint8Array(8)
    const high = this.high >>> 0
    const low = this.low >>> 0

    bytes[0] = low & 0xff
    bytes[1] = (low >>> 8) & 0xff
    bytes[2] = (low >>> 16) & 0xff
    bytes[3] = (low >>> 24) & 0xff
    bytes[4] = high & 0xff
    bytes[5] = (high >>> 8) & 0xff
    bytes[6] = (high >>> 16) & 0xff
    bytes[7] = (high >>> 24) & 0xff

    return bytes
  }

  // ==================== Accessor Methods ====================

  /**
   * Gets the low 32 bits as a signed integer
   */
  getLowBits(): number {
    return this.low
  }

  /**
   * Gets the high 32 bits as a signed integer
   */
  getHighBits(): number {
    return this.high
  }

  /**
   * Gets the number of bits needed to represent the absolute value
   */
  getNumBitsAbs(): number {
    if (this.isNegative()) {
      return this.equals(Integer.MIN_VALUE) ? 64 : this.negate().getNumBitsAbs()
    }
    const val = this.high !== 0 ? this.high : this.low
    let bit: number
    for (bit = 31; bit > 0; bit--) {
      if ((val & (1 << bit)) !== 0) {
        break
      }
    }
    return this.high !== 0 ? bit + 33 : bit + 1
  }

  // ==================== Test Methods ====================

  /**
   * Checks if value is zero
   */
  isZero(): boolean {
    return this.low === 0 && this.high === 0
  }

  /**
   * Checks if this is the maximum 64-bit integer value
   */
  isMax(): boolean {
    return this.low === -1 && this.high === 0x7fffffff
  }

  /**
   * Checks if this is the minimum 64-bit integer value
   */
  isMin(): boolean {
    return this.low === 0 && this.high === -2147483648
  }

  /**
   * Checks if this value is a power of two
   */
  isPowerOfTwo(): boolean {
    if (this.isZero() || this.isNegative()) {
      return false
    }
    // A positive number is a power of 2 if it has exactly one bit set
    // (n & (n - 1)) === 0 for powers of 2
    const minusOne = this.subtract(Integer.ONE)
    return this.and(minusOne).isZero()
  }

  /**
   * Checks if value is negative
   */
  isNegative(): boolean {
    return this.high < 0
  }

  /**
   * Checks if value is positive
   */
  isPositive(): boolean {
    return this.high >= 0 && (this.low !== 0 || this.high !== 0)
  }

  /**
   * Checks if value is odd
   */
  isOdd(): boolean {
    return (this.low & 1) === 1
  }

  /**
   * Checks if value is even
   */
  isEven(): boolean {
    return (this.low & 1) === 0
  }

  /**
   * Checks if value is within JavaScript safe integer range
   */
  inSafeRange(): boolean {
    return this.greaterThanOrEqual(Integer.MIN_SAFE_VALUE) &&
           this.lessThanOrEqual(Integer.MAX_SAFE_VALUE)
  }

  // ==================== Comparison Methods ====================

  /**
   * Tests equality
   */
  equals(other: Integer | Integerable): boolean {
    const otherInt = other instanceof Integer ? other : Integer.fromValue(other)
    return this.low === otherInt.low && this.high === otherInt.high
  }

  /**
   * Tests inequality
   */
  notEquals(other: Integer | Integerable): boolean {
    return !this.equals(other)
  }

  /**
   * Compares this Integer with another
   * @returns -1 if less, 0 if equal, 1 if greater
   */
  compare(other: Integer | Integerable): number {
    const otherInt = other instanceof Integer ? other : Integer.fromValue(other)
    if (this.equals(otherInt)) {
      return 0
    }
    const thisNeg = this.isNegative()
    const otherNeg = otherInt.isNegative()
    if (thisNeg && !otherNeg) {
      return -1
    }
    if (!thisNeg && otherNeg) {
      return 1
    }
    // Both same sign - subtract and check sign
    return this.subtract(otherInt).isNegative() ? -1 : 1
  }

  /**
   * Tests if less than
   */
  lessThan(other: Integer | Integerable): boolean {
    return this.compare(other) < 0
  }

  /**
   * Tests if less than or equal
   */
  lessThanOrEqual(other: Integer | Integerable): boolean {
    return this.compare(other) <= 0
  }

  /**
   * Tests if greater than
   */
  greaterThan(other: Integer | Integerable): boolean {
    return this.compare(other) > 0
  }

  /**
   * Tests if greater than or equal
   */
  greaterThanOrEqual(other: Integer | Integerable): boolean {
    return this.compare(other) >= 0
  }

  // ==================== Arithmetic Operations ====================

  /**
   * Returns the sum of this and another Integer
   */
  add(addend: Integer | Integerable): Integer {
    const other = addend instanceof Integer ? addend : Integer.fromValue(addend)

    // Fast path: adding zero returns same instance
    if (other.isZero()) {
      return this
    }
    if (this.isZero()) {
      return other
    }

    // Split each into 16-bit chunks to avoid overflow
    const a48 = this.high >>> 16
    const a32 = this.high & 0xffff
    const a16 = this.low >>> 16
    const a00 = this.low & 0xffff

    const b48 = other.high >>> 16
    const b32 = other.high & 0xffff
    const b16 = other.low >>> 16
    const b00 = other.low & 0xffff

    let c48 = 0, c32 = 0, c16 = 0, c00 = 0
    c00 += a00 + b00
    c16 += c00 >>> 16
    c00 &= 0xffff
    c16 += a16 + b16
    c32 += c16 >>> 16
    c16 &= 0xffff
    c32 += a32 + b32
    c48 += c32 >>> 16
    c32 &= 0xffff
    c48 += a48 + b48
    c48 &= 0xffff

    return new Integer((c16 << 16) | c00, (c48 << 16) | c32)
  }

  /**
   * Returns the sum of this and another Integer with overflow detection
   * @returns A tuple of [result, didOverflow]
   */
  addWithOverflow(addend: Integer | Integerable): [Integer, boolean] {
    const other = addend instanceof Integer ? addend : Integer.fromValue(addend)
    const result = this.add(other)

    // Overflow detection: if both operands have the same sign,
    // but the result has a different sign, overflow occurred
    const thisNeg = this.isNegative()
    const otherNeg = other.isNegative()
    const resultNeg = result.isNegative()

    // Positive + Positive = Negative means overflow
    // Negative + Negative = Positive means underflow
    const overflow = (thisNeg === otherNeg) && (thisNeg !== resultNeg)

    return [result, overflow]
  }

  /**
   * Returns the sum, throwing on overflow
   */
  checkedAdd(addend: Integer | Integerable): Integer {
    const [result, overflow] = this.addWithOverflow(addend)
    if (overflow) {
      throw new Error('Integer overflow')
    }
    return result
  }

  /**
   * Returns the sum, clamping to MIN_VALUE/MAX_VALUE on overflow
   */
  saturatingAdd(addend: Integer | Integerable): Integer {
    const other = addend instanceof Integer ? addend : Integer.fromValue(addend)
    const [result, overflow] = this.addWithOverflow(other)

    if (!overflow) {
      return result
    }

    // If overflow occurred and we were adding positive numbers, clamp to MAX
    // If overflow occurred and we were adding negative numbers, clamp to MIN
    return this.isNegative() ? Integer.MIN_VALUE : Integer.MAX_VALUE
  }

  /**
   * Returns the difference of this and another Integer
   */
  subtract(subtrahend: Integer | Integerable): Integer {
    const other = subtrahend instanceof Integer ? subtrahend : Integer.fromValue(subtrahend)

    // Fast path: subtracting zero returns same instance
    if (other.isZero()) {
      return this
    }

    return this.add(other.negate())
  }

  /**
   * Returns the difference with overflow detection
   * @returns A tuple of [result, didOverflow]
   */
  subtractWithOverflow(subtrahend: Integer | Integerable): [Integer, boolean] {
    const other = subtrahend instanceof Integer ? subtrahend : Integer.fromValue(subtrahend)
    const result = this.subtract(other)

    // Overflow detection:
    // positive - negative = negative means overflow (should be positive)
    // negative - positive = positive means underflow (should be negative)
    const thisNeg = this.isNegative()
    const otherNeg = other.isNegative()
    const resultNeg = result.isNegative()

    // If signs of operands differ and result sign differs from this's sign
    const overflow = (thisNeg !== otherNeg) && (thisNeg !== resultNeg)

    return [result, overflow]
  }

  /**
   * Returns the difference, throwing on overflow
   */
  checkedSubtract(subtrahend: Integer | Integerable): Integer {
    const [result, overflow] = this.subtractWithOverflow(subtrahend)
    if (overflow) {
      throw new Error('Integer overflow')
    }
    return result
  }

  /**
   * Returns the difference, clamping to MIN_VALUE/MAX_VALUE on overflow
   */
  saturatingSubtract(subtrahend: Integer | Integerable): Integer {
    const [result, overflow] = this.subtractWithOverflow(subtrahend)

    if (!overflow) {
      return result
    }

    // If overflow occurred, determine direction
    // If this is negative and we subtracted a positive (causing positive result), clamp to MIN
    // If this is positive and we subtracted a negative (causing negative result), clamp to MAX
    return this.isNegative() ? Integer.MIN_VALUE : Integer.MAX_VALUE
  }

  /**
   * Returns the product of this and another Integer
   */
  multiply(multiplier: Integer | Integerable): Integer {
    const other = multiplier instanceof Integer ? multiplier : Integer.fromValue(multiplier)

    if (this.isZero() || other.isZero()) {
      return Integer.ZERO
    }

    // Fast path: multiply by ONE returns same instance
    if (other.equals(Integer.ONE)) {
      return this
    }
    if (this.equals(Integer.ONE)) {
      return other
    }

    if (this.equals(Integer.MIN_VALUE)) {
      return other.isOdd() ? Integer.MIN_VALUE : Integer.ZERO
    }
    if (other.equals(Integer.MIN_VALUE)) {
      return this.isOdd() ? Integer.MIN_VALUE : Integer.ZERO
    }

    if (this.isNegative()) {
      if (other.isNegative()) {
        return this.negate().multiply(other.negate())
      }
      return this.negate().multiply(other).negate()
    }
    if (other.isNegative()) {
      return this.multiply(other.negate()).negate()
    }

    // Split into 16-bit chunks
    const a48 = this.high >>> 16
    const a32 = this.high & 0xffff
    const a16 = this.low >>> 16
    const a00 = this.low & 0xffff

    const b48 = other.high >>> 16
    const b32 = other.high & 0xffff
    const b16 = other.low >>> 16
    const b00 = other.low & 0xffff

    let c48 = 0, c32 = 0, c16 = 0, c00 = 0
    c00 += a00 * b00
    c16 += c00 >>> 16
    c00 &= 0xffff
    c16 += a16 * b00
    c32 += c16 >>> 16
    c16 &= 0xffff
    c16 += a00 * b16
    c32 += c16 >>> 16
    c16 &= 0xffff
    c32 += a32 * b00
    c48 += c32 >>> 16
    c32 &= 0xffff
    c32 += a16 * b16
    c48 += c32 >>> 16
    c32 &= 0xffff
    c32 += a00 * b32
    c48 += c32 >>> 16
    c32 &= 0xffff
    c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48
    c48 &= 0xffff

    return new Integer((c16 << 16) | c00, (c48 << 16) | c32)
  }

  /**
   * Returns the product with overflow detection
   * @returns A tuple of [result, didOverflow]
   */
  multiplyWithOverflow(multiplier: Integer | Integerable): [Integer, boolean] {
    const other = multiplier instanceof Integer ? multiplier : Integer.fromValue(multiplier)

    // Handle simple cases without overflow
    if (this.isZero() || other.isZero()) {
      return [Integer.ZERO, false]
    }
    if (other.equals(Integer.ONE)) {
      return [this, false]
    }
    if (this.equals(Integer.ONE)) {
      return [other, false]
    }

    // Special case: MIN_VALUE * -1 overflows
    if ((this.equals(Integer.MIN_VALUE) && other.equals(Integer.NEG_ONE)) ||
        (this.equals(Integer.NEG_ONE) && other.equals(Integer.MIN_VALUE))) {
      return [Integer.MIN_VALUE, true]
    }

    // Use BigInt to detect overflow accurately
    const thisBigInt = this.toBigInt()
    const otherBigInt = other.toBigInt()
    const product = thisBigInt * otherBigInt

    const MAX_BIGINT = BigInt('9223372036854775807')
    const MIN_BIGINT = BigInt('-9223372036854775808')

    const overflow = product > MAX_BIGINT || product < MIN_BIGINT
    const result = this.multiply(other)

    return [result, overflow]
  }

  /**
   * Returns the product, throwing on overflow
   */
  checkedMultiply(multiplier: Integer | Integerable): Integer {
    const [result, overflow] = this.multiplyWithOverflow(multiplier)
    if (overflow) {
      throw new Error('Integer overflow')
    }
    return result
  }

  /**
   * Returns this Integer divided by another (integer division)
   */
  div(divisor: Integer | Integerable): Integer {
    const other = divisor instanceof Integer ? divisor : Integer.fromValue(divisor)

    if (other.isZero()) {
      throw new Error('Division by zero')
    }

    if (this.isZero()) {
      return Integer.ZERO
    }

    // Fast path: divide by ONE returns same instance
    if (other.equals(Integer.ONE)) {
      return this
    }

    if (this.equals(Integer.MIN_VALUE)) {
      if (other.equals(Integer.ONE) || other.equals(Integer.NEG_ONE)) {
        return Integer.MIN_VALUE // MIN_VALUE / -1 would overflow
      }
      if (other.equals(Integer.MIN_VALUE)) {
        return Integer.ONE
      }
      // Approximate by shifting
      const halfThis = this.shiftRight(1)
      const approx = halfThis.div(other).shiftLeft(1)
      if (approx.equals(Integer.ZERO)) {
        return other.isNegative() ? Integer.ONE : Integer.NEG_ONE
      }
      const rem = this.subtract(other.multiply(approx))
      return approx.add(rem.div(other))
    }

    if (other.equals(Integer.MIN_VALUE)) {
      return Integer.ZERO
    }

    if (this.isNegative()) {
      if (other.isNegative()) {
        return this.negate().div(other.negate())
      }
      return this.negate().div(other).negate()
    }
    if (other.isNegative()) {
      return this.div(other.negate()).negate()
    }

    // Use BigInt for simplicity and correctness
    const thisBigInt = this.toBigInt()
    const otherBigInt = other.toBigInt()
    return Integer.fromBigInt(thisBigInt / otherBigInt)
  }

  /**
   * Returns this Integer modulo another
   */
  modulo(divisor: Integer | Integerable): Integer {
    const other = divisor instanceof Integer ? divisor : Integer.fromValue(divisor)

    if (other.isZero()) {
      throw new Error('Division by zero')
    }

    // Fast path: modulo by ONE is always ZERO
    if (other.equals(Integer.ONE) || other.equals(Integer.NEG_ONE)) {
      return Integer.ZERO
    }

    return this.subtract(this.div(other).multiply(other))
  }

  /**
   * Returns the negation of this Integer
   */
  negate(): Integer {
    if (this.equals(Integer.MIN_VALUE)) {
      return Integer.MIN_VALUE
    }
    return this.not().add(Integer.ONE)
  }

  // ==================== Bitwise Operations ====================

  /**
   * Returns bitwise NOT
   */
  not(): Integer {
    return new Integer(~this.low, ~this.high)
  }

  /**
   * Returns bitwise AND
   */
  and(other: Integer | Integerable): Integer {
    const otherInt = other instanceof Integer ? other : Integer.fromValue(other)
    return new Integer(this.low & otherInt.low, this.high & otherInt.high)
  }

  /**
   * Returns bitwise OR
   */
  or(other: Integer | Integerable): Integer {
    const otherInt = other instanceof Integer ? other : Integer.fromValue(other)
    return new Integer(this.low | otherInt.low, this.high | otherInt.high)
  }

  /**
   * Returns bitwise XOR
   */
  xor(other: Integer | Integerable): Integer {
    const otherInt = other instanceof Integer ? other : Integer.fromValue(other)
    return new Integer(this.low ^ otherInt.low, this.high ^ otherInt.high)
  }

  /**
   * Returns this Integer with bits shifted left
   */
  shiftLeft(numBits: number | Integer): Integer {
    const bits = typeof numBits === 'number' ? numBits : numBits.toInt()
    const shift = bits & 63
    if (shift === 0) {
      return this
    }
    if (shift < 32) {
      return new Integer(
        this.low << shift,
        (this.high << shift) | (this.low >>> (32 - shift))
      )
    }
    return new Integer(0, this.low << (shift - 32))
  }

  /**
   * Returns this Integer with bits arithmetically shifted right
   */
  shiftRight(numBits: number | Integer): Integer {
    const bits = typeof numBits === 'number' ? numBits : numBits.toInt()
    const shift = bits & 63
    if (shift === 0) {
      return this
    }
    if (shift < 32) {
      return new Integer(
        (this.low >>> shift) | (this.high << (32 - shift)),
        this.high >> shift
      )
    }
    return new Integer(this.high >> (shift - 32), this.high >= 0 ? 0 : -1)
  }
}

// ==================== Exported Functions ====================

// Cache for small integers (-128 to 127) for performance
const INT_CACHE: Map<number, Integer> = new Map()
const CACHE_MIN = -128
const CACHE_MAX = 127

// Initialize cache
for (let i = CACHE_MIN; i <= CACHE_MAX; i++) {
  INT_CACHE.set(i, new Integer(i, i < 0 ? -1 : 0))
}

/**
 * Creates an Integer from any valid input
 * Small integers (-128 to 127) are cached for performance
 */
export const int = (val: Integerable): Integer => {
  // Fast path for cached small integers
  if (typeof val === 'number' && Number.isInteger(val) && val >= CACHE_MIN && val <= CACHE_MAX) {
    return INT_CACHE.get(val)!
  }
  return Integer.fromValue(val)
}

/**
 * Type guard to check if value is an Integer
 */
export const isInt = (obj: unknown): obj is Integer => Integer.isInteger(obj)

/**
 * Checks if an Integer is in JavaScript safe integer range
 */
export const inSafeRange = (val: Integer): boolean => Integer.inSafeRange(val)

/**
 * Converts an Integer to a number
 */
export const toNumber = (val: Integer): number => Integer.toNumber(val)

/**
 * Converts an Integer to a string
 */
export const toString = (val: Integer, radix?: number): string => Integer.toString(val, radix)

/**
 * Integer namespace for compatibility with neo4j-driver
 */
export const integer = {
  toNumber,
  toString,
  inSafeRange
}
