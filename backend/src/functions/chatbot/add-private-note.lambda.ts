// backend/src/functions/chatbot/add-private-note.lambda.ts

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
const logger = new Logger('add-private-note');
const chatbotService = new ChatbotService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  itemId: z.string(), // Can be estimateItemId, inspectionItemId, etc.
  itemType: z.string(), // Type of item (estimate, inspection, etc.)
  content: z.string().min(1),
  visibility: z.enum(['private', 'internal', 'customer']).default('private')
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to add a private note to a project item
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

    // 3. Check if user is company staff or admin
    if (user.role === 'customer') {
      return errorResponse(403, { message: 'Customers cannot add private notes' });
    }

    // 4. Log operation start
    logger.info('Adding private note', { 
      projectId: requestData.projectId,
      itemId: requestData.itemId,
      itemType: requestData.itemType,
      contentLength: requestData.content.length,
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

    // 6. Add the private note
    const note = await chatbotService.addPrivateNote({
      projectId: requestData.projectId,
      itemId: requestData.itemId,
      itemType: requestData.itemType,
      content: requestData.content,
      visibility: requestData.visibility,
      createdBy: user.id
    });

    // 7. Index the note for the knowledge base
    await chatbotService.indexNote(note.noteId);

    // 8. Return successful response
    return successResponse(201, { 
      message: 'Private note added successfully',
      data: {
        noteId: note.noteId,
        projectId: note.projectId,
        itemId: note.itemId,
        itemType: note.itemType,
        visibility: note.visibility,
        created: note.created,
        createdBy: note.createdBy
      }
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error adding private note', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project or item not found' });
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