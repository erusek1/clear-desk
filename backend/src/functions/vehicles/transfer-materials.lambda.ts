// backend/src/functions/vehicles/transfer-materials.lambda.ts

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
const logger = new Logger('transfer-materials');
const vehicleInventoryService = new VehicleInventoryService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  fromWarehouse: z.boolean().default(true),
  vehicleId: z.string().uuid(),
  materialId: z.string(),
  quantity: z.number().positive(),
  companyId: z.string().uuid()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to transfer materials between warehouse and vehicle
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

    // 3. Get vehicle details to check company access
    const vehicle = await vehicleInventoryService.getVehicle(requestData.vehicleId);
    if (!vehicle) {
      return errorResponse(404, { message: 'Vehicle not found' });
    }

    // 4. Ensure user has access to the company
    if (user.companyId !== vehicle.companyId && user.role !== 'admin') {
      return errorResponse(403, { message: 'Access denied to this vehicle' });
    }

    // 5. Ensure company ID matches vehicle's company
    if (requestData.companyId !== vehicle.companyId) {
      return errorResponse(400, { message: 'Company ID does not match vehicle company' });
    }

    // 6. Log operation start
    logger.info('Transferring materials', { 
      fromWarehouse: requestData.fromWarehouse,
      vehicleId: requestData.vehicleId,
      materialId: requestData.materialId,
      quantity: requestData.quantity,
      userId: user.id
    });

    // 7. Perform the transfer
    const transactionId = await vehicleInventoryService.transferMaterials(
      requestData.fromWarehouse,
      requestData.vehicleId,
      requestData.materialId,
      requestData.quantity,
      user.id,
      requestData.companyId
    );

    // 8. Return successful response
    return successResponse(200, { 
      message: 'Materials transferred successfully',
      transactionId,
      fromWarehouse: requestData.fromWarehouse,
      vehicleId: requestData.vehicleId,
      materialId: requestData.materialId,
      quantity: requestData.quantity
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error transferring materials', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      } else if (error.name === 'InsufficientInventoryError') {
        return errorResponse(400, { message: 'Insufficient inventory for transfer' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};
