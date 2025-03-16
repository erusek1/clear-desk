// backend/src/functions/inspections/get-inspection-checklist.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { InspectionService } from '../../services/inspection.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('get-inspection-checklist');
const inspectionService = new InspectionService(docClient, s3Client);

/**
 * Lambda function to get an inspection checklist
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

    // 2. Validate path parameters
    const projectId = event.pathParameters?.projectId;
    const phase = event.pathParameters?.phase;
    const inspectionId = event.pathParameters?.inspectionId;

    if (!projectId || !phase || !inspectionId) {
      return errorResponse(400, { message: 'Missing required parameters' });
    }

    // 3. Log operation start
    logger.info('Getting inspection checklist', { 
      projectId,
      phase,
      inspectionId,
      userId: user.id
    });

    // 4. Get inspection checklist
    const checklist = await inspectionService.getInspectionChecklist(
      projectId,
      phase,
      inspectionId
    );

    if (!checklist) {
      return errorResponse(404, { message: 'Inspection checklist not found' });
    }

    // 5. Return successful response
    return successResponse(200, checklist);
  } catch (error) {
    // 6. Handle and log errors
    logger.error('Error getting inspection checklist', { error });
    
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