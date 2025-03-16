// backend/src/functions/vehicles/transfer-between-vehicles.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { VehicleInventoryService } from '../../services/vehicle-inventory.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('transfer-between-vehicles');
const vehicleInventoryService = new VehicleInventoryService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  companyId: z.string().uuid(),
  sourceVehicleId: z.string().uuid(),
  destinationVehicleId: z.string().uuid(),
  items: z.array(
    z.object({
      materialId: z.string(),
      quantity: z.number().int().positive(),
      notes: z.string().optional()
    })
  ),
  projectId: z.string().uuid().optional(),
  notes: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to transfer inventory between vehicles
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

    // 4. Ensure source and destination are different
    if (requestData.sourceVehicleId === requestData.destinationVehicleId) {
      return errorResponse(400, { message: 'Source and destination vehicles must be different' });
    }

    // 5. Log operation start
    logger.info('Transferring inventory between vehicles', { 
      companyId: requestData.companyId,
      sourceVehicleId: requestData.sourceVehicleId,
      destinationVehicleId: requestData.destinationVehicleId,
      itemCount: requestData.items.length,
      userId: user.id
    });

    // 6. Perform transfer
    const result = await vehicleInventoryService.transferBetweenVehicles(
      requestData.sourceVehicleId,
      requestData.destinationVehicleId,
      requestData.items,
      {
        projectId: requestData.projectId,
        notes: requestData.notes,
        createdBy: user.id
      }
    );

    // 7. Return successful response
    return successResponse(200, { 
      message: 'Vehicle inventory transferred successfully',
      data: {
        sourceVehicleId: requestData.sourceVehicleId,
        destinationVehicleId: requestData.destinationVehicleId,
        sourceTransactionId: result.sourceTransactionId,
        destinationTransactionId: result.destinationTransactionId,
        transferredItems: result.transferredItems.length,
        timestamp: result.timestamp
      }
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error transferring between vehicles', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Vehicle or material not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'InsufficientStockError') {
        return errorResponse(400, { message: 'Insufficient stock in source vehicle' });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};