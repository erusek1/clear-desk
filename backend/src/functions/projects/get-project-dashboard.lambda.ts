// backend/src/functions/projects/get-project-dashboard.lambda.ts

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
const logger = new Logger('get-project-dashboard');
const projectService = new ProjectService(docClient, s3Client);

/**
 * Get project dashboard data
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

    // 5. Get dashboard data
    const dashboardData = await projectService.getProjectDashboardData(projectId, user.id);

    // 6. Return successful response
    return successResponse(200, { 
      dashboard: dashboardData 
    });
  } catch (error) {
    // 7. Handle errors
    logger.error('Error getting project dashboard', { error });
    return errorResponse(500, { message: 'Failed to get project dashboard' });
  }
};
