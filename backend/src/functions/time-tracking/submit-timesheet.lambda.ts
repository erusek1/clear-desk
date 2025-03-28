// backend/src/functions/time-tracking/submit-timesheet.lambda.ts

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
const logger = new Logger('submit-timesheet');
const timeTrackingService = new TimeTrackingService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  hours: z.number().positive(),
  phases: z.array(
    z.object({
      phase: z.string(),
      hours: z.number().positive(),
      notes: z.string().optional()
    })
  ),
  notes: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to submit a timesheet
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

    // 3. Validate that sum of phase hours equals total hours
    const phaseHoursSum = requestData.phases.reduce((sum, phase) => sum + phase.hours, 0);
    if (Math.abs(phaseHoursSum - requestData.hours) > 0.01) {
      return errorResponse(400, { 
        message: 'Sum of phase hours must equal total hours',
        details: { 
          totalHours: requestData.hours, 
          phaseHoursSum 
        }
      });
    }

    // 4. Log operation start
    logger.info('Submitting timesheet', { 
      projectId: requestData.projectId,
      date: requestData.date,
      hours: requestData.hours,
      userId: user.id
    });

    // 5. Submit timesheet
    const timesheet = await timeTrackingService.submitTimesheet({
      projectId: requestData.projectId,
      userId: user.id,
      date: requestData.date,
      hours: requestData.hours,
      phases: requestData.phases,
      notes: requestData.notes
    });

    // 6. Return successful response
    return successResponse(201, { 
      message: 'Timesheet submitted successfully',
      data: {
        timesheetId: timesheet.timesheetId,
        projectId: timesheet.projectId,
        date: timesheet.date,
        status: timesheet.status,
        hours: timesheet.hours
      }
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error submitting timesheet', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'DuplicateResourceError') {
        return errorResponse(409, { message: 'Timesheet already exists for this date' });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};