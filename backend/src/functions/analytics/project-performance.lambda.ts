// backend/src/functions/analytics/project-performance.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { AnalyticsService } from '../../services/analytics.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const logger = new Logger('project-performance');
const analyticsService = new AnalyticsService(docClient);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to get project performance metrics
 * 
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Authenticate & authorize request
    const user = validateAuth(event);
    if (!user) {
      return errorResponse(401, { message: 'Unauthorized'