// backend/src/functions/projects/remove-project-member.lambda.ts

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
const logger = new Logger('remove-project-member');
const projectService = new ProjectService(docClient, s3Client);

/**
 * Remove a member from a project
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

    // 2. Extract project ID and member ID from path parameters
    const projectId = event.pathParameters?.projectId;
    const memberId = event.pathParameters?.memberId;
    
    if (!projectId) {
      return errorResponse(400, { message: 'Missing project ID' });
    }
    
    if (!memberId) {
      return errorResponse(400, { message: 'Missing member ID' });
    }

    // 3. Get project to check authorization
    const project = await projectService.getProject(projectId);
    if (!project) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 4. Check if user has permission to remove members
    // Only project manager, company admin, or system admin can remove members
    const hasRemoveMemberPermission = 
      (project.manager && project.manager.userId === user.id) ||
      user.companyId === project.companyId && user.role === 'admin' ||
      user.role === 'admin';

    // Also, users can remove themselves from a project
    const isSelfRemoval = user.id === memberId;

    if (!hasRemoveMemberPermission && !isSelfRemoval) {
      return errorResponse(403, { message: 'You do not have permission to remove members from this project' });
    }

    // 5. Check if member exists in the project
    const isMemberExisting = 
      (project.manager && project.manager.userId === memberId) ||
      (project.foreman && project.foreman.userId === memberId) ||
      project.members.some(member => member.userId === memberId);

    if (!isMemberExisting) {
      return errorResponse(404, { message: 'Member not found in project' });
    }

    // 6. Prevent removing last project manager unless it's by company admin or system admin
    const isLastManager = 
      project.manager && 
      project.manager.userId === memberId && 
      !project.members.some(m => m.role === 'manager');
    
    if (isLastManager && isSelfRemoval && user.role !== 'admin') {
      return errorResponse(400, { 
        message: 'Cannot remove the last project manager. Assign another manager first.' 
      });
    }

    // 7. Remove member from project
    const updatedProject = await projectService.removeProjectMember(projectId, memberId, user.id);
    if (!updatedProject) {
      return errorResponse(500, { message: 'Failed to remove member from project' });
    }

    // 8. Return successful response
    return successResponse(200, { 
      project: updatedProject,
      message: 'Member removed successfully'
    });
  } catch (error) {
    // 9. Handle errors
    logger.error('Error removing project member', { error });
    return errorResponse(500, { message: 'Failed to remove member from project' });
  }
};
