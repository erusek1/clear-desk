// backend/src/functions/estimates/update-estimate-status.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { successResponse, errorResponse } from '../../utils/response';
import config from '../../config';
import { TimelineEventType, TimelineEventStatus } from '../../types/timeline.types';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const logger = new Logger('update-estimate-status');

// Try to import timeline service if available
let timelineService: any = null;
try {
  const { ProjectTimelineService } = require('../../services/project-timeline.service');
  timelineService = new ProjectTimelineService(docClient);
} catch (err) {
  logger.warn('Timeline service not available, skipping timeline events');
}

// Input validation schema
const RequestSchema = z.object({
  estimateId: z.string().uuid(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'revised']),
  note: z.string().optional()
});

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to update estimate status
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

    // 3. Get the estimate to verify it exists and get projectId
    const estimateResult = await docClient.send(new GetCommand({
      TableName: config.dynamodb.tables.estimates,
      Key: {
        PK: `ESTIMATE#${requestData.estimateId}`,
        SK: 'METADATA'
      }
    }));

    if (!estimateResult.Item) {
      return errorResponse(404, { message: 'Estimate not found' });
    }

    const estimate = estimateResult.Item;
    const projectId = estimate.projectId;

    // 4. Log operation start
    logger.info('Updating estimate status', { 
      estimateId: requestData.estimateId,
      projectId,
      status: requestData.status,
      userId: user.id
    });

    // 5. Update estimate status
    const now = new Date().toISOString();
    
    // Prepare update expression and values
    let updateExpression = 'set #status = :status, updated = :updated, updatedBy = :updatedBy';
    const expressionAttributeNames = {
      '#status': 'status'
    };
    const expressionAttributeValues: Record<string, any> = {
      ':status': requestData.status,
      ':updated': now,
      ':updatedBy': user.id
    };
    
    // Add status-specific date field
    if (requestData.status === 'sent') {
      updateExpression += ', sentDate = :date';
      expressionAttributeValues[':date'] = now;
    } else if (requestData.status === 'accepted') {
      updateExpression += ', acceptedDate = :date';
      expressionAttributeValues[':date'] = now;
    } else if (requestData.status === 'rejected') {
      updateExpression += ', rejectedDate = :date';
      expressionAttributeValues[':date'] = now;
    }
    
    // Add note if provided
    if (requestData.note) {
      updateExpression += ', note = :note';
      expressionAttributeValues[':note'] = requestData.note;
    }

    // Update the estimate
    const result = await docClient.send(new UpdateCommand({
      TableName: config.dynamodb.tables.estimates,
      Key: {
        PK: `ESTIMATE#${requestData.estimateId}`,
        SK: 'METADATA'
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    if (!result.Attributes) {
      return errorResponse(500, { message: 'Failed to update estimate' });
    }

    const updatedEstimate = result.Attributes;

    // 6. Add timeline event if timeline service is available
    if (timelineService) {
      let eventType: TimelineEventType;
      let title: string;
      
      switch (requestData.status) {
        case 'sent':
          eventType = TimelineEventType.ESTIMATE_SENT;
          title = 'Estimate Sent';
          break;
        case 'accepted':
          eventType = TimelineEventType.ESTIMATE_ACCEPTED;
          title = 'Estimate Accepted';
          break;
        case 'rejected':
          eventType = TimelineEventType.ESTIMATE_REJECTED;
          title = 'Estimate Rejected';
          break;
        default:
          eventType = TimelineEventType.CUSTOM;
          title = `Estimate Status: ${requestData.status}`;
      }
      
      await timelineService.addEvent({
        projectId,
        eventType,
        title,
        description: requestData.note,
        status: TimelineEventStatus.COMPLETED,
        scheduledDate: now,
        actualDate: now,
        relatedEntityType: 'estimate',
        relatedEntityId: requestData.estimateId
      }, user.id);
    }

    // 7. Return successful response
    return successResponse(200, { 
      message: 'Estimate status updated successfully',
      data: updatedEstimate
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error updating estimate status', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException' || error.message.includes('not found')) {
        return errorResponse(404, { message: 'Estimate not found' });
      } else if (error.name === 'ValidationError' || error.message.includes('Invalid')) {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException' || error.message.includes('permission')) {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};