// backend/src/functions/chatbot/index-project-documents.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { ChatbotService } from '../../services/chatbot.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('index-project-documents');
const chatbotService = new ChatbotService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  documentTypes: z.array(z.enum([
    'all',
    'blueprint',
    'estimate',
    'inspection',
    'daily-report',
    'communication',
    'notes'
  ])).default(['all'])
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to index project documents for the chatbot knowledge base
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

    // 3. Check if user is admin or manager
    if (user.role !== 'admin' && user.role !== 'manager') {
      return errorResponse(403, { message: 'Insufficient permissions to index project documents' });
    }

    // 4. Log operation start
    logger.info('Indexing project documents', { 
      projectId: requestData.projectId,
      documentTypes: requestData.documentTypes,
      userId: user.id
    });

    // 5. Verify user's access to project
    const hasAccess = await chatbotService.verifyProjectAccess(
      requestData.projectId,
      user.id,
      user.role
    );

    if (!hasAccess) {
      return errorResponse(403, { message: 'Access denied to this project' });
    }

    // 6. Index the project documents
    const indexingResult = await chatbotService.indexProjectDocuments(
      requestData.projectId,
      requestData.documentTypes,
      user.id
    );

    // 7. Return successful response
    return successResponse(200, { 
      message: 'Project documents indexed successfully',
      data: {
        projectId: requestData.projectId,
        documentsIndexed: indexingResult.documentsIndexed,
        documentTypes: indexingResult.documentTypes,
        totalDocuments: indexingResult.totalDocuments
      }
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error indexing project documents', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      } else if (error.name === 'ServiceUnavailableError') {
        return errorResponse(503, { message: 'Indexing service temporarily unavailable' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};