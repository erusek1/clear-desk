// backend/src/functions/time-tracking/approve-timesheet.lambda.ts

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
const logger = new Logger('approve-timesheet');
const timeTrackingService = new TimeTrackingService(docClient, s3Client);

/**
 * Lambda function to approve a timesheet
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
    const userId = event.pathParameters?.userId;

    if (!projectId || !date || !userId) {
      return errorResponse(400, { message: 'Missing required parameters' });
    }

    // 3. Ensure date format is valid
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorResponse(400, { message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // 4. Log operation start
    logger.info('Approving timesheet', { 
      projectId,
      date,
      userId,
      approverUserId: user.id
    });

    // 5. Get timesheet to check it exists
    const timesheet = await timeTrackingService.getTimesheet(projectId, date, userId);
    if (!timesheet) {
      return errorResponse(404, { message: 'Timesheet not found' });
    }

    // 6. Approve timesheet
    const updatedTimesheet = await timeTrackingService.approveTimesheet(
      projectId,
      date,
      userId,
      user.id
    );

    // 7. Return successful response
    return successResponse(200, { 
      message: 'Timesheet approved successfully',
      timesheetId: updatedTimesheet!.timesheetId,
      status: updatedTimesheet!.status,
      approvedBy: updatedTimesheet!.approvedBy,
      approvedDate: updatedTimesheet!.approvedDate
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error approving timesheet', { error });
    
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