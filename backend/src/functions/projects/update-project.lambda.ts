// backend/src/functions/projects/update-project.lambda.ts

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
const logger = new Logger('update-project');
const projectService = new ProjectService(docClient, s3Client);

// Input validation schema
const ProjectAddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(1, 'ZIP code is required'),
  country: z.string().min(1, 'Country is required'),
  coordinates: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional()
  }).optional()
}).optional();

const ProjectCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: ProjectAddressSchema
}).optional();

const ProjectGeneralContractorSchema = z.object({
  name: z.string().min(1, 'General contractor name is required'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: ProjectAddressSchema
}).optional();

const UpdateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').optional(),
  status: z.enum([
    'pending', 'active', 'on-hold', 'completed', 'cancelled'
  ]).optional(),
  address: ProjectAddressSchema,
  customer: ProjectCustomerSchema,
  generalContractor: ProjectGeneralContractorSchema,
  sqFootage: z.number().optional(),
  classification: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional()
});

type UpdateProjectRequest = z.infer<typeof UpdateProjectSchema>;

/**
 * Update a project
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

    let requestData: UpdateProjectRequest;
    try {
      requestData = UpdateProjectSchema.parse(JSON.parse(event.body));
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

    // 5. Check if user has permission to update this project
    // Only project managers, company admin, or system admin can update projects
    const hasUpdatePermission = 
      (existingProject.manager && existingProject.manager.userId === user.id) ||
      user.companyId === existingProject.companyId && user.role === 'admin' ||
      user.role === 'admin';

    if (!hasUpdatePermission) {
      return errorResponse(403, { message: 'You do not have permission to update this project' });
    }

    // 6. Prepare update data
    const updateData: Partial<Omit<typeof existingProject, 'projectId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>> = {};

    // Only include fields that are present in the request
    if (requestData.name !== undefined) updateData.name = requestData.name;
    if (requestData.status !== undefined) updateData.status = requestData.status as ProjectStatus;
    if (requestData.address !== undefined) updateData.address = requestData.address;
    if (requestData.customer !== undefined) updateData.customer = requestData.customer;
    if (requestData.generalContractor !== undefined) updateData.generalContractor = requestData.generalContractor;
    if (requestData.sqFootage !== undefined) updateData.sqFootage = requestData.sqFootage;
    if (requestData.classification !== undefined) updateData.classification = requestData.classification;
    if (requestData.startDate !== undefined) updateData.startDate = requestData.startDate;
    if (requestData.endDate !== undefined) updateData.endDate = requestData.endDate;
    if (requestData.tags !== undefined) updateData.tags = requestData.tags;
    if (requestData.notes !== undefined) updateData.notes = requestData.notes;

    // 7. Update the project
    const updatedProject = await projectService.updateProject(projectId, updateData, user.id);
    if (!updatedProject) {
      return errorResponse(500, { message: 'Failed to update project' });
    }

    // 8. Return successful response
    return successResponse(200, { project: updatedProject });
  } catch (error) {
    // 9. Handle errors
    logger.error('Error updating project', { error });
    return errorResponse(500, { message: 'Failed to update project' });
  }
};
