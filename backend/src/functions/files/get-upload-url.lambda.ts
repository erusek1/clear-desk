// backend/src/functions/files/get-upload-url.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { FileService, FileType } from '../../services/file.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('get-upload-url');
const fileService = new FileService(s3Client, docClient);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1),
  fileType: z.nativeEnum(FileType),
  contentType: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  entityId: z.string().optional(),
  entityType: z.string().optional(),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to get a presigned URL for file upload
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
    logger.info('Generating upload URL', { 
      projectId: requestData.projectId,
      fileName: requestData.fileName,
      fileType: requestData.fileType,
      userId: user.id,
    });

    // 4. Generate presigned upload URL
    const result = await fileService.getPresignedUploadUrl(
      requestData,
      user.id
    );

    // 5. Return successful response
    return successResponse(200, result);
  } catch (error) {
    // 6. Handle and log errors
    logger.error('Error generating upload URL', { error });
    
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