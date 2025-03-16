// backend/src/functions/projects/delete-project.lambda.ts

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
const logger = new Logger('delete-project');
const projectService = new ProjectService(docClient, s3Client);

/**
 * Delete a project
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

    // 3. Get the existing project to check authorization
    const existingProject = await projectService.getProject(projectId);
    if (!existingProject) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 4. Check if user has permission to delete this project
    // Only company admin or system admin can delete projects
    const hasDeletePermission = 
      (user.companyId === existingProject.companyId && user.role === 'admin') ||
      user.role === 'admin';

    if (!hasDeletePermission) {
      return errorResponse(403, { message: 'You do not have permission to delete this project' });
    }

    // 5. Delete the project
    const success = await projectService.deleteProject(projectId, user.id);
    if (!success) {
      return errorResponse(500, { message: 'Failed to delete project' });
    }

    // 6. Return successful response
    return successResponse(204, null);
  } catch (error) {
    // 7. Handle errors
    logger.error('Error deleting project', { error });
    return errorResponse(500, { message: 'Failed to delete project' });
  }
};
