// backend/src/functions/inventory/update-inventory-level.lambda.ts

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
const logger = new Logger('update-inventory-level');
const inventoryService = new InventoryService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  companyId: z.string().uuid(),
  materialId: z.string(),
  adjustment: z.number().nonzero(),
  transactionType: z.enum([
    'purchase', 
    'allocation', 
    'return', 
    'manual_adjustment', 
    'damage', 
    'inventory_check'
  ]),
  projectId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  receiptS3Key: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to update inventory level with a transaction
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
    logger.info('Updating inventory level', { 
      companyId: requestData.companyId,
      materialId: requestData.materialId,
      adjustmentAmount: requestData.adjustment,
      transactionType: requestData.transactionType,
      userId: user.id
    });

    // 5. Update inventory with transaction
    const transaction = await inventoryService.createInventoryTransaction({
      companyId: requestData.companyId,
      materialId: requestData.materialId,
      quantity: requestData.adjustment,
      type: requestData.transactionType,
      projectId: requestData.projectId,
      purchaseOrderId: requestData.purchaseOrderId,
      receipt: requestData.receiptS3Key ? {
        s3Key: requestData.receiptS3Key,
        date: new Date().toISOString(),
      } : undefined,
      notes: requestData.notes,
      location: requestData.location,
      createdBy: user.id
    });

    // 6. Return successful response
    return successResponse(200, { 
      message: 'Inventory level updated successfully',
      data: {
        transactionId: transaction.transactionId,
        materialId: transaction.materialId,
        quantity: transaction.quantity,
        type: transaction.type,
        currentLevel: transaction.currentInventoryLevel,
        previousLevel: transaction.previousInventoryLevel,
        created: transaction.created
      }
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error updating inventory level', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Material not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'InvalidQuantityError') {
        return errorResponse(400, { message: 'Invalid quantity adjustment' });
      } else if (error.name === 'InsufficientStockError') {
        return errorResponse(400, { message: 'Insufficient stock for this adjustment' });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};