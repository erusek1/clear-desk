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
const PhaseSchema = z.object({
  phase: z.string(),
  hours: z.number().positive(),
  notes: z.string().optional()
});

const RequestSchema = z.object({
  projectId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  hours: z.number().positive(),
  phases: z.array(PhaseSchema),
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

    // 3. Validate total hours
    const phaseHoursTotal = requestData.phases.reduce((sum, phase) => sum + phase.hours, 0);
    if (Math.abs(phaseHoursTotal - requestData.hours) > 0.01) {
      return errorResponse(400, { message: 'Sum of phase hours does not match total hours' });
    }

    // 4. Log operation start
    logger.info('Submitting timesheet', { 
      projectId: requestData.projectId,
      date: requestData.date,
      userId: user.id
    });

    // 5. Check for existing timesheet
    const existingTimesheet = await timeTrackingService.getTimesheet(
      requestData.projectId,
      requestData.date,
      user.id
    );

    if (existingTimesheet) {
      return errorResponse(409, { 
        message: 'Timesheet already exists for this date and project',
        timesheetId: existingTimesheet.timesheetId
      });
    }

    // 6. Submit timesheet
    const timesheet = await timeTrackingService.submitTimesheet({
      projectId: requestData.projectId,
      userId: user.id,
      date: requestData.date,
      hours: requestData.hours,
      phases: requestData.phases,
      notes: requestData.notes,
      createdBy: user.id,
      updatedBy: user.id
    });

    // 7. Return successful response
    return successResponse(201, { 
      message: 'Timesheet submitted successfully',
      timesheetId: timesheet.timesheetId,
      date: timesheet.date,
      hours: timesheet.hours,
      status: timesheet.status
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error submitting timesheet', { error });
    
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