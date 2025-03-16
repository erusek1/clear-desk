// backend/src/functions/chatbot/process-customer-query.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger.js';
import { errorResponse, successResponse } from '../../utils/response.js';
import { validateAuth } from '../../utils/auth.js';
import { ChatbotService } from '../../services/chatbot.service.js';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('process-customer-query');
const chatbotService = new ChatbotService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().min(1),
  sessionId: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to process a customer query through the chatbot
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
    logger.info('Processing customer query', { 
      projectId: requestData.projectId,
      queryLength: requestData.query.length,
      sessionId: requestData.sessionId,
      userId: user.id
    });

    // 4. Verify user's access to project
    const hasAccess = await chatbotService.verifyProjectAccess(
      requestData.projectId,
      user.id,
      user.role
    );

    if (!hasAccess) {
      return errorResponse(403, { message: 'Access denied to this project' });
    }

    // 5. Process the query
    const response = await chatbotService.processQuery(
      requestData.projectId,
      requestData.query,
      user.id,
      requestData.sessionId
    );

    // 6. Return successful response
    return successResponse(200, { 
      message: 'Query processed successfully',
      data: {
        response: response.answer,
        sessionId: response.sessionId,
        sources: response.sources || []
      }
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error processing customer query', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      } else if (error.name === 'ServiceUnavailableError') {
        return errorResponse(503, { message: 'Chatbot service temporarily unavailable' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};