// backend/src/functions/time-tracking/get-daily-report.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
const logger = new Logger('get-daily-report');
const timeTrackingService = new TimeTrackingService(docClient, s3Client);

/**
 * Lambda function to get a daily report
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
    const date = event.pathParameters?.date;

    if (!projectId || !date) {
      return errorResponse(400, { message: 'Missing required path parameters' });
    }

    // 3. Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorResponse(400, { message: 'Invalid date format, expected YYYY-MM-DD' });
    }

    // 4. Log operation start
    logger.info('Getting daily report', { 
      projectId,
      date,
      userId: user.id
    });

    // 5. Get daily report
    const report = await timeTrackingService.getDailyReport(projectId, date);
    if (!report) {
      return errorResponse(404, { message: 'Daily report not found' });
    }

    // 6. Return successful response
    return successResponse(200, { 
      data: report
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error getting daily report', { error });
    
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