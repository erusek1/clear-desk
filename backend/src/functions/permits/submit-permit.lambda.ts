// backend/src/functions/permits/submit-permit.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { PermitService } from '../../services/permit.service';
import { PermitStatus } from '../../types/permit.types';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { errorResponse, successResponse } from '../../utils/response';
import config from '../../config';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('submit-permit');
const permitService = new PermitService(docClient, s3Client);

// Input validation schema
const RequestSchema = z.object({
  permitId: z.string().uuid(),
  notes: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to submit a permit
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

    // 3. Log operation start
    logger.info('Submitting permit', { 
      permitId: requestData.permitId,
      userId: user.id
    });

    // 4. Get permit to check status
    const permit = await permitService.getPermit(requestData.permitId);
    
    if (!permit) {
      return errorResponse(404, { message: 'Permit not found' });
    }
    
    // 5. Check if permit can be submitted
    if (permit.status !== PermitStatus.DRAFT) {
      return errorResponse(400, { 
        message: `Cannot submit permit with status: ${permit.status}. Only permits in DRAFT status can be submitted.` 
      });
    }
    
    // 6. Update permit status to SUBMITTED
    const updatedPermit = await permitService.updatePermit(
      requestData.permitId,
      { 
        status: PermitStatus.SUBMITTED,
        notes: requestData.notes
      },
      user.id
    );
    
    if (!updatedPermit) {
      return errorResponse(500, { message: 'Failed to update permit status' });
    }
    
    // 7. Get PDF download URL
    const pdfUrl = await permitService.getPermitPdfDownloadUrl(requestData.permitId);
    
    // 8. Return successful response
    return successResponse(200, { 
      message: 'Permit submitted successfully',
      data: {
        permit: updatedPermit,
        pdfUrl
      }
    });
  } catch (error) {
    // 9. Handle and log errors
    logger.error('Error submitting permit', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Permit not found' });
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