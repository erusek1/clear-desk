// backend/src/utils/auth.ts

import { APIGatewayProxyEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import config from '../config';
import { Logger } from './logger';

const logger = new Logger('AuthUtils');

/**
 * User structure from JWT token
 */
export interface User {
  id: string;
  email: string;
  companyId: string;
  role: string;
}

/**
 * Extended user structure with additional details from database
 */
export interface ExtendedUser extends User {
  firstName: string;
  lastName: string;
  status: string;
  settings?: Record<string, any>;
}

// Initialize DynamoDB clients
const dynamoClient = new DynamoDBClient(
  config.skipAwsValidation 
    ? { 
        region: config.aws.region,
        endpoint: config.dynamodb.endpoint,
      } 
    : { 
        region: config.aws.region,
      }
);

const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Validate user authentication from request headers
 * 
 * @param event - API Gateway event
 * @returns User information or null if not authenticated
 */
export function validateAuth(event: APIGatewayProxyEvent): User | null {
  try {
    // Get Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return null;
    }

    // Extract token from header
    const tokenMatch = authHeader.match(/^Bearer\s+(.*)$/i);
    if (!tokenMatch || !tokenMatch[1]) {
      return null;
    }

    const token = tokenMatch[1];
    
    // Verify token
    const payload = jwt.verify(token, config.auth.jwtSecret) as User;
    
    return {
      id: payload.id,
      email: payload.email,
      companyId: payload.companyId,
      role: payload.role
    };
  } catch (error) {
    logger.error('Authentication error', { error });
    return null;
  }
}

/**
 * Generate JWT token for a user
 * 
 * @param user - User information
 * @returns JWT token
 */
export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiration }
  );
}

/**
 * Get expanded user information from the database
 * 
 * @param userId - User ID
 * @returns Extended user information or null if not found
 */
export async function getExtendedUser(userId: string): Promise<ExtendedUser | null> {
  try {
    // Get user from database
    const result = await docClient.send(new GetCommand({
      TableName: config.dynamodb.tables.users,
      Key: { 
        PK: `USER#${userId}`,
        SK: 'METADATA'
      }
    }));

    if (!result.Item) {
      return null;
    }

    // Map database fields to ExtendedUser
    return {
      id: userId,
      email: result.Item.email,
      companyId: result.Item.companyId,
      role: result.Item.role,
      firstName: result.Item.firstName,
      lastName: result.Item.lastName,
      status: result.Item.status,
      settings: result.Item.settings
    };
  } catch (error) {
    logger.error('Error getting extended user', { error, userId });
    return null;
  }
}

/**
 * Check if user has required role
 * 
 * @param user - User information
 * @param requiredRoles - Required roles (any match is sufficient)
 * @returns True if user has at least one required role
 */
export function hasRole(user: User, requiredRoles: string[]): boolean {
  return requiredRoles.includes(user.role);
}

/**
 * Check if user belongs to company or has admin privileges
 * 
 * @param user - User information
 * @param companyId - Company ID to check against
 * @returns True if user belongs to company or is admin
 */
export function belongsToCompany(user: User, companyId: string): boolean {
  return user.companyId === companyId || user.role === 'admin';
}

/**
 * Create a Lambda authorizer function for API Gateway
 * 
 * @param event - API Gateway event
 * @returns Authorizer response
 */
export async function jwtAuthorizer(event: any): Promise<any> {
  try {
    // Extract token from header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      return generateAuthorizerResponse('user', 'Deny', event.methodArn);
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.*)$/i);
    if (!tokenMatch || !tokenMatch[1]) {
      return generateAuthorizerResponse('user', 'Deny', event.methodArn);
    }

    const token = tokenMatch[1];
    
    // Verify token
    const payload = jwt.verify(token, config.auth.jwtSecret) as User;
    
    // Generate policy
    return generateAuthorizerResponse(payload.id, 'Allow', event.methodArn, payload);
  } catch (error) {
    logger.error('Authorizer error', { error });
    return generateAuthorizerResponse('user', 'Deny', event.methodArn);
  }
}

/**
 * Generate response for Lambda authorizer
 * 
 * @param principalId - Principal ID
 * @param effect - Allow or Deny
 * @param resource - Resource ARN
 * @param context - Optional context to pass to Lambda
 * @returns Authorizer response
 */
function generateAuthorizerResponse(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, any>
): any {
  const authResponse = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource
        }
      ]
    },
    context
  };
  
  return authResponse;
}