
    // backend/src/functions/employee-cases/create-case.lambda.ts

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
const logger = new Logger('create-case');
const employeeCaseService = new EmployeeCaseService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  companyId: z.string().uuid(),
  employeeId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  templateId: z.string().optional(),
  items: z.array(
    z.object({
      materialId: z.string(),
      quantity: z.number().positive(),
      notes: z.string().optional()
    })
  ).optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to create an employee material case
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
    logger.info('Creating employee case', { 
      companyId: requestData.companyId,
      employeeId: requestData.employeeId,
      caseName: requestData.name,
      userId: user.id
    });

    // 5. Create employee case
    const caseData = {
      companyId: requestData.companyId,
      employeeId: requestData.employeeId,
      name: requestData.name,
      description: requestData.description || '',
      items: requestData.items || [],
      createdBy: user.id,
      updatedBy: user.id
    };

    const newCase = await employeeCaseService.createCase(caseData);

    // 6. Apply template if provided
    if (requestData.templateId) {
      await employeeCaseService.applyCaseTemplate(
        newCase.caseId,
        requestData.templateId,
        user.id
      );
    }

    // 7. Return successful response
    return successResponse(201, { 
      message: 'Employee case created successfully',
      caseId: newCase.caseId,
      name: newCase.name,
      employeeId: newCase.employeeId
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error creating employee case', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Employee or template not found' });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};