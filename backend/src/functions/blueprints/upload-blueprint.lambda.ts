// backend/src/functions/blueprints/upload-blueprint.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import config from '../../config';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('upload-blueprint');

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to generate a presigned URL for blueprint upload
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

    // 3. Validate file extension is PDF
    const fileExtension = requestData.filename.split('.').pop()?.toLowerCase();
    if (fileExtension !== 'pdf') {
      return errorResponse(400, { message: 'Only PDF files are allowed' });
    }

    // 4. Generate a unique file key for S3
    const fileKey = `blueprints/${requestData.projectId}/${uuidv4()}.pdf`;

    // 5. Create presigned URL for S3 upload
    const command = new PutObjectCommand({
      Bucket: config.s3.buckets.files,
      Key: fileKey,
      ContentType: requestData.contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // 6. Update project with the pending blueprint information
    // Note: This is done after the file is actually uploaded, in the process-blueprint Lambda

    // 7. Return successful response with the signed URL
    return successResponse(200, {
      uploadUrl: signedUrl,
      fileKey: fileKey,
      expiresIn: 3600
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error generating upload URL', { error });
    
    if (error instanceof Error) {
      return errorResponse(500, { message: error.message });
    }
    
    return errorResponse(500, { message: 'Internal server error' });
  }
};