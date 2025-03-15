// backend/src/utils/response.ts

import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Standard error codes for API responses
 */
export enum ErrorCode {
  // Authentication Errors
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Authorization Errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCESS_DENIED = 'ACCESS_DENIED',
  
  // Resource Errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST_FORMAT = 'INVALID_REQUEST_FORMAT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Operation Errors
  OPERATION_FAILED = 'OPERATION_FAILED',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Server Errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

/**
 * Error response body structure
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Success response body structure
 */
interface SuccessResponse {
  data: any;
  meta?: Record<string, any>;
}

/**
 * Create a standard success response
 * 
 * @param statusCode - HTTP status code
 * @param body - Response body
 * @param headers - Optional additional headers
 * @returns API Gateway proxy result
 */
export function successResponse(
  statusCode: number, 
  body: any, 
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  // Format response body
  const responseBody: SuccessResponse = {
    data: body
  };

  // Add metadata if it exists
  if (body && body.meta) {
    responseBody.meta = body.meta;
    delete responseBody.data.meta;
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      ...headers
    },
    body: JSON.stringify(responseBody)
  };
}

/**
 * Create a standard error response
 * 
 * @param statusCode - HTTP status code
 * @param error - Error details
 * @param headers - Optional additional headers
 * @returns API Gateway proxy result
 */
export function errorResponse(
  statusCode: number, 
  error: { code?: string; message: string; details?: any } | Error,
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  let errorBody: ErrorResponse['error'];

  // Handle standard Error objects
  if (error instanceof Error) {
    errorBody = {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message
    };

    // Add stack trace in development
    if (process.env.NODE_ENV !== 'production') {
      errorBody.details = error.stack;
    }
  } else {
    // Use provided error information
    errorBody = {
      code: error.code || getDefaultErrorCode(statusCode),
      message: error.message
    };

    // Add details if provided
    if (error.details) {
      errorBody.details = error.details;
    }
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      ...headers
    },
    body: JSON.stringify({ error: errorBody })
  };
}

/**
 * Get default error code based on HTTP status code
 * 
 * @param statusCode - HTTP status code
 * @returns Default error code
 */
function getDefaultErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return ErrorCode.INVALID_REQUEST_FORMAT;
    case 401:
      return ErrorCode.AUTHENTICATION_REQUIRED;
    case 403:
      return ErrorCode.INSUFFICIENT_PERMISSIONS;
    case 404:
      return ErrorCode.RESOURCE_NOT_FOUND;
    case 409:
      return ErrorCode.RESOURCE_CONFLICT;
    case 422:
      return ErrorCode.VALIDATION_ERROR;
    case 429:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    case 500:
      return ErrorCode.INTERNAL_SERVER_ERROR;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_SERVER_ERROR;
  }
}