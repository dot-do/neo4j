/**
 * HTTP Client utility for making requests to the Neo4j HTTP API
 * This is an internal module used by the driver, session, and transaction
 */

import type { AuthToken } from './types'
import { createErrorFromResponse, NetworkError, TimeoutError } from './errors'

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  baseUrl: string
  auth?: AuthToken
  fetch?: typeof fetch
  timeout?: number
  headers?: Record<string, string>
}

/**
 * HTTP client for making requests to the Neo4j HTTP API
 */
export class HttpClient {
  readonly baseUrl: string
  private readonly auth?: AuthToken
  private readonly fetchFn: typeof fetch
  private readonly timeout: number
  private readonly customHeaders: Record<string, string>

  constructor(config: HttpClientConfig) {
    // Remove trailing slash from base URL
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.auth = config.auth
    this.fetchFn = config.fetch ?? globalThis.fetch
    this.timeout = config.timeout ?? 30000
    this.customHeaders = config.headers ?? {}

    if (!this.fetchFn) {
      throw new Error(
        'No fetch implementation available. ' +
        'Please provide a custom fetch function in the config.'
      )
    }
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  /**
   * Make an HTTP request
   */
  async request<T>(path: string, init?: RequestInit & RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers = this.buildHeaders(init?.headers)
    const timeout = init?.timeout ?? this.timeout

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await this.fetchFn(url, {
        ...init,
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw await createErrorFromResponse(response)
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T
      }

      const text = await response.text()
      if (!text) {
        return {} as T
      }

      return JSON.parse(text) as T
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(timeout, 'HTTP request')
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new NetworkError(`Failed to fetch ${url}`, error)
        }
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Make a raw fetch request (returns Response instead of parsed JSON)
   */
  async fetch(path: string, init?: RequestInit & RequestOptions): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers = this.buildHeaders(init?.headers)
    const timeout = init?.timeout ?? this.timeout

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await this.fetchFn(url, {
        ...init,
        headers,
        signal: init?.signal ?? controller.signal,
      })

      return response
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(timeout, 'HTTP request')
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new NetworkError(`Failed to fetch ${url}`, error)
        }
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Build headers for a request
   */
  private buildHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.customHeaders,
    }

    // Add auth header
    if (this.auth) {
      headers['Authorization'] = this.buildAuthHeader(this.auth)
    }

    // Merge additional headers
    if (additionalHeaders) {
      if (additionalHeaders instanceof Headers) {
        additionalHeaders.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(additionalHeaders)) {
        for (const [key, value] of additionalHeaders) {
          headers[key] = value
        }
      } else {
        Object.assign(headers, additionalHeaders)
      }
    }

    return headers
  }

  /**
   * Build authorization header from auth token
   */
  private buildAuthHeader(auth: AuthToken): string {
    switch (auth.scheme) {
      case 'basic': {
        const credentials = btoa(`${auth.principal}:${auth.credentials}`)
        return `Basic ${credentials}`
      }
      case 'bearer':
        return `Bearer ${auth.credentials}`
      case 'kerberos':
        return `Negotiate ${auth.credentials}`
      default:
        // Custom scheme
        return `${auth.scheme} ${auth.credentials}`
    }
  }
}

/**
 * Request options
 */
export interface RequestOptions {
  timeout?: number
}
