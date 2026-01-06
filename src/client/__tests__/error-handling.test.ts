/**
 * Tests for error handling robustness
 *
 * RED TDD: These tests verify that error detection is robust and doesn't rely
 * on fragile error message string matching.
 *
 * Current fragile code (http-client.ts:104):
 *   if (error.name === 'TypeError' && error.message.includes('fetch')) {
 *     throw new NetworkError(...)
 *   }
 *
 * The problem: Different JS engines produce different error messages for fetch failures:
 *   - Chrome/Node: "fetch failed" or "Failed to fetch"
 *   - Firefox: "NetworkError when attempting to fetch resource"
 *   - Safari: "Load failed"
 *   - Cloudflare Workers: "Network connection lost"
 *
 * These tests define the contract for robust error detection that should work
 * across all JS engines.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpClient } from '../http-client'
import { NetworkError, TimeoutError } from '../errors'

// Mock fetch for testing
const createMockFetch = () => vi.fn()

describe('Error Handling Robustness', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = createMockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('NetworkError detection', () => {
    describe('should not rely on error message strings', () => {
      /**
       * Different JS engines use different error messages for network failures.
       * Error detection should work regardless of the message content.
       */
      const networkErrorMessages = [
        // Chrome/Node.js messages
        'fetch failed',
        'Failed to fetch',
        // Firefox messages
        'NetworkError when attempting to fetch resource',
        'Network request failed',
        // Safari messages
        'Load failed',
        'The network connection was lost',
        // Cloudflare Workers messages
        'Network connection lost',
        // Generic messages
        'Network error',
        'Connection refused',
        // Non-English messages (important for internationalization)
        'Error de red',
        'Erreur reseau',
        // Edge cases - messages without "fetch" keyword
        'Connection timed out',
        'DNS resolution failed',
        'SSL handshake failed',
        'Unable to connect to server',
      ]

      it.each(networkErrorMessages)(
        'should detect TypeError with message "%s" as NetworkError',
        async (message) => {
          const error = new TypeError(message)
          mockFetch.mockRejectedValue(error)

          const client = new HttpClient({
            baseUrl: 'https://test.neo4j.do',
            fetch: mockFetch,
          })

          await expect(client.get('/test')).rejects.toThrow(NetworkError)
        }
      )
    })

    describe('should use error.name for classification', () => {
      /**
       * Error classification should primarily use error.name property,
       * which is standardized across JS engines.
       */
      it('should detect TypeError as potential network error', async () => {
        const error = new TypeError('any message here')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        // TypeError from fetch should be converted to NetworkError
        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should preserve AbortError classification', async () => {
        // AbortError is used for timeouts
        const error = new DOMException('The operation was aborted', 'AbortError')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(TimeoutError)
      })

      it('should not convert non-TypeError errors to NetworkError', async () => {
        const error = new Error('Some other error')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        // Regular Error should pass through, not be converted
        await expect(client.get('/test')).rejects.toThrow(Error)
        await expect(client.get('/test')).rejects.not.toThrow(NetworkError)
      })

      it('should not convert RangeError to NetworkError', async () => {
        const error = new RangeError('Value out of range')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(RangeError)
        await expect(client.get('/test')).rejects.not.toThrow(NetworkError)
      })
    })

    describe('should use error.code when available', () => {
      /**
       * Some errors have a `code` property that provides more reliable
       * classification than message strings.
       */
      it('should detect ECONNREFUSED as NetworkError', async () => {
        const error = new TypeError('connect ECONNREFUSED')
        ;(error as NodeJS.ErrnoException).code = 'ECONNREFUSED'
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should detect ENOTFOUND as NetworkError', async () => {
        const error = new TypeError('getaddrinfo ENOTFOUND')
        ;(error as NodeJS.ErrnoException).code = 'ENOTFOUND'
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should detect ETIMEDOUT as NetworkError', async () => {
        const error = new TypeError('connect ETIMEDOUT')
        ;(error as NodeJS.ErrnoException).code = 'ETIMEDOUT'
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should detect ECONNRESET as NetworkError', async () => {
        const error = new TypeError('read ECONNRESET')
        ;(error as NodeJS.ErrnoException).code = 'ECONNRESET'
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })
    })

    describe('should handle cross-JS engine error formats', () => {
      /**
       * Tests for various error formats across different JavaScript runtimes
       * to ensure compatibility.
       */

      it('should handle errors from Node.js undici fetch', async () => {
        // Node.js native fetch (undici) throws TypeError for network errors
        const error = new TypeError('fetch failed')
        error.cause = new Error('getaddrinfo ENOTFOUND example.com')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should handle errors from Cloudflare Workers', async () => {
        // Cloudflare Workers may throw different error types
        const error = new TypeError('Network connection lost.')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should handle errors from Deno', async () => {
        // Deno may have different error message formats
        const error = new TypeError('error sending request for url')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should handle errors from Bun', async () => {
        // Bun runtime error formats
        const error = new TypeError('Unable to connect')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })

      it('should handle DOMException with network error name', async () => {
        // Some environments use DOMException for network errors
        const error = new DOMException('Network error', 'NetworkError')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        // DOMException with name 'NetworkError' should be detected
        await expect(client.get('/test')).rejects.toThrow(NetworkError)
      })
    })
  })

  describe('NetworkError should preserve original error', () => {
    /**
     * When converting errors to NetworkError, the original error
     * should be preserved as the cause for debugging purposes.
     */
    it('should include original error as cause', async () => {
      const originalError = new TypeError('fetch failed')
      mockFetch.mockRejectedValue(originalError)

      const client = new HttpClient({
        baseUrl: 'https://test.neo4j.do',
        fetch: mockFetch,
      })

      try {
        await client.get('/test')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError)
        expect((error as NetworkError).cause).toBe(originalError)
      }
    })

    it('should include meaningful error message', async () => {
      const originalError = new TypeError('some network issue')
      mockFetch.mockRejectedValue(originalError)

      const client = new HttpClient({
        baseUrl: 'https://test.neo4j.do',
        fetch: mockFetch,
      })

      try {
        await client.get('/health')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError)
        // Message should include the URL that failed
        expect((error as Error).message).toContain('https://test.neo4j.do/health')
      }
    })
  })

  describe('TimeoutError handling', () => {
    /**
     * Timeout errors should be reliably detected using error.name === 'AbortError'
     */
    it('should detect AbortError regardless of message', async () => {
      const abortMessages = [
        'The operation was aborted',
        'signal is aborted without reason',
        'This operation was aborted',
        'Aborted',
        // Non-standard messages
        'Request aborted',
        'Timeout exceeded',
      ]

      for (const message of abortMessages) {
        const error = new DOMException(message, 'AbortError')
        mockFetch.mockRejectedValue(error)

        const client = new HttpClient({
          baseUrl: 'https://test.neo4j.do',
          fetch: mockFetch,
        })

        await expect(client.get('/test')).rejects.toThrow(TimeoutError)
      }
    })
  })

  describe('Error classification hierarchy', () => {
    /**
     * Errors should be classified in a specific priority order:
     * 1. AbortError -> TimeoutError
     * 2. NetworkError (DOMException) -> NetworkError
     * 3. TypeError -> NetworkError (fetch-related)
     * 4. Other errors -> pass through
     */
    it('should prioritize AbortError over other classifications', async () => {
      // AbortError with a message that might suggest network error
      const error = new DOMException('Network request aborted', 'AbortError')
      mockFetch.mockRejectedValue(error)

      const client = new HttpClient({
        baseUrl: 'https://test.neo4j.do',
        fetch: mockFetch,
      })

      // Should be TimeoutError, not NetworkError
      await expect(client.get('/test')).rejects.toThrow(TimeoutError)
    })
  })

  describe('fetch method error handling', () => {
    /**
     * The HttpClient.fetch() method should also handle errors robustly
     */
    it('should convert TypeError to NetworkError in fetch()', async () => {
      const error = new TypeError('connection refused')
      mockFetch.mockRejectedValue(error)

      const client = new HttpClient({
        baseUrl: 'https://test.neo4j.do',
        fetch: mockFetch,
      })

      await expect(client.fetch('/test')).rejects.toThrow(NetworkError)
    })

    it('should convert AbortError to TimeoutError in fetch()', async () => {
      const error = new DOMException('Aborted', 'AbortError')
      mockFetch.mockRejectedValue(error)

      const client = new HttpClient({
        baseUrl: 'https://test.neo4j.do',
        fetch: mockFetch,
      })

      await expect(client.fetch('/test')).rejects.toThrow(TimeoutError)
    })
  })
})
