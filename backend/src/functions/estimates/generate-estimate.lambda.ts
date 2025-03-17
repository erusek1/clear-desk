// backend/src/functions/estimates/generate-estimate.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { EstimationEngineService } from '../../services/estimation-engine.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const logger = new Logger('generate-estimate');
const estimationService = new EstimationEngineService(docClient);

// Input validation schema
const RequestSchema = z.object({
  projectId: z.string().uuid(),
  blueprintId: z.string().uuid(),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to generate an estimate from a blueprint
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

    // 3. Generate the estimate
    const estimate = await estimationService.generateEstimate(
      requestData.projectId,
      requestData.blueprintId,
      user.companyId,
      user.id
    );

    // 4. Return successful response
    return successResponse(200, { 
      message: 'Estimate generated successfully', 
      estimateId: estimate.estimateId,
      estimate: estimate
    });
  } catch (error) {
    // 5. Handle and log errors
    logger.error('Error generating estimate', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.message.includes('Blueprint not found')) {
        return errorResponse(404, { message: 'Blueprint not found' });
      } else if (error.message.includes('Company not found')) {
        return errorResponse(404, { message: 'Company not found' });
      }
      
      return errorResponse(500, { message: error.message });
    }
    
    return errorResponse(500, { message: 'Internal server error' });
  }
};