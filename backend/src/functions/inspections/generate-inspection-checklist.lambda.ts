// backend/src/functions/inspections/generate-inspection-checklist.lambda.ts

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
const logger = new Logger('generate-inspection-checklist');
const inspectionService = new InspectionService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  phase: z.string(),
  templateId: z.string().optional(),
  scheduledDate: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to generate an inspection checklist
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

    // 2. Validate request body
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

    // 3. Log operation start
    logger.info('Generating inspection checklist', { 
      projectId: requestData.projectId,
      phase: requestData.phase,
      userId: user.id
    });

    // 4. Generate inspection checklist
    const checklist = await inspectionService.generateInspectionChecklist(
      requestData.projectId,
      requestData.phase,
      user.id,
      requestData.templateId,
      requestData.scheduledDate
    );

    // 5. Return successful response
    return successResponse(201, { 
      message: 'Inspection checklist generated successfully',
      inspectionId: checklist.inspectionId,
      phase: checklist.phase,
      itemCount: checklist.items.length,
      scheduledDate: checklist.scheduledDate
    });
  } catch (error) {
    // 6. Handle and log errors
    logger.error('Error generating inspection checklist', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project not found' });
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