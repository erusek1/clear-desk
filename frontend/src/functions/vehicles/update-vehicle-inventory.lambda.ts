// backend/src/functions/vehicles/update-vehicle-inventory.lambda.ts

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
const logger = new Logger('update-vehicle-inventory');
const vehicleInventoryService = new VehicleInventoryService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  companyId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  items: z.array(
    z.object({
      materialId: z.string(),
      quantity: z.number().int(),
      notes: z.string().optional()
    })
  ),
  operation: z.enum(['add', 'update', 'remove']),
  transactionType: z.enum([
    'stock', 
    'usage', 
    'return', 
    'transfer', 
    'inventory_check'
  ]),
  projectId: z.string().uuid().optional(),
  notes: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to update vehicle inventory
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
    logger.info('Updating vehicle inventory', { 
      companyId: requestData.companyId,
      vehicleId: requestData.vehicleId,
      operation: requestData.operation,
      transactionType: requestData.transactionType,
      itemCount: requestData.items.length,
      userId: user.id
    });

    // 5. Update vehicle inventory based on operation
    let result;
    switch (requestData.operation) {
      case 'add':
        result = await vehicleInventoryService.addVehicleItems(
          requestData.vehicleId,
          requestData.items,
          requestData.transactionType,
          {
            projectId: requestData.projectId,
            notes: requestData.notes,
            createdBy: user.id
          }
        );
        break;
      case 'update':
        result = await vehicleInventoryService.updateVehicleItems(
          requestData.vehicleId,
          requestData.items,
          requestData.transactionType,
          {
            projectId: requestData.projectId,
            notes: requestData.notes,
            createdBy: user.id
          }
        );
        break;
      case 'remove':
        result = await vehicleInventoryService.removeVehicleItems(
          requestData.vehicleId,
          requestData.items.map(item => ({ 
            materialId: item.materialId, 
            quantity: item.quantity 
          })),
          requestData.transactionType,
          {
            projectId: requestData.projectId,
            notes: requestData.notes,
            createdBy: user.id
          }
        );
        break;
      default:
        return errorResponse(400, { message: 'Invalid operation' });
    }

    // 6. Return successful response
    return successResponse(200, { 
      message: 'Vehicle inventory updated successfully',
      data: {
        vehicleId: requestData.vehicleId,
        transactionIds: result.transactionIds,
        updatedItems: result.updatedItems,
        updatedAt: result.updatedAt
      }
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error updating vehicle inventory', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Vehicle or material not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'InsufficientStockError') {
        return errorResponse(400, { message: 'Insufficient stock for this operation' });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};