// backend/src/functions/inventory/get-materials-takeoff.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { InventoryService } from '../../services/inventory.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('get-materials-takeoff');
const inventoryService = new InventoryService(docClient, s3Client);

/**
 * Lambda function to get materials takeoff for a project
 * 
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Authenticate & authorize request
    const user = validateAuth(event);
    if (!user) {
      return errorResponse(401, { message: 'Unauthorized' });
    }

    // 2. Get parameters from path
    const projectId = event.pathParameters?.projectId;
    const estimateId = event.pathParameters?.estimateId;
    if (!projectId) {
      return errorResponse(400, { message: 'Missing projectId parameter' });
    }

    // 3. Get query parameters
    const includeInventory = event.queryStringParameters?.includeInventory === 'true';
    const includeAllocations = event.queryStringParameters?.includeAllocations === 'true';
    const phaseFilter = event.queryStringParameters?.phase;

    // 4. Log operation start
    logger.info('Getting materials takeoff', { 
      projectId,
      estimateId,
      includeInventory,
      includeAllocations,
      phaseFilter,
      userId: user.id
    });

    // 5. Generate or retrieve materials takeoff
    const takeoff = await inventoryService.getMaterialsTakeoff(
      projectId,
      {
        estimateId,
        includeInventory,
        includeAllocations,
        phaseFilter
      }
    );

    // 6. Return successful response
    return successResponse(200, { 
      data: takeoff
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error getting materials takeoff', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project or estimate not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};