// backend/src/functions/inventory/create-purchase-order.lambda.ts

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
const logger = new Logger('create-purchase-order');
const inventoryService = new InventoryService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  vendorId: z.string().uuid(),
  items: z.array(
    z.object({
      materialId: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().optional(),
      notes: z.string().optional()
    })
  ),
  deliveryDate: z.string().optional(),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().optional().default('USA')
  }).optional(),
  notes: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to create a purchase order
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
    logger.info('Creating purchase order', { 
      companyId: requestData.companyId,
      projectId: requestData.projectId,
      vendorId: requestData.vendorId,
      itemCount: requestData.items.length,
      userId: user.id
    });

    // 5. Create purchase order
    const purchaseOrder = await inventoryService.createPurchaseOrder({
      companyId: requestData.companyId,
      projectId: requestData.projectId,
      vendorId: requestData.vendorId,
      items: requestData.items,
      deliveryDate: requestData.deliveryDate,
      shippingAddress: requestData.shippingAddress,
      notes: requestData.notes,
      createdBy: user.id
    });

    // 6. Return successful response
    return successResponse(201, { 
      message: 'Purchase order created successfully',
      data: {
        purchaseOrderId: purchaseOrder.purchaseOrderId,
        orderNumber: purchaseOrder.orderNumber,
        vendorId: purchaseOrder.vendorId,
        itemCount: purchaseOrder.items.length,
        totalCost: purchaseOrder.totalCost,
        status: purchaseOrder.status,
        created: purchaseOrder.created
      }
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error creating purchase order', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Vendor or material not found' });
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