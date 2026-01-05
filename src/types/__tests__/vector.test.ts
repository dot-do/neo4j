import { describe, it, expect } from 'vitest'
import { Vector, vector, isVector, VectorDType, VectorJSON } from '../vector'

describe('Vector', () => {
  describe('Construction and Validation', () => {
    describe('Vector class constructor', () => {
      it('creates Vector from Float32Array', () => {
        const data = new Float32Array([1.0, 2.0, 3.0])
        const v = new Vector(data, 'float32')
        expect(v).toBeInstanceOf(Vector)
        expect(v.dtype).toBe('float32')
        expect(v.dimensions).toBe(3)
      })

      it('creates Vector from Float64Array', () => {
        const data = new Float64Array([1.0, 2.0, 3.0])
        const v = new Vector(data, 'float64')
        expect(v.dtype).toBe('float64')
        expect(v.dimensions).toBe(3)
      })

      it('creates Vector from Int8Array', () => {
        const data = new Int8Array([1, 2, 3])
        const v = new Vector(data, 'int8')
        expect(v.dtype).toBe('int8')
        expect(v.dimensions).toBe(3)
      })

      it('creates Vector from Int16Array', () => {
        const data = new Int16Array([1, 2, 3])
        const v = new Vector(data, 'int16')
        expect(v.dtype).toBe('int16')
      })

      it('creates Vector from Int32Array', () => {
        const data = new Int32Array([1, 2, 3])
        const v = new Vector(data, 'int32')
        expect(v.dtype).toBe('int32')
      })

      it('creates Vector from BigInt64Array', () => {
        const data = new BigInt64Array([1n, 2n, 3n])
        const v = new Vector(data, 'int64')
        expect(v.dtype).toBe('int64')
        expect(v.dimensions).toBe(3)
      })

      it('handles empty array', () => {
        const data = new Float32Array([])
        const v = new Vector(data, 'float32')
        expect(v.dimensions).toBe(0)
      })

      it('handles large vectors', () => {
        const data = new Float32Array(1536) // Common embedding size
        const v = new Vector(data, 'float32')
        expect(v.dimensions).toBe(1536)
      })
    })

    describe('vector() factory function', () => {
      it('creates Vector from regular array (defaults to float32)', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(v.dtype).toBe('float32')
        expect(v.dimensions).toBe(3)
      })

      it('creates Vector from array with explicit dtype', () => {
        const v = vector([1, 2, 3], 'int32')
        expect(v.dtype).toBe('int32')
      })

      it('creates Vector from Float32Array', () => {
        const v = vector(new Float32Array([1.0, 2.0, 3.0]))
        expect(v.dtype).toBe('float32')
      })

      it('creates Vector from TypedArray with dtype conversion', () => {
        const v = vector(new Int32Array([1, 2, 3]), 'float32')
        expect(v.dtype).toBe('float32')
        expect(v.at(0)).toBe(1.0)
      })

      it('infers dtype from TypedArray when not specified', () => {
        const v = vector(new Int16Array([1, 2, 3]))
        expect(v.dtype).toBe('int16')
      })

      it('handles BigInt arrays for int64', () => {
        const v = vector([1n, 2n, 3n] as unknown as ArrayLike<bigint>, 'int64')
        expect(v.dtype).toBe('int64')
        expect(v.at(0)).toBe(1n)
      })
    })

    describe('Validation', () => {
      it('validates dimension bounds on vector creation', () => {
        // Very large dimension should work
        const large = new Float32Array(10000)
        const v = vector(large)
        expect(v.dimensions).toBe(10000)
      })

      it('rejects invalid dtype values', () => {
        // This should throw or handle gracefully
        expect(() => {
          const data = [1, 2, 3]
          // @ts-expect-error - Testing invalid dtype
          vector(data, 'invalid_dtype')
        }).toThrow()
      })

      it('handles NaN values', () => {
        const v = vector([1.0, NaN, 3.0])
        expect(Number.isNaN(v.at(1))).toBe(true)
      })

      it('handles Infinity values', () => {
        const v = vector([1.0, Infinity, -Infinity])
        expect(v.at(1)).toBe(Infinity)
        expect(v.at(2)).toBe(-Infinity)
      })
    })
  })

  describe('Element Access', () => {
    it('at() returns element at index', () => {
      const v = vector([1.0, 2.0, 3.0])
      expect(v.at(0)).toBe(1.0)
      expect(v.at(1)).toBe(2.0)
      expect(v.at(2)).toBe(3.0)
    })

    it('at() supports negative indexing', () => {
      const v = vector([1.0, 2.0, 3.0])
      expect(v.at(-1)).toBe(3.0)
      expect(v.at(-2)).toBe(2.0)
      expect(v.at(-3)).toBe(1.0)
    })

    it('at() returns undefined for out of bounds', () => {
      const v = vector([1.0, 2.0, 3.0])
      expect(v.at(3)).toBeUndefined()
      expect(v.at(-4)).toBeUndefined()
    })

    it('asTypedArray() returns underlying data', () => {
      const data = new Float32Array([1.0, 2.0, 3.0])
      const v = new Vector(data, 'float32')
      expect(v.asTypedArray()).toBe(data)
    })

    it('toArray() converts to regular array', () => {
      const v = vector([1.0, 2.0, 3.0])
      const arr = v.toArray()
      expect(arr).toEqual([1.0, 2.0, 3.0])
      expect(Array.isArray(arr)).toBe(true)
    })

    it('iteration works with for...of', () => {
      const v = vector([1.0, 2.0, 3.0])
      const values: number[] = []
      for (const val of v) {
        values.push(val as number)
      }
      expect(values).toEqual([1.0, 2.0, 3.0])
    })

    it('byteLength returns correct size', () => {
      const v32 = vector([1.0, 2.0, 3.0], 'float32')
      expect(v32.byteLength).toBe(12) // 3 * 4 bytes

      const v64 = vector([1.0, 2.0, 3.0], 'float64')
      expect(v64.byteLength).toBe(24) // 3 * 8 bytes
    })
  })

  describe('Vector Arithmetic', () => {
    describe('add()', () => {
      it('adds two vectors element-wise', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 5.0, 6.0])
        const result = a.add(b)
        expect(result.toArray()).toEqual([5.0, 7.0, 9.0])
      })

      it('returns a new vector (does not mutate)', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 1.0, 1.0])
        const result = a.add(b)
        expect(result).not.toBe(a)
        expect(a.toArray()).toEqual([1.0, 2.0, 3.0])
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 2.0])
        expect(() => a.add(b)).toThrow(/dimension/i)
      })

      it('handles negative values', () => {
        const a = vector([1.0, -2.0, 3.0])
        const b = vector([-1.0, 2.0, -3.0])
        const result = a.add(b)
        expect(result.toArray()).toEqual([0.0, 0.0, 0.0])
      })

      it('works with different dtypes', () => {
        const a = vector([1, 2, 3], 'int32')
        const b = vector([4, 5, 6], 'int32')
        const result = a.add(b)
        expect(result.toArray()).toEqual([5, 7, 9])
      })
    })

    describe('subtract()', () => {
      it('subtracts two vectors element-wise', () => {
        const a = vector([5.0, 7.0, 9.0])
        const b = vector([1.0, 2.0, 3.0])
        const result = a.subtract(b)
        expect(result.toArray()).toEqual([4.0, 5.0, 6.0])
      })

      it('returns a new vector (does not mutate)', () => {
        const a = vector([5.0, 5.0, 5.0])
        const b = vector([1.0, 1.0, 1.0])
        const result = a.subtract(b)
        expect(result).not.toBe(a)
        expect(a.toArray()).toEqual([5.0, 5.0, 5.0])
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 2.0])
        expect(() => a.subtract(b)).toThrow(/dimension/i)
      })

      it('handles negative results', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([5.0, 5.0, 5.0])
        const result = a.subtract(b)
        expect(result.toArray()).toEqual([-4.0, -3.0, -2.0])
      })
    })

    describe('multiply() - scalar multiplication', () => {
      it('multiplies vector by scalar', () => {
        const v = vector([1.0, 2.0, 3.0])
        const result = v.multiply(2)
        expect(result.toArray()).toEqual([2.0, 4.0, 6.0])
      })

      it('handles zero scalar', () => {
        const v = vector([1.0, 2.0, 3.0])
        const result = v.multiply(0)
        expect(result.toArray()).toEqual([0.0, 0.0, 0.0])
      })

      it('handles negative scalar', () => {
        const v = vector([1.0, 2.0, 3.0])
        const result = v.multiply(-1)
        expect(result.toArray()).toEqual([-1.0, -2.0, -3.0])
      })

      it('handles fractional scalar', () => {
        const v = vector([2.0, 4.0, 6.0])
        const result = v.multiply(0.5)
        expect(result.toArray()).toEqual([1.0, 2.0, 3.0])
      })
    })

    describe('divide() - scalar division', () => {
      it('divides vector by scalar', () => {
        const v = vector([2.0, 4.0, 6.0])
        const result = v.divide(2)
        expect(result.toArray()).toEqual([1.0, 2.0, 3.0])
      })

      it('throws on division by zero', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(() => v.divide(0)).toThrow()
      })

      it('handles fractional divisor', () => {
        const v = vector([1.0, 2.0, 3.0])
        const result = v.divide(0.5)
        expect(result.toArray()).toEqual([2.0, 4.0, 6.0])
      })
    })

    describe('dot() - dot product', () => {
      it('computes dot product of two vectors', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 5.0, 6.0])
        // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
        expect(a.dot(b)).toBe(32)
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 2.0])
        expect(() => a.dot(b)).toThrow(/dimension/i)
      })

      it('returns 0 for orthogonal vectors', () => {
        const a = vector([1.0, 0.0, 0.0])
        const b = vector([0.0, 1.0, 0.0])
        expect(a.dot(b)).toBe(0)
      })

      it('handles negative values', () => {
        const a = vector([1.0, -2.0, 3.0])
        const b = vector([-1.0, 2.0, -3.0])
        // 1*(-1) + (-2)*2 + 3*(-3) = -1 - 4 - 9 = -14
        expect(a.dot(b)).toBe(-14)
      })

      it('computes correctly for unit vectors', () => {
        const a = vector([1.0, 0.0, 0.0])
        const b = vector([1.0, 0.0, 0.0])
        expect(a.dot(b)).toBe(1)
      })

      it('works with high-dimensional vectors', () => {
        const a = vector(new Array(100).fill(1.0))
        const b = vector(new Array(100).fill(2.0))
        expect(a.dot(b)).toBe(200) // 100 * 1 * 2
      })
    })

    describe('hadamard() - element-wise multiplication', () => {
      it('computes Hadamard product', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 5.0, 6.0])
        const result = a.hadamard(b)
        expect(result.toArray()).toEqual([4.0, 10.0, 18.0])
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 2.0])
        expect(() => a.hadamard(b)).toThrow(/dimension/i)
      })
    })
  })

  describe('Normalization and Magnitude', () => {
    describe('norm() - L2 norm / magnitude', () => {
      it('computes L2 norm', () => {
        const v = vector([3.0, 4.0])
        expect(v.norm()).toBe(5) // sqrt(9 + 16) = 5
      })

      it('returns 0 for zero vector', () => {
        const v = vector([0.0, 0.0, 0.0])
        expect(v.norm()).toBe(0)
      })

      it('returns 1 for unit vectors', () => {
        const v = vector([1.0, 0.0, 0.0])
        expect(v.norm()).toBe(1)
      })

      it('handles negative values', () => {
        const v = vector([-3.0, 4.0])
        expect(v.norm()).toBe(5)
      })

      it('computes correctly for high-dimensional vectors', () => {
        // Vector of all 1s, norm = sqrt(n)
        const v = vector(new Array(100).fill(1.0))
        expect(v.norm()).toBeCloseTo(10, 5) // sqrt(100) = 10
      })
    })

    describe('magnitude() - alias for norm', () => {
      it('is an alias for norm()', () => {
        const v = vector([3.0, 4.0])
        expect(v.magnitude()).toBe(v.norm())
      })
    })

    describe('normalize()', () => {
      it('returns unit vector', () => {
        const v = vector([3.0, 4.0])
        const normalized = v.normalize()
        // Float32 has ~7 decimal digits of precision
        expect(normalized.norm()).toBeCloseTo(1, 5)
      })

      it('preserves direction', () => {
        const v = vector([3.0, 4.0])
        const normalized = v.normalize()
        // Direction should be [0.6, 0.8] - use float32 precision tolerance
        expect(normalized.at(0)).toBeCloseTo(0.6, 5)
        expect(normalized.at(1)).toBeCloseTo(0.8, 5)
      })

      it('returns zero vector for zero input', () => {
        const v = vector([0.0, 0.0, 0.0])
        const normalized = v.normalize()
        expect(normalized.toArray()).toEqual([0.0, 0.0, 0.0])
      })

      it('returns float32 vector', () => {
        const v = vector([3, 4], 'int32')
        const normalized = v.normalize()
        expect(normalized.dtype).toBe('float32')
      })

      it('handles negative values', () => {
        const v = vector([-3.0, -4.0])
        const normalized = v.normalize()
        // Use float32 precision tolerance
        expect(normalized.at(0)).toBeCloseTo(-0.6, 5)
        expect(normalized.at(1)).toBeCloseTo(-0.8, 5)
      })
    })

    describe('l1Norm() - Manhattan norm', () => {
      it('computes L1 norm (sum of absolute values)', () => {
        const v = vector([1.0, -2.0, 3.0])
        expect(v.l1Norm()).toBe(6) // |1| + |-2| + |3|
      })

      it('returns 0 for zero vector', () => {
        const v = vector([0.0, 0.0, 0.0])
        expect(v.l1Norm()).toBe(0)
      })
    })

    describe('lInfNorm() - Maximum norm', () => {
      it('computes L-infinity norm (max absolute value)', () => {
        const v = vector([1.0, -5.0, 3.0])
        expect(v.lInfNorm()).toBe(5) // max(|1|, |-5|, |3|)
      })

      it('returns 0 for zero vector', () => {
        const v = vector([0.0, 0.0, 0.0])
        expect(v.lInfNorm()).toBe(0)
      })
    })
  })

  describe('Similarity and Distance', () => {
    describe('cosineSimilarity()', () => {
      it('returns 1 for identical vectors', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(v.cosineSimilarity(v)).toBeCloseTo(1, 10)
      })

      it('returns -1 for opposite vectors', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([-1.0, -2.0, -3.0])
        expect(a.cosineSimilarity(b)).toBeCloseTo(-1, 10)
      })

      it('returns 0 for orthogonal vectors', () => {
        const a = vector([1.0, 0.0, 0.0])
        const b = vector([0.0, 1.0, 0.0])
        expect(a.cosineSimilarity(b)).toBeCloseTo(0, 10)
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 2.0])
        expect(() => a.cosineSimilarity(b)).toThrow(/dimension/i)
      })

      it('returns 0 for zero vectors', () => {
        const a = vector([0.0, 0.0, 0.0])
        const b = vector([1.0, 2.0, 3.0])
        expect(a.cosineSimilarity(b)).toBe(0)
      })

      it('is independent of magnitude', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([2.0, 4.0, 6.0]) // Same direction, 2x magnitude
        expect(a.cosineSimilarity(b)).toBeCloseTo(1, 10)
      })

      it('handles real-world embedding similarity', () => {
        // Simulate two somewhat similar embeddings
        const embedding1 = vector([0.1, 0.2, 0.3, 0.4])
        const embedding2 = vector([0.15, 0.25, 0.28, 0.38])
        const similarity = embedding1.cosineSimilarity(embedding2)
        expect(similarity).toBeGreaterThan(0.9) // Should be highly similar
        expect(similarity).toBeLessThanOrEqual(1.0)
      })
    })

    describe('cosineDistance()', () => {
      it('returns 0 for identical vectors', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(v.cosineDistance(v)).toBeCloseTo(0, 10)
      })

      it('returns 2 for opposite vectors', () => {
        const a = vector([1.0, 0.0])
        const b = vector([-1.0, 0.0])
        expect(a.cosineDistance(b)).toBeCloseTo(2, 10)
      })

      it('returns 1 for orthogonal vectors', () => {
        const a = vector([1.0, 0.0])
        const b = vector([0.0, 1.0])
        expect(a.cosineDistance(b)).toBeCloseTo(1, 10)
      })
    })

    describe('euclideanDistance()', () => {
      it('computes distance correctly', () => {
        const a = vector([0.0, 0.0])
        const b = vector([3.0, 4.0])
        expect(a.euclideanDistance(b)).toBe(5)
      })

      it('returns 0 for identical vectors', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(v.euclideanDistance(v)).toBe(0)
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0, 2.0])
        expect(() => a.euclideanDistance(b)).toThrow(/dimension/i)
      })

      it('is symmetric', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 5.0, 6.0])
        expect(a.euclideanDistance(b)).toBe(b.euclideanDistance(a))
      })

      it('handles high-dimensional vectors', () => {
        const a = vector(new Array(100).fill(0.0))
        const b = vector(new Array(100).fill(1.0))
        // Distance = sqrt(100 * 1^2) = 10
        expect(a.euclideanDistance(b)).toBeCloseTo(10, 5)
      })
    })

    describe('squaredEuclideanDistance()', () => {
      it('returns squared distance (avoids sqrt)', () => {
        const a = vector([0.0, 0.0])
        const b = vector([3.0, 4.0])
        expect(a.squaredEuclideanDistance(b)).toBe(25) // 9 + 16
      })

      it('is faster for comparisons', () => {
        // Just verify it works correctly
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 5.0, 6.0])
        const euclidean = a.euclideanDistance(b)
        const squared = a.squaredEuclideanDistance(b)
        expect(squared).toBeCloseTo(euclidean * euclidean, 10)
      })
    })

    describe('manhattanDistance()', () => {
      it('computes L1 distance', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 6.0, 8.0])
        // |1-4| + |2-6| + |3-8| = 3 + 4 + 5 = 12
        expect(a.manhattanDistance(b)).toBe(12)
      })

      it('returns 0 for identical vectors', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(v.manhattanDistance(v)).toBe(0)
      })

      it('throws on dimension mismatch', () => {
        const a = vector([1.0, 2.0])
        const b = vector([1.0])
        expect(() => a.manhattanDistance(b)).toThrow(/dimension/i)
      })
    })

    describe('chebyshevDistance()', () => {
      it('computes L-infinity distance (max diff)', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([4.0, 10.0, 5.0])
        // max(|1-4|, |2-10|, |3-5|) = max(3, 8, 2) = 8
        expect(a.chebyshevDistance(b)).toBe(8)
      })

      it('returns 0 for identical vectors', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(v.chebyshevDistance(v)).toBe(0)
      })
    })
  })

  describe('Dimension Handling', () => {
    describe('dimensions property', () => {
      it('returns correct dimension count', () => {
        expect(vector([1, 2, 3]).dimensions).toBe(3)
        expect(vector([]).dimensions).toBe(0)
        expect(vector(new Float32Array(1536)).dimensions).toBe(1536)
      })
    })

    describe('slice()', () => {
      it('returns new vector with sliced elements', () => {
        const v = vector([1.0, 2.0, 3.0, 4.0, 5.0])
        const sliced = v.slice(1, 4)
        expect(sliced.toArray()).toEqual([2.0, 3.0, 4.0])
      })

      it('preserves dtype', () => {
        const v = vector([1, 2, 3, 4, 5], 'int32')
        const sliced = v.slice(0, 3)
        expect(sliced.dtype).toBe('int32')
      })

      it('handles omitted start', () => {
        const v = vector([1.0, 2.0, 3.0])
        const sliced = v.slice(undefined, 2)
        expect(sliced.toArray()).toEqual([1.0, 2.0])
      })

      it('handles omitted end', () => {
        const v = vector([1.0, 2.0, 3.0])
        const sliced = v.slice(1)
        expect(sliced.toArray()).toEqual([2.0, 3.0])
      })
    })

    describe('concat()', () => {
      it('concatenates two vectors', () => {
        const a = vector([1.0, 2.0])
        const b = vector([3.0, 4.0])
        const result = a.concat(b)
        expect(result.toArray()).toEqual([1.0, 2.0, 3.0, 4.0])
      })

      it('handles empty vector concatenation', () => {
        const a = vector([1.0, 2.0])
        const empty = vector([])
        expect(a.concat(empty).toArray()).toEqual([1.0, 2.0])
        expect(empty.concat(a).toArray()).toEqual([1.0, 2.0])
      })
    })

    describe('reshape()', () => {
      it('reshapes vector to 2D array', () => {
        const v = vector([1, 2, 3, 4, 5, 6])
        const reshaped = v.reshape(2, 3)
        expect(reshaped).toEqual([
          [1, 2, 3],
          [4, 5, 6],
        ])
      })

      it('throws if dimensions do not match', () => {
        const v = vector([1, 2, 3, 4, 5])
        expect(() => v.reshape(2, 3)).toThrow()
      })
    })

    describe('pad()', () => {
      it('pads vector to target dimension', () => {
        const v = vector([1.0, 2.0, 3.0])
        const padded = v.pad(5)
        expect(padded.dimensions).toBe(5)
        expect(padded.toArray()).toEqual([1.0, 2.0, 3.0, 0.0, 0.0])
      })

      it('pads with custom value', () => {
        const v = vector([1.0, 2.0])
        const padded = v.pad(4, -1)
        expect(padded.toArray()).toEqual([1.0, 2.0, -1.0, -1.0])
      })

      it('returns copy if already at target dimension', () => {
        const v = vector([1.0, 2.0, 3.0])
        const padded = v.pad(3)
        expect(padded.toArray()).toEqual([1.0, 2.0, 3.0])
      })

      it('throws if target dimension is smaller', () => {
        const v = vector([1.0, 2.0, 3.0])
        expect(() => v.pad(2)).toThrow()
      })
    })

    describe('truncate()', () => {
      it('truncates vector to target dimension', () => {
        const v = vector([1.0, 2.0, 3.0, 4.0, 5.0])
        const truncated = v.truncate(3)
        expect(truncated.toArray()).toEqual([1.0, 2.0, 3.0])
      })

      it('returns copy if already at target dimension', () => {
        const v = vector([1.0, 2.0, 3.0])
        const truncated = v.truncate(3)
        expect(truncated.toArray()).toEqual([1.0, 2.0, 3.0])
      })

      it('throws if target dimension is larger', () => {
        const v = vector([1.0, 2.0])
        expect(() => v.truncate(5)).toThrow()
      })
    })
  })

  describe('Serialization', () => {
    describe('toString()', () => {
      it('returns readable string representation', () => {
        const v = vector([1.0, 2.0, 3.0])
        const str = v.toString()
        expect(str).toContain('Vector')
        expect(str).toContain('float32')
        expect(str).toContain('3')
      })

      it('truncates long vectors', () => {
        const v = vector(new Array(100).fill(1.0))
        const str = v.toString()
        expect(str).toContain('...')
      })
    })

    describe('toJSON()', () => {
      it('returns JSON-serializable object', () => {
        const v = vector([1.0, 2.0, 3.0])
        const json = v.toJSON()
        expect(json.type).toBe('Vector')
        expect(json.dtype).toBe('float32')
        expect(json.dimensions).toBe(3)
        expect(json.data).toEqual([1.0, 2.0, 3.0])
      })

      it('handles BigInt values for int64', () => {
        const v = vector(new BigInt64Array([1n, 2n, 3n]), 'int64')
        const json = v.toJSON()
        expect(json.data).toEqual(['1', '2', '3']) // BigInt as strings
      })
    })

    describe('Vector.fromJSON()', () => {
      it('reconstructs vector from JSON', () => {
        const original = vector([1.0, 2.0, 3.0])
        const json = original.toJSON()
        const restored = Vector.fromJSON(json)
        expect(restored.toArray()).toEqual([1.0, 2.0, 3.0])
        expect(restored.dtype).toBe('float32')
      })

      it('handles all dtypes', () => {
        const dtypes: VectorDType[] = ['int8', 'int16', 'int32', 'int64', 'float32', 'float64']
        for (const dtype of dtypes) {
          if (dtype === 'int64') {
            const original = vector(new BigInt64Array([1n, 2n]), 'int64')
            const restored = Vector.fromJSON(original.toJSON())
            expect(restored.dtype).toBe('int64')
          } else {
            const original = vector([1, 2, 3], dtype)
            const restored = Vector.fromJSON(original.toJSON())
            expect(restored.dtype).toBe(dtype)
          }
        }
      })

      it('throws for unknown dtype in JSON', () => {
        const badJson: VectorJSON = {
          type: 'Vector',
          // @ts-expect-error - Testing invalid dtype
          dtype: 'invalid',
          dimensions: 3,
          data: [1, 2, 3],
        }
        expect(() => Vector.fromJSON(badJson)).toThrow()
      })
    })

    describe('toBase64() / fromBase64()', () => {
      it('encodes vector to base64', () => {
        const v = vector([1.0, 2.0, 3.0])
        const base64 = v.toBase64()
        expect(typeof base64).toBe('string')
        expect(base64.length).toBeGreaterThan(0)
      })

      it('decodes base64 to vector', () => {
        const original = vector([1.0, 2.0, 3.0])
        const base64 = original.toBase64()
        const restored = Vector.fromBase64(base64, 'float32')
        expect(restored.toArray()).toEqual([1.0, 2.0, 3.0])
      })

      it('roundtrips correctly', () => {
        const original = vector([0.1, 0.2, 0.3, 0.4, 0.5])
        const base64 = original.toBase64()
        const restored = Vector.fromBase64(base64, 'float32')
        for (let i = 0; i < original.dimensions; i++) {
          expect(restored.at(i)).toBeCloseTo(original.at(i) as number, 5)
        }
      })
    })
  })

  describe('Type Guards', () => {
    describe('isVector()', () => {
      it('returns true for Vector instances', () => {
        expect(isVector(vector([1, 2, 3]))).toBe(true)
        expect(isVector(new Vector(new Float32Array([1]), 'float32'))).toBe(true)
      })

      it('returns false for arrays', () => {
        expect(isVector([1, 2, 3])).toBe(false)
      })

      it('returns false for TypedArrays', () => {
        expect(isVector(new Float32Array([1, 2, 3]))).toBe(false)
      })

      it('returns false for null/undefined', () => {
        expect(isVector(null)).toBe(false)
        expect(isVector(undefined)).toBe(false)
      })

      it('returns false for objects', () => {
        expect(isVector({ data: [1, 2, 3] })).toBe(false)
      })
    })
  })

  describe('Static Methods', () => {
    describe('Vector.zeros()', () => {
      it('creates zero vector of specified dimension', () => {
        const v = Vector.zeros(5)
        expect(v.dimensions).toBe(5)
        expect(v.toArray()).toEqual([0, 0, 0, 0, 0])
      })

      it('defaults to float32', () => {
        const v = Vector.zeros(3)
        expect(v.dtype).toBe('float32')
      })

      it('accepts dtype parameter', () => {
        const v = Vector.zeros(3, 'int32')
        expect(v.dtype).toBe('int32')
      })
    })

    describe('Vector.ones()', () => {
      it('creates vector of ones', () => {
        const v = Vector.ones(4)
        expect(v.toArray()).toEqual([1, 1, 1, 1])
      })

      it('accepts dtype parameter', () => {
        const v = Vector.ones(3, 'float64')
        expect(v.dtype).toBe('float64')
      })
    })

    describe('Vector.fill()', () => {
      it('creates vector filled with value', () => {
        const v = Vector.fill(3, 5)
        expect(v.toArray()).toEqual([5, 5, 5])
      })
    })

    describe('Vector.random()', () => {
      it('creates random vector', () => {
        const v = Vector.random(100)
        expect(v.dimensions).toBe(100)
        // Values should be between 0 and 1
        for (const val of v) {
          expect(val).toBeGreaterThanOrEqual(0)
          expect(val).toBeLessThan(1)
        }
      })

      it('creates different vectors on each call', () => {
        const v1 = Vector.random(10)
        const v2 = Vector.random(10)
        // Statistically very unlikely to be equal
        expect(v1.toArray()).not.toEqual(v2.toArray())
      })
    })

    describe('Vector.randomNormal()', () => {
      it('creates random vector with normal distribution', () => {
        const v = Vector.randomNormal(1000, 0, 1) // mean=0, std=1
        const arr = v.toArray() as number[]
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length
        // Mean should be close to 0 (statistical test)
        expect(mean).toBeCloseTo(0, 0.5)
      })
    })

    describe('Vector.range()', () => {
      it('creates range vector', () => {
        const v = Vector.range(0, 5, 1)
        expect(v.toArray()).toEqual([0, 1, 2, 3, 4])
      })

      it('handles step parameter', () => {
        const v = Vector.range(0, 10, 2)
        expect(v.toArray()).toEqual([0, 2, 4, 6, 8])
      })

      it('handles negative step', () => {
        const v = Vector.range(5, 0, -1)
        expect(v.toArray()).toEqual([5, 4, 3, 2, 1])
      })
    })

    describe('Vector.linspace()', () => {
      it('creates linearly spaced vector', () => {
        const v = Vector.linspace(0, 1, 5)
        expect(v.toArray()).toEqual([0, 0.25, 0.5, 0.75, 1])
      })
    })
  })

  describe('Statistical Operations', () => {
    describe('sum()', () => {
      it('returns sum of all elements', () => {
        const v = vector([1, 2, 3, 4, 5])
        expect(v.sum()).toBe(15)
      })

      it('returns 0 for empty vector', () => {
        const v = vector([])
        expect(v.sum()).toBe(0)
      })
    })

    describe('mean()', () => {
      it('returns arithmetic mean', () => {
        const v = vector([1, 2, 3, 4, 5])
        expect(v.mean()).toBe(3)
      })

      it('returns NaN for empty vector', () => {
        const v = vector([])
        expect(v.mean()).toBeNaN()
      })
    })

    describe('variance()', () => {
      it('returns population variance', () => {
        const v = vector([2, 4, 4, 4, 5, 5, 7, 9])
        expect(v.variance()).toBeCloseTo(4, 5)
      })
    })

    describe('std()', () => {
      it('returns standard deviation', () => {
        const v = vector([2, 4, 4, 4, 5, 5, 7, 9])
        expect(v.std()).toBeCloseTo(2, 5)
      })
    })

    describe('min()', () => {
      it('returns minimum value', () => {
        const v = vector([3, 1, 4, 1, 5, 9, 2, 6])
        expect(v.min()).toBe(1)
      })
    })

    describe('max()', () => {
      it('returns maximum value', () => {
        const v = vector([3, 1, 4, 1, 5, 9, 2, 6])
        expect(v.max()).toBe(9)
      })
    })

    describe('argmin()', () => {
      it('returns index of minimum value', () => {
        const v = vector([3, 1, 4, 1, 5])
        expect(v.argmin()).toBe(1)
      })
    })

    describe('argmax()', () => {
      it('returns index of maximum value', () => {
        const v = vector([3, 1, 4, 1, 5, 9, 2])
        expect(v.argmax()).toBe(5)
      })
    })
  })

  describe('Transformation Operations', () => {
    describe('map()', () => {
      it('applies function to each element', () => {
        const v = vector([1, 2, 3, 4])
        const result = v.map((x) => (x as number) * 2)
        expect(result.toArray()).toEqual([2, 4, 6, 8])
      })
    })

    describe('abs()', () => {
      it('returns absolute values', () => {
        const v = vector([-1, 2, -3, 4])
        expect(v.abs().toArray()).toEqual([1, 2, 3, 4])
      })
    })

    describe('negate()', () => {
      it('returns negated vector', () => {
        const v = vector([1, -2, 3])
        expect(v.negate().toArray()).toEqual([-1, 2, -3])
      })
    })

    describe('sqrt()', () => {
      it('returns element-wise square root', () => {
        const v = vector([1, 4, 9, 16])
        expect(v.sqrt().toArray()).toEqual([1, 2, 3, 4])
      })
    })

    describe('pow()', () => {
      it('raises each element to power', () => {
        const v = vector([1, 2, 3])
        expect(v.pow(2).toArray()).toEqual([1, 4, 9])
      })
    })

    describe('exp()', () => {
      it('returns e^x for each element', () => {
        const v = vector([0, 1])
        const result = v.exp()
        expect(result.at(0)).toBeCloseTo(1, 5)
        expect(result.at(1)).toBeCloseTo(Math.E, 5)
      })
    })

    describe('log()', () => {
      it('returns natural log of each element', () => {
        const v = vector([1, Math.E, Math.E * Math.E])
        const result = v.log()
        expect(result.at(0)).toBeCloseTo(0, 5)
        expect(result.at(1)).toBeCloseTo(1, 5)
        expect(result.at(2)).toBeCloseTo(2, 5)
      })
    })

    describe('clamp()', () => {
      it('clamps values to range', () => {
        const v = vector([-1, 0.5, 2])
        expect(v.clamp(0, 1).toArray()).toEqual([0, 0.5, 1])
      })
    })

    describe('softmax()', () => {
      it('applies softmax function', () => {
        const v = vector([1, 2, 3])
        const result = v.softmax()
        // Sum should be 1
        expect(result.sum()).toBeCloseTo(1, 5)
        // Values should be positive
        for (const val of result) {
          expect(val).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('Comparison Operations', () => {
    describe('equals()', () => {
      it('returns true for equal vectors', () => {
        const a = vector([1, 2, 3])
        const b = vector([1, 2, 3])
        expect(a.equals(b)).toBe(true)
      })

      it('returns false for different vectors', () => {
        const a = vector([1, 2, 3])
        const b = vector([1, 2, 4])
        expect(a.equals(b)).toBe(false)
      })

      it('returns false for different dimensions', () => {
        const a = vector([1, 2, 3])
        const b = vector([1, 2])
        expect(a.equals(b)).toBe(false)
      })
    })

    describe('almostEquals()', () => {
      it('returns true for nearly equal vectors', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.0000001, 2.0000001, 3.0000001])
        expect(a.almostEquals(b, 1e-5)).toBe(true)
      })

      it('returns false when difference exceeds tolerance', () => {
        const a = vector([1.0, 2.0, 3.0])
        const b = vector([1.1, 2.1, 3.1])
        expect(a.almostEquals(b, 0.01)).toBe(false)
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles very small values', () => {
      const v = vector([1e-38, 1e-38])
      expect(v.norm()).toBeCloseTo(Math.sqrt(2) * 1e-38, 30)
    })

    it('handles very large values', () => {
      const v = vector([1e38, 1e38])
      // Float32 has limited precision for very large values
      const expected = Math.sqrt(2) * 1e38
      const actual = v.norm()
      // Use relative comparison for large values
      expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-6)
    })

    it('handles mixed extreme values', () => {
      const v = vector([1e-10, 1e10])
      // Should not overflow/underflow
      expect(v.normalize().norm()).toBeCloseTo(1, 5)
    })

    it('handles single element vectors', () => {
      const v = vector([5])
      expect(v.norm()).toBe(5)
      expect(v.normalize().at(0)).toBeCloseTo(1, 10)
    })
  })
})
