// backend/src/functions/projects/get-company-projects.lambda.ts

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
const logger = new Logger('get-company-projects');
const projectService = new ProjectService(docClient, s3Client);

/**
 * Get all projects for a company
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

    // 2. Extract company ID from path parameters
    const companyId = event.pathParameters?.companyId;
    if (!companyId) {
      return errorResponse(400, { message: 'Missing company ID' });
    }

    // 3. Check if user has access to this company's projects
    // A user can access a company's projects if:
    // - They belong to the company
    // - They have admin privileges
    const hasAccess = user.companyId === companyId || user.role === 'admin';
    if (!hasAccess) {
      return errorResponse(403, { message: 'You do not have access to projects for this company' });
    }

    // 4. Get query parameters for filtering and pagination
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : undefined;
    const nextToken = queryParams.nextToken;

    // 5. Get projects for the company
    const projects = await projectService.getCompanyProjects(companyId);

    // 6. Apply filters if provided
    let filteredProjects = projects;
    if (status) {
      filteredProjects = projects.filter(project => project.status === status);
    }

    // 7. Implement pagination
    let paginatedProjects = filteredProjects;
    let newNextToken: string | undefined;
    
    if (limit && limit > 0) {
      let startIndex = 0;
      
      // If nextToken is provided, find the starting index
      if (nextToken) {
        const decodedToken = Buffer.from(nextToken, 'base64').toString('utf-8');
        startIndex = parseInt(decodedToken, 10);
        if (isNaN(startIndex) || startIndex < 0 || startIndex >= filteredProjects.length) {
          startIndex = 0;
        }
      }
      
      // Calculate end index
      const endIndex = Math.min(startIndex + limit, filteredProjects.length);
      
      // Slice the projects array for pagination
      paginatedProjects = filteredProjects.slice(startIndex, endIndex);
      
      // Generate next token if there are more results
      if (endIndex < filteredProjects.length) {
        newNextToken = Buffer.from(endIndex.toString()).toString('base64');
      }
    }

    // 8. Return successful response with pagination metadata
    return successResponse(200, { 
      projects: paginatedProjects,
      meta: {
        total: filteredProjects.length,
        count: paginatedProjects.length,
        nextToken: newNextToken
      }
    });
  } catch (error) {
    // 9. Handle errors
    logger.error('Error getting company projects', { error });
    return errorResponse(500, { message: 'Failed to get company projects' });
  }
};
