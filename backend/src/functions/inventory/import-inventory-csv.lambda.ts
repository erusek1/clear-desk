// backend/src/functions/inventory/import-inventory-csv.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { InventoryService } from '../../services/inventory.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('import-inventory-csv');
const inventoryService = new InventoryService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  companyId: z.string().uuid(),
  fileKey: z.string()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to import inventory from a CSV file
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

    // 3. Ensure user has access to the company
    if (user.companyId !== requestData.companyId && user.role !== 'admin') {
      return errorResponse(403, { message: 'Access denied to this company' });
    }

    // 4. Log operation start
    logger.info('Importing inventory from CSV', { 
      companyId: requestData.companyId,
      fileKey: requestData.fileKey,
      userId: user.id
    });

    // 5. Import CSV
    const result = await inventoryService.importInventoryFromCsv(
      requestData.companyId,
      requestData.fileKey,
      user.id
    );

    // 6. Return successful response
    return successResponse(200, { 
      message: 'Inventory imported successfully',
      data: result
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error importing inventory from CSV', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'NoSuchKey') {
        return errorResponse(404, { message: 'CSV file not found' });
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
