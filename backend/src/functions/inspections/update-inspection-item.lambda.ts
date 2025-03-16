// backend/src/functions/inspections/update-inspection-item.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
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
const logger = new Logger('update-inspection-item');
const inspectionService = new InspectionService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  itemId: z.string(),
  response: z.enum(['yes', 'no', 'n/a']),
  comment: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to update an inspection item
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

    // 3. Validate request body
    if (!event.body) {
      return errorResponse(400, { message: 'Missing request body' });
    }

    let requestData: RequestType;
    try {
      requestData = RequestSchema.parse(JSON.parse(event.body));
    } catch (error) {
      logger.error('Validation error', { error });
      return errorResponse(400, { message: 'Invalid request format', details: error });
    }

    // 4. Log operation start
    logger.info('Updating inspection item', { 
      projectId,
      phase,
      inspectionId,
      itemId: requestData.itemId,
      userId: user.id
    });

    // 5. Update inspection item
    const updatedInspection = await inspectionService.updateInspectionItemResponse(
      projectId,
      phase,
      inspectionId,
      requestData.itemId,
      requestData.response,
      requestData.comment,
      user.id
    );

    if (!updatedInspection) {
      return errorResponse(404, { message: 'Inspection checklist or item not found' });
    }

    // 6. Calculate completion statistics
    const totalItems = updatedInspection.items.length;
    const completedItems = updatedInspection.items.filter(i => i.response !== null).length;
    const completionPercentage = Math.round((completedItems / totalItems) * 100);

    // 7. Return successful response
    return successResponse(200, { 
      message: 'Inspection item updated successfully',
      itemId: requestData.itemId,
      response: requestData.response,
      completionStats: {
        totalItems,
        completedItems,
        completionPercentage
      }
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error updating inspection item', { error });
    
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