// backend/src/functions/time-tracking/add-photo-to-report.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { TimeTrackingService } from '../../services/time-tracking.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('add-photo-to-report');
const timeTrackingService = new TimeTrackingService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  fileKey: z.string(),
  caption: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to add a photo to a daily report
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
    const date = event.pathParameters?.date;

    if (!projectId || !date) {
      return errorResponse(400, { message: 'Missing required parameters' });
    }

    // 3. Ensure date format is valid
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorResponse(400, { message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // 4. Validate request body
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

    // 5. Log operation start
    logger.info('Adding photo to daily report', { 
      projectId,
      date,
      fileKey: requestData.fileKey,
      userId: user.id
    });

    // 6. Get report to check it exists
    const report = await timeTrackingService.getDailyReport(projectId, date);
    if (!report) {
      return errorResponse(404, { message: 'Daily report not found' });
    }

    // 7. Add photo to report
    const updatedReport = await timeTrackingService.addPhotoToDailyReport(
      projectId,
      date,
      requestData.fileKey,
      requestData.caption,
      user.id
    );

    // 8. Return successful response
    return successResponse(200, { 
      message: 'Photo added to daily report successfully',
      reportId: updatedReport!.reportId,
      photoCount: updatedReport!.photos?.length || 0
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error adding photo to daily report', { error });
    
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