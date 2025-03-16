// backend/src/functions/blueprints/generate-template.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { BlueprintService } from '../../services/blueprint.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('generate-template');
const blueprintService = new BlueprintService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  sampleFileKeys: z.array(z.string()).optional(),
  patterns: z.array(
    z.object({
      dataType: z.string(),
      patternType: z.string(),
      pattern: z.string(),
      examples: z.array(z.string()).optional()
    })
  ).optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to create a blueprint template
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
    logger.info('Creating blueprint template', { 
      templateName: requestData.name,
      userId: user.id,
    });

    // 4. Create template
    const template = await blueprintService.createTemplate({
      name: requestData.name,
      description: requestData.description || '',
      patterns: requestData.patterns || [],
      sampleFiles: requestData.sampleFileKeys || [],
      createdBy: user.id,
      updatedBy: user.id
    });

    // 5. Return successful response
    return successResponse(201, { 
      message: 'Blueprint template created successfully',
      templateId: template.templateId,
      name: template.name
    });
  } catch (error) {
    // 6. Handle and log errors
    logger.error('Error creating blueprint template', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};