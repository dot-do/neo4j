/**
 * URI Parsing for Neo4j Driver
 */

import type { ParsedUri } from '../types'

const SUPPORTED_SCHEMES = ['neo4j', 'neo4j+s', 'neo4j+ssc', 'bolt', 'bolt+s', 'bolt+ssc']
const DEFAULT_PORT = 7687

/**
 * Parse a Neo4j connection URI
 */
export function parseUri(uri: string): ParsedUri {
  if (!uri || typeof uri !== 'string') {
    throw new Error('Invalid URI: URI must be a non-empty string')
  }

  // Extract scheme
  const schemeMatch = uri.match(/^([a-z0-9+]+):\/\//i)
  if (!schemeMatch) {
    throw new Error(`Invalid URI: Unable to parse scheme from "${uri}"`)
  }

  const scheme = schemeMatch[1].toLowerCase()

  if (!SUPPORTED_SCHEMES.includes(scheme)) {
    throw new Error(
      `Invalid URI: Unsupported scheme "${scheme}". Supported schemes: ${SUPPORTED_SCHEMES.join(', ')}`
    )
  }

  // Determine if encrypted
  const encrypted = scheme.includes('+s')

  // Remove scheme from URI
  const rest = uri.slice(schemeMatch[0].length)

  // Parse host and port
  let host: string
  let port: number = DEFAULT_PORT
  let database: string | undefined

  // Handle IPv6 addresses
  if (rest.startsWith('[')) {
    const ipv6Match = rest.match(/^\[([^\]]+)\](?::(\d+))?(.*)$/)
    if (!ipv6Match) {
      throw new Error(`Invalid URI: Malformed IPv6 address in "${uri}"`)
    }
    host = `[${ipv6Match[1]}]`
    if (ipv6Match[2]) {
      port = parseInt(ipv6Match[2], 10)
    }
    const remaining = ipv6Match[3] || ''
    if (remaining.startsWith('/')) {
      database = remaining.slice(1).split('?')[0] || undefined
    }
  } else {
    // Handle IPv4 or hostname
    const hostMatch = rest.match(/^([^:/?#]+)(?::(\d+))?(.*)$/)
    if (!hostMatch) {
      throw new Error(`Invalid URI: Unable to parse host from "${uri}"`)
    }
    host = hostMatch[1]
    if (hostMatch[2]) {
      port = parseInt(hostMatch[2], 10)
    }
    const remaining = hostMatch[3] || ''
    if (remaining.startsWith('/')) {
      database = remaining.slice(1).split('?')[0] || undefined
    }
  }

  if (!host) {
    throw new Error(`Invalid URI: Host is required in "${uri}"`)
  }

  if (port < 0 || port > 65535) {
    throw new Error(`Invalid URI: Port must be between 0 and 65535, got ${port}`)
  }

  return {
    scheme,
    host,
    port,
    database,
    encrypted,
  }
}
