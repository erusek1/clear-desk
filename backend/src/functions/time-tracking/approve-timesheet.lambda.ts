// backend/src/functions/time-tracking/approve-timesheet.lambda.ts

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
const logger = new Logger('approve-timesheet');
const timeTrackingService = new TimeTrackingService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comment: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to approve or reject a timesheet
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
    const userId = event.pathParameters?.userId;

    if (!projectId || !date || !userId) {
      return errorResponse(400, { message: 'Missing required path parameters' });
    }

    // 3. Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorResponse(400, { message: 'Invalid date format, expected YYYY-MM-DD' });
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

    // 5. Check if user has permission to approve timesheets (admin or manager)
    if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'foreman') {
      return errorResponse(403, { message: 'Insufficient permissions to approve timesheets' });
    }

    // 6. Log operation start
    logger.info(`${requestData.action.charAt(0).toUpperCase() + requestData.action.slice(1)}ing timesheet`, { 
      projectId,
      date,
      userId,
      approverId: user.id
    });

    // 7. Approve or reject timesheet
    let updatedTimesheet;
    if (requestData.action === 'approve') {
      updatedTimesheet = await timeTrackingService.approveTimesheet(
        projectId,
        date,
        userId,
        user.id
      );
    } else {
      updatedTimesheet = await timeTrackingService.rejectTimesheet(
        projectId,
        date,
        userId,
        user.id
      );
    }

    if (!updatedTimesheet) {
      return errorResponse(404, { message: 'Timesheet not found' });
    }

    // 8. Return successful response
    const action = requestData.action === 'approve' ? 'approved' : 'rejected';
    return successResponse(200, { 
      message: `Timesheet ${action} successfully`,
      data: {
        timesheetId: updatedTimesheet.timesheetId,
        projectId: updatedTimesheet.projectId,
        date: updatedTimesheet.date,
        status: updatedTimesheet.status,
        hours: updatedTimesheet.hours,
        approvedBy: updatedTimesheet.approvedBy,
        approvedDate: updatedTimesheet.approvedDate
      }
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error approving/rejecting timesheet', { error });
    
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