// backend/src/functions/projects/get-project-activities.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { errorResponse, successResponse } from '../../utils/response';
import { ProjectService } from '../../services/project.service';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('get-project-activities');
const projectService = new ProjectService(docClient, s3Client);

/**
 * Get project activities
 * 
 * @param event - API Gateway proxy event
 * @returns API Gateway proxy result
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Authenticate the request
    const user = validateAuth(event);
    if (!user) {
      return errorResponse(401, { message: 'Unauthorized' });
    }

    // 2. Extract project ID from path parameters
    const projectId = event.pathParameters?.projectId;
    if (!projectId) {
      return errorResponse(400, { message: 'Missing project ID' });
    }

    // 3. Get project to check authorization
    const project = await projectService.getProject(projectId);
    if (!project) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 4. Check if user has access to this project
    const hasAccess = 
      user.companyId === project.companyId || 
      project.members.some(member => member.userId === user.id) ||
      (project.manager && project.manager.userId === user.id) ||
      (project.foreman && project.foreman.userId === user.id) ||
      user.role === 'admin';

    if (!hasAccess) {
      return errorResponse(403, { message: 'You do not have access to this project' });
    }

    // 5. Get query parameters for filtering and pagination
    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : undefined;
    const entityId = queryParams.entityId;
    const entityType = queryParams.entityType;
    const keyword = queryParams.keyword;

    // 6. Get activities based on the provided parameters
    let activities;
    
    if (entityId && entityType) {
      // Get activities for a specific entity
      activities = await projectService.getEntityActivities(
        projectId, 
        entityId, 
        entityType, 
        limit
      );
    } else if (keyword) {
      // Search activities by keyword
      activities = await projectService.searchActivities(
        projectId, 
        keyword, 
        limit
      );
    } else {
      // Get all project activities with optional date range
      activities = await projectService.getProjectActivities(
        projectId, 
        startDate, 
        endDate, 
        limit
      );
    }

    // 7. Return successful response
    return successResponse(200, { 
      activities,
      meta: {
        total: activities.length,
        filters: {
          startDate,
          endDate,
          entityId,
          entityType,
          keyword
        }
      }
    });
  } catch (error) {
    // 8. Handle errors
    logger.error('Error getting project activities', { error });
    return errorResponse(500, { message: 'Failed to get project activities' });
  }
};
