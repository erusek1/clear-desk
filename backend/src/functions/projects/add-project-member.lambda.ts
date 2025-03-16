// backend/src/functions/projects/add-project-member.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { errorResponse, successResponse } from '../../utils/response';
import { ProjectService } from '../../services/project.service';
import { IProjectMember, ProjectRole, ProjectPermission } from '../../types/project.types';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('add-project-member');
const projectService = new ProjectService(docClient, s3Client);

// Input validation schema
const ProjectMemberSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  role: z.enum([
    'manager', 'foreman', 'estimator', 'electrician', 'apprentice', 'office-admin', 'viewer'
  ], {
    errorMap: () => ({ message: 'Role must be one of: manager, foreman, estimator, electrician, apprentice, office-admin, viewer' })
  }),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  permissions: z.array(z.enum([
    'view', 'edit', 'delete', 'manage-members', 'manage-estimates', 'approve-estimates',
    'manage-inspections', 'manage-inventory', 'manage-timetracking', 'view-financials'
  ]))
});

type AddProjectMemberRequest = z.infer<typeof ProjectMemberSchema>;

/**
 * Add a member to a project
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

    let requestData: AddProjectMemberRequest;
    try {
      requestData = ProjectMemberSchema.parse(JSON.parse(event.body));
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

    // 4. Get project to check authorization
    const project = await projectService.getProject(projectId);
    if (!project) {
      return errorResponse(404, { message: 'Project not found' });
    }

    // 5. Check if user has permission to add members
    // Only project manager, company admin, or system admin can add members
    const hasAddMemberPermission = 
      (project.manager && project.manager.userId === user.id) ||
      user.companyId === project.companyId && user.role === 'admin' ||
      user.role === 'admin';

    if (!hasAddMemberPermission) {
      return errorResponse(403, { message: 'You do not have permission to add members to this project' });
    }

    // 6. Check if member is already in the project
    const isMemberExisting = 
      (project.manager && project.manager.userId === requestData.userId) ||
      (project.foreman && project.foreman.userId === requestData.userId) ||
      project.members.some(member => member.userId === requestData.userId);

    // 7. Create member data
    const member: IProjectMember = {
      userId: requestData.userId,
      role: requestData.role as ProjectRole,
      firstName: requestData.firstName,
      lastName: requestData.lastName,
      email: requestData.email,
      phone: requestData.phone,
      joinedDate: new Date().toISOString(),
      permissions: requestData.permissions as ProjectPermission[]
    };

    // 8. Add member to project
    const updatedProject = await projectService.addProjectMember(projectId, member, user.id);
    if (!updatedProject) {
      return errorResponse(500, { message: 'Failed to add member to project' });
    }

    // 9. Return successful response
    return successResponse(200, { 
      project: updatedProject,
      message: isMemberExisting ? 'Member updated successfully' : 'Member added successfully'
    });
  } catch (error) {
    // 10. Handle errors
    logger.error('Error adding project member', { error });
    return errorResponse(500, { message: 'Failed to add member to project' });
  }
};
