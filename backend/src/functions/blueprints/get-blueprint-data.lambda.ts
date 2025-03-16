// backend/src/functions/blueprints/get-blueprint-data.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { BlueprintService } from '../../services/blueprint.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('get-blueprint-data');
const blueprintService = new BlueprintService(docClient, s3Client);

/**
 * Lambda function to get processed blueprint data for a project
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

    // 2. Get project ID from path parameters
    const projectId = event.pathParameters?.projectId;
    if (!projectId) {
      return errorResponse(400, { message: 'Missing projectId parameter' });
    }

    // 3. Log operation start
    logger.info('Getting blueprint data', { 
      projectId,
      userId: user.id,
    });

    // 4. Get project to check company access
    const project = await blueprintService.getProject(projectId, user.companyId);
    if (!project) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 5. Check if project has been processed
    if (!project.blueprint || !project.blueprint.extractedData) {
      return errorResponse(404, { message: 'No processed blueprint data found for this project' });
    }

    // 6. Return blueprint data
    return successResponse(200, {
      projectId,
      projectName: project.name,
      blueprintData: project.blueprint.extractedData
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error getting blueprint data', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};