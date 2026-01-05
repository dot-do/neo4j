/**
 * Neo4j Authentication Tokens
 * Compatible with neo4j-driver npm package
 */

import type { AuthToken } from '../types'

/**
 * Creates a basic authentication token
 */
function basic(username: string, password: string, realm?: string): AuthToken {
  const token: AuthToken = {
    scheme: 'basic',
    principal: username,
    credentials: password,
  }
  if (realm !== undefined) {
    token.realm = realm
  }
  return token
}

/**
 * Creates a bearer authentication token for SSO
 */
function bearer(token: string): AuthToken {
  return {
    scheme: 'bearer',
    credentials: token,
  }
}

/**
 * Creates a Kerberos authentication token
 */
function kerberos(ticket: string): AuthToken {
  return {
    scheme: 'kerberos',
    credentials: ticket,
  }
}

/**
 * Creates a custom authentication token
 */
function custom(
  principal: string,
  credentials: string,
  realm: string,
  scheme: string,
  parameters?: Record<string, unknown>
): AuthToken {
  const token: AuthToken = {
    scheme,
    principal,
    credentials,
    realm,
  }
  if (parameters !== undefined) {
    token.parameters = parameters
  }
  return token
}

export const auth = {
  basic,
  bearer,
  kerberos,
  custom,
}

export type { AuthToken }
