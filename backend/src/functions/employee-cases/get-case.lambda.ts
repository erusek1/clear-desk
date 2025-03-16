// backend/src/functions/employee-cases/get-case.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
const logger = new Logger('get-case');
const employeeCaseService = new EmployeeCaseService(docClient, s3Client);

/**
 * Lambda function to get an employee material case
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

    // 3. Log operation start
    logger.info('Getting employee case', { 
      caseId,
      userId: user.id
    });

    // 4. Get the case
    const caseData = await employeeCaseService.getCase(caseId);
    if (!caseData) {
      return errorResponse(404, { message: 'Case not found' });
    }

    // 5. Ensure user has access to the company
    if (user.companyId !== caseData.companyId && user.role !== 'admin') {
      return errorResponse(403, { message: 'Access denied to this case' });
    }

    // 6. Return successful response
    return successResponse(200, { 
      data: caseData
    });
  } catch (error) {
    // 7. Handle and log errors
    logger.error('Error getting employee case', { error });
    
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