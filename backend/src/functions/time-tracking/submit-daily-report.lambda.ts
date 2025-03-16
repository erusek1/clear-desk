// backend/src/functions/time-tracking/submit-daily-report.lambda.ts

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
const logger = new Logger('submit-daily-report');
const timeTrackingService = new TimeTrackingService(docClient, s3Client);

// Input validation schema
const WeatherSchema = z.object({
  conditions: z.string(),
  temperature: z.number(),
  impacts: z.string().optional()
}).optional();

const CrewMemberSchema = z.object({
  userId: z.string(),
  hours: z.number().positive()
});

const IssueSchema = z.object({
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['open', 'in-progress', 'resolved']),
  assignedTo: z.string().optional()
}).optional();

const MaterialRequestSchema = z.object({
  materialId: z.string(),
  quantity: z.number().positive(),
  urgency: z.enum(['low', 'medium', 'high']),
  notes: z.string().optional()
}).optional();

const ExtraWorkSchema = z.object({
  description: z.string(),
  authorizedBy: z.string().optional(),
  estimatedHours: z.number().optional(),
  estimatedMaterials: z.number().optional()
}).optional();

const RequestSchema = z.object({
  projectId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  weather: WeatherSchema,
  crew: z.array(CrewMemberSchema),
  workCompleted: z.string(),
  workPlanned: z.string().optional(),
  issues: z.array(IssueSchema).optional(),
  materialRequests: z.array(MaterialRequestSchema).optional(),
  extraWork: z.array(ExtraWorkSchema).optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to submit a daily report
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
    logger.info('Submitting daily report', { 
      projectId: requestData.projectId,
      date: requestData.date,
      userId: user.id
    });

    // 4. Check for existing report
    const existingReport = await timeTrackingService.getDailyReport(
      requestData.projectId,
      requestData.date
    );

    if (existingReport) {
      return errorResponse(409, { 
        message: 'Daily report already exists for this date',
        reportId: existingReport.reportId
      });
    }

    // 5. Submit daily report
    const report = await timeTrackingService.submitDailyReport({
      projectId: requestData.projectId,
      date: requestData.date,
      weather: requestData.weather,
      crew: requestData.crew,
      workCompleted: requestData.workCompleted,
      workPlanned: requestData.workPlanned,
      issues: requestData.issues || [],
      materialRequests: requestData.materialRequests || [],
      extraWork: requestData.extraWork || [],
      photos: [],  // Initialize with empty photos array
      createdBy: user.id,
      updatedBy: user.id
    });

    // 6. Return successful response
    return successResponse(201, { 
      message: 'Daily report submitted successfully',
      reportId: report.reportId,
      date: report.date
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error submitting daily report', { error });
    
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