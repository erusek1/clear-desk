// backend/src/functions/vehicles/get-vehicle-inventory.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
const logger = new Logger('get-vehicle-inventory');
const vehicleInventoryService = new VehicleInventoryService(docClient, s3Client);

/**
 * Lambda function to get a vehicle's inventory
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

    // 2. Get vehicle ID from path parameters
    const vehicleId = event.pathParameters?.vehicleId;
    if (!vehicleId) {
      return errorResponse(400, { message: 'Missing vehicleId parameter' });
    }

    // 3. Get vehicle details to check company access
    const vehicle = await vehicleInventoryService.getVehicle(vehicleId);
    if (!vehicle) {
      return errorResponse(404, { message: 'Vehicle not found' });
    }

    // 4. Ensure user has access to the company
    if (user.companyId !== vehicle.companyId && user.role !== 'admin') {
      return errorResponse(403, { message: 'Access denied to this vehicle' });
    }

    // 5. Log operation start
    logger.info('Getting vehicle inventory', { 
      vehicleId,
      userId: user.id
    });

    // 6. Get inventory
    const inventory = await vehicleInventoryService.getVehicleInventory(vehicleId);

    // 7. Return successful response
    return successResponse(200, { 
      vehicleId,
      vehicleName: vehicle.name,
      inventory
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error getting vehicle inventory', { error });
    
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
