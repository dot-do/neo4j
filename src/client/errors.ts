/**
 * HTTP Client SDK Errors
 * Custom error classes for the HTTP client
 */

/**
 * Base class for all HTTP driver errors
 */
export class HttpDriverError extends Error {
  readonly code: string
  readonly statusCode?: number
  readonly details?: unknown

  constructor(
    message: string,
    code: string = 'HTTP_DRIVER_ERROR',
    statusCode?: number,
    details?: unknown
  ) {
    super(message)
    this.name = 'HttpDriverError'
    this.code = code
    this.statusCode = statusCode
    this.details = details

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpDriverError)
    }
  }
}

/**
 * Error when the driver is closed but an operation is attempted
 */
export class DriverClosedError extends HttpDriverError {
  constructor(operation: string = 'operation') {
    super(
      `Cannot perform ${operation} on closed driver`,
      'DRIVER_CLOSED'
    )
    this.name = 'DriverClosedError'
  }
}

/**
 * Error when a session is closed but an operation is attempted
 */
export class SessionClosedError extends HttpDriverError {
  constructor(operation: string = 'operation') {
    super(
      `Cannot perform ${operation} on closed session`,
      'SESSION_CLOSED'
    )
    this.name = 'SessionClosedError'
  }
}

/**
 * Error when a transaction is not in the expected state
 */
export class TransactionStateError extends HttpDriverError {
  readonly currentState: string
  readonly expectedState: string

  constructor(currentState: string, expectedState: string) {
    super(
      `Transaction is ${currentState}, expected ${expectedState}`,
      'TRANSACTION_STATE_ERROR'
    )
    this.name = 'TransactionStateError'
    this.currentState = currentState
    this.expectedState = expectedState
  }
}

/**
 * Error when a network request fails
 */
export class NetworkError extends HttpDriverError {
  constructor(message: string, cause?: Error) {
    super(message, 'NETWORK_ERROR')
    this.name = 'NetworkError'
    if (cause) {
      this.cause = cause
    }
  }
}

/**
 * Error when a request times out
 */
export class TimeoutError extends HttpDriverError {
  readonly timeout: number

  constructor(timeout: number, operation: string = 'request') {
    super(
      `${operation} timed out after ${timeout}ms`,
      'TIMEOUT_ERROR'
    )
    this.name = 'TimeoutError'
    this.timeout = timeout
  }
}

/**
 * Error when authentication fails
 */
export class AuthenticationError extends HttpDriverError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401)
    this.name = 'AuthenticationError'
  }
}

/**
 * Error when the server returns an error response
 */
export class ServerError extends HttpDriverError {
  constructor(message: string, code: string, statusCode: number, details?: unknown) {
    super(message, code, statusCode, details)
    this.name = 'ServerError'
  }
}

/**
 * Error when a transaction is not found on the server
 */
export class TransactionNotFoundError extends HttpDriverError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(
      `Transaction ${transactionId} not found`,
      'TRANSACTION_NOT_FOUND',
      404
    )
    this.name = 'TransactionNotFoundError'
    this.transactionId = transactionId
  }
}

/**
 * Create an error from an HTTP response
 */
export async function createErrorFromResponse(response: Response): Promise<HttpDriverError> {
  let errorData: { error?: { code?: string; message?: string; details?: unknown } } = {}

  try {
    errorData = await response.json()
  } catch {
    // Response body is not JSON
  }

  const code = errorData.error?.code ?? `HTTP_${response.status}`
  const message = errorData.error?.message ?? response.statusText ?? 'Unknown error'
  const details = errorData.error?.details

  // Map status codes to specific error types
  switch (response.status) {
    case 401:
      return new AuthenticationError(message)
    case 404:
      if (code.includes('TRANSACTION')) {
        return new TransactionNotFoundError(message)
      }
      return new ServerError(message, code, response.status, details)
    default:
      return new ServerError(message, code, response.status, details)
  }
}
