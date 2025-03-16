// backend/src/functions/projects/get-project.lambda.ts

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
const logger = new Logger('get-project');
const projectService = new ProjectService(docClient, s3Client);

/**
 * Get a project by ID
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

    // 3. Get the project
    const project = await projectService.getProject(projectId);
    if (!project) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 4. Check if user has access to this project
    // A user can access a project if:
    // - They belong to the same company as the project
    // - They are a member of the project
    // - They have admin privileges
    const hasAccess = 
      user.companyId === project.companyId || 
      project.members.some(member => member.userId === user.id) ||
      (project.manager && project.manager.userId === user.id) ||
      (project.foreman && project.foreman.userId === user.id) ||
      user.role === 'admin';

    if (!hasAccess) {
      return errorResponse(403, { message: 'You do not have access to this project' });
    }

    // 5. Return successful response
    return successResponse(200, { project });
  } catch (error) {
    // 6. Handle errors
    logger.error('Error getting project', { error });
    return errorResponse(500, { message: 'Failed to get project' });
  }
};
