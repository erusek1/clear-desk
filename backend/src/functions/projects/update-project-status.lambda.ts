// backend/src/functions/projects/update-project-status.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { errorResponse, successResponse } from '../../utils/response';
import { ProjectService } from '../../services/project.service';
import { ProjectStatus } from '../../types/project.types';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('update-project-status');
const projectService = new ProjectService(docClient, s3Client);

// Input validation schema
const UpdateProjectStatusSchema = z.object({
  status: z.enum([
    'pending', 'active', 'on-hold', 'completed', 'cancelled'
  ], {
    errorMap: () => ({ message: 'Status must be one of: pending, active, on-hold, completed, cancelled' })
  }),
  reason: z.string().optional()
});

type UpdateProjectStatusRequest = z.infer<typeof UpdateProjectStatusSchema>;

/**
 * Update project status
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

    // 3. Validate request body
    if (!event.body) {
      return errorResponse(400, { message: 'Missing request body' });
    }

    let requestData: UpdateProjectStatusRequest;
    try {
      requestData = UpdateProjectStatusSchema.parse(JSON.parse(event.body));
    } catch (error) {
      logger.error('Validation error', { error });
      if (error instanceof z.ZodError) {
        return errorResponse(400, { 
          message: 'Invalid request format', 
          details: error.errors 
        });
      }
      return errorResponse(400, { message: 'Invalid request format' });
    }

    // 4. Get the existing project to check authorization
    const existingProject = await projectService.getProject(projectId);
    if (!existingProject) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 5. Check if user has permission to update project status
    // Project managers, company admin, or system admin can update project status
    const hasUpdatePermission = 
      (existingProject.manager && existingProject.manager.userId === user.id) ||
      (existingProject.foreman && existingProject.foreman.userId === user.id) ||
      user.companyId === existingProject.companyId && user.role === 'admin' ||
      user.role === 'admin';

    if (!hasUpdatePermission) {
      return errorResponse(403, { message: 'You do not have permission to update this project status' });
    }

    // 6. Update project status
    const updatedProject = await projectService.updateProjectStatus(
      projectId, 
      requestData.status as ProjectStatus, 
      user.id
    );

    if (!updatedProject) {
      return errorResponse(500, { message: 'Failed to update project status' });
    }

    // 7. Special case handling for 'completed' status (archiving)
    if (requestData.status === 'completed' && requestData.reason) {
      await projectService.archiveProject(projectId, requestData.reason, user.id);
    }

    // 8. Return successful response
    return successResponse(200, { project: updatedProject });
  } catch (error) {
    // 9. Handle errors
    logger.error('Error updating project status', { error });
    return errorResponse(500, { message: 'Failed to update project status' });
  }
};
