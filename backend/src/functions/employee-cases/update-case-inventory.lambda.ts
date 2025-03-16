// backend/src/functions/employee-cases/update-case-inventory.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { errorResponse, successResponse } from '../../utils/response';
import { validateAuth } from '../../utils/auth';
import { EmployeeCaseService } from '../../services/employee-case.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('update-case-inventory');
const employeeCaseService = new EmployeeCaseService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  items: z.array(
    z.object({
      materialId: z.string(),
      quantity: z.number().int(),
      notes: z.string().optional()
    })
  ),
  operation: z.enum(['add', 'update', 'remove']),
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to update items in an employee case
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

    // 2. Get case ID from path parameters
    const caseId = event.pathParameters?.caseId;
    if (!caseId) {
      return errorResponse(400, { message: 'Missing caseId parameter' });
    }

    // 3. Validate request body
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

    // 4. Log operation start
    logger.info('Updating case inventory', { 
      caseId,
      operation: requestData.operation,
      itemCount: requestData.items.length,
      userId: user.id
    });

    // 5. Get the case to check access
    const caseData = await employeeCaseService.getCase(caseId);
    if (!caseData) {
      return errorResponse(404, { message: 'Case not found' });
    }

    // 6. Ensure user has access to the company
    if (user.companyId !== caseData.companyId && user.role !== 'admin') {
      return errorResponse(403, { message: 'Access denied to this case' });
    }

    // 7. Update case inventory based on operation
    let result;
    switch (requestData.operation) {
      case 'add':
        result = await employeeCaseService.addCaseItems(caseId, requestData.items, user.id);
        break;
      case 'update':
        result = await employeeCaseService.updateCaseItems(caseId, requestData.items, user.id);
        break;
      case 'remove':
        result = await employeeCaseService.removeCaseItems(caseId, requestData.items.map(item => item.materialId), user.id);
        break;
      default:
        return errorResponse(400, { message: 'Invalid operation' });
    }

    // 8. Return successful response
    return successResponse(200, { 
      message: 'Case inventory updated successfully',
      data: {
        caseId: result.caseId,
        itemCount: result.items.length,
        updatedAt: result.updated,
        updatedBy: result.updatedBy
      }
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error updating case inventory', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Material not found' });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};