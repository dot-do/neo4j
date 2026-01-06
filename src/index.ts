/**
 * neo4j.do - Neo4j-compatible graph database on Cloudflare Workers
 *
 * This module provides a Neo4j-compatible interface backed by Cloudflare D1 (SQLite).
 */

// Re-export auth module
export { auth } from './auth'
export type { AuthToken } from './auth'

// Re-export driver factory
export { createDriver as driver, Driver } from './driver'

// Re-export types
export type { Config, SessionConfig, TransactionConfig, ParsedUri, AccessMode } from './types'

export interface Env {
  DB: D1Database
}

/**
 * Cloudflare Worker entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check endpoint
    if (url.pathname === '/health') {
      // Simple health check that tests D1 connectivity
      try {
        await env.DB.prepare('SELECT 1').first()
        return new Response(JSON.stringify({ status: 'healthy' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch {
        return new Response(JSON.stringify({ status: 'unhealthy' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({
      name: 'neo4j.do',
      version: '0.1.1',
      description: 'Neo4j-compatible graph database on Cloudflare Workers',
      status: 'initializing',
      path: url.pathname,
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  },
}
