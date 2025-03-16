// backend/src/functions/inspections/complete-inspection.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { InspectionService } from '../../services/inspection.service';
import { InspectionStatus } from '../../types/inspection.types';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('complete-inspection');
const inspectionService = new InspectionService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  // Items with responses
  items: z.array(
    z.object({
      itemId: z.string(),
      response: z.enum(['yes', 'no', 'n/a']),
      comment: z.string().optional(),
    })
  ),
  status: z.nativeEnum(InspectionStatus),
  notes: z.string().optional(),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to complete an inspection with responses and update status
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
    const phase = event.pathParameters?.phase;
    const inspectionId = event.pathParameters?.inspectionId;

    if (!projectId || !phase || !inspectionId) {
      return errorResponse(400, { message: 'Missing required path parameters' });
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
    logger.info('Completing inspection', { 
      projectId,
      phase,
      inspectionId,
      itemCount: requestData.items.length,
      status: requestData.status,
      userId: user.id,
    });

    // 5. Get the checklist to update
    const checklist = await inspectionService.getInspectionChecklist(
      projectId,
      phase,
      inspectionId
    );

    if (!checklist) {
      return errorResponse(404, { message: 'Inspection checklist not found' });
    }

    // 6. Update each item
    for (const item of requestData.items) {
      await inspectionService.updateInspectionItemResponse(
        inspectionId,
        projectId,
        phase,
        item.itemId,
        item.response,
        item.comment,
        user.id
      );
    }

    // 7. Update status and complete the inspection
    const completedDate = new Date().toISOString();
    const updatedChecklist = await inspectionService.updateInspectionStatus(
      projectId,
      phase,
      inspectionId,
      requestData.status,
      user.id,
      completedDate
    );

    // 8. Return successful response
    return successResponse(200, { 
      message: 'Inspection completed successfully',
      data: {
        inspectionId: updatedChecklist.inspectionId,
        projectId: updatedChecklist.projectId,
        phase: updatedChecklist.phase,
        status: updatedChecklist.status,
        completedDate: updatedChecklist.completedDate,
        itemsUpdated: requestData.items.length
      }
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error completing inspection', { error });
    
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