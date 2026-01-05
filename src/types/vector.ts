/**
 * Vector Type - First-class vector support for embeddings and AI/ML use cases
 *
 * This is a SUPERSET feature not in standard neo4j-driver.
 * It provides efficient vector storage and operations for AI workloads.
 */

/**
 * Supported data types for vectors
 */
export type VectorDType = 'int8' | 'int16' | 'int32' | 'int64' | 'float32' | 'float64'

/**
 * Mapping from dtype to the corresponding TypedArray type
 */
export type TypedArrayMap = {
  int8: Int8Array
  int16: Int16Array
  int32: Int32Array
  int64: BigInt64Array
  float32: Float32Array
  float64: Float64Array
}

/**
 * TypedArray union type
 */
export type TypedArray = TypedArrayMap[VectorDType]

/**
 * JSON representation of a Vector for serialization
 */
export interface VectorJSON {
  type: 'Vector'
  dtype: VectorDType
  dimensions: number
  data: (number | string)[] // string for BigInt values
}

/**
 * Vector class for efficient storage and manipulation of numerical vectors
 *
 * @example
 * ```typescript
 * // Create from Float32Array
 * const embedding = new Vector(new Float32Array([0.1, 0.2, 0.3]), 'float32')
 *
 * // Access properties
 * console.log(embedding.dimensions) // 3
 * console.log(embedding.dtype) // 'float32'
 *
 * // Element access
 * console.log(embedding.at(0)) // 0.1
 *
 * // Iteration
 * for (const value of embedding) {
 *   console.log(value)
 * }
 * ```
 */
export class Vector<T extends VectorDType = 'float32'> {
  readonly #data: TypedArrayMap[T]
  readonly dtype: T

  /**
   * Create a new Vector instance
   * @param data - The underlying TypedArray containing vector data
   * @param dtype - The data type identifier
   */
  constructor(data: TypedArrayMap[T], dtype: T) {
    this.#data = data
    this.dtype = dtype
  }

  /**
   * Number of elements in the vector
   */
  get dimensions(): number {
    return this.#data.length
  }

  /**
   * Size of the vector in bytes
   */
  get byteLength(): number {
    return this.#data.byteLength
  }

  /**
   * Get element at the specified index
   * @param index - The index (supports negative indexing)
   * @returns The element at the index, or undefined if out of bounds
   */
  at(index: number): number | bigint | undefined {
    const normalizedIndex = index < 0 ? this.#data.length + index : index
    if (normalizedIndex < 0 || normalizedIndex >= this.#data.length) {
      return undefined
    }
    return this.#data[normalizedIndex]
  }

  /**
   * Get the underlying TypedArray
   * @returns The TypedArray storing the vector data
   */
  asTypedArray(): TypedArrayMap[T] {
    return this.#data
  }

  /**
   * Convert to a regular JavaScript array
   * @returns Array of numbers (or bigints for int64)
   */
  toArray(): (number | bigint)[] {
    return Array.from(this.#data) as (number | bigint)[]
  }

  /**
   * Create a new Vector from a slice of this vector
   * @param start - Start index (inclusive)
   * @param end - End index (exclusive)
   * @returns New Vector containing the slice
   */
  slice(start?: number, end?: number): Vector<T> {
    const sliced = this.#data.slice(start, end) as TypedArrayMap[T]
    return new Vector(sliced, this.dtype)
  }

  /**
   * Iterate over vector elements
   */
  [Symbol.iterator](): Iterator<number | bigint> {
    return this.#data[Symbol.iterator]() as Iterator<number | bigint>
  }

  /**
   * String representation of the vector
   */
  toString(): string {
    const preview = this.#data.length > 5 ? [...this.#data.slice(0, 5), '...'] : [...this.#data]
    return `Vector<${this.dtype}>(${this.dimensions})[${preview.join(', ')}]`
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): VectorJSON {
    const data: (number | string)[] = []
    for (const value of this.#data) {
      // Convert BigInt to string for JSON serialization
      data.push(typeof value === 'bigint' ? value.toString() : (value as number))
    }

    return {
      type: 'Vector',
      dtype: this.dtype,
      dimensions: this.dimensions,
      data,
    }
  }

  /**
   * Reconstruct a Vector from JSON representation
   * @param json - The JSON object to parse
   * @returns A new Vector instance
   */
  static fromJSON<T extends VectorDType>(json: VectorJSON): Vector<T> {
    const { dtype, data } = json

    let typedArray: TypedArray

    switch (dtype) {
      case 'int8':
        typedArray = new Int8Array(data.map((v) => Number(v)))
        break
      case 'int16':
        typedArray = new Int16Array(data.map((v) => Number(v)))
        break
      case 'int32':
        typedArray = new Int32Array(data.map((v) => Number(v)))
        break
      case 'int64':
        typedArray = new BigInt64Array(data.map((v) => BigInt(v)))
        break
      case 'float32':
        typedArray = new Float32Array(data.map((v) => Number(v)))
        break
      case 'float64':
        typedArray = new Float64Array(data.map((v) => Number(v)))
        break
      default:
        throw new Error(`Unknown dtype: ${dtype}`)
    }

    return new Vector(typedArray as TypedArrayMap[T], dtype as T)
  }

  // ============================================
  // Vector Arithmetic Operations
  // ============================================

  /**
   * Add another vector element-wise
   * @param other - The vector to add
   * @returns A new vector with the sum
   */
  add(other: Vector): Vector<'float32'> {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    const result = new Float32Array(this.dimensions)
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(aData[i]) + Number(bData[i])
    }

    return new Vector(result, 'float32')
  }

  /**
   * Subtract another vector element-wise
   * @param other - The vector to subtract
   * @returns A new vector with the difference
   */
  subtract(other: Vector): Vector<'float32'> {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    const result = new Float32Array(this.dimensions)
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(aData[i]) - Number(bData[i])
    }

    return new Vector(result, 'float32')
  }

  /**
   * Multiply by a scalar
   * @param scalar - The scalar to multiply by
   * @returns A new vector with scaled values
   */
  multiply(scalar: number): Vector<'float32'> {
    const result = new Float32Array(this.dimensions)
    const data = this.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(data[i]) * scalar
    }

    return new Vector(result, 'float32')
  }

  /**
   * Divide by a scalar
   * @param scalar - The scalar to divide by
   * @returns A new vector with divided values
   */
  divide(scalar: number): Vector<'float32'> {
    if (scalar === 0) {
      throw new Error('Division by zero')
    }

    const result = new Float32Array(this.dimensions)
    const data = this.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(data[i]) / scalar
    }

    return new Vector(result, 'float32')
  }

  /**
   * Compute Hadamard (element-wise) product with another vector
   * @param other - The other vector
   * @returns A new vector with element-wise products
   */
  hadamard(other: Vector): Vector<'float32'> {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    const result = new Float32Array(this.dimensions)
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(aData[i]) * Number(bData[i])
    }

    return new Vector(result, 'float32')
  }

  /**
   * Compute dot product with another vector
   * @param other - The other vector to compute dot product with
   * @returns The dot product
   */
  dot(other: Vector): number {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    let result = 0
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result += Number(aData[i]) * Number(bData[i])
    }

    return result
  }

  // ============================================
  // Normalization and Magnitude
  // ============================================

  /**
   * Compute the L2 norm (magnitude) of this vector
   * @returns The L2 norm
   */
  norm(): number {
    let sumSquares = 0
    for (const value of this.#data) {
      const v = Number(value)
      sumSquares += v * v
    }
    return Math.sqrt(sumSquares)
  }

  /**
   * Alias for norm() - compute the magnitude of this vector
   * @returns The magnitude (L2 norm)
   */
  magnitude(): number {
    return this.norm()
  }

  /**
   * Return a normalized version of this vector (unit vector)
   * @returns A new vector with magnitude 1
   */
  normalize(): Vector<'float32'> {
    const mag = this.norm()
    if (mag === 0) {
      return new Vector(new Float32Array(this.dimensions), 'float32')
    }

    const normalized = new Float32Array(this.dimensions)
    const data = this.toArray()
    for (let i = 0; i < this.dimensions; i++) {
      normalized[i] = Number(data[i]) / mag
    }

    return new Vector(normalized, 'float32')
  }

  /**
   * Compute L1 norm (Manhattan norm / sum of absolute values)
   * @returns The L1 norm
   */
  l1Norm(): number {
    let sum = 0
    for (const value of this.#data) {
      sum += Math.abs(Number(value))
    }
    return sum
  }

  /**
   * Compute L-infinity norm (maximum absolute value)
   * @returns The L-infinity norm
   */
  lInfNorm(): number {
    let maxAbs = 0
    for (const value of this.#data) {
      const absVal = Math.abs(Number(value))
      if (absVal > maxAbs) {
        maxAbs = absVal
      }
    }
    return maxAbs
  }

  // ============================================
  // Similarity and Distance
  // ============================================

  /**
   * Compute cosine similarity with another vector
   * @param other - The other vector to compare with
   * @returns Cosine similarity score between -1 and 1
   */
  cosineSimilarity(other: Vector): number {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      const a = Number(aData[i])
      const b = Number(bData[i])
      dotProduct += a * b
      normA += a * a
      normB += b * b
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
    if (magnitude === 0) return 0

    return dotProduct / magnitude
  }

  /**
   * Compute cosine distance with another vector
   * @param other - The other vector to compare with
   * @returns Cosine distance (1 - cosine similarity), range [0, 2]
   */
  cosineDistance(other: Vector): number {
    return 1 - this.cosineSimilarity(other)
  }

  /**
   * Compute Euclidean distance to another vector
   * @param other - The other vector to compare with
   * @returns Euclidean distance (L2 norm of difference)
   */
  euclideanDistance(other: Vector): number {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    let sumSquares = 0
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      const diff = Number(aData[i]) - Number(bData[i])
      sumSquares += diff * diff
    }

    return Math.sqrt(sumSquares)
  }

  /**
   * Compute squared Euclidean distance (faster, avoids sqrt)
   * @param other - The other vector
   * @returns Squared Euclidean distance
   */
  squaredEuclideanDistance(other: Vector): number {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    let sumSquares = 0
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      const diff = Number(aData[i]) - Number(bData[i])
      sumSquares += diff * diff
    }

    return sumSquares
  }

  /**
   * Compute Manhattan (L1) distance to another vector
   * @param other - The other vector
   * @returns Manhattan distance
   */
  manhattanDistance(other: Vector): number {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    let sum = 0
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      sum += Math.abs(Number(aData[i]) - Number(bData[i]))
    }

    return sum
  }

  /**
   * Compute Chebyshev (L-infinity) distance to another vector
   * @param other - The other vector
   * @returns Chebyshev distance (max absolute difference)
   */
  chebyshevDistance(other: Vector): number {
    if (this.dimensions !== other.dimensions) {
      throw new Error(`Dimension mismatch: ${this.dimensions} vs ${other.dimensions}`)
    }

    let maxDiff = 0
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      const diff = Math.abs(Number(aData[i]) - Number(bData[i]))
      if (diff > maxDiff) {
        maxDiff = diff
      }
    }

    return maxDiff
  }

  // ============================================
  // Dimension Handling
  // ============================================

  /**
   * Concatenate this vector with another
   * @param other - The vector to concatenate
   * @returns A new vector with concatenated elements
   */
  concat(other: Vector): Vector<'float32'> {
    const result = new Float32Array(this.dimensions + other.dimensions)
    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(aData[i])
    }
    for (let i = 0; i < other.dimensions; i++) {
      result[this.dimensions + i] = Number(bData[i])
    }

    return new Vector(result, 'float32')
  }

  /**
   * Reshape vector to 2D array
   * @param rows - Number of rows
   * @param cols - Number of columns
   * @returns 2D array representation
   */
  reshape(rows: number, cols: number): (number | bigint)[][] {
    if (rows * cols !== this.dimensions) {
      throw new Error(
        `Cannot reshape vector of size ${this.dimensions} to (${rows}, ${cols})`
      )
    }

    const result: (number | bigint)[][] = []
    const data = this.toArray()

    for (let i = 0; i < rows; i++) {
      const row: (number | bigint)[] = []
      for (let j = 0; j < cols; j++) {
        row.push(data[i * cols + j])
      }
      result.push(row)
    }

    return result
  }

  /**
   * Pad vector to target dimension
   * @param targetDim - Target dimension
   * @param value - Value to pad with (default: 0)
   * @returns A new padded vector
   */
  pad(targetDim: number, value: number = 0): Vector<'float32'> {
    if (targetDim < this.dimensions) {
      throw new Error(
        `Target dimension ${targetDim} is smaller than current dimension ${this.dimensions}`
      )
    }

    const result = new Float32Array(targetDim)
    const data = this.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = Number(data[i])
    }
    for (let i = this.dimensions; i < targetDim; i++) {
      result[i] = value
    }

    return new Vector(result, 'float32')
  }

  /**
   * Truncate vector to target dimension
   * @param targetDim - Target dimension
   * @returns A new truncated vector
   */
  truncate(targetDim: number): Vector<'float32'> {
    if (targetDim > this.dimensions) {
      throw new Error(
        `Target dimension ${targetDim} is larger than current dimension ${this.dimensions}`
      )
    }

    const result = new Float32Array(targetDim)
    const data = this.toArray()

    for (let i = 0; i < targetDim; i++) {
      result[i] = Number(data[i])
    }

    return new Vector(result, 'float32')
  }

  // ============================================
  // Serialization
  // ============================================

  /**
   * Encode vector to base64 string
   * @returns Base64 encoded string
   */
  toBase64(): string {
    const bytes = new Uint8Array(this.#data.buffer, this.#data.byteOffset, this.#data.byteLength)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Decode vector from base64 string
   * @param base64 - Base64 encoded string
   * @param dtype - Data type of the vector
   * @returns A new Vector instance
   */
  static fromBase64<T extends VectorDType>(base64: string, dtype: T): Vector<T> {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    let typedArray: TypedArray

    switch (dtype) {
      case 'int8':
        typedArray = new Int8Array(bytes.buffer)
        break
      case 'int16':
        typedArray = new Int16Array(bytes.buffer)
        break
      case 'int32':
        typedArray = new Int32Array(bytes.buffer)
        break
      case 'int64':
        typedArray = new BigInt64Array(bytes.buffer)
        break
      case 'float32':
        typedArray = new Float32Array(bytes.buffer)
        break
      case 'float64':
        typedArray = new Float64Array(bytes.buffer)
        break
      default:
        throw new Error(`Unknown dtype: ${dtype}`)
    }

    return new Vector(typedArray as TypedArrayMap[T], dtype)
  }

  // ============================================
  // Static Factory Methods
  // ============================================

  /**
   * Create a zero vector of specified dimension
   * @param dim - Number of dimensions
   * @param dtype - Data type (default: float32)
   * @returns A new zero vector
   */
  static zeros<T extends VectorDType = 'float32'>(dim: number, dtype?: T): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const typedArray = createTypedArray(new Array(dim).fill(0), actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  /**
   * Create a vector of ones
   * @param dim - Number of dimensions
   * @param dtype - Data type (default: float32)
   * @returns A new vector of ones
   */
  static ones<T extends VectorDType = 'float32'>(dim: number, dtype?: T): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const typedArray = createTypedArray(new Array(dim).fill(1), actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  /**
   * Create a vector filled with a specific value
   * @param dim - Number of dimensions
   * @param value - Value to fill with
   * @param dtype - Data type (default: float32)
   * @returns A new filled vector
   */
  static fill<T extends VectorDType = 'float32'>(
    dim: number,
    value: number,
    dtype?: T
  ): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const typedArray = createTypedArray(new Array(dim).fill(value), actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  /**
   * Create a vector with random values between 0 and 1
   * @param dim - Number of dimensions
   * @param dtype - Data type (default: float32)
   * @returns A new random vector
   */
  static random<T extends VectorDType = 'float32'>(dim: number, dtype?: T): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const values = new Array(dim)
    for (let i = 0; i < dim; i++) {
      values[i] = Math.random()
    }
    const typedArray = createTypedArray(values, actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  /**
   * Create a vector with random values from normal distribution
   * @param dim - Number of dimensions
   * @param mean - Mean of the distribution (default: 0)
   * @param std - Standard deviation (default: 1)
   * @param dtype - Data type (default: float32)
   * @returns A new random vector
   */
  static randomNormal<T extends VectorDType = 'float32'>(
    dim: number,
    mean: number = 0,
    std: number = 1,
    dtype?: T
  ): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const values = new Array(dim)
    for (let i = 0; i < dim; i++) {
      // Box-Muller transform
      const u1 = Math.random()
      const u2 = Math.random()
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      values[i] = z0 * std + mean
    }
    const typedArray = createTypedArray(values, actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  /**
   * Create a range vector
   * @param start - Start value
   * @param end - End value (exclusive)
   * @param step - Step size (default: 1)
   * @param dtype - Data type (default: float32)
   * @returns A new range vector
   */
  static range<T extends VectorDType = 'float32'>(
    start: number,
    end: number,
    step: number = 1,
    dtype?: T
  ): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const values: number[] = []

    if (step > 0) {
      for (let i = start; i < end; i += step) {
        values.push(i)
      }
    } else if (step < 0) {
      for (let i = start; i > end; i += step) {
        values.push(i)
      }
    } else {
      throw new Error('Step cannot be zero')
    }

    const typedArray = createTypedArray(values, actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  /**
   * Create a linearly spaced vector
   * @param start - Start value
   * @param end - End value
   * @param num - Number of points
   * @param dtype - Data type (default: float32)
   * @returns A new linearly spaced vector
   */
  static linspace<T extends VectorDType = 'float32'>(
    start: number,
    end: number,
    num: number,
    dtype?: T
  ): Vector<T> {
    const actualDtype = dtype ?? ('float32' as T)
    const values: number[] = []
    const step = (end - start) / (num - 1)

    for (let i = 0; i < num; i++) {
      values.push(start + step * i)
    }

    const typedArray = createTypedArray(values, actualDtype)
    return new Vector(typedArray, actualDtype)
  }

  // ============================================
  // Statistical Operations
  // ============================================

  /**
   * Sum of all elements
   * @returns The sum
   */
  sum(): number {
    let result = 0
    for (const value of this.#data) {
      result += Number(value)
    }
    return result
  }

  /**
   * Arithmetic mean of all elements
   * @returns The mean
   */
  mean(): number {
    if (this.dimensions === 0) return NaN
    return this.sum() / this.dimensions
  }

  /**
   * Population variance of elements
   * @returns The variance
   */
  variance(): number {
    if (this.dimensions === 0) return NaN
    const avg = this.mean()
    let sumSquares = 0
    for (const value of this.#data) {
      const diff = Number(value) - avg
      sumSquares += diff * diff
    }
    return sumSquares / this.dimensions
  }

  /**
   * Population standard deviation of elements
   * @returns The standard deviation
   */
  std(): number {
    return Math.sqrt(this.variance())
  }

  /**
   * Minimum value
   * @returns The minimum
   */
  min(): number | bigint {
    if (this.dimensions === 0) return NaN
    let minVal = this.#data[0]
    for (let i = 1; i < this.dimensions; i++) {
      if (this.#data[i] < minVal) {
        minVal = this.#data[i]
      }
    }
    return minVal
  }

  /**
   * Maximum value
   * @returns The maximum
   */
  max(): number | bigint {
    if (this.dimensions === 0) return NaN
    let maxVal = this.#data[0]
    for (let i = 1; i < this.dimensions; i++) {
      if (this.#data[i] > maxVal) {
        maxVal = this.#data[i]
      }
    }
    return maxVal
  }

  /**
   * Index of minimum value
   * @returns The index
   */
  argmin(): number {
    if (this.dimensions === 0) return -1
    let minIdx = 0
    let minVal = this.#data[0]
    for (let i = 1; i < this.dimensions; i++) {
      if (this.#data[i] < minVal) {
        minVal = this.#data[i]
        minIdx = i
      }
    }
    return minIdx
  }

  /**
   * Index of maximum value
   * @returns The index
   */
  argmax(): number {
    if (this.dimensions === 0) return -1
    let maxIdx = 0
    let maxVal = this.#data[0]
    for (let i = 1; i < this.dimensions; i++) {
      if (this.#data[i] > maxVal) {
        maxVal = this.#data[i]
        maxIdx = i
      }
    }
    return maxIdx
  }

  // ============================================
  // Transformation Operations
  // ============================================

  /**
   * Apply a function to each element
   * @param fn - Function to apply
   * @returns A new transformed vector
   */
  map(fn: (value: number | bigint, index: number) => number): Vector<'float32'> {
    const result = new Float32Array(this.dimensions)
    const data = this.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      result[i] = fn(data[i], i)
    }

    return new Vector(result, 'float32')
  }

  /**
   * Absolute value of each element
   * @returns A new vector with absolute values
   */
  abs(): Vector<'float32'> {
    return this.map((v) => Math.abs(Number(v)))
  }

  /**
   * Negate each element
   * @returns A new negated vector
   */
  negate(): Vector<'float32'> {
    return this.map((v) => -Number(v))
  }

  /**
   * Square root of each element
   * @returns A new vector with square roots
   */
  sqrt(): Vector<'float32'> {
    return this.map((v) => Math.sqrt(Number(v)))
  }

  /**
   * Raise each element to a power
   * @param exponent - The exponent
   * @returns A new vector with powered values
   */
  pow(exponent: number): Vector<'float32'> {
    return this.map((v) => Math.pow(Number(v), exponent))
  }

  /**
   * Exponential of each element (e^x)
   * @returns A new vector with exponentials
   */
  exp(): Vector<'float32'> {
    return this.map((v) => Math.exp(Number(v)))
  }

  /**
   * Natural logarithm of each element
   * @returns A new vector with logarithms
   */
  log(): Vector<'float32'> {
    return this.map((v) => Math.log(Number(v)))
  }

  /**
   * Clamp each element to a range
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns A new clamped vector
   */
  clamp(min: number, max: number): Vector<'float32'> {
    return this.map((v) => Math.max(min, Math.min(max, Number(v))))
  }

  /**
   * Apply softmax function
   * @returns A new vector with softmax applied
   */
  softmax(): Vector<'float32'> {
    const maxVal = Number(this.max())
    const expVec = this.map((v) => Math.exp(Number(v) - maxVal))
    const sumExp = expVec.sum()
    return expVec.map((v) => Number(v) / sumExp)
  }

  // ============================================
  // Comparison Operations
  // ============================================

  /**
   * Check if two vectors are equal
   * @param other - The other vector
   * @returns True if equal
   */
  equals(other: Vector): boolean {
    if (this.dimensions !== other.dimensions) {
      return false
    }

    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      if (aData[i] !== bData[i]) {
        return false
      }
    }

    return true
  }

  /**
   * Check if two vectors are almost equal within tolerance
   * @param other - The other vector
   * @param tolerance - Maximum difference allowed
   * @returns True if almost equal
   */
  almostEquals(other: Vector, tolerance: number): boolean {
    if (this.dimensions !== other.dimensions) {
      return false
    }

    const aData = this.toArray()
    const bData = other.toArray()

    for (let i = 0; i < this.dimensions; i++) {
      if (Math.abs(Number(aData[i]) - Number(bData[i])) > tolerance) {
        return false
      }
    }

    return true
  }
}

/**
 * Infer dtype from TypedArray
 */
function inferDType(data: TypedArray): VectorDType {
  if (data instanceof Int8Array) return 'int8'
  if (data instanceof Int16Array) return 'int16'
  if (data instanceof Int32Array) return 'int32'
  if (data instanceof BigInt64Array) return 'int64'
  if (data instanceof Float32Array) return 'float32'
  if (data instanceof Float64Array) return 'float64'
  throw new Error('Unknown TypedArray type')
}

/**
 * Create TypedArray from array based on dtype
 */
function createTypedArray<T extends VectorDType>(
  data: ArrayLike<number> | ArrayLike<bigint>,
  dtype: T
): TypedArrayMap[T] {
  switch (dtype) {
    case 'int8':
      return new Int8Array(data as ArrayLike<number>) as TypedArrayMap[T]
    case 'int16':
      return new Int16Array(data as ArrayLike<number>) as TypedArrayMap[T]
    case 'int32':
      return new Int32Array(data as ArrayLike<number>) as TypedArrayMap[T]
    case 'int64':
      return new BigInt64Array(data as ArrayLike<bigint>) as TypedArrayMap[T]
    case 'float32':
      return new Float32Array(data as ArrayLike<number>) as TypedArrayMap[T]
    case 'float64':
      return new Float64Array(data as ArrayLike<number>) as TypedArrayMap[T]
    default:
      throw new Error(`Unknown dtype: ${dtype}`)
  }
}

/**
 * Factory function to create Vector instances
 *
 * @example
 * ```typescript
 * // From Float32Array (most common for embeddings)
 * const v1 = vector(new Float32Array([0.1, 0.2, 0.3]))
 *
 * // From regular array (auto-converts to float32)
 * const v2 = vector([0.1, 0.2, 0.3])
 *
 * // With explicit dtype
 * const v3 = vector([1, 2, 3], 'int32')
 * ```
 *
 * @param data - Array or TypedArray of values
 * @param dtype - Optional data type (inferred if not provided)
 * @returns A new Vector instance
 */
export function vector<T extends VectorDType>(
  data: ArrayLike<number> | ArrayLike<bigint> | TypedArray,
  dtype?: T
): Vector<T> {
  // If data is already a TypedArray
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    const typedData = data as TypedArray
    const inferredDType = dtype ?? (inferDType(typedData) as T)

    // If requested dtype matches, use directly
    if (dtype === undefined || dtype === inferredDType) {
      return new Vector(typedData as TypedArrayMap[T], inferredDType as T)
    }

    // Otherwise convert
    const converted = createTypedArray(
      Array.from(typedData) as ArrayLike<number>,
      dtype
    )
    return new Vector(converted, dtype)
  }

  // Regular array - default to float32
  const targetDType = dtype ?? ('float32' as T)
  const typedArray = createTypedArray(data as ArrayLike<number>, targetDType)
  return new Vector(typedArray, targetDType)
}

/**
 * Type guard to check if a value is a Vector
 * @param value - The value to check
 * @returns True if value is a Vector instance
 */
export function isVector(value: unknown): value is Vector {
  return value instanceof Vector
}
