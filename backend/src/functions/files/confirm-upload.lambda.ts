// backend/src/functions/files/confirm-upload.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { FileService } from '../../services/file.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('confirm-upload');
const fileService = new FileService(s3Client, docClient);

// Input validation schema
const RequestSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  size: z.number().int().positive(),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to confirm a file upload and update metadata
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
    logger.info('Confirming file upload', { 
      fileId: requestData.fileId,
      projectId: requestData.projectId,
      size: requestData.size,
      userId: user.id,
    });

    // 4. Update file metadata with size
    const fileMetadata = await fileService.updateFileMetadataAfterUpload(
      requestData.fileId,
      requestData.projectId,
      requestData.size,
      user.id
    );

    // 5. If it's a blueprint, trigger processing
    if (fileMetadata.fileType === 'blueprint') {
      // In a real implementation, this would send a message to SQS/SNS
      // to trigger the blueprint processing Lambda function
      // For now, just log it
      logger.info('Blueprint uploaded, processing should be triggered', {
        fileId: fileMetadata.fileId,
        projectId: fileMetadata.projectId,
        s3Key: fileMetadata.s3Key
      });
    }

    // 6. Return successful response
    return successResponse(200, { 
      message: 'File upload confirmed',
      data: fileMetadata
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error confirming file upload', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'File or project not found' });
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