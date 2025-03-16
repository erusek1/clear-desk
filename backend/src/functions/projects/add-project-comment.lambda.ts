// backend/src/functions/projects/add-project-comment.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
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
const logger = new Logger('add-project-comment');
const projectService = new ProjectService(docClient, s3Client);

// Input validation schema
const CommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required'),
  parentId: z.string().uuid('Parent ID must be a valid UUID').optional(),
  attachments: z.array(z.object({
    s3Key: z.string(),
    fileName: z.string(),
    fileType: z.string(),
    uploadDate: z.string()
  })).optional(),
  mentions: z.array(z.string()).optional()
});

type AddCommentRequest = z.infer<typeof CommentSchema>;

/**
 * Add a comment to a project
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

    let requestData: AddCommentRequest;
    try {
      requestData = CommentSchema.parse(JSON.parse(event.body));
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

    // 5. Check if user has access to this project
    const hasAccess = 
      user.companyId === project.companyId || 
      project.members.some(member => member.userId === user.id) ||
      (project.manager && project.manager.userId === user.id) ||
      (project.foreman && project.foreman.userId === user.id) ||
      user.role === 'admin';

    if (!hasAccess) {
      return errorResponse(403, { message: 'You do not have access to this project' });
    }

    // 6. If it's a reply, check if parent comment exists
    if (requestData.parentId) {
      const parentComment = await projectService.getComment(projectId, requestData.parentId);
      if (!parentComment) {
        return errorResponse(404, { message: 'Parent comment not found' });
      }
    }

    // 7. Add comment to project
    const comment = await projectService.addComment(
      projectId,
      {
        content: requestData.content,
        parentId: requestData.parentId,
        attachments: requestData.attachments,
        mentions: requestData.mentions
      },
      user.id
    );

    // 8. Return successful response
    return successResponse(201, { 
      comment,
      message: requestData.parentId ? 'Reply added successfully' : 'Comment added successfully'
    });
  } catch (error) {
    // 9. Handle errors
    logger.error('Error adding project comment', { error });
    return errorResponse(500, { message: 'Failed to add comment to project' });
  }
};
